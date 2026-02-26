import { Queue, StorageType, BackoffStrategyType } from '../src/index.js';

/**
 * Restart Recovery Example
 * 
 * This demonstrates how the queue recovers jobs after a restart.
 * The processor function is defined by YOUR application code,
 * not stored in the job data.
 * 
 * Run this example:
 * 1. First run: node dist/example/restart-recovery.js
 * 2. Kill it with Ctrl+C while jobs are processing
 * 3. Run again: node dist/example/restart-recovery.js
 * 4. Watch it recover and complete the interrupted jobs
 */

async function main() {
  console.log('=== Restart Recovery Example ===\n');
  console.log('Application starting...\n');

  // 1. Create queue with file storage
  const queue = new Queue({
    storage: StorageType.FILE,
    filePath: './restart-recovery-jobs.log',
    concurrency: 2,
    retry: {
      maxAttempts: 3,
      backoff: {
        type: BackoffStrategyType.EXPONENTIAL,
        delay: 1000,
      },
    },
  });

  // 2. Define YOUR processor function
  //    This is YOUR business logic that runs every time the app starts
  queue.process(async (job) => {
    console.log(`[Worker] Processing job ${job.id} (attempt ${job.attempts + 1})`);
    console.log(`  Action: ${(job.payload as any).action}`);
    console.log(`  Data:`, job.payload);
    
    // Simulate work
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(`[Worker] Job ${job.id} completed\n`);
    return { success: true, timestamp: Date.now() };
  });

  // 3. Check if there are existing jobs (from previous run)
  const stats = await queue.getStats();
  console.log('Current queue state:');
  console.log(`  Pending: ${stats.pending}`);
  console.log(`  Active: ${stats.active}`);
  console.log(`  Completed: ${stats.completed}`);
  console.log(`  Failed: ${stats.failed}\n`);

  if (stats.pending > 0) {
    console.log(`⚠️  Found ${stats.pending} pending jobs from previous run!`);
    console.log('These will be processed automatically.\n');
  }

  // 4. Add new jobs (only if this is the first run)
  if (stats.pending === 0 && stats.active === 0 && stats.completed === 0) {
    console.log('First run - adding new jobs...\n');
    
    await queue.add({
      action: 'send-email',
      email: 'user1@example.com',
      template: 'welcome',
    });
    
    await queue.add({
      action: 'process-payment',
      amount: 99.99,
      userId: 123,
    });
    
    await queue.add({
      action: 'generate-report',
      reportType: 'monthly',
      userId: 456,
    });
    
    console.log('3 jobs added to queue\n');
    console.log('💡 TIP: Press Ctrl+C while jobs are processing to simulate a crash');
    console.log('Then run this script again to see crash recovery in action!\n');
  }

  // 5. Keep running
  console.log('Processing jobs... (Press Ctrl+C to stop)\n');
  
  // Wait indefinitely (until Ctrl+C)
  await new Promise(() => {});
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
