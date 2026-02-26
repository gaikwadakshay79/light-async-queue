import { describe, it, expect } from 'vitest';
import { Backoff } from '../src/queue/Backoff.js';
import { BackoffStrategyType } from '../src/index.js';

describe('Backoff', () => {
  describe('exponential backoff calculation', () => {
    it('should calculate correct delays for each attempt', () => {
      const backoff = new Backoff({ type: BackoffStrategyType.EXPONENTIAL, delay: 1000 });
      
      expect(backoff.calculateDelay(1)).toBe(1000);
      expect(backoff.calculateDelay(2)).toBe(2000);
      expect(backoff.calculateDelay(3)).toBe(4000);
      expect(backoff.calculateDelay(4)).toBe(8000);
      expect(backoff.calculateDelay(5)).toBe(16000);
    });
  });

  describe('fixed backoff calculation', () => {
    it('should return fixed delay for all attempts', () => {
      const backoff = new Backoff({ type: BackoffStrategyType.FIXED, delay: 5000 });
      
      expect(backoff.calculateDelay(1)).toBe(5000);
      expect(backoff.calculateDelay(2)).toBe(5000);
      expect(backoff.calculateDelay(3)).toBe(5000);
      expect(backoff.calculateDelay(10)).toBe(5000);
    });
  });

  describe('max delay cap', () => {
    it('should cap delay at 1 hour', () => {
      const backoff = new Backoff({ type: BackoffStrategyType.EXPONENTIAL, delay: 1000 });
      
      // Attempt 20 would be 1000 * 2^19 = 524,288,000ms (6+ days)
      // Should be capped at 1 hour (3,600,000ms)
      const delay = backoff.calculateDelay(20);
      
      expect(delay).toBeLessThanOrEqual(3600000);
      expect(delay).toBe(3600000);
    });
  });

  describe('getNextRunAt', () => {
    it('should return future timestamp with correct delay for exponential', () => {
      const backoff = new Backoff({ type: BackoffStrategyType.EXPONENTIAL, delay: 1000 });
      const now = Date.now();
      
      const nextRunAt = backoff.getNextRunAt(2);
      
      expect(nextRunAt).toBeGreaterThan(now);
      expect(nextRunAt).toBeLessThanOrEqual(now + 2100);
    });

    it('should return future timestamp with correct delay for fixed', () => {
      const backoff = new Backoff({ type: BackoffStrategyType.FIXED, delay: 3000 });
      const now = Date.now();
      
      const nextRunAt = backoff.getNextRunAt(5);
      
      expect(nextRunAt).toBeGreaterThan(now);
      expect(nextRunAt).toBeLessThanOrEqual(now + 3100);
    });
  });

  describe('different base delays', () => {
    it('should respect configured base delay', () => {
      const backoff500 = new Backoff({ type: BackoffStrategyType.EXPONENTIAL, delay: 500 });
      const backoff2000 = new Backoff({ type: BackoffStrategyType.EXPONENTIAL, delay: 2000 });
      
      expect(backoff500.calculateDelay(3)).toBe(2000);
      expect(backoff2000.calculateDelay(3)).toBe(8000);
    });
  });
});
