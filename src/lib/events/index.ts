/**
 * Event Management
 * Inngest event definitions and handlers
 */

import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'izzie2',
  eventKey: process.env.INNGEST_EVENT_KEY,
});

// Event type definitions
export type InngestEvents = {
  'github/event': { data: { action: string; payload: unknown } };
  'linear/event': { data: { action: string; payload: unknown } };
  'google/calendar': { data: { action: string; payload: unknown } };
  'telegram/message': { data: { chatId: string; message: string } };
};
