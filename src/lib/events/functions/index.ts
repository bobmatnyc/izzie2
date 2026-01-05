/**
 * Inngest Functions Export
 * Centralized export of all Inngest functions
 */

export { classifyEvent } from './classify-event';
export { processEvent, sendNotification } from './process-event';
export { scheduleEventFunction } from './schedule-event';
export { ingestEmails } from './ingest-emails';
export { ingestDrive } from './ingest-drive';
export { extractEntitiesFromEmail, extractEntitiesFromDrive } from './extract-entities';
export { updateGraph } from './update-graph';

/**
 * All functions array for Inngest serve handler
 */
import { classifyEvent } from './classify-event';
import { processEvent, sendNotification } from './process-event';
import { scheduleEventFunction } from './schedule-event';
import { ingestEmails } from './ingest-emails';
import { ingestDrive } from './ingest-drive';
import { extractEntitiesFromEmail, extractEntitiesFromDrive } from './extract-entities';
import { updateGraph } from './update-graph';

export const functions = [
  classifyEvent,
  processEvent,
  sendNotification,
  scheduleEventFunction,
  ingestEmails,
  ingestDrive,
  extractEntitiesFromEmail,
  extractEntitiesFromDrive,
  updateGraph,
];
