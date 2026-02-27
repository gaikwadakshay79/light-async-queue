# 📊 Queue Dashboard - Real-Time Monitoring

The Light Async Queue includes a built-in HTML dashboard for real-time monitoring of your queue, similar to Zookeeper. The dashboard provides a modern, responsive web interface for tracking job statuses and managing your queue.

## 🎯 Features

- **Real-time Statistics**: Live updates of queue metrics (active, waiting, delayed, pending, completed, failed, stalled jobs)
- **Job Tracking**: View all active and waiting jobs with their progress
- **Dead Letter Queue (DLQ) Management**: Monitor failed jobs and retry them from the UI
- **WebSocket Updates**: Fast, real-time data synchronization
- **Progress Visualization**: Track job progress with visual bars
- **Responsive Design**: Beautiful, modern UI that works on desktop and mobile
- **Status Indicators**: Color-coded status badges for quick status recognition

## 🚀 Quick Start

### 1. Import the Dashboard

```typescript
import {
  Queue,
  StorageType,
  BackoffStrategyType,
  Dashboard,
} from "light-async-queue";
```

### 2. Create a Queue and Dashboard Instance

```typescript
const queue = new Queue({
  storage: StorageType.FILE,
  filePath: "./jobs.log",
  concurrency: 3,
  retry: {
    maxAttempts: 5,
    backoff: {
      type: BackoffStrategyType.EXPONENTIAL,
      delay: 1000,
    },
  },
});

const dashboard = new Dashboard(queue, {
  port: 3000,
  host: "localhost",
  updateInterval: 1000, // Update every 1 second
});
```

### 3. Start the Dashboard

```typescript
await dashboard.start();
console.log("Dashboard running at http://localhost:3000");
```

### 4. Open in Your Browser

Navigate to `http://localhost:3000` to access the dashboard.

## 📋 API Reference

### Dashboard Configuration

```typescript
interface DashboardConfig {
  port: number; // Port to listen on
  host?: string; // Host to bind to (default: 'localhost')
  updateInterval?: number; // WebSocket update interval in ms (default: 1000)
}
```

### Dashboard Methods

#### `start(): Promise<void>`

Starts the dashboard HTTP server and WebSocket connection.

```typescript
await dashboard.start();
```

#### `stop(): Promise<void>`

Gracefully shuts down the dashboard server and closes all client connections.

```typescript
await dashboard.stop();
```

## 🎨 Dashboard Features

### Queue Statistics Panel

Displays real-time counts for each job state:

- **Active**: Jobs currently being processed
- **Waiting**: Jobs ready to be processed
- **Delayed**: Jobs waiting for their scheduled time
- **Pending**: Jobs in initial state
- **Completed**: Successfully processed jobs
- **Failed**: Jobs that exceeded max retry attempts (in DLQ)
- **Stalled**: Jobs that appear to be stuck

### Queue Overview

Shows overall progress of job processing with a visual progress bar and percentage.

### Active & Waiting Jobs Table

Lists all active and waiting jobs with:

- Job ID
- Current status
- Attempt count
- Progress percentage
- Creation timestamp

### Failed Jobs (Dead Letter Queue)

Displays failed jobs that exceeded maximum retry attempts with:

- Job ID
- Error message
- Attempt count
- Failure timestamp
- **Retry Button** to reprocess the job

## 📱 Responsive Design

The dashboard is fully responsive and includes:

- Clean, modern UI with professional styling
- Color-coded status badges
- Real-time WebSocket updates
- Connection status indicator
- Mobile-friendly layout
- Automatic reconnection on connection loss

## 🔌 API Endpoints

The dashboard exposes the following REST API endpoints:

### `GET /`

Serves the HTML dashboard page.

### `GET /api/stats`

Returns current queue statistics.

```json
{
  "active": 2,
  "waiting": 5,
  "delayed": 3,
  "pending": 0,
  "failed": 1,
  "completed": 42,
  "stalled": 0
}
```

### `GET /api/jobs`

Returns list of active and waiting jobs (up to 100).

### `GET /api/failed-jobs`

Returns list of failed jobs in the Dead Letter Queue (up to 50).

### `POST /api/reprocess-failed`

Reprocesses a failed job from the Dead Letter Queue.

**Request:**

```json
{
  "jobId": "job-uuid-here"
}
```

**Response:**

```json
{
  "success": true
}
```

## 💡 Complete Example

See [dashboard-example.ts](../example/dashboard-example.ts) for a complete working example that demonstrates:

- Creating a queue with the dashboard
- Adding different types of jobs (immediate, delayed, priority, repeating)
- Processing jobs with progress tracking
- Handling job events
- Retrying failed jobs from the UI

Run the example:

```bash
npm run build:examples
node dist/example/dashboard-example.js
```

Then open http://localhost:3000 in your browser.

## 🌟 Best Practices

### 1. Production Deployment

For production environments, consider:

```typescript
const dashboard = new Dashboard(queue, {
  port: 3000,
  host: "127.0.0.1", // Limit to localhost
  updateInterval: 2000, // Reduce update frequency to save resources
});

// Run behind a reverse proxy (nginx, Apache)
// Use HTTPS in production
```

### 2. Security

- Only expose dashboard on trusted networks
- Use a reverse proxy with authentication
- Consider IP whitelisting
- Don't expose to the public internet without proper security

### 3. Performance

- Adjust `updateInterval` based on your needs
- Higher intervals reduce server load
- Monitor WebSocket connections
- Clean up old jobs regularly with `queue.clean()`

## 🔄 WebSocket Connection

The dashboard uses WebSocket for real-time updates:

- **Auto-reconnect**: Automatically reconnects if connection is lost
- **Heartbeat**: Periodic updates keep connection alive
- **Efficient**: Only sends deltas when data changes
- **Scalable**: Handles multiple concurrent connections

## 🐛 Troubleshooting

### Dashboard not accessible

- Check if the port is not in use: `lsof -i :3000`
- Verify the host/port configuration
- Check firewall rules

### Updates not real-time

- Verify WebSocket connection (check browser dev tools)
- Check network connectivity
- Increase `updateInterval` if server is overloaded

### Memory usage

- Reduce `updateInterval` to lower frequency
- Limit number of jobs displayed (already capped at 100)
- Clean up old jobs regularly

## 📊 Monitoring Queue Health

The dashboard helps you:

1. **Identify Bottlenecks**: High "Waiting" count indicates concurrency limits
2. **Track Failures**: Monitor "Failed" count to identify issues
3. **Detect Stalls**: Stalled jobs indicate processing problems
4. **Verify Completion**: Watch "Completed" count increase
5. **Manage DLQ**: Retry or analyze failed jobs

## 🔗 Integration with Queue Events

The dashboard works alongside queue events:

```typescript
// Listen to events in your code
queue.on("completed", (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
  // Dashboard automatically updates
});

queue.on("failed", (job, error) => {
  console.log(`Job ${job.id} failed:`, error);
  // Job appears in Failed Jobs table
});
```

## 📈 Next Steps

- Check out the [example](../example/dashboard-example.ts)
- Read the [main README](../README.md) for general queue documentation
- Explore queue [configuration options](../README.md#-configuration)

## 🆘 Getting Help

- Check the [main README](../README.md) for queue documentation
- Review [examples](../example/) for usage patterns
- Open an issue on [GitHub](https://github.com/gaikwadakshay79/light-async-queue/issues)
