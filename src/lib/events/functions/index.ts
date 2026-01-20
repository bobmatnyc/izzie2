/**
 * Inngest Functions Export
 * Centralized export of all Inngest functions
 */

export { classifyEvent } from './classify-event';
export { processEvent, sendNotification } from './process-event';
export { scheduleEventFunction } from './schedule-event';
export { ingestEmails } from './ingest-emails';
export { ingestDrive } from './ingest-drive';
export { ingestCalendar } from './ingest-calendar';
export { extractTaskEntities } from './ingest-tasks';
export { extractEntitiesFromEmail, extractEntitiesFromDrive, extractEntitiesFromCalendar } from './extract-entities';
export { updateGraph } from './update-graph';
export { researchTask } from './research-task';
export { generateDigestFunction } from './generate-digest';

/**
 * All functions array for Inngest serve handler
 */
import { classifyEvent } from './classify-event';
import { processEvent, sendNotification } from './process-event';
import { scheduleEventFunction } from './schedule-event';
import { ingestEmails } from './ingest-emails';
import { ingestDrive } from './ingest-drive';
import { ingestCalendar } from './ingest-calendar';
import { extractTaskEntities } from './ingest-tasks';
import { extractEntitiesFromEmail, extractEntitiesFromDrive, extractEntitiesFromCalendar } from './extract-entities';
import { updateGraph } from './update-graph';
import { researchTask } from './research-task';
import { generateDigestFunction } from './generate-digest';

export const functions = [
  classifyEvent,
  processEvent,
  sendNotification,
  scheduleEventFunction,
  ingestEmails,
  ingestDrive,
  ingestCalendar,
  extractTaskEntities,
  extractEntitiesFromEmail,
  extractEntitiesFromDrive,
  extractEntitiesFromCalendar,
  updateGraph,
  researchTask,
  generateDigestFunction,
];
