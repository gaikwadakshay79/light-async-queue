import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { Queue } from "../queue/Queue.js";
import { JobStatus } from "../constants.js";

export interface DashboardConfig {
  port: number;
  host?: string;
  updateInterval?: number; // milliseconds
}

export class Dashboard {
  private queue: Queue;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;
  private updateInterval: NodeJS.Timeout | null = null;
  private config: DashboardConfig;
  private clients: Set<WebSocket> = new Set();
  private htmlTemplate: string;

  constructor(queue: Queue, config: DashboardConfig) {
    this.queue = queue;
    this.config = {
      ...config,
      updateInterval: config.updateInterval || 1000,
    };
    this.htmlTemplate = this.loadTemplate();

    // Create HTTP server
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      this.handleRequest(req, res);
    });

    // Create WebSocket server
    this.wss = new WebSocketServer({ server: this.server });
    this.setupWebSocketHandlers();
  }

  /**
   * Start the dashboard server
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      const host = this.config.host || "localhost";
      this.server.listen(this.config.port, host, () => {
        console.log(
          `[Dashboard] Queue dashboard running at http://${host}:${this.config.port}`,
        );
        this.startUpdateInterval();
        resolve();
      });
    });
  }

  /**
   * Stop the dashboard server
   */
  async stop(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Close all WebSocket connections
    for (const client of this.clients) {
      client.close();
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        console.log("[Dashboard] Dashboard server stopped");
        resolve();
      });
    });
  }

  /**
   * Handle HTTP requests
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    if (req.url === "/" || req.url === "/index.html") {
      this.serveHTML(res);
    } else if (req.url === "/api/stats") {
      this.serveStats(res);
    } else if (req.url === "/api/jobs") {
      this.serveJobs(res);
    } else if (req.url === "/api/failed-jobs") {
      this.serveFailedJobs(res);
    } else if (req.url === "/api/reprocess-failed" && req.method === "POST") {
      this.handleReprocessFailed(req, res);
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    }
  }

  /**
   * Serve the HTML dashboard
   */
  private serveHTML(res: ServerResponse): void {
    const html = this.generateHTML();
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  }

  /**
   * Generate HTML dashboard
   */
  private generateHTML(): string {
    return this.htmlTemplate;
  }

  private loadTemplate(): string {
    const templatePath = resolve(
      process.cwd(),
      "src",
      "dashboard",
      "dashboard.html",
    );
    return readFileSync(templatePath, "utf8");
  }

  /**
   * Setup WebSocket handlers
   */
  private setupWebSocketHandlers(): void {
    this.wss.on("connection", (ws: WebSocket) => {
      console.log("[Dashboard] New WebSocket client connected");
      this.clients.add(ws);

      // Send initial data
      this.sendStatsToClient(ws).catch((error) => {
        console.error("[Dashboard] Error sending initial stats:", error);
      });

      ws.on("message", (message: string) => {
        try {
          const data = JSON.parse(message);
          if (data.action === "getUpdate") {
            this.sendStatsToClient(ws).catch((error) => {
              console.error("[Dashboard] Error sending stats:", error);
            });
          }
        } catch (error) {
          console.error("[Dashboard] Error parsing message:", error);
        }
      });

      ws.on("close", () => {
        console.log("[Dashboard] WebSocket client disconnected");
        this.clients.delete(ws);
      });

      ws.on("error", (error) => {
        console.error("[Dashboard] WebSocket error:", error);
      });
    });
  }

  /**
   * Serve stats API
   */
  private serveStats(res: ServerResponse): void {
    this.queue
      .getStats()
      .then((stats) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            stats,
            meta: {
              concurrency: this.queue.getConcurrency(),
            },
          }),
        );
      })
      .catch((error) => {
        console.error("[Dashboard] Error getting stats:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to get stats" }));
      });
  }

  /**
   * Serve jobs list
   */
  private serveJobs(res: ServerResponse): void {
    this.queue
      .getAllJobs()
      .then((jobs) => {
        const filtered = jobs
          .filter(
            (j) =>
              j.status === JobStatus.PROCESSING ||
              j.status === JobStatus.WAITING ||
              j.status === JobStatus.DELAYED ||
              j.status === JobStatus.PENDING ||
              j.status === JobStatus.STALLED,
          )
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 100);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(filtered));
      })
      .catch((error) => {
        console.error("[Dashboard] Error getting jobs:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to get jobs" }));
      });
  }

  /**
   * Serve failed jobs
   */
  private serveFailedJobs(res: ServerResponse): void {
    this.queue
      .getFailedJobs()
      .then((failedJobs) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify(
            failedJobs.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 50),
          ),
        );
      })
      .catch((error) => {
        console.error("[Dashboard] Error getting failed jobs:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Failed to get failed jobs" }));
      });
  }

  /**
   * Handle reprocess failed job request
   */
  private handleReprocessFailed(
    req: IncomingMessage,
    res: ServerResponse,
  ): void {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const { jobId } = data;

        this.queue
          .reprocessFailed(jobId)
          .then((success) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success }));

            // Broadcast update to all clients
            this.broadcastStats().catch((error) => {
              console.error(
                "[Dashboard] Error broadcasting after reprocess:",
                error,
              );
            });
          })
          .catch((error) => {
            console.error("[Dashboard] Error reprocessing failed job:", error);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Failed to reprocess job" }));
          });
      } catch (error) {
        console.error("[Dashboard] Error parsing reprocess request:", error);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid request" }));
      }
    });
  }

  /**
   * Send stats to a specific client
   */
  private async sendStatsToClient(ws: WebSocket): Promise<void> {
    try {
      const stats = await this.queue.getStats();
      const allJobs = await this.queue.getAllJobs();
      const failedJobs = await this.queue.getFailedJobs();

      const jobs = allJobs
        .filter(
          (j) =>
            j.status === JobStatus.PROCESSING ||
            j.status === JobStatus.WAITING ||
            j.status === JobStatus.DELAYED ||
            j.status === JobStatus.PENDING ||
            j.status === JobStatus.STALLED,
        )
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 100);

      ws.send(
        JSON.stringify({
          stats,
          jobs,
          failedJobs: failedJobs.slice(0, 50),
          meta: {
            concurrency: this.queue.getConcurrency(),
          },
        }),
      );
    } catch (error) {
      console.error("[Dashboard] Error getting data for client:", error);
    }
  }

  /**
   * Broadcast stats to all clients
   */
  private async broadcastStats(): Promise<void> {
    if (this.clients.size === 0) {
      return;
    }

    try {
      const stats = await this.queue.getStats();
      const allJobs = await this.queue.getAllJobs();
      const failedJobs = await this.queue.getFailedJobs();

      const jobs = allJobs
        .filter(
          (j) =>
            j.status === JobStatus.PROCESSING ||
            j.status === JobStatus.WAITING ||
            j.status === JobStatus.DELAYED ||
            j.status === JobStatus.PENDING ||
            j.status === JobStatus.STALLED,
        )
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 100);

      const data = JSON.stringify({
        stats,
        jobs,
        failedJobs: failedJobs.slice(0, 50),
        meta: {
          concurrency: this.queue.getConcurrency(),
        },
      });

      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data);
        }
      }
    } catch (error) {
      console.error("[Dashboard] Error broadcasting stats:", error);
    }
  }

  /**
   * Start periodic update interval
   */
  private startUpdateInterval(): void {
    this.updateInterval = setInterval(() => {
      this.broadcastStats().catch((error) => {
        console.error("[Dashboard] Error in update interval:", error);
      });
    }, this.config.updateInterval || 1000);
  }
}
