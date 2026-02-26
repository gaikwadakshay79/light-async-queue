/**
 * Job Status Enum
 * Represents the different states a job can be in
 */
export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Backoff Strategy Type Enum
 * Determines how to calculate delay between retries
 */
export enum BackoffStrategyType {
  EXPONENTIAL = 'exponential',
  FIXED = 'fixed',
}

/**
 * Storage Type Enum
 * Determines the storage backend for the queue
 */
export enum StorageType {
  MEMORY = 'memory',
  FILE = 'file',
}

/**
 * Worker Message Type Enum
 * Types of messages sent from parent to child worker process
 */
export enum WorkerMessageType {
  EXECUTE = 'execute',
  SET_PROCESSOR = 'setProcessor',
}

/**
 * Worker Response Type Enum
 * Types of responses sent from child to parent worker process
 */
export enum WorkerResponseType {
  RESULT = 'result',
}

/**
 * Worker Signal Type Enum
 * Special signals for worker communication
 */
export enum WorkerSignalType {
  READY = 'ready',
}
