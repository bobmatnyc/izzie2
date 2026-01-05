/**
 * Inngest Functions Export
 * Centralized export of all Inngest functions
 */

export { classifyEvent } from './classify-event';
export { processEvent, sendNotification } from './process-event';

/**
 * All functions array for Inngest serve handler
 */
import { classifyEvent } from './classify-event';
import { processEvent, sendNotification } from './process-event';

export const functions = [classifyEvent, processEvent, sendNotification];
