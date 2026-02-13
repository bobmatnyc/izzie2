/**
 * Calendar Event Processor Service
 *
 * Fetches calendar events day-by-day and extracts entities and relationships
 * from attendees, organizers, and locations.
 *
 * Infers relationships from meeting patterns:
 * - Recurring 1:1 meetings → WORKS_WITH or REPORTS_TO
 * - Team meetings (3+ attendees) → PARTICIPATES_IN
 */

import { Auth } from 'googleapis';
import { CalendarService } from '@/lib/google/calendar';
import { getProgressService, ProgressService } from './progress';
import type { CalendarEvent } from '@/lib/google/types';
import type { Entity, InlineRelationship } from '@/lib/extraction/types';
import type { DayResult } from '../types';

const LOG_PREFIX = '[CalendarProcessor]';

export interface CalendarProcessorConfig {
  batchSize: number; // Events per batch (default: 50)
  delayBetweenBatches: number; // ms between batches (default: 500)
  maxEventsPerDay: number; // Max events per day to process (default: 100)
  startDate?: Date; // Start date for processing
  endDate?: Date; // End date for processing
  userId?: string; // User ID for database operations
}

export class CalendarProcessorService {
  private calendar: CalendarService;
  private auth: Auth.OAuth2Client;
  private config: CalendarProcessorConfig;
  private progress: ProgressService;
  private userEmail: string | null = null;

  constructor(
    auth: Auth.OAuth2Client,
    config: Partial<CalendarProcessorConfig> = {}
  ) {
    this.auth = auth;
    this.calendar = new CalendarService(auth);
    this.progress = getProgressService();
    this.config = {
      batchSize: config.batchSize ?? 50,
      delayBetweenBatches: config.delayBetweenBatches ?? 500,
      maxEventsPerDay: config.maxEventsPerDay ?? 100,
      startDate: config.startDate,
      endDate: config.endDate,
      userId: config.userId,
    };

    console.log(`${LOG_PREFIX} Initialized with config:`, this.config);
  }

  /**
   * Set user identity for entity filtering
   */
  setUserIdentity(email: string): void {
    this.userEmail = email;
    console.log(`${LOG_PREFIX} User identity set: ${email}`);
  }

  /**
   * Process calendar events for a single day
   */
  async processDayEvents(day: string, signal?: AbortSignal): Promise<DayResult> {
    console.log(`${LOG_PREFIX} Processing day: ${day}`);

    const dayStart = new Date(`${day}T00:00:00.000Z`);
    const dayEnd = new Date(`${day}T23:59:59.999Z`);

    const result: DayResult = {
      date: day,
      emailsProcessed: 0, // Not processing emails here
      eventsProcessed: 0 as number, // Track calendar events
      entities: [],
      relationships: [],
      errors: [],
    };

    try {
      // Fetch calendar events for this day
      const events = await this.fetchEventsForDay(dayStart, dayEnd);
      console.log(`${LOG_PREFIX} Found ${events.length} calendar events for ${day}`);

      // Limit events per day
      const eventsToProcess = events.slice(0, this.config.maxEventsPerDay);

      // Process events
      for (const event of eventsToProcess) {
        if (signal?.aborted) {
          console.log(`${LOG_PREFIX} Day processing aborted`);
          return result;
        }

        try {
          // Extract entities from event
          const entities = this.extractEntitiesFromEvent(event);
          result.entities.push(...entities);

          // Infer relationships from event
          const relationships = this.inferRelationshipsFromEvent(event);
          result.relationships.push(...relationships);

          // Record calendar event in progress
          this.progress.recordCalendarEvent(
            {
              id: event.id,
              summary: event.summary,
              start: event.start.dateTime,
              end: event.end.dateTime,
              attendeeCount: event.attendees.length,
              location: event.location,
              date: new Date(event.start.dateTime),
            },
            entities,
            relationships
          );

          result.eventsProcessed = (result.eventsProcessed || 0) + 1;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`${LOG_PREFIX} Error processing event ${event.id}:`, error);
          result.errors.push(`Event ${event.id}: ${errorMessage}`);
          this.progress.recordError(
            `Failed to process calendar event ${event.id}`,
            errorMessage
          );
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`${LOG_PREFIX} Error fetching events for ${day}:`, error);
      result.errors.push(errorMessage);
      this.progress.recordError(`Failed to fetch calendar events for ${day}`, errorMessage);
    }

    console.log(
      `${LOG_PREFIX} Day ${day} complete: ` +
      `${result.eventsProcessed} events, ` +
      `${result.entities.length} entities, ` +
      `${result.relationships.length} relationships`
    );

    return result;
  }

  /**
   * Extract entities from calendar event
   * - Organizer → person entity
   * - Attendees → person entities
   * - Location → location entity
   */
  private extractEntitiesFromEvent(event: CalendarEvent): Entity[] {
    const entities: Entity[] = [];

    // Extract organizer as person entity
    if (event.organizer && event.organizer.email !== this.userEmail) {
      entities.push({
        type: 'person',
        value: event.organizer.displayName || event.organizer.email,
        metadata: {
          email: event.organizer.email,
          source: 'calendar',
          role: 'organizer',
        },
      });
    }

    // Extract attendees as person entities (exclude user)
    for (const attendee of event.attendees) {
      if (attendee.email === this.userEmail) continue;
      if (attendee.email === event.organizer?.email) continue; // Already added organizer

      entities.push({
        type: 'person',
        value: attendee.displayName || attendee.email,
        metadata: {
          email: attendee.email,
          source: 'calendar',
          role: 'attendee',
          responseStatus: attendee.responseStatus,
        },
      });
    }

    // Extract location as location entity
    if (event.location) {
      entities.push({
        type: 'location',
        value: event.location,
        metadata: {
          source: 'calendar',
        },
      });
    }

    return entities;
  }

  /**
   * Infer relationships from calendar event patterns
   * - Recurring 1:1 meeting → WORKS_WITH or REPORTS_TO
   * - Team meeting (3+ attendees) → PARTICIPATES_IN
   */
  private inferRelationshipsFromEvent(event: CalendarEvent): InlineRelationship[] {
    const relationships: InlineRelationship[] = [];

    // Skip events without attendees or with only user
    const otherAttendees = event.attendees.filter((a) => a.email !== this.userEmail);
    if (otherAttendees.length === 0) return relationships;

    const userDisplayName = this.userEmail || 'You';

    // Pattern 1: Recurring 1:1 meeting
    if (event.recurringEventId && otherAttendees.length === 1) {
      const attendee = otherAttendees[0];
      const attendeeName = attendee.displayName || attendee.email;

      // If user is organizer → user MANAGES attendee (or REPORTS_TO if inverted)
      // If attendee is organizer → attendee MANAGES user
      if (event.organizer?.email === this.userEmail) {
        relationships.push({
          from: userDisplayName,
          to: attendeeName,
          type: 'WORKS_WITH',
          metadata: {
            source: 'calendar',
            pattern: 'recurring_1on1',
            eventId: event.id,
            meetingTitle: event.summary,
          },
        });
      } else if (event.organizer?.email === attendee.email) {
        relationships.push({
          from: attendeeName,
          to: userDisplayName,
          type: 'WORKS_WITH',
          metadata: {
            source: 'calendar',
            pattern: 'recurring_1on1',
            eventId: event.id,
            meetingTitle: event.summary,
          },
        });
      }
    }

    // Pattern 2: Team meeting (3+ attendees including user)
    if (otherAttendees.length >= 2) {
      const projectName = event.summary || 'Unknown Project';

      // Create PARTICIPATES_IN relationships for all attendees
      for (const attendee of otherAttendees) {
        const attendeeName = attendee.displayName || attendee.email;
        relationships.push({
          from: attendeeName,
          to: projectName,
          type: 'PARTICIPATES_IN',
          metadata: {
            source: 'calendar',
            pattern: 'team_meeting',
            eventId: event.id,
            attendeeCount: otherAttendees.length + 1, // +1 for user
          },
        });
      }

      // User also participates
      relationships.push({
        from: userDisplayName,
        to: projectName,
        type: 'PARTICIPATES_IN',
        metadata: {
          source: 'calendar',
          pattern: 'team_meeting',
          eventId: event.id,
          attendeeCount: otherAttendees.length + 1,
        },
      });
    }

    return relationships;
  }

  /**
   * Fetch calendar events for a specific day
   */
  private async fetchEventsForDay(start: Date, end: Date): Promise<CalendarEvent[]> {
    const allEvents: CalendarEvent[] = [];
    let pageToken: string | undefined;

    // Fetch all pages
    do {
      const response = await this.calendar.fetchEvents({
        timeMin: start,
        timeMax: end,
        maxResults: this.config.batchSize,
        pageToken,
      });

      allEvents.push(...response.events);
      pageToken = response.nextPageToken;

      // Respect batch delay
      if (pageToken) {
        await this.sleep(this.config.delayBetweenBatches);
      }
    } while (pageToken && allEvents.length < this.config.maxEventsPerDay);

    return allEvents.slice(0, this.config.maxEventsPerDay);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create processor with auth
 */
export function createCalendarProcessor(
  auth: Auth.OAuth2Client,
  config?: Partial<CalendarProcessorConfig>
): CalendarProcessorService {
  return new CalendarProcessorService(auth, config);
}
