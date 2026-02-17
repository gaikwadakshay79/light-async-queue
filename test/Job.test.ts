import { describe, it, expect } from 'vitest';
import { Job } from '../src/queue/Job.js';

describe('Job', () => {
  describe('creation', () => {
    it('should create a job with correct initial values', () => {
      const job = new Job({ email: 'test@example.com' }, 3);
      
      expect(job.id).toBeTruthy();
      expect(job.attempts).toBe(0);
      expect(job.maxAttempts).toBe(3);
      expect(job.status).toBe('pending');
      expect(job.createdAt).toBeGreaterThan(0);
      expect(job.payload).toEqual({ email: 'test@example.com' });
    });
  });

  describe('markProcessing', () => {
    it('should update status to processing', () => {
      const job = new Job({ data: 'test' }, 3);
      job.markProcessing();
      
      expect(job.status).toBe('processing');
      expect(job.updatedAt).toBeGreaterThanOrEqual(job.createdAt);
    });
  });

  describe('markCompleted', () => {
    it('should update status to completed', () => {
      const job = new Job({ data: 'test' }, 3);
      job.markCompleted();
      
      expect(job.status).toBe('completed');
    });
  });

  describe('markFailed', () => {
    it('should increment attempts and set status to pending for retry', () => {
      const job = new Job({ data: 'test' }, 3);
      const nextRunAt = Date.now() + 5000;
      job.markFailed(nextRunAt);
      
      expect(job.attempts).toBe(1);
      expect(job.status).toBe('pending');
      expect(job.nextRunAt).toBe(nextRunAt);
    });

    it('should set status to failed after exceeding max attempts', () => {
      const job = new Job({ data: 'test' }, 2);
      job.markFailed();
      job.markFailed();
      
      expect(job.attempts).toBe(2);
      expect(job.status).toBe('failed');
      expect(job.hasExceededMaxAttempts()).toBe(true);
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize correctly', () => {
      const job = new Job({ email: 'test@example.com' }, 3);
      job.markProcessing();
      
      const data = job.toData();
      const restored = Job.fromData(data);
      
      expect(restored.id).toBe(job.id);
      expect(restored.status).toBe(job.status);
      expect(restored.attempts).toBe(job.attempts);
      expect(restored.payload).toEqual(job.payload);
    });
  });

  describe('reset', () => {
    it('should reset job for reprocessing', () => {
      const job = new Job({ data: 'test' }, 3);
      job.markFailed();
      job.markFailed();
      
      expect(job.attempts).toBe(2);
      
      job.reset();
      
      expect(job.attempts).toBe(0);
      expect(job.status).toBe('pending');
    });
  });
});
