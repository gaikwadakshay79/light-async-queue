import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Queue, StorageType, BackoffStrategyType, QueueConfig } from '../src/index.js';

describe('Queue', () => {
  let queue: Queue;
  const config: QueueConfig = {
    storage: StorageType.MEMORY,
    concurrency: 2,
    retry: {
      maxAttempts: 3,
      backoff: {
        type: BackoffStrategyType.EXPONENTIAL,
        delay: 100,
      },
    },
  };

  beforeEach(() => {
    queue = new Queue(config);
  });

  afterEach(async () => {
    await queue.shutdown();
  }, 15000);

  describe('initialization', () => {
    it('should create a queue with memory storage', () => {
      expect(queue).toBeDefined();
    });

    it('should throw error if file storage without path', () => {
      expect(() => {
        const invalidConfig: QueueConfig = {
          storage: StorageType.FILE,
          concurrency: 2,
          retry: {
            maxAttempts: 3,
            backoff: {
              type: BackoffStrategyType.FIXED,
              delay: 100,
            },
          },
        };
        new Queue(invalidConfig);
      }).toThrow();
    });
  });

  describe('process', () => {
    it('should set a processor function', () => {
      const processor = vi.fn(async () => {
        return { success: true };
      });

      queue.process(processor);
      // Processor is stored internally, we can't directly verify, but we can test that jobs are processed
    });
  });

  describe('add method', () => {
    it('should add a job to the queue', async () => {
      const jobId = await queue.add({ test: 'payload' });

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
    });

    it('should throw error when shutting down', async () => {
      await queue.shutdown();

      await expect(queue.add({ test: 'payload' })).rejects.toThrow(
        'Queue is shutting down'
      );
    });

    it('should return different IDs for different jobs', async () => {
      const id1 = await queue.add({ test: 'payload1' });
      const id2 = await queue.add({ test: 'payload2' });

      expect(id1).not.toBe(id2);
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', async () => {
      queue.process(async (_job) => {
        return { success: true };
      });

      await queue.add({ test: 'data' });

      const stats = await queue.getStats();

      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(typeof stats.active).toBe('number');
      expect(typeof stats.pending).toBe('number');
      expect(typeof stats.completed).toBe('number');
      expect(typeof stats.failed).toBe('number');
    });

    it('should reflect added jobs in pending count', async () => {
      queue.process(async (_job) => {
        return { success: true };
      });

      const statsBefore = await queue.getStats();
      expect(statsBefore.pending).toBe(0);

      await queue.add({ test: 'data' });

      const statsAfter = await queue.getStats();
      expect(statsAfter.pending).toBeGreaterThan(0);
    });
  });

  describe('getFailedJobs', () => {
    it('should return empty array when no failed jobs', async () => {
      const failedJobs = await queue.getFailedJobs();
      expect(failedJobs).toEqual([]);
    });
  });

  describe('reprocessFailed', () => {
    it('should return false for non-existent job', async () => {
      const result = await queue.reprocessFailed('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await queue.add({ test: 'data' });
      await queue.shutdown();
      // If it doesn't throw, shutdown was successful
      expect(true).toBe(true);
    });

    it('should prevent new jobs after shutdown', async () => {
      await queue.shutdown();

      await expect(queue.add({ test: 'data' })).rejects.toThrow();
    });
  });

  describe('job processing flow', () => {
    it('should allow setting processor and adding jobs', async () => {
      const processorFn = vi.fn(async (job) => {
        return { success: true, jobId: job.id };
      });

      queue.process(processorFn);
      const jobId = await queue.add({ test: 'data' });

      expect(jobId).toBeDefined();
      expect(typeof jobId).toBe('string');
    });
  });

  describe('concurrency control', () => {
    it('should be created with concurrency limit', async () => {
      const concurrencyConfig: QueueConfig = {
        storage: StorageType.MEMORY,
        concurrency: 1,
        retry: {
          maxAttempts: 2,
          backoff: {
            type: BackoffStrategyType.FIXED,
            delay: 50,
          },
        },
      };

      const concurrencyQueue = new Queue(concurrencyConfig);
      // Just verify the queue initializes with concurrency config
      expect(concurrencyQueue).toBeDefined();

      await concurrencyQueue.shutdown();
    });
  });
});
