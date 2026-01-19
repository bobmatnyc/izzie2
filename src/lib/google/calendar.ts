/**
 * Google Calendar Service
 * Provides methods to interact with Google Calendar API
 */

import { google, Auth, calendar_v3 } from 'googleapis';
import type { CalendarEvent } from './types';

export class CalendarService {
  private calendar: calendar_v3.Calendar;

  constructor(auth: Auth.GoogleAuth | Auth.OAuth2Client) {
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  /**
   * Fetch calendar events from primary calendar
   */
  async fetchEvents(options: {
    timeMin: Date;
    timeMax: Date;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{
    events: CalendarEvent[];
    nextPageToken?: string;
  }> {
    const { timeMin, timeMax, maxResults = 100, pageToken } = options;

    try {
      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults,
        singleEvents: true, // Expand recurring events
        orderBy: 'startTime',
        pageToken,
      });

      const items = response.data.items || [];

      // Map to our CalendarEvent type
      const events: CalendarEvent[] = items.map((item) => ({
        id: item.id || '',
        summary: item.summary || 'Untitled Event',
        description: item.description || undefined,
        location: item.location || undefined,
        start: this.parseDateTime(item.start),
        end: this.parseDateTime(item.end),
        attendees:
          item.attendees?.map((attendee) => ({
            email: attendee.email || '',
            displayName: attendee.displayName || attendee.email || '',
            responseStatus: attendee.responseStatus as
              | 'accepted'
              | 'declined'
              | 'tentative'
              | 'needsAction'
              | undefined,
            organizer: attendee.organizer || false,
            self: attendee.self || false,
          })) || [],
        organizer: item.organizer
          ? {
              email: item.organizer.email || '',
              displayName: item.organizer.displayName || item.organizer.email || '',
              self: item.organizer.self || false,
            }
          : undefined,
        recurringEventId: item.recurringEventId || undefined,
        status: item.status as 'confirmed' | 'tentative' | 'cancelled' | undefined,
        htmlLink: item.htmlLink || undefined,
      }));

      return {
        events,
        nextPageToken: response.data.nextPageToken || undefined,
      };
    } catch (error) {
      console.error('[Calendar] Failed to fetch events:', error);
      throw error;
    }
  }

  /**
   * Parse date/time from Calendar API response
   */
  private parseDateTime(
    dateTime?: calendar_v3.Schema$EventDateTime
  ): { dateTime: string; timeZone?: string } {
    if (!dateTime) {
      return { dateTime: new Date().toISOString() };
    }

    // Use dateTime if available (for events with specific times)
    // Otherwise use date (for all-day events)
    const dt = dateTime.dateTime || dateTime.date;

    return {
      dateTime: dt || new Date().toISOString(),
      timeZone: dateTime.timeZone ?? undefined,
    };
  }

  /**
   * Get a specific event by ID
   */
  async getEvent(eventId: string): Promise<CalendarEvent | null> {
    try {
      const response = await this.calendar.events.get({
        calendarId: 'primary',
        eventId,
      });

      const item = response.data;

      return {
        id: item.id || '',
        summary: item.summary || 'Untitled Event',
        description: item.description || undefined,
        location: item.location || undefined,
        start: this.parseDateTime(item.start),
        end: this.parseDateTime(item.end),
        attendees:
          item.attendees?.map((attendee) => ({
            email: attendee.email || '',
            displayName: attendee.displayName || attendee.email || '',
            responseStatus: attendee.responseStatus as
              | 'accepted'
              | 'declined'
              | 'tentative'
              | 'needsAction'
              | undefined,
            organizer: attendee.organizer || false,
            self: attendee.self || false,
          })) || [],
        organizer: item.organizer
          ? {
              email: item.organizer.email || '',
              displayName: item.organizer.displayName || item.organizer.email || '',
              self: item.organizer.self || false,
            }
          : undefined,
        recurringEventId: item.recurringEventId || undefined,
        status: item.status as 'confirmed' | 'tentative' | 'cancelled' | undefined,
        htmlLink: item.htmlLink || undefined,
      };
    } catch (error) {
      console.error('[Calendar] Failed to get event:', error);
      return null;
    }
  }
}

/**
 * Factory function to create CalendarService instance
 */
export async function getCalendarService(
  auth: Auth.GoogleAuth | Auth.OAuth2Client
): Promise<CalendarService> {
  return new CalendarService(auth);
}
