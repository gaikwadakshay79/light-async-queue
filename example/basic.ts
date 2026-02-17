import { Queue } from '../src/index.js';

/**
 * Basic usage example of light-queue
 */

async function main() {
  console.log('=== Light Queue Example ===\n');

  // Create a queue with file-based storage
  const queue = new Queue({
    storage: 'file',
    filePath: './example-jobs.log',
    concurrency: 3,
    retry: {
      maxAttempts: 5,
      backoff: {
        type: 'exponential',
        delay: 1000, // 1 second base delay
      },
    },
  });

  // Define the job processor
  queue.process(async (job) => {
    console.log(`[Worker] Processing job ${job.id}:`, job.payload);
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate random failures for demonstration
    const shouldFail = Math.random() < 0.3;
    if (shouldFail && job.attempts < 2) {
      throw new Error('Simulated failure');
    }
    
    console.log(`[Worker] Job ${job.id} completed successfully`);
    return { processed: true, timestamp: Date.now() };
  });

  // Add some jobs
  console.log('Adding jobs to queue...\n');
  
  const jobIds = [];
  for (let i = 1; i <= 10; i++) {
    const jobId = await queue.add({
      email: `user${i}@example.com`,
      action: 'send-welcome-email',
      userId: i,
    });
    jobIds.push(jobId);
    console.log(`Added job ${i}: ${jobId}`);
  }

  console.log(`\n${jobIds.length} jobs added to queue\n`);

  // Wait for jobs to process
  console.log('Processing jobs...\n');
  await new Promise(resolve => setTimeout(resolve, 15000));

  // Get queue statistics
  const stats = await queue.getStats();
  console.log('\n=== Queue Statistics ===');
  console.log(`Active: ${stats.active}`);
  console.log(`Pending: ${stats.pending}`);
  console.log(`Completed: ${stats.completed}`);
  console.log(`Failed: ${stats.failed}`);

  // Check failed jobs
  if (stats.failed > 0) {
    console.log('\n=== Failed Jobs (DLQ) ===');
    const failedJobs = await queue.getFailedJobs();
    failedJobs.forEach(job => {
      console.log(`Job ${job.id}: ${job.attempts} attempts`);
      console.log(`  Payload:`, job.payload);
    });

    // Optionally reprocess a failed job
    if (failedJobs.length > 0) {
      console.log(`\nReprocessing failed job: ${failedJobs[0].id}`);
      await queue.reprocessFailed(failedJobs[0].id);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Graceful shutdown
  console.log('\n=== Shutting Down ===');
  await queue.shutdown();
  console.log('Queue shut down successfully');
}

main().catch(console.error);
