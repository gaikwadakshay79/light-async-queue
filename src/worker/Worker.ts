import { fork, ChildProcess } from "node:child_process";
import {
  JobData,
  JobProcessor,
  ProcessorExecutionMode,
  ProcessorSource,
  WorkerMessage,
  WorkerResponse,
  WorkerMessageType,
  WorkerSignalType,
  WorkerResponseType,
  JobWithMethods,
} from "../types.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Worker manager that handles job execution in isolated child processes
 */
export class Worker {
  private processor: ProcessorSource;
  private workerEnv: NodeJS.ProcessEnv | undefined;
  private executionMode: ProcessorExecutionMode;
  private inProcessProcessor: JobProcessor | null;
  private childProcess: ChildProcess | null;
  private isReady: boolean;
  private currentJobId: string | null;

  constructor(
    processor: ProcessorSource,
    workerEnv?: NodeJS.ProcessEnv,
    executionMode: ProcessorExecutionMode = "isolated",
  ) {
    this.processor = processor;
    this.workerEnv = workerEnv;
    this.executionMode = executionMode;
    this.inProcessProcessor = null;
    this.childProcess = null;
    this.isReady = false;
    this.currentJobId = null;
  }

  /**
   * Initialize the worker by forking a child process
   */
  async initialize(): Promise<void> {
    if (this.executionMode === "inline") {
      await this.initializeInlineProcessor();
      this.isReady = true;
      return;
    }

    return new Promise((resolve, reject) => {
      const childProcessorJsPath = join(__dirname, "childProcessor.js");
      const childProcessorTsPath = join(__dirname, "childProcessor.ts");
      const childProcessorPath = existsSync(childProcessorJsPath)
        ? childProcessorJsPath
        : childProcessorTsPath;

      this.childProcess = fork(childProcessorPath, [], {
        stdio: ["pipe", "pipe", "pipe", "ipc"],
        execArgv: this.getChildExecArgv(),
        env: this.getChildEnv(),
      });

      // Handle ready signal from child
      const readyHandler = (message: { type: string }) => {
        if (message.type === WorkerSignalType.READY) {
          this.isReady = true;
          this.childProcess?.off("message", readyHandler);

          // Send processor function to child
          this.sendProcessorToChild()
            .then(() => resolve())
            .catch((error) => {
              this.isReady = false;
              reject(error);
            });
        }
      };

      this.childProcess.on("message", readyHandler);

      // Handle child process errors
      this.childProcess.on("error", (error) => {
        console.error("[Worker] Child process error:", error);
        reject(error);
      });

      // Handle unexpected exit during initialization
      this.childProcess.on("exit", (code, signal) => {
        if (!this.isReady) {
          reject(
            new Error(
              `Child process exited during initialization: code=${code}, signal=${signal}`,
            ),
          );
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.isReady) {
          reject(new Error("Worker initialization timeout"));
        }
      }, 5000);
    });
  }

  /**
   * Initialize processor for inline execution mode
   */
  private async initializeInlineProcessor(): Promise<void> {
    if (typeof this.processor === "function") {
      this.inProcessProcessor = this.processor;
      return;
    }

    const modulePath = this.normalizeModuleSpecifier(this.processor.modulePath);
    const exportName = this.processor.exportName ?? "default";
    const processorModule = (await import(modulePath)) as Record<
      string,
      unknown
    >;
    const candidate = processorModule[exportName];

    if (typeof candidate !== "function") {
      throw new Error(
        `Export "${exportName}" in module "${modulePath}" is not a function`,
      );
    }

    this.inProcessProcessor = candidate as JobProcessor;
  }

  /**
   * Send the processor function to the child process
   */
  private async sendProcessorToChild(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.childProcess) {
        reject(new Error("Child process not initialized"));
        return;
      }

      const timeout = setTimeout(() => {
        this.childProcess?.off("message", processorSetHandler);
        reject(new Error("Timed out waiting for child processor setup"));
      }, 5000);

      const processorSetHandler = (message: { type: string }) => {
        if (message.type === WorkerSignalType.PROCESSOR_SET) {
          clearTimeout(timeout);
          this.childProcess?.off("message", processorSetHandler);
          resolve();
        }
      };

      this.childProcess.on("message", processorSetHandler);

      const sendMessage = (payload: WorkerMessage) => {
        this.childProcess?.send(payload, (error) => {
          if (error) {
            clearTimeout(timeout);
            this.childProcess?.off("message", processorSetHandler);
            reject(error);
          }
        });
      };

      if (typeof this.processor === "function") {
        const processorCode = this.processor.toString();

        sendMessage({
          type: WorkerMessageType.SET_PROCESSOR,
          code: processorCode,
        });
        return;
      }

      const modulePath = this.normalizeModuleSpecifier(
        this.processor.modulePath,
      );
      const exportName = this.processor.exportName ?? "default";

      sendMessage({
        type: WorkerMessageType.SET_PROCESSOR_MODULE,
        modulePath,
        exportName,
      });
    });
  }

  /**
   * Normalize a module specifier for child-process dynamic import
   */
  private normalizeModuleSpecifier(modulePath: string): string {
    if (
      modulePath.startsWith("file://") ||
      modulePath.startsWith("node:") ||
      modulePath.startsWith("data:")
    ) {
      return modulePath;
    }

    if (modulePath.startsWith("./") || modulePath.startsWith("../")) {
      return pathToFileURL(resolve(process.cwd(), modulePath)).href;
    }

    if (isAbsolute(modulePath)) {
      return pathToFileURL(modulePath).href;
    }

    return modulePath;
  }

  /**
   * Get safe exec arguments for child process
   */
  private getChildExecArgv(): string[] {
    const sanitized: string[] = [];

    for (let index = 0; index < process.execArgv.length; index++) {
      const arg = process.execArgv[index];

      if (
        arg === "-e" ||
        arg === "--eval" ||
        arg === "-p" ||
        arg === "--print"
      ) {
        index += 1;
        continue;
      }

      if (
        arg.startsWith("--eval=") ||
        arg.startsWith("--print=") ||
        arg.startsWith("--input-type")
      ) {
        continue;
      }

      sanitized.push(arg);
    }

    return sanitized;
  }

  /**
   * Build child process environment
   */
  private getChildEnv(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ...this.workerEnv,
    };
  }

  /**
   * Execute a job in the child process
   */
  async execute(
    job: JobData,
    jobWithMethods?: JobWithMethods,
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    if (
      !this.isReady ||
      (this.executionMode === "isolated" && !this.childProcess)
    ) {
      throw new Error("Worker not initialized");
    }

    if (this.currentJobId) {
      throw new Error("Worker is already processing a job");
    }

    this.currentJobId = job.id;

    if (this.executionMode === "inline") {
      try {
        if (!this.inProcessProcessor) {
          throw new Error("Inline processor not initialized");
        }

        const executableJob =
          jobWithMethods ??
          ({
            ...job,
            updateProgress: async () => {},
            log: () => {},
          } as JobWithMethods);

        const result = await this.inProcessProcessor(executableJob);
        this.currentJobId = null;

        return {
          success: true,
          result,
        };
      } catch (error) {
        this.currentJobId = null;
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return new Promise((resolve, reject) => {
      if (!this.childProcess) {
        reject(new Error("Child process not available"));
        return;
      }

      const exitHandler = (code: number | null, signal: string | null) => {
        if (this.currentJobId === job.id) {
          this.childProcess?.off("exit", exitHandler);
          this.childProcess?.off("message", messageHandler);
          this.currentJobId = null;
          this.isReady = false;

          resolve({
            success: false,
            error: `Worker crashed: code=${code}, signal=${signal}`,
          });
        }
      };

      const messageHandler = (message: WorkerResponse) => {
        if (
          message.type === WorkerResponseType.RESULT &&
          message.jobId === job.id
        ) {
          this.childProcess?.off("message", messageHandler);
          this.childProcess?.off("exit", exitHandler);
          this.currentJobId = null;

          if (message.result.success) {
            resolve({
              success: true,
              result: message.result.result,
            });
          } else {
            resolve({
              success: false,
              error: message.result.error,
            });
          }
        } else if (message.type === "progress" && message.jobId === job.id) {
          if (jobWithMethods?.updateProgress) {
            jobWithMethods.updateProgress(message.progress).catch((err) => {
              console.error("[Worker] Error updating progress:", err);
            });
          }
        }
      };

      this.childProcess.on("message", messageHandler);

      this.childProcess.once("exit", exitHandler);

      // Send job to child process
      this.childProcess.send({
        type: WorkerMessageType.EXECUTE,
        job,
      });
    });
  }

  /**
   * Check if worker is currently processing a job
   */
  isBusy(): boolean {
    return this.currentJobId !== null;
  }

  /**
   * Terminate the worker
   */
  async terminate(): Promise<void> {
    if (this.executionMode === "inline") {
      this.currentJobId = null;
      this.isReady = false;
      this.inProcessProcessor = null;
      return;
    }

    if (this.childProcess) {
      return new Promise((resolve) => {
        if (!this.childProcess) {
          resolve();
          return;
        }

        this.childProcess.once("exit", () => {
          this.childProcess = null;
          this.isReady = false;
          this.currentJobId = null;
          resolve();
        });

        try {
          this.childProcess.kill();
        } catch (error) {
          const err = error as NodeJS.ErrnoException;
          if (err.code === "EPERM" || err.code === "ESRCH") {
            this.childProcess = null;
            this.isReady = false;
            this.currentJobId = null;
            resolve();
            return;
          }
          throw error;
        }

        // Force kill after 5 seconds
        setTimeout(() => {
          if (this.childProcess) {
            this.childProcess.kill("SIGKILL");
          }
        }, 5000);
      });
    }
  }
}
