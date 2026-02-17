import { Queue } from '../src/index.js';

/**
 * Concurrency control demonstration
 * Shows how the queue respects the concurrency limit
 */

async function main() {
  console.log('=== Concurrency Control Example ===\n');

  const queue = new Queue({
    storage: 'memory',
    concurrency: 3, // Only 3 jobs run in parallel
    retry: {
      maxAttempts: 2,
      backoff: {
        type: 'exponential',
        delay: 500,
      },
    },
  });

  let activeCount = 0;
  let maxConcurrent = 0;

  queue.process(async (job) => {
    activeCount++;
    maxConcurrent = Math.max(maxConcurrent, activeCount);
    
    console.log(`[Worker] Started job ${job.id} | Active: ${activeCount}`);
    
    // Simulate work (2 seconds)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    activeCount--;
    console.log(`[Worker] Finished job ${job.id} | Active: ${activeCount}`);
    
    return { processed: true };
  });

  // Add 10 jobs
  console.log('Adding 10 jobs to queue...\n');
  for (let i = 1; i <= 10; i++) {
    await queue.add({ jobNumber: i });
  }

  // Wait for all jobs to complete
  await new Promise(resolve => setTimeout(resolve, 8000));

  const stats = await queue.getStats();
  console.log('\n=== Results ===');
  console.log(`Max concurrent jobs: ${maxConcurrent} (should be 3)`);
  console.log(`Completed: ${stats.completed}`);
  console.log(`Failed: ${stats.failed}`);

  await queue.shutdown();
}

main().catch(console.error);
