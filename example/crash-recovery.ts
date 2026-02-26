import { Queue, StorageType, BackoffStrategyType } from '../src/index.js';

/**
 * Crash recovery demonstration
 * 
 * This example shows how the queue recovers from crashes:
 * 1. Jobs in "processing" state are marked as "pending"
 * 2. Attempts are incremented
 * 3. Jobs are retried automatically
 */

async function main() {
  console.log('=== Crash Recovery Example ===\n');

  const queue = new Queue({
    storage: StorageType.FILE,
    filePath: './crash-recovery-jobs.log',
    concurrency: 2,
    retry: {
      maxAttempts: 3,
      backoff: {
        type: BackoffStrategyType.EXPONENTIAL,
        delay: 1000,
      },
    },
  });

  queue.process(async (job) => {
    console.log(`[Worker] Processing job ${job.id} (attempt ${job.attempts + 1})`);
    console.log(`  Payload:`, job.payload);
    
    // Simulate work
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate crash on first attempt
    if (job.attempts === 0) {
      console.log(`[Worker] Simulating crash for job ${job.id}...`);
      process.exit(1); // Force crash
    }
    
    console.log(`[Worker] Job ${job.id} completed successfully`);
    return { success: true };
  });

  // Add a job
  console.log('Adding job to queue...\n');
  const jobId = await queue.add({
    task: 'important-task',
    data: { value: 42 },
  });
  console.log(`Job added: ${jobId}\n`);

  // Wait a bit for processing to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('Job is now processing...');
  console.log('The worker will crash, but the job will be recovered on next run.\n');
  console.log('Run this script again to see the recovery in action!');

  // Keep process alive
  await new Promise(resolve => setTimeout(resolve, 10000));
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
