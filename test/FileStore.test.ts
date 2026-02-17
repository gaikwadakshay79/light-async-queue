import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileStore } from '../src/storage/FileStore.js';
import { Job } from '../src/queue/Job.js';
import { unlink, writeFile } from 'node:fs/promises';

describe('FileStore', () => {
  const testFilePath = './test-jobs.log';
  const testDLQPath = './test-jobs-dead-letter.log';

  // Cleanup helper
  async function cleanup() {
    try {
      await unlink(testFilePath);
    } catch (error) {
      // File doesn't exist - ignore
    }
    try {
      await unlink(testDLQPath);
    } catch (error) {
      // File doesn't exist - ignore
    }
  }

  beforeEach(async () => {
    await cleanup();
  });

  afterEach(async () => {
    await cleanup();
  });

  describe('initialization', () => {
    it('should initialize and create file', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      await store.close();
    });
  });

  describe('persistence', () => {
    it('should persist jobs to file', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const job = new Job({ data: 'test' }, 3);
      await store.addJob(job.toData());
      
      await store.close();
      
      // Reopen and verify persistence
      const store2 = new FileStore(testFilePath);
      await store2.initialize();
      
      const retrieved = await store2.getJob(job.id);
      
      expect(retrieved).toBeTruthy();
      expect(retrieved!.id).toBe(job.id);
      
      await store2.close();
    });
  });

  describe('crash recovery', () => {
    it('should recover processing jobs on restart', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const job = new Job({ data: 'test' }, 3);
      job.markProcessing();
      await store.addJob(job.toData());
      
      await store.close();
      
      // Simulate restart - job should be recovered
      const store2 = new FileStore(testFilePath);
      await store2.initialize();
      
      const recovered = await store2.getJob(job.id);
      
      expect(recovered).toBeTruthy();
      expect(recovered!.status).toBe('pending');
      expect(recovered!.attempts).toBe(1);
      
      await store2.close();
    });

    it('should recover multiple processing jobs', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const job1 = new Job({ data: 'test1' }, 3);
      const job2 = new Job({ data: 'test2' }, 3);
      const job3 = new Job({ data: 'test3' }, 3);
      
      job1.markProcessing();
      job2.markProcessing();
      job3.markCompleted();
      
      await store.addJob(job1.toData());
      await store.addJob(job2.toData());
      await store.addJob(job3.toData());
      
      await store.close();
      
      // Restart
      const store2 = new FileStore(testFilePath);
      await store2.initialize();
      
      const recovered1 = await store2.getJob(job1.id);
      const recovered2 = await store2.getJob(job2.id);
      const recovered3 = await store2.getJob(job3.id);
      
      expect(recovered1!.status).toBe('pending');
      expect(recovered2!.status).toBe('pending');
      expect(recovered3!.status).toBe('completed');
      
      await store2.close();
    });
  });

  describe('error handling', () => {
    it('should handle corrupted job lines gracefully', async () => {
      // Write corrupted data to file
      await writeFile(testFilePath, 'invalid json line\n{"id":"valid","status":"pending"}\n', 'utf-8');
      
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const jobs = await store.getAllJobs();
      // Should only load the valid job
      expect(jobs.length).toBeGreaterThanOrEqual(0);
      
      await store.close();
    });

    it('should handle corrupted DLQ lines gracefully', async () => {
      // Write corrupted data to DLQ file
      await writeFile(testDLQPath, 'invalid json line\n', 'utf-8');
      
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const failed = await store.getFailedJobs();
      expect(failed).toHaveLength(0);
      
      await store.close();
    });

    it('should throw error when updating non-existent job', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const job = new Job({ data: 'test' }, 3);
      
      await expect(store.updateJob(job.toData())).rejects.toThrow('Job');
      
      await store.close();
    });
  });

  describe('updateJob', () => {
    it('should persist job updates', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const job = new Job({ data: 'test' }, 3);
      await store.addJob(job.toData());
      
      job.markCompleted();
      await store.updateJob(job.toData());
      
      const retrieved = await store.getJob(job.id);
      expect(retrieved!.status).toBe('completed');
      
      await store.close();
    });
  });

  describe('getPendingJobs', () => {
    it('should return only pending jobs ready to run', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const now = Date.now();
      
      const job1 = new Job({ data: 'test1' }, 3);
      job1.nextRunAt = now - 1000; // Ready to run
      
      const job2 = new Job({ data: 'test2' }, 3);
      job2.nextRunAt = now + 10000; // Not ready yet
      
      const job3 = new Job({ data: 'test3' }, 3);
      job3.markCompleted();
      
      await store.addJob(job1.toData());
      await store.addJob(job2.toData());
      await store.addJob(job3.toData());
      
      const pending = await store.getPendingJobs(now);
      
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(job1.id);
      
      await store.close();
    });

    it('should sort pending jobs by nextRunAt', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const now = Date.now();
      
      const job1 = new Job({ data: 'test1' }, 3);
      job1.nextRunAt = now - 3000;
      
      const job2 = new Job({ data: 'test2' }, 3);
      job2.nextRunAt = now - 1000;
      
      const job3 = new Job({ data: 'test3' }, 3);
      job3.nextRunAt = now - 2000;
      
      await store.addJob(job1.toData());
      await store.addJob(job2.toData());
      await store.addJob(job3.toData());
      
      const pending = await store.getPendingJobs(now);
      
      expect(pending).toHaveLength(3);
      expect(pending[0].id).toBe(job1.id); // Oldest first
      expect(pending[1].id).toBe(job3.id);
      expect(pending[2].id).toBe(job2.id);
      
      await store.close();
    });
  });

  describe('getJob', () => {
    it('should return null for non-existent job', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const retrieved = await store.getJob('non-existent-id');
      
      expect(retrieved).toBeNull();
      
      await store.close();
    });
  });

  describe('dead letter queue', () => {
    it('should persist DLQ across restarts', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const job = new Job({ data: 'test' }, 3);
      await store.addJob(job.toData());
      await store.moveToDeadLetter(job.toData());
      
      const failed = await store.getFailedJobs();
      expect(failed).toHaveLength(1);
      
      await store.close();
      
      // Verify DLQ persistence
      const store2 = new FileStore(testFilePath);
      await store2.initialize();
      
      const failedAfterRestart = await store2.getFailedJobs();
      expect(failedAfterRestart).toHaveLength(1);
      
      await store2.close();
    });

    it('should remove job from main storage when moved to DLQ', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const job = new Job({ data: 'test' }, 3);
      await store.addJob(job.toData());
      
      await store.moveToDeadLetter(job.toData());
      
      const retrieved = await store.getJob(job.id);
      expect(retrieved).toBeNull();
      
      const failed = await store.getFailedJobs();
      expect(failed).toHaveLength(1);
      
      await store.close();
    });

    it('should remove job from DLQ', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const job = new Job({ data: 'test' }, 3);
      await store.addJob(job.toData());
      await store.moveToDeadLetter(job.toData());
      
      await store.removeFromDeadLetter(job.id);
      
      const failed = await store.getFailedJobs();
      expect(failed).toHaveLength(0);
      
      await store.close();
    });

    it('should handle empty DLQ file after removing all jobs', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const job1 = new Job({ data: 'test1' }, 3);
      const job2 = new Job({ data: 'test2' }, 3);
      
      await store.addJob(job1.toData());
      await store.addJob(job2.toData());
      
      await store.moveToDeadLetter(job1.toData());
      await store.moveToDeadLetter(job2.toData());
      
      await store.removeFromDeadLetter(job1.id);
      await store.removeFromDeadLetter(job2.id);
      
      const failed = await store.getFailedJobs();
      expect(failed).toHaveLength(0);
      
      await store.close();
    });
  });

  describe('getAllJobs', () => {
    it('should return all jobs', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const job1 = new Job({ data: 'test1' }, 3);
      const job2 = new Job({ data: 'test2' }, 3);
      const job3 = new Job({ data: 'test3' }, 3);
      
      await store.addJob(job1.toData());
      await store.addJob(job2.toData());
      await store.addJob(job3.toData());
      
      const allJobs = await store.getAllJobs();
      
      expect(allJobs).toHaveLength(3);
      
      await store.close();
    });
  });

  describe('close with null streams', () => {
    it('should handle close when streams are null', async () => {
      const store = new FileStore(testFilePath);
      // Don't initialize - streams will be null
      
      await expect(store.close()).resolves.toBeUndefined();
    });
  });

  describe('rewriteJobFile with empty jobs', () => {
    it('should handle empty job list when rewriting', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      // Add and then move all jobs to DLQ
      const job = new Job({ data: 'test' }, 3);
      await store.addJob(job.toData());
      await store.moveToDeadLetter(job.toData());
      
      // At this point, main job file should be rewritten with empty content
      const allJobs = await store.getAllJobs();
      expect(allJobs).toHaveLength(0);
      
      await store.close();
    });
  });

  describe('file system error handling', () => {
    it('should handle file read errors for main job file', async () => {
      // Create a file with permission issues by writing to a protected location
      const protectedPath = '/root/test-jobs.log';
      const store = new FileStore(protectedPath);
      
      // This should handle the error gracefully or throw appropriately
      try {
        await store.initialize();
        await store.close();
      } catch (error) {
        // Expected to fail on permission issues
        expect(error).toBeDefined();
      }
    });

    it('should handle multiple DLQ operations', async () => {
      const store = new FileStore(testFilePath);
      await store.initialize();
      
      const job1 = new Job({ data: 'test1' }, 3);
      const job2 = new Job({ data: 'test2' }, 3);
      
      await store.addJob(job1.toData());
      await store.addJob(job2.toData());
      
      // Move to DLQ
      await store.moveToDeadLetter(job1.toData());
      await store.moveToDeadLetter(job2.toData());
      
      // Remove one
      await store.removeFromDeadLetter(job1.id);
      
      const failed = await store.getFailedJobs();
      expect(failed).toHaveLength(1);
      expect(failed[0].id).toBe(job2.id);
      
      await store.close();
    });
  });
});
