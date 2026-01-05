/**
 * Google Calendar Types
 * Type definitions for calendar operations
 */

/**
 * Time representation for events
 */
export interface EventTime {
  dateTime?: string; // RFC3339 timestamp
  date?: string; // YYYY-MM-DD for all-day events
  timeZone?: string; // IANA timezone identifier
}

/**
 * Event attendee
 */
export interface EventAttendee {
  email: string;
  displayName?: string;
  organizer?: boolean;
  self?: boolean;
  responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  optional?: boolean;
  comment?: string;
}

/**
 * Event reminder
 */
export interface EventReminder {
  method: 'email' | 'popup';
  minutes: number;
}

/**
 * Recurrence rule
 */
export interface RecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval?: number;
  count?: number;
  until?: string;
  byDay?: string[]; // e.g., ['MO', 'WE', 'FR']
  byMonthDay?: number[];
  byMonth?: number[];
}

/**
 * Calendar event
 */
export interface CalendarEvent {
  id: string;
  calendarId: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  htmlLink?: string;
  created?: string;
  updated?: string;
  summary: string;
  description?: string;
  location?: string;
  creator?: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
  organizer?: {
    email: string;
    displayName?: string;
    self?: boolean;
  };
  start: EventTime;
  end: EventTime;
  endTimeUnspecified?: boolean;
  recurrence?: string[]; // RRULE, EXRULE, RDATE, EXDATE
  recurringEventId?: string;
  originalStartTime?: EventTime;
  transparency?: 'opaque' | 'transparent';
  visibility?: 'default' | 'public' | 'private' | 'confidential';
  iCalUID?: string;
  sequence?: number;
  attendees?: EventAttendee[];
  attendeesOmitted?: boolean;
  hangoutLink?: string;
  conferenceData?: {
    conferenceId?: string;
    conferenceSolution?: {
      name?: string;
      iconUri?: string;
    };
    entryPoints?: Array<{
      entryPointType: 'video' | 'phone' | 'sip' | 'more';
      uri: string;
      label?: string;
      password?: string;
    }>;
  };
  reminders?: {
    useDefault?: boolean;
    overrides?: EventReminder[];
  };
  colorId?: string;
}

/**
 * Calendar metadata
 */
export interface Calendar {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  timeZone?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  selected?: boolean;
  accessRole?: 'freeBusyReader' | 'reader' | 'writer' | 'owner';
  defaultReminders?: EventReminder[];
  primary?: boolean;
  deleted?: boolean;
  hidden?: boolean;
}

/**
 * Calendar list response
 */
export interface CalendarListResponse {
  calendars: Calendar[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

/**
 * Event list response
 */
export interface EventListResponse {
  events: CalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
  summary?: string;
  description?: string;
  updated?: string;
  timeZone?: string;
}

/**
 * Free/busy query time period
 */
export interface TimePeriod {
  start: string; // RFC3339 timestamp
  end: string; // RFC3339 timestamp
}

/**
 * Free/busy request
 */
export interface FreeBusyRequest {
  timeMin: string; // RFC3339 timestamp
  timeMax: string; // RFC3339 timestamp
  timeZone?: string;
  items: Array<{ id: string }>; // Calendar IDs to query
}

/**
 * Free/busy response
 */
export interface FreeBusyResponse {
  calendars: {
    [calendarId: string]: {
      busy: TimePeriod[];
      errors?: Array<{
        domain: string;
        reason: string;
      }>;
    };
  };
  timeMin: string;
  timeMax: string;
}

/**
 * Event creation parameters
 */
export interface CreateEventParams {
  calendarId?: string; // Defaults to 'primary'
  summary: string;
  description?: string;
  location?: string;
  start: EventTime;
  end: EventTime;
  attendees?: EventAttendee[];
  reminders?: {
    useDefault?: boolean;
    overrides?: EventReminder[];
  };
  conferenceData?: CalendarEvent['conferenceData'];
  recurrence?: string[];
  transparency?: 'opaque' | 'transparent';
  visibility?: 'default' | 'public' | 'private' | 'confidential';
  colorId?: string;
}

/**
 * Event update parameters
 */
export interface UpdateEventParams extends Partial<CreateEventParams> {
  eventId: string;
  calendarId?: string;
  sendUpdates?: 'all' | 'externalOnly' | 'none';
}

/**
 * Event list parameters
 */
export interface ListEventsParams {
  calendarId?: string; // Defaults to 'primary'
  timeMin?: string; // RFC3339 timestamp
  timeMax?: string; // RFC3339 timestamp
  maxResults?: number;
  pageToken?: string;
  singleEvents?: boolean; // Expand recurring events
  orderBy?: 'startTime' | 'updated';
  q?: string; // Free text search
  showDeleted?: boolean;
  showHiddenInvitations?: boolean;
  timeZone?: string;
}

/**
 * Calendar service error
 */
export class CalendarError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'CalendarError';
  }
}
