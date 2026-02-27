import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../src/storage/MemoryStore.js';
import { Job } from '../src/queue/Job.js';

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    await store.initialize();
  });

  describe('initialization', () => {
    it('should initialize without errors', async () => {
      const newStore = new MemoryStore();
      await expect(newStore.initialize()).resolves.toBeUndefined();
    });
  });

  describe('addJob and getJob', () => {
    it('should add and retrieve a job', async () => {
      const job = new Job({ data: 'test' }, 3);
      await store.addJob(job.toData());
      
      const retrieved = await store.getJob(job.id);
      
      expect(retrieved).toBeTruthy();
      expect(retrieved!.id).toBe(job.id);
    });
  });

  describe('updateJob', () => {
    it('should update job status', async () => {
      const job = new Job({ data: 'test' }, 3);
      await store.addJob(job.toData());
      
      job.markProcessing();
      await store.updateJob(job.toData());
      
      const retrieved = await store.getJob(job.id);
      expect(retrieved!.status).toBe('processing');
    });

    it('should throw error when updating non-existent job', async () => {
      const job = new Job({ data: 'test' }, 3);
      
      await expect(store.updateJob(job.toData())).rejects.toThrow('Job');
    });
  });

  describe('getPendingJobs', () => {
    it('should return only pending jobs ready to run', async () => {
      const job1 = new Job({ data: 'test1' }, 3);
      const job2 = new Job({ data: 'test2' }, 3);
      const job3 = new Job({ data: 'test3' }, 3);
      
      // Job1: pending, ready now
      await store.addJob(job1.toData());
      
      // Job2: pending, ready in future
      job2.nextRunAt = Date.now() + 10000;
      await store.addJob(job2.toData());
      
      // Job3: processing
      job3.markProcessing();
      await store.addJob(job3.toData());
      
      const pending = await store.getPendingJobs(Date.now());
      
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(job1.id);
    });
  });

  describe('getAllJobs', () => {
    it('should return all jobs', async () => {
      const job1 = new Job({ data: 'test1' }, 3);
      const job2 = new Job({ data: 'test2' }, 3);
      
      await store.addJob(job1.toData());
      await store.addJob(job2.toData());
      
      const all = await store.getAllJobs();
      expect(all).toHaveLength(2);
    });
  });

  describe('moveToDeadLetter', () => {
    it('should move failed job to DLQ', async () => {
      const job = new Job({ data: 'test' }, 3);
      job.markFailed('Error 1');
      job.markFailed('Error 2');
      job.markFailed('Error 3');
      
      await store.addJob(job.toData());
      await store.moveToDeadLetter(job.toData());
      
      const retrieved = await store.getJob(job.id);
      expect(retrieved).toBeNull();
      
      const failed = await store.getFailedJobs();
      expect(failed).toHaveLength(1);
      expect(failed[0].id).toBe(job.id);
    });
  });

  describe('removeFromDeadLetter', () => {
    it('should remove job from DLQ', async () => {
      const job = new Job({ data: 'test' }, 3);
      await store.addJob(job.toData());
      await store.moveToDeadLetter(job.toData());
      
      await store.removeFromDeadLetter(job.id);
      
      const failed = await store.getFailedJobs();
      expect(failed).toHaveLength(0);
    });
  });

  describe('close', () => {
    it('should close without errors', async () => {
      await expect(store.close()).resolves.toBeUndefined();
    });
  });
});
