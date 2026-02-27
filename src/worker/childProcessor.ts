import { WorkerMessage, WorkerResponse, WorkerMessageType, WorkerResponseType, WorkerSignalType } from '../types.js';

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
  if (message.type === WorkerMessageType.EXECUTE) {
    const { job } = message;
    
    try {
      // Execute the job processor
      if (!processorFn) {
        throw new Error('Processor function not set');
      }
      
      // Create job object with methods
      const jobWithMethods = {
        ...job,
        updateProgress: async (progress: number) => {
          if (process.send) {
            process.send({
              type: 'progress',
              jobId: job.id,
              progress,
            });
          }
        },
        log: (message: string) => {
          console.log(`[Job ${job.id}] ${message}`);
        },
      };
      
      const result = await processorFn(jobWithMethods);
      
      const response: WorkerResponse = {
        type: WorkerResponseType.RESULT,
        jobId: job.id,
        result: {
          success: true,
          result,
        },
      };
      
      process.send!(response);
    } catch (error) {
      const response: WorkerResponse = {
        type: WorkerResponseType.RESULT,
        jobId: job.id,
        result: {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
      };
      
      process.send!(response);
    }
  } else if (message.type === WorkerMessageType.SET_PROCESSOR) {
    // Receive the processor function code as a string and evaluate it
    // This is sent from the parent during worker initialization
    try {
      const processorCode = message.code;
       
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
  process.send({ type: WorkerSignalType.READY });
}
