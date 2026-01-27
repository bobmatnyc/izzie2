/**
 * Google Contacts Chat Tools
 * Enables users to search and manage Google Contacts through the chat interface
 */

import { z } from 'zod';
import { google } from 'googleapis';
import { getGoogleTokens, updateGoogleTokens } from '@/lib/auth';
import { ContactsService } from '@/lib/google/contacts';
import type { Contact } from '@/lib/google/types';

const LOG_PREFIX = '[Contacts Tools]';

/**
 * Initialize OAuth2 client with user's tokens for Contacts access
 */
async function getContactsClient(userId: string): Promise<ContactsService> {
  const tokens = await getGoogleTokens(userId);
  if (!tokens) {
    throw new Error('No Google tokens found for user. Please connect your Google account.');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
      : 'http://localhost:3300/api/auth/callback/google'
  );

  oauth2Client.setCredentials({
    access_token: tokens.accessToken || undefined,
    refresh_token: tokens.refreshToken || undefined,
    expiry_date: tokens.accessTokenExpiresAt
      ? new Date(tokens.accessTokenExpiresAt).getTime()
      : undefined,
  });

  // Auto-refresh tokens if needed
  oauth2Client.on('tokens', async (newTokens) => {
    console.log(`${LOG_PREFIX} Tokens refreshed for user:`, userId);
    await updateGoogleTokens(userId, newTokens);
  });

  return new ContactsService(oauth2Client);
}

/**
 * Format a contact for display
 */
function formatContact(contact: Contact, detailed: boolean = false): string {
  let result = `**${contact.displayName}**`;

  // Primary email
  const primaryEmail = contact.emails.find((e) => e.primary) || contact.emails[0];
  if (primaryEmail) {
    result += `\n  Email: ${primaryEmail.value}`;
  }

  // Primary phone
  const primaryPhone = contact.phoneNumbers.find((p) => p.primary) || contact.phoneNumbers[0];
  if (primaryPhone) {
    result += `\n  Phone: ${primaryPhone.value}`;
  }

  // Organization
  const org = contact.organizations[0];
  if (org) {
    if (org.title && org.name) {
      result += `\n  Work: ${org.title} at ${org.name}`;
    } else if (org.name) {
      result += `\n  Company: ${org.name}`;
    } else if (org.title) {
      result += `\n  Title: ${org.title}`;
    }
  }

  if (detailed) {
    // All emails
    if (contact.emails.length > 1) {
      result += '\n  All Emails:';
      contact.emails.forEach((e) => {
        result += `\n    - ${e.value} (${e.type}${e.primary ? ', primary' : ''})`;
      });
    }

    // All phone numbers
    if (contact.phoneNumbers.length > 1) {
      result += '\n  All Phones:';
      contact.phoneNumbers.forEach((p) => {
        result += `\n    - ${p.value} (${p.type}${p.primary ? ', primary' : ''})`;
      });
    }

    // Addresses
    if (contact.addresses.length > 0) {
      result += '\n  Addresses:';
      contact.addresses.forEach((a) => {
        result += `\n    - ${a.formattedValue} (${a.type})`;
      });
    }

    // Biography
    if (contact.biography) {
      result += `\n  Notes: ${contact.biography}`;
    }

    // Birthday
    const birthday = contact.birthdays[0]?.date;
    if (birthday && birthday.month && birthday.day) {
      const year = birthday.year ? `${birthday.year}-` : '';
      result += `\n  Birthday: ${year}${birthday.month}/${birthday.day}`;
    }

    // Resource name for reference
    result += `\n  ID: ${contact.resourceName}`;
  }

  return result;
}

/**
 * Search Contacts Tool
 * Search contacts by name, email, or company
 */
export const searchContactsToolSchema = z.object({
  query: z
    .string()
    .describe(
      'Search query to find contacts. Searches across name, email, phone, and company.'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Maximum number of results to return (1-50)'),
});

export type SearchContactsParams = z.infer<typeof searchContactsToolSchema>;

export const searchContactsTool = {
  name: 'search_contacts',
  description:
    'Search your Google Contacts by name, email, phone number, or company. Returns matching contacts with their basic information.',
  parameters: searchContactsToolSchema,

  async execute(
    params: SearchContactsParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = searchContactsToolSchema.parse(params);
      const contactsService = await getContactsClient(userId);

      // Fetch contacts and filter locally (Google People API doesn't have search)
      const allContacts = await contactsService.fetchAllContacts(500);
      const query = validated.query.toLowerCase();

      const matches = allContacts.filter((contact) => {
        const searchFields = [
          contact.displayName,
          contact.givenName,
          contact.familyName,
          ...contact.emails.map((e) => e.value),
          ...contact.phoneNumbers.map((p) => p.value),
          ...contact.organizations.map((o) => `${o.name} ${o.title || ''} ${o.department || ''}`),
        ]
          .filter(Boolean)
          .map((f) => f!.toLowerCase());

        return searchFields.some((field) => field.includes(query));
      });

      if (matches.length === 0) {
        return {
          message: `No contacts found matching "${validated.query}".`,
        };
      }

      const limitedMatches = matches.slice(0, validated.limit);
      const contactList = limitedMatches.map((c) => formatContact(c, false)).join('\n\n');

      let message = `**Found ${matches.length} contact(s) matching "${validated.query}"**`;
      if (matches.length > validated.limit) {
        message += ` (showing first ${validated.limit})`;
      }
      message += `:\n\n${contactList}`;

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} Search contacts failed:`, error);
      throw new Error(
        `Failed to search contacts: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Get Contact Details Tool
 * Get full contact information by ID or email
 */
export const getContactDetailsToolSchema = z.object({
  identifier: z
    .string()
    .describe(
      'Contact identifier - either a resource name (e.g., "people/c1234567890") or an email address'
    ),
});

export type GetContactDetailsParams = z.infer<typeof getContactDetailsToolSchema>;

export const getContactDetailsTool = {
  name: 'get_contact_details',
  description:
    'Get full details of a contact by their ID (resource name like "people/c123") or email address. Returns all contact information including addresses, notes, and birthday.',
  parameters: getContactDetailsToolSchema,

  async execute(
    params: GetContactDetailsParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = getContactDetailsToolSchema.parse(params);
      const contactsService = await getContactsClient(userId);
      const identifier = validated.identifier.trim();

      let contact: Contact | null = null;

      // Check if it's a resource name or email
      if (identifier.startsWith('people/')) {
        // Direct lookup by resource name
        contact = await contactsService.getContact(identifier);
      } else {
        // Search by email
        const allContacts = await contactsService.fetchAllContacts(500);
        contact = allContacts.find((c) =>
          c.emails.some((e) => e.value.toLowerCase() === identifier.toLowerCase())
        ) || null;
      }

      if (!contact) {
        return {
          message: `No contact found with identifier "${identifier}".`,
        };
      }

      const details = formatContact(contact, true);
      return {
        message: `**Contact Details**\n\n${details}`,
      };
    } catch (error) {
      console.error(`${LOG_PREFIX} Get contact details failed:`, error);
      throw new Error(
        `Failed to get contact details: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};

/**
 * Sync Contacts Tool
 * Trigger a contact sync and report status
 */
export const syncContactsToolSchema = z.object({
  maxContacts: z
    .number()
    .int()
    .min(10)
    .max(1000)
    .optional()
    .default(100)
    .describe('Maximum number of contacts to sync (10-1000)'),
});

export type SyncContactsParams = z.infer<typeof syncContactsToolSchema>;

export const syncContactsTool = {
  name: 'sync_contacts',
  description:
    'Sync contacts from Google Contacts. Fetches and reports the current state of your contacts.',
  parameters: syncContactsToolSchema,

  async execute(
    params: SyncContactsParams,
    userId: string
  ): Promise<{ message: string }> {
    try {
      const validated = syncContactsToolSchema.parse(params);
      const contactsService = await getContactsClient(userId);

      console.log(`${LOG_PREFIX} Starting contact sync for user:`, userId);

      const contacts = await contactsService.fetchAllContacts(validated.maxContacts);

      // Calculate stats
      const withEmail = contacts.filter((c) => c.emails.length > 0).length;
      const withPhone = contacts.filter((c) => c.phoneNumbers.length > 0).length;
      const withOrg = contacts.filter((c) => c.organizations.length > 0).length;

      let message = `**Contact Sync Complete**\n\n`;
      message += `Total contacts synced: ${contacts.length}\n`;
      message += `- With email: ${withEmail}\n`;
      message += `- With phone: ${withPhone}\n`;
      message += `- With organization: ${withOrg}\n`;

      if (contacts.length >= validated.maxContacts) {
        message += `\n*Note: Reached max limit of ${validated.maxContacts}. You may have more contacts.*`;
      }

      return { message };
    } catch (error) {
      console.error(`${LOG_PREFIX} Sync contacts failed:`, error);
      throw new Error(
        `Failed to sync contacts: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },
};
