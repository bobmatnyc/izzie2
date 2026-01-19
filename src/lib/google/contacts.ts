/**
 * Google Contacts Service
 * Provides methods to interact with Google People API (Contacts)
 */

import { google, Auth, people_v1 } from 'googleapis';
import type { Contact } from './types';

export class ContactsService {
  private people: people_v1.People;

  constructor(auth: Auth.GoogleAuth | Auth.OAuth2Client) {
    this.people = google.people({ version: 'v1', auth });
  }

  /**
   * Fetch user's contacts from Google People API
   */
  async fetchContacts(options: {
    pageSize?: number;
    pageToken?: string;
  } = {}): Promise<{
    contacts: Contact[];
    nextPageToken?: string;
    totalContacts: number;
  }> {
    const { pageSize = 100, pageToken } = options;

    try {
      const response = await this.people.people.connections.list({
        resourceName: 'people/me',
        pageSize,
        pageToken,
        personFields: [
          'names',
          'emailAddresses',
          'phoneNumbers',
          'organizations',
          'photos',
          'biographies',
          'addresses',
          'birthdays',
        ].join(','),
      });

      const connections = response.data.connections || [];

      // Map to our Contact type
      const contacts: Contact[] = connections
        .filter((person) => {
          // Only include contacts with at least a name or email
          const hasName = person.names && person.names.length > 0;
          const hasEmail = person.emailAddresses && person.emailAddresses.length > 0;
          return hasName || hasEmail;
        })
        .map((person) => {
          const primaryName = person.names?.[0];
          const primaryEmail = person.emailAddresses?.find((e) => e.metadata?.primary)
            || person.emailAddresses?.[0];
          const primaryPhone = person.phoneNumbers?.find((p) => p.metadata?.primary)
            || person.phoneNumbers?.[0];
          const primaryOrg = person.organizations?.[0];
          const primaryPhoto = person.photos?.find((p) => p.metadata?.primary)
            || person.photos?.[0];

          return {
            resourceName: person.resourceName || '',
            displayName: primaryName?.displayName || primaryEmail?.value || 'Unknown',
            givenName: primaryName?.givenName ?? undefined,
            familyName: primaryName?.familyName ?? undefined,
            emails: person.emailAddresses?.map((email) => ({
              value: email.value || '',
              type: email.type || 'other',
              primary: email.metadata?.primary || false,
            })) || [],
            phoneNumbers: person.phoneNumbers?.map((phone) => ({
              value: phone.value || '',
              type: phone.type || 'other',
              primary: phone.metadata?.primary || false,
            })) || [],
            organizations: person.organizations?.map((org) => ({
              name: org.name || '',
              title: org.title ?? undefined,
              department: org.department ?? undefined,
            })) || [],
            photoUrl: primaryPhoto?.url ?? undefined,
            biography: person.biographies?.[0]?.value ?? undefined,
            addresses: person.addresses?.map((addr) => ({
              formattedValue: addr.formattedValue || '',
              type: addr.type || 'other',
              city: addr.city ?? undefined,
              region: addr.region ?? undefined,
              country: addr.country ?? undefined,
            })) || [],
            birthdays: person.birthdays?.map((bday) => ({
              date: bday.date ? {
                year: bday.date.year || undefined,
                month: bday.date.month || undefined,
                day: bday.date.day || undefined,
              } : undefined,
            })) || [],
          };
        });

      return {
        contacts,
        nextPageToken: response.data.nextPageToken || undefined,
        totalContacts: response.data.totalPeople || contacts.length,
      };
    } catch (error) {
      console.error('[Contacts] Failed to fetch contacts:', error);
      throw error;
    }
  }

  /**
   * Fetch all contacts with pagination
   */
  async fetchAllContacts(maxContacts: number = 1000): Promise<Contact[]> {
    const allContacts: Contact[] = [];
    let pageToken: string | undefined;
    let totalFetched = 0;

    try {
      do {
        const batch = await this.fetchContacts({
          pageSize: Math.min(100, maxContacts - totalFetched),
          pageToken,
        });

        allContacts.push(...batch.contacts);
        totalFetched += batch.contacts.length;
        pageToken = batch.nextPageToken;

        console.log(`[Contacts] Fetched ${totalFetched} contacts so far...`);

        // Stop if we've reached max contacts
        if (totalFetched >= maxContacts) {
          break;
        }
      } while (pageToken);

      console.log(`[Contacts] Total contacts fetched: ${allContacts.length}`);
      return allContacts;
    } catch (error) {
      console.error('[Contacts] Failed to fetch all contacts:', error);
      throw error;
    }
  }

  /**
   * Get a specific contact by resource name
   */
  async getContact(resourceName: string): Promise<Contact | null> {
    try {
      const response = await this.people.people.get({
        resourceName,
        personFields: [
          'names',
          'emailAddresses',
          'phoneNumbers',
          'organizations',
          'photos',
          'biographies',
          'addresses',
          'birthdays',
        ].join(','),
      });

      const person = response.data;
      const primaryName = person.names?.[0];
      const primaryEmail = person.emailAddresses?.find((e) => e.metadata?.primary)
        || person.emailAddresses?.[0];
      const primaryPhoto = person.photos?.find((p) => p.metadata?.primary)
        || person.photos?.[0];

      return {
        resourceName: person.resourceName || '',
        displayName: primaryName?.displayName || primaryEmail?.value || 'Unknown',
        givenName: primaryName?.givenName ?? undefined,
        familyName: primaryName?.familyName ?? undefined,
        emails: person.emailAddresses?.map((email) => ({
          value: email.value || '',
          type: email.type || 'other',
          primary: email.metadata?.primary || false,
        })) || [],
        phoneNumbers: person.phoneNumbers?.map((phone) => ({
          value: phone.value || '',
          type: phone.type || 'other',
          primary: phone.metadata?.primary || false,
        })) || [],
        organizations: person.organizations?.map((org) => ({
          name: org.name || '',
          title: org.title ?? undefined,
          department: org.department ?? undefined,
        })) || [],
        photoUrl: primaryPhoto?.url ?? undefined,
        biography: person.biographies?.[0]?.value ?? undefined,
        addresses: person.addresses?.map((addr) => ({
          formattedValue: addr.formattedValue || '',
          type: addr.type || 'other',
          city: addr.city ?? undefined,
          region: addr.region ?? undefined,
          country: addr.country ?? undefined,
        })) || [],
        birthdays: person.birthdays?.map((bday) => ({
          date: bday.date ? {
            year: bday.date.year || undefined,
            month: bday.date.month || undefined,
            day: bday.date.day || undefined,
          } : undefined,
        })) || [],
      };
    } catch (error) {
      console.error('[Contacts] Failed to get contact:', error);
      return null;
    }
  }
}

/**
 * Factory function to create ContactsService instance
 */
export async function getContactsService(
  auth: Auth.GoogleAuth | Auth.OAuth2Client
): Promise<ContactsService> {
  return new ContactsService(auth);
}
