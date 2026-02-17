import { WorkerMessage, WorkerResponse } from '../types.js';

/**
 * Child process script that executes jobs in isolation
 * Communicates with parent via IPC
 */

// Store the job processor function
let processorFn: ((job: unknown) => Promise<unknown>) | null = null;

/**
 * Handle messages from parent process
 */
process.on('message', async (message: WorkerMessage) => {
  if (message.type === 'execute') {
    const { job } = message;
    
    try {
      // Execute the job processor
      if (!processorFn) {
        throw new Error('Processor function not set');
      }
      
      const result = await processorFn(job);
      
      const response: WorkerResponse = {
        type: 'result',
        jobId: job.id,
        result: {
          success: true,
          result,
        },
      };
      
      process.send!(response);
    } catch (error) {
      const response: WorkerResponse = {
        type: 'result',
        jobId: job.id,
        result: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
      };
      
      process.send!(response);
    }
  } else if (message.type === 'setProcessor') {
    // Receive the processor function code as a string and evaluate it
    // This is sent from the parent during worker initialization
    try {
      const processorCode = message.code;
      // eslint-disable-next-line no-eval
      processorFn = eval(`(${processorCode})`);
    } catch (error) {
      console.error('Failed to set processor function:', error);
      process.exit(1);
    }
  }
});

/**
 * Handle uncaught errors
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in worker:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in worker:', reason);
  process.exit(1);
});

// Signal ready
if (process.send) {
  process.send({ type: 'ready' });
}
