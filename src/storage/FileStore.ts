import { StorageInterface, JobData, JobStatus } from '../types.js';
import { promises as fs } from 'node:fs';
import { createWriteStream, WriteStream } from 'node:fs';
import { dirname } from 'node:path';

/**
 * File-based storage implementation with crash recovery
 * Uses append-only log for durability
 */
export class FileStore implements StorageInterface {
  private filePath: string;
  private deadLetterPath: string;
  private jobs: Map<string, JobData>;
  private deadLetterJobs: Map<string, JobData>;
  private writeStream: WriteStream | null;
  private dlqWriteStream: WriteStream | null;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.deadLetterPath = filePath.replace(/\.log$/, '') + '-dead-letter.log';
    this.jobs = new Map();
    this.deadLetterJobs = new Map();
    this.writeStream = null;
    this.dlqWriteStream = null;
  }

  /**
   * Initialize storage and perform crash recovery
   */
  async initialize(): Promise<void> {
    // Ensure directory exists
    await this.ensureDirectory(this.filePath);
    await this.ensureDirectory(this.deadLetterPath);

    // Load existing jobs from file
    await this.loadJobsFromFile();
    
    // Perform crash recovery
    await this.performCrashRecovery();

    // Open write streams for appending
    this.writeStream = createWriteStream(this.filePath, { flags: 'a' });
    this.dlqWriteStream = createWriteStream(this.deadLetterPath, { flags: 'a' });
  }

  /**
   * Ensure parent directory exists
   */
  private async ensureDirectory(filePath: string): Promise<void> {
    const dir = dirname(filePath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      // Directory might already exist
    }
  }

  /**
   * Load jobs from log file
   */
  private async loadJobsFromFile(): Promise<void> {
    try {
      const content = await fs.readFile(this.filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      for (const line of lines) {
        try {
          const job = JSON.parse(line) as JobData;
          this.jobs.set(job.id, job);
        } catch (parseError) {
          console.error('Failed to parse job line:', line, parseError);
        }
      }
    } catch (error) {
      // File doesn't exist yet - this is fine for first run
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Load dead letter jobs
    try {
      const content = await fs.readFile(this.deadLetterPath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      for (const line of lines) {
        try {
          const job = JSON.parse(line) as JobData;
          this.deadLetterJobs.set(job.id, job);
        } catch (parseError) {
          console.error('Failed to parse DLQ job line:', line, parseError);
        }
      }
    } catch (error) {
      // File doesn't exist yet - this is fine
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Perform crash recovery:
   * - Any job with status "processing" is marked as "pending"
   * - Increment attempts by 1
   * - Set nextRunAt to now
   */
  private async performCrashRecovery(): Promise<void> {
    const now = Date.now();
    let recoveredCount = 0;

    for (const [id, job] of this.jobs.entries()) {
      if (job.status === JobStatus.PROCESSING) {
        // Job was being processed when system crashed
        job.status = JobStatus.PENDING;
        job.attempts += 1;
        job.nextRunAt = now;
        job.updatedAt = now;
        
        this.jobs.set(id, job);
        recoveredCount++;
      }
    }

    if (recoveredCount > 0) {
      console.log(`[FileStore] Crash recovery: ${recoveredCount} jobs recovered`);
      // Rewrite the entire file with recovered state
      await this.rewriteJobFile();
    }
  }

  /**
   * Rewrite the entire job file (used after crash recovery)
   */
  private async rewriteJobFile(): Promise<void> {
    const lines = Array.from(this.jobs.values())
      .map(job => JSON.stringify(job))
      .join('\n');
    
    if (lines.length > 0) {
      await fs.writeFile(this.filePath, lines + '\n', 'utf-8');
    }
  }

  /**
   * Append a job to the log file atomically
   */
  private async appendToLog(job: JobData): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.writeStream) {
        reject(new Error('Write stream not initialized'));
        return;
      }

      const line = JSON.stringify(job) + '\n';
      this.writeStream.write(line, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Append a job to the dead letter queue log
   */
  private async appendToDLQ(job: JobData): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.dlqWriteStream) {
        reject(new Error('DLQ write stream not initialized'));
        return;
      }

      const line = JSON.stringify(job) + '\n';
      this.dlqWriteStream.write(line, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async addJob(job: JobData): Promise<void> {
    this.jobs.set(job.id, { ...job });
    await this.appendToLog(job);
  }

  async updateJob(job: JobData): Promise<void> {
    if (!this.jobs.has(job.id)) {
      throw new Error(`Job ${job.id} not found`);
    }
    this.jobs.set(job.id, { ...job });
    await this.appendToLog(job);
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
    await this.appendToDLQ(job);
    
    // Rewrite main job file to remove the failed job
    await this.rewriteJobFile();
  }

  async getFailedJobs(): Promise<JobData[]> {
    return Array.from(this.deadLetterJobs.values()).map(job => ({ ...job }));
  }

  async removeFromDeadLetter(jobId: string): Promise<void> {
    this.deadLetterJobs.delete(jobId);
    
    // Rewrite DLQ file
    const lines = Array.from(this.deadLetterJobs.values())
      .map(job => JSON.stringify(job))
      .join('\n');
    
    if (lines.length > 0) {
      await fs.writeFile(this.deadLetterPath, lines + '\n', 'utf-8');
    } else {
      // If no jobs left, write empty file
      await fs.writeFile(this.deadLetterPath, '', 'utf-8');
    }
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      let closed = 0;
      const checkComplete = () => {
        closed++;
        if (closed === 2) {
          resolve();
        }
      };

      if (this.writeStream) {
        this.writeStream.end(checkComplete);
      } else {
        checkComplete();
      }

      if (this.dlqWriteStream) {
        this.dlqWriteStream.end(checkComplete);
      } else {
        checkComplete();
      }
    });
  }
}
