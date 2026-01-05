/**
 * Inngest API Route
 * Serves Inngest functions for event-driven workflows
 */

import { serve } from 'inngest/next';
import { inngest } from '@/lib/events';
import { functions } from '@/lib/events/functions';

// Register all Inngest functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
