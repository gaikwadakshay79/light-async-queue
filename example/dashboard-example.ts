import {
  Queue,
  StorageType,
  BackoffStrategyType,
  Dashboard,
} from "../src/index.js";
import { availableParallelism } from "node:os";

/**
 * Example: Queue with HTML Dashboard
 *
 * This example demonstrates how to use the Dashboard to monitor queue status
 * in real-time, similar to Zookeeper. The dashboard provides:
 *
 * - Real-time queue statistics (active, waiting, delayed, failed jobs)
 * - Live job tracking with progress
 * - Dead Letter Queue management
 * - WebSocket-based updates
 * - Responsive web UI
 */

const workerConcurrency = Math.min(
  64,
  Math.max(12, availableParallelism() * 4),
);
const demoDurationMs = Number(process.env.DEMO_DURATION_MS || 100000);

const queue = new Queue({
  storage: StorageType.MEMORY,
  filePath: "./dashboard-jobs.log",
  concurrency: workerConcurrency,
  retry: {
    maxAttempts: 2,
    backoff: {
      type: BackoffStrategyType.FIXED,
      delay: 20,
    },
  },
});

// Initialize the dashboard server
const dashboard = new Dashboard(queue, {
  port: 3000,
  host: "localhost",
  updateInterval: 1000, // Update every 1 second
});

// Define the job processor
queue.process(async (job) => {
  const payload = job.payload as { mode?: string; batch?: number };
  const isHighThroughputJob = payload?.mode === "throughput";

  if (isHighThroughputJob) {
    // Hot path: avoid artificial delay and progress IPC for max throughput.
  } else {
    // Keep the richer progress visualization for regular sample jobs.
    for (let i = 0; i <= 100; i += 25) {
      await job.updateProgress(i);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  // Keep failures for regular jobs only to avoid throughput distortion.
  if (!isHighThroughputJob && Math.random() > 0.95) {
    throw new Error("Simulated job failure for testing");
  }

  return { success: true, processedAt: new Date(), batch: payload?.batch };
});

// Listen to job events
queue.on("completed", (job, result) => {
  const payload = job.payload as { mode?: string };
  if (payload?.mode !== "throughput") {
    console.log(`[Event] Job ${job.id} completed:`, result);
  }
});

queue.on("failed", (job, error) => {
  console.log(`[Event] Job ${job.id} failed:`, error.message);
});

queue.on("stalled", (job) => {
  console.log(`[Event] Job ${job.id} is stalled`);
});

/**
 * Start the dashboard and add sample jobs
 */
async function main() {
  try {
    let isShuttingDown = false;

    const shutdown = async (reason: string) => {
      if (isShuttingDown) {
        return;
      }
      isShuttingDown = true;

      console.log(`\n\nShutting down gracefully (${reason})...`);

      clearInterval(jobProducerInterval);
      clearInterval(statsInterval);
      clearTimeout(demoTimeout);

      await dashboard.stop();
      await queue.shutdown();
      process.exit(0);
    };

    // Start the dashboard server
    await dashboard.start();

    console.log("\n✨ Dashboard started! Open your browser:");
    console.log("   http://localhost:3000\n");
    console.log(`Worker concurrency: ${workerConcurrency}`);
    console.log(`Demo duration: ${Math.round(demoDurationMs / 1000)}s`);

    // Add some sample jobs to demonstrate the dashboard
    console.log("Adding sample jobs...\n");

    // Add immediate jobs
    for (let i = 0; i < 5; i++) {
      await queue.add({
        id: i,
        task: "process_data",
        data: { input: `Item ${i}` },
      });
      console.log(`✓ Added job ${i}`);
    }

    // Add delayed jobs
    for (let i = 5; i < 8; i++) {
      await queue.add(
        {
          id: i,
          task: "scheduled_task",
          data: { input: `Item ${i}` },
        },
        {
          delay: 5000, // 5 second delay
        },
      );
      console.log(`✓ Added delayed job ${i}`);
    }

    // Add high priority job
    await queue.add(
      {
        id: "priority_job",
        task: "urgent_task",
        data: { action: "execute_immediately" },
      },
      {
        priority: 10,
      },
    );
    console.log(`✓ Added priority job`);

    // Add repeating job (every 10 seconds)
    await queue.add(
      {
        id: "repeating_job",
        task: "recurring_task",
        data: { action: "repeat" },
      },
      {
        repeat: {
          every: 10000, // Every 10 seconds
          limit: 5, // Only 5 repetitions
        },
      },
    );
    console.log(`✓ Added repeating job\n`);

    console.log("Jobs added! Check the dashboard at http://localhost:3000");
    console.log("\nFeatures to try:");
    console.log("  • Watch jobs progress through different states");
    console.log("  • See real-time stats update");
    console.log("  • View failed jobs in the Dead Letter Queue");
    console.log("  • Retry failed jobs from the UI");
    console.log("  • Observe throughput reaching 100+/s\n");

    // Continuously add jobs in burst mode to sustain high throughput (100+/s target).
    let counter = 10;
    const throughputBatchSize = Math.max(50, workerConcurrency * 6);
    const pendingHighWatermark = workerConcurrency * 40;
    const jobProducerInterval = setInterval(async () => {
      try {
        const stats = await queue.getStats();
        if (stats.pending > pendingHighWatermark) {
          console.log(
            `⏸ Backpressure active (pending=${stats.pending}, limit=${pendingHighWatermark})`,
          );
          return;
        }

        const burstAdds: Array<Promise<string>> = [];

        for (let i = 0; i < throughputBatchSize; i++) {
          const id = counter;
          burstAdds.push(
            queue.add({
              id,
              task: "throughput_job",
              mode: "throughput",
              batch: Math.floor(id / throughputBatchSize),
              data: { input: `Item ${id}` },
            }),
          );
          counter++;
        }

        await Promise.all(burstAdds);
        console.log(
          `✓ Added ${throughputBatchSize} throughput jobs (next id: ${counter})`,
        );
      } catch (error) {
        console.error("Error adding job:", error);
      }
    }, 500);

    // Display queue stats every 5 seconds
    let previousCompleted = 0;
    let previousTime = Date.now();
    const statsInterval = setInterval(async () => {
      try {
        const stats = await queue.getStats();
        const now = Date.now();
        const elapsedSeconds = Math.max((now - previousTime) / 1000, 1);
        const throughput = (
          (stats.completed - previousCompleted) /
          elapsedSeconds
        ).toFixed(1);

        console.log("\n📊 Current Queue Stats:");
        console.log(`   Active: ${stats.active}`);
        console.log(`   Waiting: ${stats.waiting}`);
        console.log(`   Delayed: ${stats.delayed}`);
        console.log(`   Completed: ${stats.completed}`);
        console.log(`   Failed: ${stats.failed}`);
        console.log(`   Pending: ${stats.pending}`);
        console.log(`   Stalled: ${stats.stalled}`);
        console.log(`   Throughput: ${throughput}/s\n`);

        previousCompleted = stats.completed;
        previousTime = now;
      } catch (error) {
        console.error("Error getting stats:", error);
      }
    }, 5000);

    const demoTimeout = setTimeout(() => {
      shutdown("demo timeout reached").catch((error) => {
        console.error("Error during timed shutdown:", error);
        process.exit(1);
      });
    }, demoDurationMs);

    // Graceful shutdown
    process.on("SIGINT", async () => {
      shutdown("SIGINT").catch((error) => {
        console.error("Error during SIGINT shutdown:", error);
        process.exit(1);
      });
    });
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
