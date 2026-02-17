import { StorageInterface, JobData } from '../types.js';
import { Job } from '../queue/Job.js';

/**
 * Dead Letter Queue for managing failed jobs
 */
export class DeadLetterQueue {
  private storage: StorageInterface;

  constructor(storage: StorageInterface) {
    this.storage = storage;
  }

  /**
   * Move a job to the dead letter queue
   */
  async add(job: Job): Promise<void> {
    await this.storage.moveToDeadLetter(job.toData());
  }

  /**
   * Get all failed jobs
   */
  async getAll(): Promise<JobData[]> {
    return this.storage.getFailedJobs();
  }

  /**
   * Get a specific failed job by ID
   */
  async get(jobId: string): Promise<JobData | null> {
    const failedJobs = await this.storage.getFailedJobs();
    return failedJobs.find(job => job.id === jobId) || null;
  }

  /**
   * Remove a job from DLQ and return it for reprocessing
   */
  async remove(jobId: string): Promise<Job | null> {
    const jobData = await this.get(jobId);
    
    if (!jobData) {
      return null;
    }

    await this.storage.removeFromDeadLetter(jobId);
    
    // Create a Job instance and reset it for reprocessing
    const job = Job.fromData(jobData);
    job.reset();
    
    return job;
  }

  /**
   * Get count of failed jobs
   */
  async count(): Promise<number> {
    const jobs = await this.storage.getFailedJobs();
    return jobs.length;
  }

  /**
   * Clear all failed jobs (use with caution)
   */
  async clear(): Promise<void> {
    const jobs = await this.storage.getFailedJobs();
    for (const job of jobs) {
      await this.storage.removeFromDeadLetter(job.id);
    }
  }
}
