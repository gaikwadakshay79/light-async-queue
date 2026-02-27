import { JobData, JobStatus, JobOptions, RepeatConfig } from '../types.js';
import { randomUUID } from 'node:crypto';

/**
 * Job class representing a single unit of work in the queue
 */
export class Job {
  public readonly id: string;
  public payload: unknown;
  public attempts: number;
  public maxAttempts: number;
  public status: JobStatus;
  public priority: number;
  public progress: number;
  public nextRunAt: number;
  public delay: number;
  public repeatConfig?: RepeatConfig;
  public repeatCount: number;
  public dependsOn?: string[];
  public parentJobId?: string;
  public result?: unknown;
  public error?: string;
  public readonly createdAt: number;
  public updatedAt: number;
  public startedAt?: number;
  public completedAt?: number;

  constructor(payload: unknown, maxAttempts: number, options: JobOptions = {}) {
    const now = Date.now();
    this.id = options.jobId || randomUUID();
    this.payload = payload;
    this.attempts = 0;
    this.maxAttempts = maxAttempts;
    this.status = options.delay ? JobStatus.DELAYED : options.dependsOn?.length ? JobStatus.WAITING : JobStatus.PENDING;
    this.priority = options.priority ?? 0;
    this.progress = 0;
    this.delay = options.delay ?? 0;
    this.nextRunAt = now + (options.delay ?? 0);
    this.repeatConfig = options.repeat;
    this.repeatCount = 0;
    this.dependsOn = options.dependsOn;
    this.createdAt = now;
    this.updatedAt = now;
  }

  /**
   * Create a Job instance from stored data
   */
  static fromData(data: JobData): Job {
    const job = Object.create(Job.prototype);
    Object.assign(job, data);
    return job;
  }

  /**
   * Convert job to plain data object for storage
   */
  toData(): JobData {
    return {
      id: this.id,
      payload: this.payload,
      attempts: this.attempts,
      maxAttempts: this.maxAttempts,
      status: this.status,
      priority: this.priority,
      progress: this.progress,
      nextRunAt: this.nextRunAt,
      delay: this.delay,
      repeatConfig: this.repeatConfig,
      repeatCount: this.repeatCount,
      dependsOn: this.dependsOn,
      parentJobId: this.parentJobId,
      result: this.result,
      error: this.error,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
    };
  }

  /**
   * Mark job as processing
   */
  markProcessing(): void {
    this.status = JobStatus.PROCESSING;
    this.startedAt = Date.now();
    this.updatedAt = this.startedAt;
  }

  /**
   * Mark job as completed
   */
  markCompleted(result?: unknown): void {
    this.status = JobStatus.COMPLETED;
    this.result = result;
    this.completedAt = Date.now();
    this.updatedAt = this.completedAt;
    this.progress = 100;
  }

  /**
   * Mark job as failed and increment attempts
   */
  markFailed(error: string, nextRunAt?: number): void {
    this.attempts += 1;
    this.error = error;
    this.status = this.attempts >= this.maxAttempts ? JobStatus.FAILED : JobStatus.PENDING;
    if (nextRunAt !== undefined) {
      this.nextRunAt = nextRunAt;
    }
    this.updatedAt = Date.now();
  }

  /**
   * Check if job has exceeded max attempts
   */
  hasExceededMaxAttempts(): boolean {
    return this.attempts >= this.maxAttempts;
  }

  /**
   * Reset job for reprocessing (used when recovering from DLQ)
   */
  reset(): void {
    this.attempts = 0;
    this.status = JobStatus.PENDING;
    this.nextRunAt = Date.now();
    this.updatedAt = Date.now();
    this.error = undefined;
    this.progress = 0;
    this.startedAt = undefined;
    this.completedAt = undefined;
  }

  /**
   * Update job progress
   */
  updateProgress(progress: number): void {
    this.progress = Math.min(100, Math.max(0, progress));
    this.updatedAt = Date.now();
  }

  /**
   * Mark job as stalled
   */
  markStalled(): void {
    this.status = JobStatus.STALLED;
    this.updatedAt = Date.now();
  }

  /**
   * Check if job is stalled (processing for too long)
   */
  isStalled(stalledThreshold: number = 30000): boolean {
    if (this.status !== JobStatus.PROCESSING || !this.startedAt) {
      return false;
    }
    return Date.now() - this.startedAt > stalledThreshold;
  }

  /**
   * Check if dependencies are satisfied
   */
  areDependenciesSatisfied(completedJobIds: Set<string>): boolean {
    if (!this.dependsOn || this.dependsOn.length === 0) {
      return true;
    }
    return this.dependsOn.every(id => completedJobIds.has(id));
  }

  /**
   * Create a repeated instance of this job
   */
  createRepeatInstance(): Job {
    const job = Job.fromData(this.toData());
    job.attempts = 0;
    job.status = JobStatus.PENDING;
    job.repeatCount += 1;
    job.progress = 0;
    job.error = undefined;
    job.result = undefined;
    job.startedAt = undefined;
    job.completedAt = undefined;
    return job;
  }
}
