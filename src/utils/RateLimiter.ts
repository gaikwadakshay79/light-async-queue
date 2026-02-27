import { RateLimiterConfig } from '../types.js';

/**
 * Token bucket rate limiter
 * Limits the number of operations within a time window
 */
export class RateLimiter {
  private config: RateLimiterConfig;
  private tokens: number;
  private lastRefill: number;

  constructor(config: RateLimiterConfig) {
    this.config = config;
    this.tokens = config.max;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume a token
   * Returns true if allowed, false if rate limited
   */
  async consume(): Promise<boolean> {
    this.refill();

    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }

    return false;
  }

  /**
   * Wait until a token is available
   */
  async wait(): Promise<void> {
    while (!(await this.consume())) {
      const timeToWait = this.getTimeUntilRefill();
      await new Promise(resolve => setTimeout(resolve, Math.min(timeToWait, 100)));
    }
  }

  /**
   * Get time until next refill in milliseconds
   */
  private getTimeUntilRefill(): number {
    const elapsed = Date.now() - this.lastRefill;
    return Math.max(0, this.config.duration - elapsed);
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.config.duration) {
      this.tokens = this.config.max;
      this.lastRefill = now;
    }
  }

  /**
   * Get current token count
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.tokens = this.config.max;
    this.lastRefill = Date.now();
  }
}
