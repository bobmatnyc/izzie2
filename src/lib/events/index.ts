/**
 * Event Management
 * Inngest event definitions and handlers
 */

import { Inngest } from 'inngest';
import type { Events } from './types';

export const inngest = new Inngest({
  id: 'izzie2',
  name: 'Izzie2 AI Assistant',
  eventKey: process.env.INNGEST_EVENT_KEY,
});

// Re-export types for convenience
export type { Events } from './types';
