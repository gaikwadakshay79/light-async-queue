/**
 * Job status enum
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Backoff strategy configuration
 */
export interface BackoffConfig {
  type: 'exponential' | 'fixed';
  delay: number; // Base delay in milliseconds
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  backoff: BackoffConfig;
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
  nextRunAt: number; // Unix timestamp in milliseconds
  createdAt: number; // Unix timestamp in milliseconds
  updatedAt: number; // Unix timestamp in milliseconds
}

/**
 * Queue configuration options
 */
export interface QueueConfig {
  storage: 'memory' | 'file';
  filePath?: string; // Required if storage is 'file'
  concurrency: number;
  retry: RetryConfig;
}

/**
 * Job processor function type
 */
export type JobProcessor<T = unknown> = (job: JobData) => Promise<T>;

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
      type: 'execute';
      job: JobData;
    }
  | {
      type: 'setProcessor';
      code: string;
    };

/**
 * Response from child worker process
 */
export interface WorkerResponse {
  type: 'result';
  jobId: string;
  result: WorkerResult;
}
