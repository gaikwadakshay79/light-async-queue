import { WebhookConfig, JobData, QueueEventType } from '../types.js';
import { request } from 'node:https';
import { request as httpRequest } from 'node:http';

/**
 * Webhook manager for sending job events to external URLs
 */
export class WebhookManager {
  private webhooks: WebhookConfig[];

  constructor(webhooks: WebhookConfig[] = []) {
    this.webhooks = webhooks;
  }

  /**
   * Send event to all configured webhooks
   */
  async sendEvent(event: QueueEventType, data: { job?: JobData; error?: Error; result?: unknown }): Promise<void> {
    const promises = this.webhooks
      .filter(webhook => webhook.events.includes(event))
      .map(webhook => this.sendWebhook(webhook, event, data));

    await Promise.allSettled(promises);
  }

  /**
   * Send a single webhook request
   */
  private async sendWebhook(
    config: WebhookConfig,
    event: QueueEventType,
    data: { job?: JobData; error?: Error; result?: unknown }
  ): Promise<void> {
    const payload = {
      event,
      timestamp: Date.now(),
      data: {
        job: data.job,
        error: data.error?.message,
        result: data.result,
      },
    };

    const url = new URL(config.url);
    const isHttps = url.protocol === 'https:';
    const requestFn = isHttps ? request : httpRequest;

    return new Promise<void>((resolve, reject) => {
      const req = requestFn(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'light-async-queue',
            ...config.headers,
          },
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve();
            } else {
              reject(new Error(`Webhook failed with status ${res.statusCode}: ${body}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();

      // Timeout after 10 seconds
      setTimeout(() => {
        req.destroy();
        reject(new Error('Webhook request timeout'));
      }, 10000);
    });
  }

  /**
   * Add a webhook configuration
   */
  addWebhook(config: WebhookConfig): void {
    this.webhooks.push(config);
  }

  /**
   * Remove all webhooks
   */
  clearWebhooks(): void {
    this.webhooks = [];
  }
}
