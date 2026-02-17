import { fork, ChildProcess } from 'node:child_process';
import { JobData, JobProcessor, WorkerResponse } from '../types.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Worker manager that handles job execution in isolated child processes
 */
export class Worker {
  private processor: JobProcessor;
  private childProcess: ChildProcess | null;
  private isReady: boolean;
  private currentJobId: string | null;

  constructor(processor: JobProcessor) {
    this.processor = processor;
    this.childProcess = null;
    this.isReady = false;
    this.currentJobId = null;
  }

  /**
   * Initialize the worker by forking a child process
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const childProcessorPath = join(__dirname, 'childProcessor.js');
      
      this.childProcess = fork(childProcessorPath, [], {
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      });

      // Handle ready signal from child
      const readyHandler = (message: { type: string }) => {
        if (message.type === 'ready') {
          this.isReady = true;
          this.childProcess?.off('message', readyHandler);
          
          // Send processor function to child
          this.sendProcessorToChild()
            .then(() => resolve())
            .catch(reject);
        }
      };

      this.childProcess.on('message', readyHandler);

      // Handle child process errors
      this.childProcess.on('error', (error) => {
        console.error('[Worker] Child process error:', error);
        reject(error);
      });

      // Handle unexpected exit during initialization
      this.childProcess.on('exit', (code, signal) => {
        if (!this.isReady) {
          reject(new Error(`Child process exited during initialization: code=${code}, signal=${signal}`));
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.isReady) {
          reject(new Error('Worker initialization timeout'));
        }
      }, 5000);
    });
  }

  /**
   * Send the processor function to the child process
   */
  private async sendProcessorToChild(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.childProcess) {
        reject(new Error('Child process not initialized'));
        return;
      }

      // Convert processor function to string
      const processorCode = this.processor.toString();
      
      this.childProcess.send(
        { type: 'setProcessor', code: processorCode },
        (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Execute a job in the child process
   */
  async execute(job: JobData): Promise<{ success: boolean; result?: unknown; error?: string }> {
    if (!this.childProcess || !this.isReady) {
      throw new Error('Worker not initialized');
    }

    if (this.currentJobId) {
      throw new Error('Worker is already processing a job');
    }

    this.currentJobId = job.id;

    return new Promise((resolve, reject) => {
      if (!this.childProcess) {
        reject(new Error('Child process not available'));
        return;
      }

      // Set up message handler for result
      const messageHandler = (message: WorkerResponse) => {
        if (message.type === 'result' && message.jobId === job.id) {
          this.childProcess?.off('message', messageHandler);
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
        }
      };

      this.childProcess.on('message', messageHandler);

      // Handle child process crash
      const exitHandler = (code: number | null, signal: string | null) => {
        if (this.currentJobId === job.id) {
          this.childProcess?.off('exit', exitHandler);
          this.currentJobId = null;
          this.isReady = false;

          resolve({
            success: false,
            error: `Worker crashed: code=${code}, signal=${signal}`,
          });
        }
      };

      this.childProcess.once('exit', exitHandler);

      // Send job to child process
      this.childProcess.send({
        type: 'execute',
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
    if (this.childProcess) {
      return new Promise((resolve) => {
        if (!this.childProcess) {
          resolve();
          return;
        }

        this.childProcess.once('exit', () => {
          this.childProcess = null;
          this.isReady = false;
          this.currentJobId = null;
          resolve();
        });

        this.childProcess.kill();

        // Force kill after 5 seconds
        setTimeout(() => {
          if (this.childProcess) {
            this.childProcess.kill('SIGKILL');
          }
        }, 5000);
      });
    }
  }
}
