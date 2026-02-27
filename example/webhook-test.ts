import { Queue, StorageType, BackoffStrategyType, QueueEventType } from '../src/index.js';

/**
 * Webhook example - Send job events to a local webhook server
 * Run the echo server first:
 *   node dist/example/webhook-echo-server.js
 */

async function main() {
  console.log('🪝 Webhook Test Example\n');

  // Create queue with webhook configuration
  const queue = new Queue({
    storage: StorageType.MEMORY,
    concurrency: 3,
    retry: {
      maxAttempts: 2,
      backoff: {
        type: BackoffStrategyType.EXPONENTIAL,
        delay: 1000,
      },
    },
    // Configure webhooks to send to local echo server
    webhooks: [
      {
        url: 'http://localhost:3000/webhook',
        events: [
          QueueEventType.ACTIVE,
          QueueEventType.COMPLETED,
          QueueEventType.FAILED,
          QueueEventType.PROGRESS,
        ],
        headers: {
          'X-Queue-Name': 'webhook-test',
          'X-Source': 'light-async-queue',
        },
      },
    ],
  });

  // Listen to local events too
  queue.on(QueueEventType.ACTIVE, (job) => {
    console.log(`▶️  Job ${job.id} started`);
  });

  queue.on(QueueEventType.PROGRESS, (job, progress) => {
    console.log(`📊 Job ${job.id}: ${progress}% complete`);
  });

  queue.on(QueueEventType.COMPLETED, (job) => {
    console.log(`✅ Job ${job.id} completed\n`);
  });

  queue.on(QueueEventType.FAILED, (job, error) => {
    console.log(`❌ Job ${job.id} failed: ${error.message}\n`);
  });

  // Define processor
  queue.process(async (job) => {
    // Simulate work
    await job.updateProgress(25);
    await new Promise(r => setTimeout(r, 200));

    await job.updateProgress(50);
    await new Promise(r => setTimeout(r, 200));

    await job.updateProgress(75);
    await new Promise(r => setTimeout(r, 200));

    await job.updateProgress(100);

    // Simulate occasional failure
    if (Math.random() < 0.3) {
      throw new Error('Random failure for demo');
    }

    return { success: true, processedAt: Date.now() };
  });

  console.log('📢 Adding jobs to queue...\n');

  // Add multiple jobs
  for (let i = 1; i <= 5; i++) {
    await queue.add(
      { id: i, task: `Job ${i}`, priority: Math.floor(Math.random() * 10) },
      { priority: Math.floor(Math.random() * 5) }
    );
  }

  console.log('⏳ Processing jobs (webhooks sent to http://localhost:3000/webhook)...\n');

  // Wait for all jobs
  await queue.drain();

  console.log('🏁 All jobs completed!');
  console.log('📊 Final Stats:');
  const stats = await queue.getStats();
  console.log(stats);

  await queue.shutdown();
  console.log('\n✨ Demo complete!');
}

main().catch(console.error);
