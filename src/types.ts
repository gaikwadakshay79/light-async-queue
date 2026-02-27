import {
  JobStatus,
  BackoffStrategyType,
  StorageType,
  WorkerMessageType,
  WorkerResponseType,
  QueueEventType,
} from './constants.js';

/**
 * Job status enum - Re-exported from constants
 */
export {
  JobStatus,
  BackoffStrategyType,
  StorageType,
  WorkerMessageType,
  WorkerResponseType,
  WorkerSignalType,
  QueueEventType,
} from './constants.js';

/**
 * Backoff strategy configuration
 */
export interface BackoffConfig {
  type: BackoffStrategyType;
  delay: number; // Base delay in milliseconds
}

/**
 * Repeat job configuration
 */
export interface RepeatConfig {
  every?: number;       // Repeat every X milliseconds
  pattern?: string;     // Cron pattern (e.g., '0 0 * * *')
  limit?: number;       // Max number of repetitions
  startDate?: Date;     // When to start repeating
  endDate?: Date;       // When to stop repeating
}

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  max: number;          // Maximum jobs
  duration: number;     // Per duration in milliseconds
}

/**
 * Webhook configuration
 */
export interface WebhookConfig {
  url: string;
  events: QueueEventType[];  // Which events to send
  headers?: Record<string, string>;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  backoff: BackoffConfig;
}

/**
 * Job options when adding to queue
 */
export interface JobOptions {
  priority?: number;         // Job priority (default: 0)
  delay?: number;           // Delay in milliseconds before execution
  repeat?: RepeatConfig;    // Repeat configuration
  dependsOn?: string[];     // Job IDs this job depends on
  jobId?: string;           // Custom job ID
}

/**
 * Core job data structure
 */
export interface JobData {
  id: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
  status: JobStatus;
  priority: number;                    // Job priority (higher = more important)
  progress: number;                    // Progress percentage (0-100)
  nextRunAt: number;                   // Unix timestamp in milliseconds
  delay: number;                       // Delay before execution in milliseconds  
  repeatConfig?: RepeatConfig;        // Repeat configuration if repeating
  repeatCount: number;                 // How many times has this repeated
  dependsOn?: string[];               // Job IDs this job depends on
  parentJobId?: string;               // Parent job ID for dependencies
  result?: unknown;                   // Result from job execution
  error?: string;                     // Error message if failed
  createdAt: number;                  // Unix timestamp in milliseconds
  updatedAt: number;                  // Unix timestamp in milliseconds
  startedAt?: number;                 // When job started processing
  completedAt?: number;               // When job completed
}

/**
 * Queue configuration options
 */
export interface QueueConfig {
  storage: StorageType;
  filePath?: string; // Required if storage is StorageType.FILE
  concurrency: number;
  retry: RetryConfig;
  rateLimiter?: RateLimiterConfig;  // Rate limiting configuration
  webhooks?: WebhookConfig[];       // Webhook configurations
  stalledInterval?: number;          // Check for stalled jobs every X ms (default: 30000)
}

/**
 * Job processor function type
 */
export type JobProcessor<T = unknown> = (job: JobWithMethods) => Promise<T>;

/**
 * Queue event listeners
 */
export interface QueueEvents {
  waiting: (job: JobData) => void;
  delayed: (job: JobData) => void;
  active: (job: JobData) => void;
  progress: (job: JobData, progress: number) => void;
  completed: (job: JobData, result: unknown) => void;
  failed: (job: JobData, error: Error) => void;
  stalled: (job: JobData) => void;
  drained: () => void;
  error: (error: Error) => void;
}

/**
 * Job with methods for use in processor
 */
export interface JobWithMethods extends JobData {
  updateProgress(progress: number): Promise<void>;
  log(message: string): void;
}

/**
 * Storage interface that all storage implementations must follow
 */
export interface StorageInterface {
  /**
   * Initialize the storage (load from disk, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Add a new job to storage
   */
  addJob(job: JobData): Promise<void>;

  /**
   * Update an existing job
   */
  updateJob(job: JobData): Promise<void>;

  /**
   * Get all pending jobs that are ready to run
   */
  getPendingJobs(now: number): Promise<JobData[]>;

  /**
   * Get a specific job by ID
   */
  getJob(id: string): Promise<JobData | null>;

  /**
   * Get all jobs (for debugging/monitoring)
   */
  getAllJobs(): Promise<JobData[]>;

  /**
   * Move a job to dead letter queue
   */
  moveToDeadLetter(job: JobData): Promise<void>;

  /**
   * Get all failed jobs from DLQ
   */
  getFailedJobs(): Promise<JobData[]>;

  /**
   * Remove a job from DLQ (for reprocessing)
   */
  removeFromDeadLetter(jobId: string): Promise<void>;

  /**
   * Close/cleanup storage
   */
  close(): Promise<void>;
}

/**
 * Worker result - success case
 */
export interface WorkerSuccess {
  success: true;
  result: unknown;
}

/**
 * Worker result - failure case
 */
export interface WorkerFailure {
  success: false;
  error: string;
}

/**
 * Worker result type
 */
export type WorkerResult = WorkerSuccess | WorkerFailure;

/**
 * Message sent to child worker process
 */
export type WorkerMessage = 
  | {
      type: WorkerMessageType.EXECUTE;
      job: JobData;
    }
  | {
      type: WorkerMessageType.SET_PROCESSOR;
      code: string;
    };

/**
 * Response from child worker process
 */
export type WorkerResponse = 
  | {
      type: WorkerResponseType.RESULT;
      jobId: string;
      result: WorkerResult;
    }
  | {
      type: 'progress';
      jobId: string;
      progress: number;
    };
