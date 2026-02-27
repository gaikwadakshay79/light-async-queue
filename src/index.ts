/**
 * light-queue - Production-ready Redis-free async job queue
 * 
 * A reliable job queue for single-node applications with:
 * - File-based persistence with crash recovery
 * - Worker process isolation
 * - Retry with exponential backoff
 * - Dead letter queue for failed jobs
 * - Graceful shutdown handling
 * - Job events and progress tracking
 * - Job priorities and dependencies
 * - Repeating jobs with cron support
 * - Rate limiting
 * - Webhooks
 * - HTML Dashboard for monitoring
 */

export { Queue } from './queue/Queue.js';
export { Job } from './queue/Job.js';
export type {
  QueueConfig,
  JobData,
  JobProcessor,
  JobOptions,
  RetryConfig,
  BackoffConfig,
  RepeatConfig,
  RateLimiterConfig,
  WebhookConfig,
  QueueEvents,
  JobWithMethods,
} from './types.js';
export {
  JobStatus,
  BackoffStrategyType,
  StorageType,
  WorkerMessageType,
  WorkerResponseType,
  WorkerSignalType,
  QueueEventType,
} from './types.js';
export { CronParser } from './utils/CronParser.js';
export { RateLimiter } from './utils/RateLimiter.js';
export { WebhookManager } from './utils/WebhookManager.js';
export { Dashboard } from './dashboard/Dashboard.js';
export type { DashboardConfig } from './dashboard/Dashboard.js';
