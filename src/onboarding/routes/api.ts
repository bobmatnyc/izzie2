/**
 * API Routes
 *
 * Handles processing control (start/pause/stop/flush) and SSE streaming.
 */

import { Router, Request, Response } from 'express';
import { getProgressService } from '../services/progress';
import { createEmailProcessor, EmailProcessorService } from '../services/email-processor';
import { syncEntitiesWithProgress as syncContactsWithProgress } from '../services/contacts-sync';
import { syncEntitiesWithProgress as syncTasksWithProgress } from '../services/tasks-sync';
import { getFeedbackService } from '../services/feedback';
import { getOntologyService } from '../services/ontology';
import { getAuthenticatedClient, isAuthenticated } from './oauth';
import { createOnboardingDatabase, OnboardingDatabase } from '../services/database';
import type { ProcessingConfig } from '../types';

const LOG_PREFIX = '[API]';

const router = Router();

// Current processor instance and database
let processor: EmailProcessorService | null = null;
let database: OnboardingDatabase | null = null;

/**
 * Middleware to require authentication
 */
function requireAuth(req: Request, res: Response, next: () => void): void {
  if (!isAuthenticated()) {
    res.status(401).json({ error: 'Not authenticated. Please login first.' });
    return;
  }
  next();
}

/**
 * GET /api/events
 * SSE endpoint for real-time progress updates
 */
router.get('/events', (req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} SSE client connected`);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // Add client to progress service
  const progress = getProgressService();
  progress.addClient(res);

  // Send initial connection event
  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  // Keep-alive ping every 30 seconds
  const pingInterval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);
  }, 30000);

  // Handle client disconnect
  req.on('close', () => {
    console.log(`${LOG_PREFIX} SSE client disconnected`);
    clearInterval(pingInterval);
    progress.removeClient(res);
  });
});

/**
 * POST /api/start
 * Start processing emails
 */
router.post('/start', requireAuth, async (req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} Start processing requested`);

  const progress = getProgressService();

  if (!progress.canStart()) {
    res.status(400).json({
      error: 'Cannot start processing',
      currentState: progress.getState(),
    });
    return;
  }

  const client = getAuthenticatedClient();
  if (!client) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  // Get optional config from body
  const config: Partial<ProcessingConfig> = {
    batchSize: req.body.batchSize,
    delayBetweenBatches: req.body.delayBetweenBatches,
    maxEmailsPerDay: req.body.maxEmailsPerDay,
    startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
    endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
    userId: req.body.userId, // Optional userId for database persistence
  };

  // Create database instance if userId provided
  if (config.userId) {
    database = createOnboardingDatabase(config.userId);
    console.log(`${LOG_PREFIX} Database persistence enabled for user ${config.userId}`);
  } else {
    database = null;
    console.log(`${LOG_PREFIX} Running in memory-only mode (no userId provided)`);
  }

  // Create processor
  processor = createEmailProcessor(client, config);

  // Set user identity if provided
  if (req.body.userEmail) {
    processor.setUserIdentity(req.body.userEmail, req.body.userName);
  }

  // Start processing
  const abortController = progress.start();

  // Run processing in background
  processor.processSentEmails(abortController.signal).catch((error) => {
    console.error(`${LOG_PREFIX} Processing error:`, error);
    progress.recordError(
      'Processing failed',
      error instanceof Error ? error.message : String(error)
    );
    progress.stop();
  });

  res.json({
    success: true,
    message: 'Processing started',
    state: progress.getState(),
  });
});

/**
 * POST /api/pause
 * Pause processing
 */
router.post('/pause', requireAuth, (_req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} Pause requested`);

  const progress = getProgressService();

  if (!progress.canPause()) {
    res.status(400).json({
      error: 'Cannot pause processing',
      currentState: progress.getState(),
    });
    return;
  }

  progress.pause();

  res.json({
    success: true,
    message: 'Processing paused',
    state: progress.getState(),
  });
});

/**
 * POST /api/resume
 * Resume processing
 */
router.post('/resume', requireAuth, (_req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} Resume requested`);

  const progress = getProgressService();

  if (!progress.canResume()) {
    res.status(400).json({
      error: 'Cannot resume processing',
      currentState: progress.getState(),
    });
    return;
  }

  progress.resume();

  res.json({
    success: true,
    message: 'Processing resumed',
    state: progress.getState(),
  });
});

/**
 * POST /api/stop
 * Stop processing
 */
router.post('/stop', requireAuth, (_req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} Stop requested`);

  const progress = getProgressService();

  if (!progress.canStop()) {
    res.status(400).json({
      error: 'Cannot stop processing',
      currentState: progress.getState(),
    });
    return;
  }

  progress.stop();
  processor = null;

  res.json({
    success: true,
    message: 'Processing stopped',
    state: progress.getState(),
  });
});

/**
 * POST /api/flush
 * Flush all data and reset (both memory and database)
 */
router.post('/flush', async (_req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} Flush requested`);

  const progress = getProgressService();
  progress.flush();
  processor = null;

  // Also flush database if connected
  if (database) {
    try {
      await database.flushAll();
      console.log(`${LOG_PREFIX} Database flushed`);
      database = null;
    } catch (error) {
      console.error(`${LOG_PREFIX} Failed to flush database:`, error);
      res.status(500).json({
        error: 'Failed to flush database',
        details: error instanceof Error ? error.message : String(error),
      });
      return;
    }
  }

  res.json({
    success: true,
    message: 'All data flushed',
    state: progress.getState(),
  });
});

/**
 * GET /api/status
 * Get current processing status
 */
router.get('/status', (_req: Request, res: Response) => {
  const progress = getProgressService();

  res.json({
    state: progress.getState(),
    authenticated: isAuthenticated(),
    entities: progress.getEntities().length,
    relationships: progress.getRelationships().length,
  });
});

/**
 * GET /api/entities
 * Get all discovered entities
 */
router.get('/entities', (_req: Request, res: Response) => {
  const progress = getProgressService();
  const entities = progress.getEntities();

  // Sort by occurrence count (descending)
  entities.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  res.json({
    count: entities.length,
    entities,
  });
});

/**
 * GET /api/relationships
 * Get all discovered relationships
 */
router.get('/relationships', (_req: Request, res: Response) => {
  const progress = getProgressService();
  const relationships = progress.getRelationships();

  // Sort by occurrence count (descending)
  relationships.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  res.json({
    count: relationships.length,
    relationships,
  });
});

/**
 * GET /api/database/stats
 * Get database statistics (requires userId in query or database instance)
 */
router.get('/database/stats', async (req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} Database stats requested`);

  // Use existing database instance or create new one from query param
  let statsDatabase = database;
  const userId = req.query.userId as string | undefined;

  if (!statsDatabase && userId) {
    statsDatabase = createOnboardingDatabase(userId);
  }

  if (!statsDatabase) {
    res.status(400).json({
      error: 'No database connection available. Provide userId or start processing with userId.',
    });
    return;
  }

  try {
    const stats = await statsDatabase.getProcessingStats();
    res.json(stats);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to get database stats:`, error);
    res.status(500).json({
      error: 'Failed to get database statistics',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/sync-contacts
 * Sync discovered Person entities to Google Contacts
 */
router.post('/sync-contacts', requireAuth, async (req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} Sync contacts requested`);

  const progress = getProgressService();
  const client = getAuthenticatedClient();

  // Log OAuth token status (not the token itself)
  console.log(`${LOG_PREFIX} OAuth client status:`, {
    hasClient: !!client,
    hasCredentials: !!client?.credentials,
    hasAccessToken: !!client?.credentials?.access_token,
    hasRefreshToken: !!client?.credentials?.refresh_token,
    tokenExpiry: client?.credentials?.expiry_date
      ? new Date(client.credentials.expiry_date).toISOString()
      : 'unknown',
    isTokenExpired: client?.credentials?.expiry_date
      ? Date.now() > client.credentials.expiry_date
      : 'unknown',
  });

  if (!client) {
    console.error(`${LOG_PREFIX} No authenticated client available`);
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  // Get all discovered entities
  const entities = progress.getEntities();
  const personEntities = entities.filter((e) => e.type === 'person');

  // Log entity counts before syncing
  console.log(`${LOG_PREFIX} Entity counts:`, {
    totalEntities: entities.length,
    personEntities: personEntities.length,
    entityTypes: [...new Set(entities.map(e => e.type))],
  });

  if (personEntities.length === 0) {
    res.json({
      success: true,
      message: 'No person entities to sync',
      summary: { total: 0, created: 0, updated: 0, skipped: 0, errors: 0 },
    });
    return;
  }

  // Optional: get specific entity values from request body
  const selectedValues: string[] | undefined = req.body.entityValues;
  const entitiesToSync = selectedValues
    ? personEntities.filter((e) => selectedValues.includes(e.value))
    : personEntities;

  console.log(`${LOG_PREFIX} Syncing ${entitiesToSync.length} person entities to contacts`, {
    selectedCount: entitiesToSync.length,
    totalPersonEntities: personEntities.length,
    hasSelectedValues: !!selectedValues,
  });

  try {
    // Sync with progress callback
    const summary = await syncContactsWithProgress(
      client,
      entitiesToSync,
      (current, total, result) => {
        // Emit progress via SSE
        progress.recordContactSync(
          entitiesToSync[current - 1].value,
          result.action,
          current,
          total,
          result.resourceName,
          result.error
        );
      }
    );

    console.log(`${LOG_PREFIX} Sync contacts completed:`, summary);

    res.json({
      success: true,
      message: `Synced ${summary.created + summary.updated} contacts`,
      summary,
    });
  } catch (error: unknown) {
    // Log full error details
    console.error(`${LOG_PREFIX} Sync contacts error:`, {
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });

    // Log Google API specific error details if available
    const googleError = error as { code?: number; status?: string; errors?: unknown[]; response?: { data?: unknown } };
    if (googleError.code || googleError.status || googleError.errors) {
      console.error(`${LOG_PREFIX} Google API error details:`, {
        code: googleError.code,
        status: googleError.status,
        errors: googleError.errors,
        responseData: googleError.response?.data,
      });
    }

    res.status(500).json({
      error: 'Failed to sync contacts',
      details: error instanceof Error ? error.message : String(error),
      errorCode: (error as { code?: number }).code,
      errorStatus: (error as { status?: string }).status,
    });
  }
});

/**
 * POST /api/sync-tasks
 * Sync discovered action_item entities to Google Tasks
 */
router.post('/sync-tasks', requireAuth, async (req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} Sync tasks requested`);

  const progress = getProgressService();
  const client = getAuthenticatedClient();

  // Log OAuth token status (not the token itself)
  console.log(`${LOG_PREFIX} OAuth client status:`, {
    hasClient: !!client,
    hasCredentials: !!client?.credentials,
    hasAccessToken: !!client?.credentials?.access_token,
    hasRefreshToken: !!client?.credentials?.refresh_token,
    tokenExpiry: client?.credentials?.expiry_date
      ? new Date(client.credentials.expiry_date).toISOString()
      : 'unknown',
    isTokenExpired: client?.credentials?.expiry_date
      ? Date.now() > client.credentials.expiry_date
      : 'unknown',
  });

  if (!client) {
    console.error(`${LOG_PREFIX} No authenticated client available`);
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  // Get all discovered entities
  const entities = progress.getEntities();
  const actionItems = entities.filter((e) => e.type === 'action_item');

  // Log entity counts before syncing
  console.log(`${LOG_PREFIX} Entity counts:`, {
    totalEntities: entities.length,
    actionItems: actionItems.length,
    entityTypes: [...new Set(entities.map(e => e.type))],
  });

  if (actionItems.length === 0) {
    res.json({
      success: true,
      message: 'No action_item entities to sync',
      summary: { total: 0, created: 0, skipped: 0, errors: 0, taskListId: '', taskListName: '' },
    });
    return;
  }

  // Optional: get specific entity values from request body
  const selectedValues: string[] | undefined = req.body.entityValues;
  const entitiesToSync = selectedValues
    ? actionItems.filter((e) => selectedValues.includes(e.value))
    : actionItems;

  // Optional: custom task list name
  const listName: string | undefined = req.body.listName;

  console.log(`${LOG_PREFIX} Syncing ${entitiesToSync.length} action_item entities to tasks`, {
    selectedCount: entitiesToSync.length,
    totalActionItems: actionItems.length,
    hasSelectedValues: !!selectedValues,
    listName: listName || '(default)',
  });

  try {
    // Sync with progress callback
    const summary = await syncTasksWithProgress(
      client,
      entitiesToSync,
      (current, total, entityValue, result) => {
        // Emit progress via SSE
        progress.recordTaskSync(
          entityValue,
          result.action,
          current,
          total,
          result.taskId,
          result.taskListId,
          result.error
        );
      },
      { listName }
    );

    console.log(`${LOG_PREFIX} Sync tasks completed:`, summary);

    res.json({
      success: true,
      message: `Synced ${summary.created} tasks`,
      summary,
    });
  } catch (error: unknown) {
    // Log full error details
    console.error(`${LOG_PREFIX} Sync tasks error:`, {
      errorName: error instanceof Error ? error.name : 'Unknown',
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });

    // Log Google API specific error details if available
    const googleError = error as { code?: number; status?: string; errors?: unknown[]; response?: { data?: unknown } };
    if (googleError.code || googleError.status || googleError.errors) {
      console.error(`${LOG_PREFIX} Google API error details:`, {
        code: googleError.code,
        status: googleError.status,
        errors: googleError.errors,
        responseData: googleError.response?.data,
      });
    }

    res.status(500).json({
      error: 'Failed to sync tasks',
      details: error instanceof Error ? error.message : String(error),
      errorCode: (error as { code?: number }).code,
      errorStatus: (error as { status?: string }).status,
    });
  }
});

/**
 * POST /api/feedback
 * Record feedback for an entity or relationship
 */
router.post('/feedback', (req: Request, res: Response) => {
  console.log(`${LOG_PREFIX} Feedback received`);

  const { type, extracted, feedback, context, correction } = req.body;

  if (!type || !extracted || !feedback) {
    res.status(400).json({
      error: 'Missing required fields: type, extracted, feedback',
    });
    return;
  }

  if (!['entity', 'relationship'].includes(type)) {
    res.status(400).json({
      error: 'Invalid type. Must be "entity" or "relationship"',
    });
    return;
  }

  if (!['positive', 'negative'].includes(feedback)) {
    res.status(400).json({
      error: 'Invalid feedback. Must be "positive" or "negative"',
    });
    return;
  }

  const feedbackService = getFeedbackService();
  const record = feedbackService.recordFeedback(
    type,
    extracted,
    feedback,
    context,
    correction
  );

  // Emit feedback event via SSE
  const progress = getProgressService();
  progress.recordFeedback(
    record.id,
    type,
    extracted.value,
    feedback,
    extracted.entityType,
    extracted.relationshipType
  );

  res.json({
    success: true,
    record,
  });
});

/**
 * GET /api/feedback/stats
 * Get feedback statistics
 */
router.get('/feedback/stats', (_req: Request, res: Response) => {
  const feedbackService = getFeedbackService();
  const stats = feedbackService.getStats();

  res.json({
    success: true,
    stats,
  });
});

/**
 * GET /api/feedback/export
 * Export feedback as JSONL for ML training
 */
router.get('/feedback/export', (_req: Request, res: Response) => {
  const feedbackService = getFeedbackService();
  const jsonl = feedbackService.exportToJSONL();
  const stats = feedbackService.getStats();

  // Set headers for file download
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="feedback_${new Date().toISOString().split('T')[0]}.jsonl"`
  );

  res.send(jsonl);
});

/**
 * GET /api/feedback
 * Get all feedback records
 */
router.get('/feedback', (_req: Request, res: Response) => {
  const feedbackService = getFeedbackService();
  const records = feedbackService.getAllRecords();

  res.json({
    success: true,
    count: records.length,
    records,
  });
});

/**
 * DELETE /api/feedback/:id
 * Delete a feedback record
 */
router.delete('/feedback/:id', (req: Request, res: Response) => {
  const feedbackService = getFeedbackService();
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const deleted = feedbackService.deleteRecord(id);

  if (deleted) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Feedback record not found' });
  }
});

/**
 * GET /api/ontology
 * Get the topic ontology tree
 */
router.get('/ontology', (_req: Request, res: Response) => {
  const ontologyService = getOntologyService();

  res.json({
    success: true,
    tree: ontologyService.getOntologyTree(),
    flat: ontologyService.getAllTopicsFlat(),
    stats: ontologyService.getStats(),
  });
});

/**
 * GET /api/ontology/topic/:name
 * Get hierarchy information for a specific topic
 */
router.get('/ontology/topic/:name', (req: Request, res: Response) => {
  const ontologyService = getOntologyService();
  const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
  const hierarchy = ontologyService.getTopicWithHierarchy(name);

  if (hierarchy) {
    res.json({
      success: true,
      topic: hierarchy,
      path: ontologyService.getHierarchyPath(name),
    });
  } else {
    res.status(404).json({ error: 'Topic not found' });
  }
});

/**
 * POST /api/ontology/topic
 * Add a topic to the ontology (with optional auto-parent detection)
 */
router.post('/ontology/topic', async (req: Request, res: Response) => {
  const { name, parentName, autoDetectParent } = req.body;

  if (!name) {
    res.status(400).json({ error: 'Missing required field: name' });
    return;
  }

  const ontologyService = getOntologyService();

  try {
    let node;
    if (autoDetectParent && !parentName) {
      node = await ontologyService.addTopicWithAutoParent(name);
    } else {
      node = ontologyService.addTopic(name, parentName);
    }

    res.json({
      success: true,
      topic: node,
      hierarchy: ontologyService.getTopicWithHierarchy(name),
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to add topic:`, error);
    res.status(500).json({
      error: 'Failed to add topic',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
