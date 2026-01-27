/**
 * Google Contacts Sync API Endpoint
 * Triggers contact synchronization from Google People API
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, getGoogleTokens, updateGoogleTokens } from '@/lib/auth';

import { google } from 'googleapis';
import { getContactsService } from '@/lib/google/contacts';
import { saveEntities } from '@/lib/weaviate/entities';
import type { Entity } from '@/lib/extraction/types';

import type { Contact } from '@/lib/google/types';

// Allow longer execution time for contact sync (60 seconds)
export const maxDuration = 60;

// In-memory sync status (in production, use Redis or database)
let syncStatus: {
  isRunning: boolean;
  contactsProcessed: number;
  entitiesSaved: number;
  lastSync?: Date;
  error?: string;
} = {
  isRunning: false,
  contactsProcessed: 0,
  entitiesSaved: 0,
};

/**
 * POST /api/contacts/sync
 * Start contact synchronization
 */
export async function POST(request: NextRequest) {
  try {
    // Check if sync is already running
    if (syncStatus.isRunning) {
      return NextResponse.json(
        {
          error: 'Sync already in progress',
          status: syncStatus,
        },
        { status: 409 }
      );
    }

    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { maxContacts = 1000 } = body;

    // Run sync synchronously to capture errors properly
    // (In-memory status doesn't work reliably on serverless)
    try {
      await startSync(userId, maxContacts);
      return NextResponse.json({
        message: 'Contact sync completed',
        status: syncStatus,
      });
    } catch (syncError) {
      console.error('[Contacts Sync] Sync failed:', syncError);
      return NextResponse.json(
        {
          error: syncError instanceof Error ? syncError.message : 'Sync failed',
          status: syncStatus,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[Contacts Sync] Failed to start sync:', error);
    // Check if it's an auth error
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isAuthError = errorMessage.includes('Unauthorized') || errorMessage.includes('authentication');
    return NextResponse.json(
      { error: errorMessage },
      { status: isAuthError ? 401 : 500 }
    );
  }
}

/**
 * GET /api/contacts/sync
 * Get sync status
 */
export async function GET() {
  return NextResponse.json({
    status: syncStatus,
  });
}

/**
 * Background sync function
 */
async function startSync(userId: string, maxContacts: number): Promise<void> {
  syncStatus = {
    isRunning: true,
    contactsProcessed: 0,
    entitiesSaved: 0,
    lastSync: new Date(),
  };

  try {
    console.log(`[Contacts Sync] Starting sync for user ${userId}...`);

    // Get Google OAuth tokens from database
    const tokens = await getGoogleTokens(userId);

    if (!tokens || !tokens.accessToken) {
      throw new Error('No Google access token found for user');
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    // Set credentials
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken || undefined,
    });

    // Set up token refresh callback to update database
    oauth2Client.on('tokens', async (newTokens) => {
      console.log('[Contacts Sync] OAuth tokens refreshed automatically');
      await updateGoogleTokens(userId, newTokens);
    });

    // Initialize Contacts Service
    const contactsService = await getContactsService(oauth2Client);

    // Fetch all contacts with pagination
    const contacts = await contactsService.fetchAllContacts(maxContacts);

    syncStatus.contactsProcessed = contacts.length;

    console.log(`[Contacts Sync] Fetched ${contacts.length} contacts`);

    // Convert contacts to Person entities
    const entities = convertContactsToEntities(contacts);

    console.log(`[Contacts Sync] Converted to ${entities.length} Person entities`);

    // Save entities to Weaviate
    if (entities.length > 0) {
      await saveEntities(entities, userId, 'contacts-sync');
      syncStatus.entitiesSaved = entities.length;
      console.log(`[Contacts Sync] Saved ${entities.length} entities to Weaviate`);
    }

    syncStatus.isRunning = false;
    syncStatus.lastSync = new Date();

    console.log(
      `[Contacts Sync] Completed. Processed ${contacts.length} contacts, saved ${syncStatus.entitiesSaved} entities`
    );
  } catch (error) {
    console.error('[Contacts Sync] Sync failed:', error);
    syncStatus.isRunning = false;
    syncStatus.error = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  }
}

/**
 * Convert Google Contacts to Person entities
 */
function convertContactsToEntities(contacts: Contact[]): Entity[] {
  const entities: Entity[] = [];

  for (const contact of contacts) {
    // Create Person entity with high confidence (these are user's saved contacts)
    const personEntity: Entity = {
      type: 'person',
      value: contact.displayName,
      normalized: normalizeContactName(contact),
      confidence: 0.95, // High confidence for saved contacts
      source: 'metadata',
      context: buildContactContext(contact),
    };

    entities.push(personEntity);

    // Add company entities from organizations
    for (const org of contact.organizations) {
      if (org.name) {
        entities.push({
          type: 'company',
          value: org.name,
          normalized: org.name.toLowerCase().trim(),
          confidence: 0.9,
          source: 'metadata',
          context: `${contact.displayName} works at ${org.name}${org.title ? ` as ${org.title}` : ''}`,
        });
      }
    }
  }

  return entities;
}

/**
 * Normalize contact name for entity matching
 */
function normalizeContactName(contact: Contact): string {
  if (contact.givenName && contact.familyName) {
    return `${contact.givenName} ${contact.familyName}`.toLowerCase().trim();
  }
  return contact.displayName.toLowerCase().trim();
}

/**
 * Build context string for contact entity
 */
function buildContactContext(contact: Contact): string {
  const parts: string[] = [];

  // Add primary email
  const primaryEmail = contact.emails.find((e) => e.primary) || contact.emails[0];
  if (primaryEmail) {
    parts.push(`Email: ${primaryEmail.value}`);
  }

  // Add primary phone
  const primaryPhone = contact.phoneNumbers.find((p) => p.primary) || contact.phoneNumbers[0];
  if (primaryPhone) {
    parts.push(`Phone: ${primaryPhone.value}`);
  }

  // Add organization
  if (contact.organizations.length > 0) {
    const org = contact.organizations[0];
    if (org.title && org.name) {
      parts.push(`${org.title} at ${org.name}`);
    } else if (org.name) {
      parts.push(org.name);
    }
  }

  return parts.join(' | ');
}
