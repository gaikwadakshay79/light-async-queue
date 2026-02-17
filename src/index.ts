/**
 * light-queue - Production-ready Redis-free async job queue
 * 
 * A reliable job queue for single-node applications with:
 * - File-based persistence with crash recovery
 * - Worker process isolation
 * - Retry with exponential backoff
 * - Dead letter queue for failed jobs
 * - Graceful shutdown handling
 */

export { Queue } from './queue/Queue.js';
export { Job } from './queue/Job.js';
export type {
  QueueConfig,
  JobData,
  JobStatus,
  JobProcessor,
  RetryConfig,
  BackoffConfig,
} from './types.js';
