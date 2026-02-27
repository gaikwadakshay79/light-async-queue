import { describe, it, expect, beforeEach } from 'vitest';
import { DeadLetterQueue } from '../src/dlq/DeadLetterQueue.js';
import { Job } from '../src/queue/Job.js';
import { MemoryStore } from '../src/storage/MemoryStore.js';

describe('DeadLetterQueue', () => {
  let dlq: DeadLetterQueue;
  let storage: MemoryStore;

  beforeEach(async () => {
    storage = new MemoryStore();
    await storage.initialize();
    dlq = new DeadLetterQueue(storage);
  });

  describe('add', () => {
    it('should add a job to the dead letter queue', async () => {
      const job = new Job({ test: 'data' }, 3);
      job.attempts = 3;

      await dlq.add(job);

      const failedJobs = await dlq.getAll();
      expect(failedJobs).toHaveLength(1);
      expect(failedJobs[0].id).toBe(job.id);
    });

    it('should handle multiple jobs in DLQ', async () => {
      const job1 = new Job({ test: 'data1' }, 3);
      const job2 = new Job({ test: 'data2' }, 3);

      await dlq.add(job1);
      await dlq.add(job2);

      const failedJobs = await dlq.getAll();
      expect(failedJobs).toHaveLength(2);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no jobs in DLQ', async () => {
      const failedJobs = await dlq.getAll();
      expect(failedJobs).toEqual([]);
    });

    it('should return all failed jobs', async () => {
      const job1 = new Job({ test: 'data1' }, 3);
      const job2 = new Job({ test: 'data2' }, 3);

      await dlq.add(job1);
      await dlq.add(job2);

      const failedJobs = await dlq.getAll();
      expect(failedJobs).toHaveLength(2);
      expect(failedJobs.map(j => j.id)).toContain(job1.id);
      expect(failedJobs.map(j => j.id)).toContain(job2.id);
    });
  });

  describe('get', () => {
    it('should return a specific failed job by ID', async () => {
      const job = new Job({ test: 'data' }, 3);
      await dlq.add(job);

      const retrieved = await dlq.get(job.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(job.id);
      expect(retrieved?.payload).toEqual({ test: 'data' });
    });

    it('should return null for non-existent job', async () => {
      const retrieved = await dlq.get('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('remove', () => {
    it('should remove a job from DLQ and return it', async () => {
      const job = new Job({ test: 'data' }, 3);
      job.attempts = 3;
      await dlq.add(job);

      const removed = await dlq.remove(job.id);
      expect(removed).not.toBeNull();
      expect(removed?.id).toBe(job.id);

      // Verify it's removed from DLQ
      const failedJobs = await dlq.getAll();
      expect(failedJobs).toHaveLength(0);
    });

    it('should reset job attempts and status when removing', async () => {
      const job = new Job({ test: 'data' }, 3);
      job.attempts = 3;
      job.markFailed('Test error');
      await dlq.add(job);

      const removed = await dlq.remove(job.id);
      expect(removed).not.toBeNull();
      expect(removed?.attempts).toBe(0);
    });

    it('should return null for non-existent job', async () => {
      const removed = await dlq.remove('non-existent-id');
      expect(removed).toBeNull();
    });
  });

  describe('count', () => {
    it('should return 0 when DLQ is empty', async () => {
      const count = await dlq.count();
      expect(count).toBe(0);
    });

    it('should return correct count of failed jobs', async () => {
      const job1 = new Job({ test: 'data1' }, 3);
      const job2 = new Job({ test: 'data2' }, 3);
      const job3 = new Job({ test: 'data3' }, 3);

      await dlq.add(job1);
      await dlq.add(job2);
      await dlq.add(job3);

      const count = await dlq.count();
      expect(count).toBe(3);
    });
  });

  describe('clear', () => {
    it('should remove all failed jobs from DLQ', async () => {
      const job1 = new Job({ test: 'data1' }, 3);
      const job2 = new Job({ test: 'data2' }, 3);

      await dlq.add(job1);
      await dlq.add(job2);

      expect(await dlq.count()).toBe(2);

      await dlq.clear();

      expect(await dlq.count()).toBe(0);
      expect(await dlq.getAll()).toEqual([]);
    });

    it('should handle clearing empty DLQ', async () => {
      await expect(dlq.clear()).resolves.not.toThrow();
    });
  });
});
