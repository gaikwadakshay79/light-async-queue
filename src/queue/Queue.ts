import {
  QueueConfig,
  JobProcessor,
  StorageInterface,
  JobData,
  StorageType,
  JobStatus,
  JobOptions,
  QueueEventType,
  JobWithMethods,
} from '../types.js';
import { Job } from './Job.js';
import { Backoff } from './Backoff.js';
import { Scheduler } from './Scheduler.js';
import { Worker } from '../worker/Worker.js';
import { DeadLetterQueue } from '../dlq/DeadLetterQueue.js';
import { MemoryStore } from '../storage/MemoryStore.js';
import { FileStore } from '../storage/FileStore.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import { WebhookManager } from '../utils/WebhookManager.js';
import { CronParser } from '../utils/CronParser.js';
import { EventEmitter } from 'node:events';

/**
 * Main Queue class - orchestrates job processing
 */
export class Queue extends EventEmitter {
  private config: QueueConfig;
  private storage: StorageInterface;
  private scheduler: Scheduler;
  private dlq: DeadLetterQueue;
  private backoff: Backoff;
  private processor: JobProcessor | null;
  private workers: Worker[];
  private activeJobs: Map<string, Job>;
  private completedJobIds: Set<string>;
  private repeatingJobs: Map<string, NodeJS.Timeout>;
  private isShuttingDown: boolean;
  private isInitialized: boolean;
  private rateLimiter?: RateLimiter;
  private webhookManager?: WebhookManager;
  private stalledCheckInterval?: NodeJS.Timeout;

  constructor(config: QueueConfig) {
    super();
    this.config = config;
    this.processor = null;
    this.workers = [];
    this.activeJobs = new Map();
    this.completedJobIds = new Set();
    this.repeatingJobs = new Map();
    this.isShuttingDown = false;
    this.isInitialized = false;

    // Initialize storage based on config
    if (config.storage === StorageType.FILE) {
      if (!config.filePath) {
        throw new Error(`filePath is required when storage is "${StorageType.FILE}"`);
      }
      this.storage = new FileStore(config.filePath);
    } else {
      this.storage = new MemoryStore();
    }

    // Initialize other components
    this.scheduler = new Scheduler(this.storage);
    this.dlq = new DeadLetterQueue(this.storage);
    this.backoff = new Backoff(config.retry.backoff);

    // Initialize rate limiter if configured
    if (config.rateLimiter) {
      this.rateLimiter = new RateLimiter(config.rateLimiter);
    }

    // Initialize webhook manager if configured
    if (config.webhooks && config.webhooks.length > 0) {
      this.webhookManager = new WebhookManager(config.webhooks);
    }

    // Set up scheduler event handler
    this.scheduler.on('job-ready', (jobData: JobData) => {
      this.handleJobReady(jobData).catch(error => {
        console.error('[Queue] Error handling job:', error);
        this.emit(QueueEventType.ERROR, error);
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

    // Start stalled job checker
    this.startStalledChecker();

    // Load completed job IDs for dependency tracking
    await this.loadCompletedJobIds();
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
  async add(payload: unknown, options: JobOptions = {}): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isShuttingDown) {
      throw new Error('Queue is shutting down, cannot accept new jobs');
    }

    const job = new Job(payload, this.config.retry.maxAttempts, options);
    await this.storage.addJob(job.toData());

    // Emit event based on job status
    if (job.status === JobStatus.DELAYED) {
      this.emit(QueueEventType.DELAYED, job.toData());
      await this.sendWebhook(QueueEventType.DELAYED, { job: job.toData() });
    } else if (job.status === JobStatus.WAITING) {
      this.emit(QueueEventType.WAITING, job.toData());
      await this.sendWebhook(QueueEventType.WAITING, { job: job.toData() });
    }

    // Set up repeating job if configured
    if (options.repeat) {
      await this.scheduleRepeat(job);
    }

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

    // Check if dependencies are satisfied
    if (!job.areDependenciesSatisfied(this.completedJobIds)) {
      return; // Job is still waiting for dependencies
    }

    // Apply rate limiting if configured
    if (this.rateLimiter) {
      const allowed = await this.rateLimiter.consume();
      if (!allowed) {
        return; // Rate limit reached, will retry on next tick
      }
    }

    // Mark job as processing
    job.markProcessing();
    this.activeJobs.set(job.id, job);
    await this.storage.updateJob(job.toData());

    // Emit active event
    this.emit(QueueEventType.ACTIVE, job.toData());
    await this.sendWebhook(QueueEventType.ACTIVE, { job: job.toData() });

    // Get or create a worker
    const worker = await this.getAvailableWorker();

    try {
      // Create job with methods for processor
      const jobWithMethods = this.createJobWithMethods(job);

      // Execute job in worker
      const result = await worker.execute(job.toData(), jobWithMethods);

      if (result.success) {
        // Job succeeded
        job.markCompleted(result.result);
        await this.storage.updateJob(job.toData());

        // Track completed job for dependency resolution
        this.completedJobIds.add(job.id);

        // Check for dependent jobs
        await this.checkDependentJobs(job.id);

        // Emit completed event
        this.emit(QueueEventType.COMPLETED, job.toData(), result.result);
        await this.sendWebhook(QueueEventType.COMPLETED, { job: job.toData(), result: result.result });
      } else {
        // Job failed
        const error = new Error(result.error || 'Unknown error');
        await this.handleJobFailure(job, error);
      }
    } catch (error) {
      // Worker execution error
      const err = error instanceof Error ? error : new Error(String(error));
      await this.handleJobFailure(job, err);
    } finally {
      // Remove from active jobs
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Handle job failure with retry logic
   */
  private async handleJobFailure(job: Job, error: Error): Promise<void> {
    console.error(`[Queue] Job ${job.id} failed:`, error.message);

    // Calculate next run time with backoff
    const nextRunAt = this.backoff.getNextRunAt(job.attempts + 1);
    job.markFailed(error.message, nextRunAt);

    if (job.hasExceededMaxAttempts()) {
      // Move to dead letter queue
      console.log(`[Queue] Job ${job.id} exceeded max attempts, moving to DLQ`);
      await this.dlq.add(job);

      // Emit failed event
      this.emit(QueueEventType.FAILED, job.toData(), error);
      await this.sendWebhook(QueueEventType.FAILED, { job: job.toData(), error });
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
   * Create a job with methods for use in processor
   */
  private createJobWithMethods(job: Job): JobWithMethods {
    const self = this;
    return {
      ...job.toData(),
      updateProgress: async (progress: number) => {
        job.updateProgress(progress);
        await self.storage.updateJob(job.toData());
        self.emit(QueueEventType.PROGRESS, job.toData(), progress);
        await self.sendWebhook(QueueEventType.PROGRESS, { job: job.toData() });
      },
      log: (message: string) => {
        console.log(`[Job ${job.id}] ${message}`);
      },
    };
  }

  /**
   * Load completed job IDs for dependency tracking
   */
  private async loadCompletedJobIds(): Promise<void> {
    const allJobs = await this.storage.getAllJobs();
    this.completedJobIds.clear();
    for (const job of allJobs) {
      if (job.status === JobStatus.COMPLETED) {
        this.completedJobIds.add(job.id);
      }
    }
  }

  /**
   * Check and update waiting jobs whose dependencies are now satisfied
   */
  private async checkDependentJobs(completedJobId: string): Promise<void> {
    const allJobs = await this.storage.getAllJobs();
    
    for (const jobData of allJobs) {
      if (jobData.status === JobStatus.WAITING && jobData.dependsOn?.includes(completedJobId)) {
        const job = Job.fromData(jobData);
        if (job.areDependenciesSatisfied(this.completedJobIds)) {
          // All dependencies satisfied, move to pending
          job.status = JobStatus.PENDING;
          await this.storage.updateJob(job.toData());
        }
      }
    }
  }

  /**
   * Schedule a repeating job
   */
  private async scheduleRepeat(job: Job): Promise<void> {
    if (!job.repeatConfig) {
      return;
    }

    const repeatConfig = job.repeatConfig;

    // Check if we've hit the repeat limit
    if (repeatConfig.limit && job.repeatCount >= repeatConfig.limit) {
      return;
    }

    // Calculate next run time
    let nextRunAt: number;
    
    if (repeatConfig.pattern) {
      // Cron pattern
      const cronParser = new CronParser(repeatConfig.pattern);
      nextRunAt = cronParser.getNextRunTime(Date.now());
    } else if (repeatConfig.every) {
      // Repeat every X ms
      nextRunAt = Date.now() + repeatConfig.every;
    } else {
      return;
    }

    // Check date constraints
    if (repeatConfig.startDate && nextRunAt < repeatConfig.startDate.getTime()) {
      nextRunAt = repeatConfig.startDate.getTime();
    }
    if (repeatConfig.endDate && nextRunAt > repeatConfig.endDate.getTime()) {
      return;
    }

    // Schedule the next instance
    const delay = nextRunAt - Date.now();
    const timeout = setTimeout(async () => {
      const nextJob = job.createRepeatInstance();
      nextJob.nextRunAt = nextRunAt;
      await this.storage.addJob(nextJob.toData());
      
      // Schedule the next repeat
      await this.scheduleRepeat(nextJob);
    }, delay);

    this.repeatingJobs.set(job.id, timeout);
  }

  /**
   * Start stalled job checker
   */
  private startStalledChecker(): void {
    const interval = this.config.stalledInterval || 30000;
    
    this.stalledCheckInterval = setInterval(async () => {
      await this.checkStalledJobs();
    }, interval);
  }

  /**
   * Check for stalled jobs and mark them
   */
  private async checkStalledJobs(): Promise<void> {
    const stalledThreshold = this.config.stalledInterval || 30000;
    const allJobs = await this.storage.getAllJobs();

    for (const jobData of allJobs) {
      if (jobData.status === JobStatus.PROCESSING) {
        const job = Job.fromData(jobData);
        if (job.isStalled(stalledThreshold)) {
          console.warn(`[Queue] Job ${job.id} appears stalled`);
          job.markStalled();
          await this.storage.updateJob(job.toData());
          
          // Emit stalled event
          this.emit(QueueEventType.STALLED, job.toData());
          await this.sendWebhook(QueueEventType.STALLED, { job: job.toData() });
        }
      }
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhook(event: QueueEventType, data: { job?: JobData; error?: Error; result?: unknown }): Promise<void> {
    if (this.webhookManager) {
      try {
        await this.webhookManager.sendEvent(event, data);
      } catch (error) {
        console.error('[Queue] Webhook error:', error);
      }
    }
  }

  /**
   * Get a specific job by ID
   */
  async getJob(jobId: string): Promise<JobData | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.storage.getJob(jobId);
  }

  /**
   * Remove a specific job
   */
  async removeJob(jobId: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Check if job is active
    if (this.activeJobs.has(jobId)) {
      return false; // Cannot remove active job
    }

    const job = await this.storage.getJob(jobId);
    if (!job) {
      return false;
    }

    // Remove from storage by updating status
    job.status = JobStatus.FAILED;
    await this.storage.updateJob(job);
    
    return true;
  }

  /**
   * Pause the queue (stop processing new jobs)
   */
  pause(): void {
    this.scheduler.stop();
  }

  /**
   * Resume the queue
   */
  resume(): void {
    if (!this.isShuttingDown) {
      this.scheduler.start();
    }
  }

  /**
   * Drain the queue - process all pending jobs
   */
  async drain(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Wait for all pending jobs to be processed
    while (true) {
      const allJobs = await this.storage.getAllJobs();
      const pendingJobs = allJobs.filter(j => 
        j.status === JobStatus.PENDING || 
        j.status === JobStatus.WAITING ||
        j.status === JobStatus.DELAYED
      );

      if (pendingJobs.length === 0 && this.activeJobs.size === 0) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.emit(QueueEventType.DRAINED);
    await this.sendWebhook(QueueEventType.DRAINED, {});
  }

  /**
   * Clean completed jobs older than a certain age
   */
  async clean(maxAge: number = 24 * 60 * 60 * 1000): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const allJobs = await this.storage.getAllJobs();
    const now = Date.now();
    let cleaned = 0;

    for (const job of allJobs) {
      if (job.status === JobStatus.COMPLETED && now - job.updatedAt > maxAge) {
        job.status = JobStatus.FAILED; // Mark for removal
        await this.storage.updateJob(job);
        this.completedJobIds.delete(job.id);
        cleaned++;
      }
    }

    return cleaned;
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
    waiting: number;
    delayed: number;
    pending: number;
    failed: number;
    completed: number;
    stalled: number;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const allJobs = await this.storage.getAllJobs();
    const failedJobs = await this.dlq.getAll();

    return {
      active: this.activeJobs.size,
      waiting: allJobs.filter(j => j.status === JobStatus.WAITING).length,
      delayed: allJobs.filter(j => j.status === JobStatus.DELAYED).length,
      pending: allJobs.filter(j => j.status === JobStatus.PENDING).length,
      failed: failedJobs.length,
      completed: allJobs.filter(j => j.status === JobStatus.COMPLETED).length,
      stalled: allJobs.filter(j => j.status === JobStatus.STALLED).length,
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

    // Stop stalled checker
    if (this.stalledCheckInterval) {
      clearInterval(this.stalledCheckInterval);
    }

    // Cancel all repeating jobs
    for (const timeout of this.repeatingJobs.values()) {
      clearTimeout(timeout);
    }
    this.repeatingJobs.clear();

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
