import { CronExpressionParser } from "cron-parser";

/**
 * Cron parser wrapper backed by the `cron-parser` npm package.
 */
export class CronParser {
  private pattern: string;

  constructor(pattern: string) {
    this.pattern = pattern;
  }

  /**
   * Get the next run time from a given timestamp
   */
  getNextRunTime(from: number = Date.now()): number {
    try {
      const interval = CronExpressionParser.parse(this.pattern, {
        currentDate: new Date(from),
      });

      return interval.next().toDate().getTime();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown cron parser error";
      throw new Error(`Invalid cron pattern: ${message}`);
    }
  }
}
