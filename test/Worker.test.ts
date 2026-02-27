import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Worker } from '../src/worker/Worker.js';
import { JobData, JobStatus } from '../src/index.js';

describe('Worker', () => {
  let worker: Worker;
  const simpleProcessor = async (job: JobData) => {
    return { processed: true, jobId: job.id };
  };

  beforeEach(() => {
    worker = new Worker(simpleProcessor);
  });

  afterEach(async () => {
    try {
      await worker.terminate();
    } catch {
      // Ignore termination errors in cleanup
    }
  }, 15000);

  describe('initialization', () => {
    it('should create a worker instance', () => {
      expect(worker).toBeDefined();
    });

    it('should not be busy initially', () => {
      expect(worker.isBusy()).toBe(false);
    });
  });

  describe('execute', () => {
    it('should throw error if worker is not initialized', async () => {
      const jobData: JobData = {
        id: 'test-job-1',
        payload: { test: 'data' },
        attempts: 0,
        maxAttempts: 3,
        status: JobStatus.PROCESSING,
        priority: 0,
        progress: 0,
        nextRunAt: Date.now(),
        delay: 0,
        repeatCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await expect(worker.execute(jobData)).rejects.toThrow('Worker not initialized');
    });
  });

  describe('isBusy', () => {
    it('should return false when not processing', () => {
      expect(worker.isBusy()).toBe(false);
    });
  });

  describe('terminate', () => {
    it('should handle terminate when not initialized', async () => {
      await expect(worker.terminate()).resolves.not.toThrow();
    });
  });

  describe('processor function handling', () => {
    it('should store the processor function', () => {
      const testProcessor = async (_job: JobData) => {
        return { processed: true };
      };

      const testWorker = new Worker(testProcessor);
      expect(testWorker).toBeDefined();
    });
  });
});
