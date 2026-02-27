import { Queue, StorageType, BackoffStrategyType, QueueEventType, JobData } from '../src/index.js';

/**
 * Comprehensive example showcasing all BullMQ-compatible features
 */
async function main() {
  console.log('🚀 Light Async Queue - Advanced Features Demo\n');

  // Create queue with advanced features
  const queue = new Queue({
    storage: StorageType.MEMORY,
    concurrency: 3,
    retry: {
      maxAttempts: 3,
      backoff: {
        type: BackoffStrategyType.EXPONENTIAL,
        delay: 1000,
      },
    },
    // Rate limiting: max 10 jobs per 5 seconds
    rateLimiter: {
      max: 10,
      duration: 5000,
    },
    // Webhook notifications
    webhooks: [
      {
        url: 'https://example.com/webhook',
        events: [QueueEventType.COMPLETED, QueueEventType.FAILED],
        headers: {
          'Authorization': 'Bearer token123',
        },
      },
    ],
    stalledInterval: 30000, // Check for stalled jobs every 30 seconds
  });

  // ========================================
  // 1. JOB EVENTS & LISTENERS
  // ========================================
  console.log('📢 Setting up event listeners...');
  
  queue.on(QueueEventType.WAITING, (job: JobData) => {
    console.log(`⏳ Job ${job.id} is waiting for dependencies`);
  });

  queue.on(QueueEventType.DELAYED, (job: JobData) => {
    console.log(`⏰ Job ${job.id} is delayed until ${new Date(job.nextRunAt).toISOString()}`);
  });

  queue.on(QueueEventType.ACTIVE, (job: JobData) => {
    console.log(`▶️  Job ${job.id} is now active`);
  });

  queue.on(QueueEventType.PROGRESS, (job: JobData, progress: number) => {
    console.log(`📊 Job ${job.id} progress: ${progress}%`);
  });

  queue.on(QueueEventType.COMPLETED, (job: JobData, result: unknown) => {
    console.log(`✅ Job ${job.id} completed:`, result);
  });

  queue.on(QueueEventType.FAILED, (job: JobData, error: Error) => {
    console.error(`❌ Job ${job.id} failed:`, error.message);
  });

  queue.on(QueueEventType.STALLED, (job: JobData) => {
    console.warn(`⚠️  Job ${job.id} appears stalled`);
  });

  queue.on(QueueEventType.DRAINED, () => {
    console.log('🏁 Queue drained - all jobs processed');
  });

  // ========================================
  // 2. JOB PROCESSOR WITH PROGRESS
  // ========================================
  console.log('⚙️  Setting up job processor...\n');

  queue.process(async (job) => {
    console.log(`Processing job: ${job.id}`);

    // Progress tracking
    await job.updateProgress(25);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await job.updateProgress(50);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await job.updateProgress(75);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await job.updateProgress(100);

    return { 
      processed: true, 
      data: job.payload,
      timestamp: Date.now(),
    };
  });

  // ========================================
  // 3. JOB PRIORITIES
  // ========================================
  console.log('🎯 Adding jobs with priorities...');
  
  await queue.add(
    { type: 'low-priority', message: 'Process me last' },
    { priority: 1 }
  );

  await queue.add(
    { type: 'high-priority', message: 'Process me first!' },
    { priority: 10 }
  );

  await queue.add(
    { type: 'medium-priority', message: 'Process me second' },
    { priority: 5 }
  );

  // ========================================
  // 4. DELAYED JOBS
  // ========================================
  console.log('⏰ Adding delayed job...');
  
  await queue.add(
    { type: 'delayed', message: 'Execute me in 2 seconds' },
    { delay: 2000 }
  );

  // ========================================
  // 5. REPEATING JOBS (Simple Interval)
  // ========================================
  console.log('🔄 Adding repeating job (every 5 seconds)...');
  
  await queue.add(
    { type: 'heartbeat', message: 'I repeat every 5 seconds' },
    { 
      repeat: {
        every: 5000,      // Every 5 seconds
        limit: 3,         // Repeat only 3 times
      }
    }
  );

  // ========================================
  // 6. CRON-STYLE REPEATING JOBS
  // ========================================
  console.log('📅 Adding cron-style job (every minute)...');
  
  await queue.add(
    { type: 'scheduled', message: 'I run every minute' },
    { 
      repeat: {
        pattern: '* * * * *', // Every minute (cron format)
        limit: 2,             // Run only twice
      }
    }
  );

  // ========================================
  // 7. JOB DEPENDENCIES
  // ========================================
  console.log('🔗 Adding jobs with dependencies...');
  
  const job1Id = await queue.add(
    { type: 'step1', message: 'I run first' },
    { jobId: 'job-1' }
  );

  const job2Id = await queue.add(
    { type: 'step2', message: 'I wait for step 1' },
    { 
      jobId: 'job-2',
      dependsOn: [job1Id] 
    }
  );

  await queue.add(
    { type: 'step3', message: 'I wait for step 2' },
    { 
      jobId: 'job-3',
      dependsOn: [job2Id] 
    }
  );

  // ========================================
  // 8. QUEUE OPERATIONS
  // ========================================
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('\n📊 Queue Statistics:');
  const stats = await queue.getStats();
  console.log(stats);

  console.log('\n🔍 Getting specific job...');
  const job = await queue.getJob(job1Id);
  if (job) {
    console.log(`Found job ${job.id} with status: ${job.status}`);
  }

  // Pause and resume
  console.log('\n⏸️  Pausing queue...');
  queue.pause();
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('▶️  Resuming queue...');
  queue.resume();

  // ========================================
  // 9. DRAINING QUEUE
  // ========================================
  console.log('\n⏳ Waiting for all jobs to complete (drain)...');
  await queue.drain();
  console.log('✅ All jobs processed!');

  // ========================================
  // 10. CLEANUP
  // ========================================
  console.log('\n🧹 Cleaning old completed jobs...');
  const cleaned = await queue.clean(60000); // Remove jobs older than 1 minute
  console.log(`Cleaned ${cleaned} old jobs`);

  // Final stats
  console.log('\n📊 Final Statistics:');
  const finalStats = await queue.getStats();
  console.log(finalStats);

  // Graceful shutdown
  console.log('\n👋 Shutting down gracefully...');
  await queue.shutdown();
  
  console.log('\n✨ Demo complete!');
}

main().catch(console.error);
