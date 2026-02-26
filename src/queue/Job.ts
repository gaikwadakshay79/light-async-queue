import { JobData, JobStatus } from '../types.js';
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
  public nextRunAt: number;
  public readonly createdAt: number;
  public updatedAt: number;

  constructor(payload: unknown, maxAttempts: number, nextRunAt?: number) {
    const now = Date.now();
    this.id = randomUUID();
    this.payload = payload;
    this.attempts = 0;
    this.maxAttempts = maxAttempts;
    this.status = JobStatus.PENDING;
    this.nextRunAt = nextRunAt ?? now;
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
      nextRunAt: this.nextRunAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  /**
   * Mark job as processing
   */
  markProcessing(): void {
    this.status = JobStatus.PROCESSING;
    this.updatedAt = Date.now();
  }

  /**
   * Mark job as completed
   */
  markCompleted(): void {
    this.status = JobStatus.COMPLETED;
    this.updatedAt = Date.now();
  }

  /**
   * Mark job as failed and increment attempts
   */
  markFailed(nextRunAt?: number): void {
    this.attempts += 1;
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
  }
}
