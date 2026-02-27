import { StorageInterface } from '../types.js';
import { EventEmitter } from 'node:events';

/**
 * Scheduler that periodically checks for pending jobs
 * Runs every 200ms and emits events for jobs ready to process
 */
export class Scheduler extends EventEmitter {
  private storage: StorageInterface;
  private interval: NodeJS.Timeout | null;
  private isRunning: boolean;
  private readonly tickInterval: number = 200; // 200ms

  constructor(storage: StorageInterface) {
    super();
    this.storage = storage;
    this.interval = null;
    this.isRunning = false;
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.interval = setInterval(() => {
      this.tick().catch(error => {
        this.emit('error', error);
      });
    }, this.tickInterval);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
  }

  /**
   * Single tick - check for pending jobs
   */
  private async tick(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    const now = Date.now();
    const pendingJobs = await this.storage.getPendingJobs(now);

    // Sort by priority (higher first) then by nextRunAt (earlier first)
    const sortedJobs = pendingJobs.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return a.nextRunAt - b.nextRunAt;
    });

    for (const job of sortedJobs) {
      // Emit job-ready event for each pending job
      this.emit('job-ready', job);
    }
  }

  /**
   * Check if scheduler is running
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }
}
