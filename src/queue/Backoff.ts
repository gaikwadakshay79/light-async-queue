import { BackoffConfig } from '../types.js';

/**
 * Backoff calculator for retry delays
 */
export class Backoff {
  private config: BackoffConfig;

  constructor(config: BackoffConfig) {
    this.config = config;
  }

  /**
   * Calculate the next retry delay based on attempt number
   * Formula: delay = baseDelay * (2 ^ (attempt - 1))
   * 
   * @param attempt - Current attempt number (1-based)
   * @returns Delay in milliseconds
   */
  calculateDelay(attempt: number): number {
    if (this.config.type === 'exponential') {
      // Exponential backoff: delay * 2^(attempt-1)
      const exponentialDelay = this.config.delay * Math.pow(2, attempt - 1);
      
      // Cap at 1 hour to prevent extremely long delays
      const maxDelay = 60 * 60 * 1000; // 1 hour
      return Math.min(exponentialDelay, maxDelay);
    }
    
    return this.config.delay;
  }

  /**
   * Calculate the next run timestamp for a job
   * 
   * @param attempt - Current attempt number (1-based)
   * @returns Unix timestamp in milliseconds
   */
  getNextRunAt(attempt: number): number {
    const delay = this.calculateDelay(attempt);
    return Date.now() + delay;
  }
}
