import { QueueConfig, JobProcessor, StorageInterface, JobData } from '../types.js';
import { Job } from './Job.js';
import { Backoff } from './Backoff.js';
import { Scheduler } from './Scheduler.js';
import { Worker } from '../worker/Worker.js';
import { DeadLetterQueue } from '../dlq/DeadLetterQueue.js';
import { MemoryStore } from '../storage/MemoryStore.js';
import { FileStore } from '../storage/FileStore.js';

/**
 * Main Queue class - orchestrates job processing
 */
export class Queue {
  private config: QueueConfig;
  private storage: StorageInterface;
  private scheduler: Scheduler;
  private dlq: DeadLetterQueue;
  private backoff: Backoff;
  private processor: JobProcessor | null;
  private workers: Worker[];
  private activeJobs: Map<string, Job>;
  private isShuttingDown: boolean;
  private isInitialized: boolean;

  constructor(config: QueueConfig) {
    this.config = config;
    this.processor = null;
    this.workers = [];
    this.activeJobs = new Map();
    this.isShuttingDown = false;
    this.isInitialized = false;

    // Initialize storage based on config
    if (config.storage === 'file') {
      if (!config.filePath) {
        throw new Error('filePath is required when storage is "file"');
      }
      this.storage = new FileStore(config.filePath);
    } else {
      this.storage = new MemoryStore();
    }

    // Initialize other components
    this.scheduler = new Scheduler(this.storage);
    this.dlq = new DeadLetterQueue(this.storage);
    this.backoff = new Backoff(config.retry.backoff);

    // Set up scheduler event handler
    this.scheduler.on('job-ready', (jobData: JobData) => {
      this.handleJobReady(jobData).catch(error => {
        console.error('[Queue] Error handling job:', error);
      });
    });

    // Set up graceful shutdown
    this.setupGracefulShutdown();
  }

  /**
   * Initialize the queue
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    await this.storage.initialize();
    this.isInitialized = true;
  }

  /**
   * Set the job processor function
   */
  process(processor: JobProcessor): void {
    this.processor = processor;
  }

  /**
   * Add a job to the queue
   */
  async add(payload: unknown): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isShuttingDown) {
      throw new Error('Queue is shutting down, cannot accept new jobs');
    }

    const job = new Job(payload, this.config.retry.maxAttempts);
    await this.storage.addJob(job.toData());

    // Start scheduler if not already running
    if (!this.scheduler.getIsRunning()) {
      this.scheduler.start();
    }

    return job.id;
  }

  /**
   * Handle a job that's ready to process
   */
  private async handleJobReady(jobData: JobData): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    // Check concurrency limit
    if (this.activeJobs.size >= this.config.concurrency) {
      return;
    }

    // Check if job is already being processed
    if (this.activeJobs.has(jobData.id)) {
      return;
    }

    if (!this.processor) {
      console.error('[Queue] No processor function set');
      return;
    }

    const job = Job.fromData(jobData);

    // Mark job as processing
    job.markProcessing();
    this.activeJobs.set(job.id, job);
    await this.storage.updateJob(job.toData());

    // Get or create a worker
    const worker = await this.getAvailableWorker();

    try {
      // Execute job in worker
      const result = await worker.execute(job.toData());

      if (result.success) {
        // Job succeeded
        job.markCompleted();
        await this.storage.updateJob(job.toData());
      } else {
        // Job failed
        await this.handleJobFailure(job, result.error || 'Unknown error');
      }
    } catch (error) {
      // Worker execution error
      await this.handleJobFailure(
        job,
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      // Remove from active jobs
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Handle job failure with retry logic
   */
  private async handleJobFailure(job: Job, error: string): Promise<void> {
    console.error(`[Queue] Job ${job.id} failed:`, error);

    // Calculate next run time with backoff
    const nextRunAt = this.backoff.getNextRunAt(job.attempts + 1);
    job.markFailed(nextRunAt);

    if (job.hasExceededMaxAttempts()) {
      // Move to dead letter queue
      console.log(`[Queue] Job ${job.id} exceeded max attempts, moving to DLQ`);
      await this.dlq.add(job);
    } else {
      // Update job for retry
      await this.storage.updateJob(job.toData());
    }
  }

  /**
   * Get an available worker or create a new one
   */
  private async getAvailableWorker(): Promise<Worker> {
    // Find an idle worker
    for (const worker of this.workers) {
      if (!worker.isBusy()) {
        return worker;
      }
    }

    // Create a new worker if under concurrency limit
    if (this.workers.length < this.config.concurrency) {
      if (!this.processor) {
        throw new Error('Processor function not set');
      }

      const worker = new Worker(this.processor);
      await worker.initialize();
      this.workers.push(worker);
      return worker;
    }

    // Wait for a worker to become available
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        for (const worker of this.workers) {
          if (!worker.isBusy()) {
            clearInterval(checkInterval);
            resolve(worker);
            return;
          }
        }
      }, 100);
    });
  }

  /**
   * Get all failed jobs from DLQ
   */
  async getFailedJobs(): Promise<JobData[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.dlq.getAll();
  }

  /**
   * Reprocess a failed job from DLQ
   */
  async reprocessFailed(jobId: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const job = await this.dlq.remove(jobId);
    
    if (!job) {
      return false;
    }

    // Add back to queue
    await this.storage.addJob(job.toData());
    
    return true;
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<{
    active: number;
    pending: number;
    failed: number;
    completed: number;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const allJobs = await this.storage.getAllJobs();
    const failedJobs = await this.dlq.getAll();

    return {
      active: this.activeJobs.size,
      pending: allJobs.filter(j => j.status === 'pending').length,
      failed: failedJobs.length,
      completed: allJobs.filter(j => j.status === 'completed').length,
    };
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async () => {
      console.log('[Queue] Graceful shutdown initiated...');
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  /**
   * Gracefully shutdown the queue
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    // Stop accepting new jobs
    this.scheduler.stop();

    // Wait for active jobs to complete
    console.log(`[Queue] Waiting for ${this.activeJobs.size} active jobs to complete...`);
    
    while (this.activeJobs.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Terminate all workers
    console.log('[Queue] Terminating workers...');
    await Promise.all(this.workers.map(worker => worker.terminate()));

    // Close storage
    console.log('[Queue] Closing storage...');
    await this.storage.close();

    console.log('[Queue] Shutdown complete');
  }
}
