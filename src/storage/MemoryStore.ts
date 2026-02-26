import { StorageInterface, JobData, JobStatus } from '../types.js';

/**
 * In-memory storage implementation
 * Suitable for development and testing
 */
export class MemoryStore implements StorageInterface {
  private jobs: Map<string, JobData>;
  private deadLetterJobs: Map<string, JobData>;

  constructor() {
    this.jobs = new Map();
    this.deadLetterJobs = new Map();
  }

  async initialize(): Promise<void> {
    // No initialization needed for memory store
  }

  async addJob(job: JobData): Promise<void> {
    this.jobs.set(job.id, { ...job });
  }

  async updateJob(job: JobData): Promise<void> {
    if (!this.jobs.has(job.id)) {
      throw new Error(`Job ${job.id} not found`);
    }
    this.jobs.set(job.id, { ...job });
  }

  async getPendingJobs(now: number): Promise<JobData[]> {
    const pendingJobs: JobData[] = [];
    
    for (const job of this.jobs.values()) {
      if (job.status === JobStatus.PENDING && job.nextRunAt <= now) {
        pendingJobs.push({ ...job });
      }
    }
    
    // Sort by nextRunAt (oldest first)
    return pendingJobs.sort((a, b) => a.nextRunAt - b.nextRunAt);
  }

  async getJob(id: string): Promise<JobData | null> {
    const job = this.jobs.get(id);
    return job ? { ...job } : null;
  }

  async getAllJobs(): Promise<JobData[]> {
    return Array.from(this.jobs.values()).map(job => ({ ...job }));
  }

  async moveToDeadLetter(job: JobData): Promise<void> {
    this.deadLetterJobs.set(job.id, { ...job });
    this.jobs.delete(job.id);
  }

  async getFailedJobs(): Promise<JobData[]> {
    return Array.from(this.deadLetterJobs.values()).map(job => ({ ...job }));
  }

  async removeFromDeadLetter(jobId: string): Promise<void> {
    this.deadLetterJobs.delete(jobId);
  }

  async close(): Promise<void> {
    // No cleanup needed for memory store
  }
}
