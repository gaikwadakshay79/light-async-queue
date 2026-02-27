# 🚀 light-async-queue

[![npm version](https://img.shields.io/npm/v/light-async-queue.svg)](https://www.npmjs.com/package/light-async-queue)
[![npm downloads](https://img.shields.io/npm/dm/light-async-queue.svg)](https://www.npmjs.com/package/light-async-queue)
[![CI](https://github.com/gaikwadakshay79/light-async-queue/actions/workflows/ci.yml/badge.svg)](https://github.com/gaikwadakshay79/light-async-queue/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/light-async-queue.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)

A production-ready, **Redis-free** async job queue for Node.js with TypeScript. A powerful BullMQ alternative designed for single-node reliability with file-based persistence, worker process isolation, and enterprise-grade features.

## 🎥 Demo Video

GitHub README often does not render local `.mp4` files inline. Use the direct raw link:

- [▶️ Watch dashboard demo (streamable MP4)](https://raw.githubusercontent.com/gaikwadakshay79/light-async-queue/main/Light-Async-Queue-Dashboard.mp4)
- [📁 Repo file link](./Light-Async-Queue-Dashboard.mp4)

## ✨ Features

### Core Features

- **🔄 Reliable Job Processing** - File-based persistence with crash recovery
- **👷 Worker Isolation** - Jobs execute in separate child processes using `child_process.fork()`
- **🔁 Smart Retry Logic** - Exponential backoff with configurable attempts
- **💀 Dead Letter Queue** - Failed jobs are preserved and can be reprocessed
- **⚡ Concurrency Control** - Configurable parallel job execution
- **🛡️ Graceful Shutdown** - Waits for active jobs before exiting
- **🎯 TypeScript First** - Full type safety with no `any` types
- **🪶 Minimal Dependencies** - Only 2 runtime dependencies (`cron-parser`, `ws`)

### Advanced Features (BullMQ Compatible)

- **📢 Job Events** - Listen to waiting, active, completed, failed, progress, stalled events
- **⏰ Delayed Jobs** - Schedule jobs to run after a delay
- **🔄 Repeating Jobs** - Interval-based and cron-pattern recurring jobs
- **🎯 Job Priorities** - High-priority jobs run first
- **📊 Progress Tracking** - Real-time job progress updates
- **🔗 Job Dependencies** - Jobs can wait for other jobs to complete
- **⚡ Rate Limiting** - Control job execution rate
- **🌐 Webhooks** - HTTP callbacks for job events
- **⏱️ Stalled Job Detection** - Automatically detect and handle stuck jobs
- **📈 Enhanced Metrics** - Detailed queue statistics by job status
- **🖥️ HTML Dashboard** - Real-time web UI for monitoring (Zookeeper-style)

## 📦 Installation

```bash
npm install light-async-queue
```

## 🏗️ Architecture

![Architecture Diagram](./architecture.png)

The queue follows a producer-consumer pattern with the following components:

- **Queue API**: Main interface for adding jobs and managing the queue
- **Scheduler**: Polls for ready jobs every 200ms and dispatches to workers
- **Storage Layer**: Pluggable storage (Memory or File-based) for job persistence
- **Worker Pool**: Manages concurrent job execution in isolated child processes
- **Dead Letter Queue (DLQ)**: Stores jobs that exceeded max retry attempts

**Key Features:**

- Jobs execute in isolated child processes for crash resilience
- File-based storage provides automatic crash recovery
- Exponential backoff retry strategy prevents overwhelming failing services
- Graceful shutdown ensures no job loss during deployment

## 🚀 Quick Start

```typescript
import { Queue, StorageType, BackoffStrategyType } from "light-async-queue";

// Create a queue
const queue = new Queue({
  storage: StorageType.FILE,
  filePath: "./jobs.log",
  concurrency: 3,
  retry: {
    maxAttempts: 5,
    backoff: {
      type: BackoffStrategyType.EXPONENTIAL,
      delay: 1000, // 1 second base delay
    },
  },
});

// Define job processor
queue.process(async (job) => {
  console.log("Processing:", job.payload);

  // Your job logic here
  await sendEmail(job.payload.email);

  return { success: true };
});

// Add jobs
await queue.add({
  email: "user@example.com",
  template: "welcome",
});
```

## 📖 API Reference

### `new Queue(config)`

Create a new queue instance.

**Config Options:**

```typescript
import {
  StorageType,
  BackoffStrategyType,
  QueueEventType,
} from "light-async-queue";

interface QueueConfig {
  storage: StorageType;
  filePath?: string; // Required if storage is StorageType.FILE
  concurrency: number; // Max parallel jobs
  retry: {
    maxAttempts: number;
    backoff: {
      type: BackoffStrategyType;
      delay: number; // Base delay in ms
    };
  };
  rateLimiter?: {
    max: number; // Max jobs
    duration: number; // Per duration in ms
  };
  webhooks?: Array<{
    url: string;
    events: QueueEventType[];
    headers?: Record<string, string>;
  }>;
  stalledInterval?: number; // Check for stalled jobs every X ms (default: 30000)
}
```

### `queue.process(processor)`

Set the job processor function with progress tracking support.

```typescript
queue.process(async (job) => {
  // Access job data
  console.log(job.payload);

  // Report progress
  await job.updateProgress(50);

  // Log messages
  job.log("Processing step 1");

  // Return result
  return { success: true };
});
```

### `queue.add(payload, options?)`

Add a job to the queue with advanced options.

```typescript
// Simple job
const jobId = await queue.add({ userId: 123 });

// Job with priority (higher = more important)
await queue.add({ urgent: true }, { priority: 10 });

// Delayed job (runs after delay)
await queue.add({ task: "cleanup" }, { delay: 5000 });

// Repeating job (every X milliseconds)
await queue.add(
  { type: "heartbeat" },
  {
    repeat: {
      every: 60000, // Every minute
      limit: 100, // Max 100 repetitions
    },
  },
);

// Cron-style repeating job
await queue.add(
  { type: "daily-report" },
  {
    repeat: {
      pattern: "0 0 * * *", // Every day at midnight
    },
  },
);

// Job with dependencies
const job1 = await queue.add({ step: 1 });
await queue.add({ step: 2 }, { dependsOn: [job1] });

// Custom job ID
await queue.add({ data: "test" }, { jobId: "custom-id-123" });
```

### Queue Events

Listen to job lifecycle events:

```typescript
import { QueueEventType } from "light-async-queue";

queue.on(QueueEventType.WAITING, (job) => {
  console.log("Job waiting for dependencies:", job.id);
});

queue.on(QueueEventType.DELAYED, (job) => {
  console.log("Job delayed until:", new Date(job.nextRunAt));
});

queue.on(QueueEventType.ACTIVE, (job) => {
  console.log("Job started:", job.id);
});

queue.on(QueueEventType.PROGRESS, (job, progress) => {
  console.log(`Job ${job.id} progress: ${progress}%`);
});

queue.on(QueueEventType.COMPLETED, (job, result) => {
  console.log("Job completed:", job.id, result);
});

queue.on(QueueEventType.FAILED, (job, error) => {
  console.error("Job failed:", job.id, error.message);
});

queue.on(QueueEventType.STALLED, (job) => {
  console.warn("Job appears stalled:", job.id);
});

queue.on(QueueEventType.DRAINED, () => {
  console.log("Queue drained - all jobs processed");
});

queue.on(QueueEventType.ERROR, (error) => {
  console.error("Queue error:", error);
});
```

### Queue Methods

#### `queue.getJob(jobId)`

Get a specific job by ID.

```typescript
const job = await queue.getJob("job-id-123");
if (job) {
  console.log(job.status, job.progress);
}
```

#### `queue.removeJob(jobId)`

Remove a specific job (only if not currently active).

```typescript
const removed = await queue.removeJob("job-id-123");
```

#### `queue.pause()`

Pause job processing.

```typescript
queue.pause();
```

#### `queue.resume()`

Resume job processing.

```typescript
queue.resume();
```

#### `queue.drain()`

Wait for all pending jobs to be processed.

```typescript
await queue.drain();
console.log("All jobs completed!");
```

#### `queue.clean(maxAge)`

Remove completed jobs older than maxAge (in milliseconds).

```typescript
// Clean jobs older than 24 hours
const cleaned = await queue.clean(24 * 60 * 60 * 1000);
console.log(`Cleaned ${cleaned} old jobs`);
```

#### `queue.getFailedJobs()`

Get all jobs in the Dead Letter Queue.

```typescript
const failedJobs = await queue.getFailedJobs();
```

#### `queue.reprocessFailed(jobId)`

Reprocess a failed job from the DLQ.

```typescript
await queue.reprocessFailed("job-id-here");
```

#### `queue.getStats()`

Get enhanced queue statistics.

```typescript
const stats = await queue.getStats();
// {
//   active: 2,
//   waiting: 1,
//   delayed: 3,
//   pending: 5,
//   completed: 100,
//   failed: 3,
//   stalled: 0
// }
```

#### `queue.shutdown()`

Gracefully shutdown the queue.

```typescript
await queue.shutdown();
```

## 🔄 Retry & Backoff

Jobs are retried with exponential backoff:

```
delay = baseDelay * (2 ^ (attempt - 1))
```

**Example with 1000ms base delay:**

- Attempt 1: Immediate
- Attempt 2: 1 second delay
- Attempt 3: 2 seconds delay
- Attempt 4: 4 seconds delay
- Attempt 5: 8 seconds delay

After `maxAttempts`, jobs move to the Dead Letter Queue.

## 💾 Storage Options

### Memory Storage

Fast, in-memory storage for development:

```typescript
import { Queue, StorageType } from "light-async-queue";

const queue = new Queue({
  storage: StorageType.MEMORY,
  concurrency: 5,
  retry: {
    /* ... */
  },
});
```

### File Storage

Persistent, crash-recoverable storage for production:

```typescript
import { Queue, StorageType } from "light-async-queue";

const queue = new Queue({
  storage: StorageType.FILE,
  filePath: "./jobs.log",
  concurrency: 5,
  retry: {
    /* ... */
  },
});
```

**File Format:**

- Append-only log
- One JSON object per line
- Atomic writes
- Separate `dead-letter.log` for failed jobs

## 🛡️ Crash Recovery

When using file storage, the queue automatically recovers from crashes:

1. **On startup**, the queue reads the job log
2. Any job with status `"processing"` is marked as `"pending"`
3. The job's `attempts` counter is incremented
4. The job is scheduled for immediate retry

This ensures no jobs are lost during unexpected shutdowns.

## 👷 Worker Isolation

Jobs execute in isolated child processes:

- **Process Isolation**: Each job runs in a separate Node.js process
- **Crash Detection**: Parent detects worker crashes and retries the job
- **IPC Communication**: Results are sent back via inter-process communication
- **Resource Cleanup**: Workers are properly terminated on shutdown

## 🔒 Graceful Shutdown

The queue handles `SIGINT` and `SIGTERM` signals:

1. Stop accepting new jobs
2. Wait for active jobs to complete
3. Terminate all worker processes
4. Persist final state to disk
5. Exit cleanly

```typescript
// Automatic on SIGINT/SIGTERM
// Or manual:
await queue.shutdown();
```

## �️ HTML Dashboard - Real-Time Monitoring

Light Async Queue includes a built-in HTML dashboard for real-time monitoring, similar to Zookeeper. The dashboard provides a modern, responsive web interface for tracking job statuses and managing your queue.

### Quick Start

```typescript
import { Queue, Dashboard, StorageType } from "light-async-queue";

const queue = new Queue({
  storage: StorageType.FILE,
  filePath: "./jobs.log",
  concurrency: 3,
  retry: {
    /* ... */
  },
});

// Create and start dashboard
const dashboard = new Dashboard(queue, {
  port: 3000,
  host: "localhost",
  updateInterval: 1000, // Update every 1 second
});

await dashboard.start();
console.log("📊 Dashboard: http://localhost:3000");
```

### Dashboard Features

- **📊 Real-time Statistics** - Live job counts (active, waiting, delayed, pending, completed, failed, stalled)
- **📋 Job Tracking** - View active/waiting jobs with progress bars
- **⚠️ Dead Letter Queue** - Monitor and retry failed jobs from the UI
- **🔄 WebSocket Updates** - Fast, real-time data synchronization
- **🎨 Modern UI** - Responsive design with color-coded status badges
- **📈 Progress Visualization** - Track job completion with visual indicators

### API Endpoints

The dashboard exposes REST API endpoints:

- `GET /` - HTML dashboard interface
- `GET /api/stats` - Queue statistics (JSON)
- `GET /api/jobs` - Active and waiting jobs
- `GET /api/failed-jobs` - Failed jobs in DLQ
- `POST /api/reprocess-failed` - Retry a failed job

### Example Usage

See the [complete dashboard example](./example/dashboard-example.ts) for a working implementation with:

- Real-time job processing
- Progress tracking
- Event handling
- Failed job retry from UI

```bash
# Run the example
npm run build:examples
node dist/example/dashboard-example.js
# Open http://localhost:3000
```

For detailed dashboard documentation, see [Dashboard README](./src/dashboard/README.md).

## �📊 Comparison with BullMQ and Bull

| Feature           | light-async-queue             | BullMQ           | Bull            |
| ----------------- | ----------------------------- | ---------------- | --------------- |
| Redis Required    | ❌ No                         | ✅ Yes           | ✅ Yes          |
| File Persistence  | ✅ Yes                        | ❌ No            | ❌ No           |
| Worker Isolation  | ✅ Child Process              | ⚠️ Same Process  | ⚠️ Same Process |
| Crash Recovery    | ✅ Built-in                   | ⚠️ Needs Redis   | ⚠️ Needs Redis  |
| Job Events        | ✅ Yes                        | ✅ Yes           | ✅ Yes          |
| Job Priorities    | ✅ Yes                        | ✅ Yes           | ✅ Yes          |
| Delayed Jobs      | ✅ Yes                        | ✅ Yes           | ✅ Yes          |
| Repeating Jobs    | ✅ Yes                        | ✅ Yes           | ✅ Yes          |
| Cron Patterns     | ✅ Yes                        | ✅ Yes           | ✅ Yes          |
| Job Dependencies  | ✅ Yes                        | ✅ Yes           | ❌ No           |
| Progress Tracking | ✅ Yes                        | ✅ Yes           | ✅ Yes          |
| Rate Limiting     | ✅ Yes                        | ✅ Yes           | ✅ Yes          |
| Webhooks          | ✅ Yes                        | ❌ No            | ❌ No           |
| Stalled Detection | ✅ Yes                        | ✅ Yes           | ✅ Yes          |
| HTML Dashboard    | ✅ Built-in                   | ⚠️ Bull Board    | ⚠️ Bull Board   |
| Setup Complexity  | 🟢 Low                        | 🟡 Medium        | 🟡 Medium       |
| Dependencies      | 🟢 Minimal (cron-parser + ws) | 🔴 Redis + deps  | 🔴 Redis + deps |
| Best For          | Single-node apps              | Distributed apps | Legacy apps     |

**Why choose light-async-queue?**

- ✅ No Redis infrastructure or maintenance
- ✅ Built-in crash recovery with file persistence
- ✅ True process isolation for better fault tolerance
- ✅ Minimal runtime dependencies (`cron-parser`, `ws`)
- ✅ Perfect for edge deployments, serverless, or single-server apps
- ✅ All BullMQ features without the complexity

## 🎯 Use Cases

Perfect for:

- **Single-server applications** that don't need Redis
- **Background job processing** (emails, reports, etc.)
- **Reliable task queues** with crash recovery
- **Development environments** with minimal external dependencies
- **Edge deployments** where Redis isn't available

## 🔧 Advanced Example

```typescript
import { Queue, StorageType, BackoffStrategyType } from "light-async-queue";

const queue = new Queue({
  storage: StorageType.FILE,
  filePath: "./production-jobs.log",
  concurrency: 10,
  retry: {
    maxAttempts: 3,
    backoff: {
      type: BackoffStrategyType.EXPONENTIAL,
      delay: 2000,
    },
  },
});

// Email sending processor
queue.process(async (job) => {
  const { email, template, data } = job.payload;

  try {
    await emailService.send({
      to: email,
      template,
      data,
    });

    return { sent: true, timestamp: Date.now() };
  } catch (error) {
    // Will retry with exponential backoff
    throw error;
  }
});

// Add jobs
await queue.add({
  email: "user@example.com",
  template: "welcome",
  data: { name: "John" },
});

// Monitor failed jobs
setInterval(async () => {
  const stats = await queue.getStats();
  console.log("Queue stats:", stats);

  if (stats.failed > 0) {
    const failed = await queue.getFailedJobs();
    console.log("Failed jobs:", failed);
  }
}, 60000);
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run examples
npm install
npm run build
npm run example
```

**Test Results:** ✅ 85+ tests passing across 8 test suites (powered by Vitest)

See [TEST_SUITE.md](./TEST_SUITE.md) for detailed test documentation.

## 📚 Examples

Check out the `example/` directory for comprehensive examples:

- **[basic.ts](./example/basic.ts)** - Simple queue setup and job processing
- **[concurrency.ts](./example/concurrency.ts)** - Concurrent job processing
- **[crash-recovery.ts](./example/crash-recovery.ts)** - Crash recovery demonstration
- **[advanced-features.ts](./example/advanced-features.ts)** - All BullMQ-compatible features:
  - Job events and listeners
  - Job priorities
  - Delayed and repeating jobs
  - Cron patterns
  - Job dependencies
  - Progress tracking
  - Rate limiting
  - Webhooks

## 📝 License

MIT

## 🤝 Contributing

Contributions welcome! This is a production-ready implementation focused on reliability and simplicity.

## 📦 Publishing

This package uses [npm trusted publishing](https://docs.npmjs.com/generating-provenance-statements) for secure, token-free releases from GitHub Actions. Publishes are automatically triggered when version tags are pushed (e.g., `v1.0.0`). See [TRUSTED_PUBLISHING.md](./TRUSTED_PUBLISHING.md) for detailed setup instructions.

---

Built with ❤️ for Node.js developers who need reliable job queues without Redis.
