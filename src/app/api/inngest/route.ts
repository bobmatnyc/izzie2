/**
 * Inngest API Route
 * Serves Inngest functions for event-driven workflows
 */

import { serve } from 'inngest/next';
import { inngest } from '@/lib/events';

// Define your Inngest functions here
// Example: const helloWorld = inngest.createFunction(...)
const functions: never[] = [];

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
