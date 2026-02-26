import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Scheduler } from '../src/queue/Scheduler.js';
import { MemoryStore } from '../src/storage/MemoryStore.js';
import { Job } from '../src/queue/Job.js';
import type { StorageInterface } from '../src/types.js';

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let storage: MemoryStore;

  beforeEach(async () => {
    storage = new MemoryStore();
    await storage.initialize();
    scheduler = new Scheduler(storage);
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe('start and stop', () => {
    it('should start the scheduler', () => {
      expect(scheduler.getIsRunning()).toBe(false);
      scheduler.start();
      expect(scheduler.getIsRunning()).toBe(true);
      scheduler.stop();
    });

    it('should stop the scheduler', () => {
      scheduler.start();
      expect(scheduler.getIsRunning()).toBe(true);
      scheduler.stop();
      expect(scheduler.getIsRunning()).toBe(false);
    });

    it('should not start if already running', () => {
      scheduler.start();
      expect(scheduler.getIsRunning()).toBe(true);
      scheduler.start(); // Call again
      expect(scheduler.getIsRunning()).toBe(true);
      scheduler.stop();
    });

    it('should handle multiple stop calls', () => {
      scheduler.start();
      scheduler.stop();
      expect(() => scheduler.stop()).not.toThrow();
    });
  });

  describe('job scheduling', () => {
    it('should emit job-ready event for pending jobs', async () => {
      const job = new Job({ test: 'data' }, 3);
      await storage.addJob(job.toData());

      const jobReadyHandler = vi.fn();
      scheduler.on('job-ready', jobReadyHandler);

      scheduler.start();

      // Wait for scheduler to tick
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(jobReadyHandler).toHaveBeenCalled();
      const emittedJob = jobReadyHandler.mock.calls[0][0];
      expect(emittedJob.id).toBe(job.id);

      scheduler.stop();
    });

    it('should not emit jobs that are not yet ready', async () => {
      const futureTime = Date.now() + 10000;
      const job = new Job({ test: 'data' }, 3);
      job.nextRunAt = futureTime;
      await storage.addJob(job.toData());

      const jobReadyHandler = vi.fn();
      scheduler.on('job-ready', jobReadyHandler);

      scheduler.start();

      // Wait for scheduler to tick
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(jobReadyHandler).not.toHaveBeenCalled();
      scheduler.stop();
    });

    it('should emit multiple pending jobs', async () => {
      const job1 = new Job({ test: 'data1' }, 3);
      const job2 = new Job({ test: 'data2' }, 3);
      await storage.addJob(job1.toData());
      await storage.addJob(job2.toData());

      const jobReadyHandler = vi.fn();
      scheduler.on('job-ready', jobReadyHandler);

      scheduler.start();

      // Wait for scheduler to tick
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(jobReadyHandler.mock.calls.length).toBeGreaterThanOrEqual(2);
      scheduler.stop();
    });
  });

  describe('getIsRunning', () => {
    it('should return false when not running', () => {
      expect(scheduler.getIsRunning()).toBe(false);
    });

    it('should return true when running', () => {
      scheduler.start();
      expect(scheduler.getIsRunning()).toBe(true);
      scheduler.stop();
    });
  });

  describe('error handling', () => {
    it('should emit error event on tick failure', async () => {
      // Create a mock storage that throws an error
      const badStorage: StorageInterface = {
        initialize: async () => {},
        addJob: async () => {},
        updateJob: async () => {},
        getPendingJobs: async () => {
          throw new Error('Storage error');
        },
        getJob: async () => null,
        getAllJobs: async () => [],
        moveToDeadLetter: async () => {},
        getFailedJobs: async () => [],
        removeFromDeadLetter: async () => {},
        close: async () => {},
      };

      const badScheduler = new Scheduler(badStorage);
      const errorHandler = vi.fn();
      badScheduler.on('error', errorHandler);

      badScheduler.start();

      // Wait for scheduler to tick and encounter error
      await new Promise(resolve => setTimeout(resolve, 300));

      expect(errorHandler).toHaveBeenCalled();
      badScheduler.stop();
    });
  });
});
