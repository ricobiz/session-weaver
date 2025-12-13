import { ActionHandler } from '../types';

/**
 * Wait action
 * Pauses execution for a specified duration
 */
export const waitAction: ActionHandler = async (context, step) => {
  const { log } = context;
  const duration = step.duration || 5;
  const durationMs = duration * 1000;

  log('info', `Waiting for ${duration} seconds...`);
  
  await new Promise(resolve => setTimeout(resolve, durationMs));

  log('success', `Wait completed`);
};
