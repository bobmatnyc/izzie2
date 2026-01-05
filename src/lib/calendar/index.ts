/**
 * Google Calendar Service
 * Provides calendar operations using Google Calendar API with OAuth tokens
 */

import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { getGoogleTokens } from '@/lib/auth';
import type {
  Calendar,
  CalendarEvent,
  CalendarListResponse,
  EventListResponse,
  CreateEventParams,
  UpdateEventParams,
  ListEventsParams,
  FreeBusyRequest,
  FreeBusyResponse,
  CalendarError,
  EventTime,
} from './types';

/**
 * Initialize OAuth2 client with user's tokens
 */
async function getCalendarClient(userId: string): Promise<{
  auth: OAuth2Client;
  calendar: calendar_v3.Calendar;
}> {
  try {
    // Get user's Google OAuth tokens
    const tokens = await getGoogleTokens(userId);

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
        : 'http://localhost:3300/api/auth/callback/google'
    );

    // Set credentials
    oauth2Client.setCredentials({
      access_token: tokens.accessToken || undefined,
      refresh_token: tokens.refreshToken || undefined,
      expiry_date: tokens.expiresAt ? new Date(tokens.expiresAt).getTime() : undefined,
    });

    // Auto-refresh tokens if needed
    oauth2Client.on('tokens', async (newTokens) => {
      console.log('[Calendar] Tokens refreshed for user:', userId);
      // TODO: Update tokens in database
      // This would require importing dbClient and updating the accounts table
    });

    // Initialize Calendar API
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    return { auth: oauth2Client, calendar };
  } catch (error) {
    console.error('[Calendar] Failed to initialize client:', error);
    throw new Error(
      error instanceof Error ? error.message : 'Failed to initialize calendar client'
    );
  }
}

/**
 * Convert Google Calendar API calendar to our Calendar type
 */
function mapCalendar(cal: calendar_v3.Schema$CalendarListEntry): Calendar {
  return {
    id: cal.id || '',
    summary: cal.summary || '',
    description: cal.description ?? undefined,
    location: cal.location ?? undefined,
    timeZone: cal.timeZone ?? undefined,
    backgroundColor: cal.backgroundColor ?? undefined,
    foregroundColor: cal.foregroundColor ?? undefined,
    selected: cal.selected ?? undefined,
    accessRole: cal.accessRole as Calendar['accessRole'],
    defaultReminders: cal.defaultReminders?.map((r) => ({
      method: r.method as 'email' | 'popup',
      minutes: r.minutes || 0,
    })),
    primary: cal.primary ?? undefined,
    deleted: cal.deleted ?? undefined,
    hidden: cal.hidden ?? undefined,
  };
}

/**
 * Convert Google Calendar API event to our CalendarEvent type
 */
function mapEvent(event: calendar_v3.Schema$Event, calendarId: string): CalendarEvent {
  return {
    id: event.id || '',
    calendarId,
    status: event.status as CalendarEvent['status'],
    htmlLink: event.htmlLink ?? undefined,
    created: event.created ?? undefined,
    updated: event.updated ?? undefined,
    summary: event.summary || '(No title)',
    description: event.description ?? undefined,
    location: event.location ?? undefined,
    creator: event.creator
      ? {
          email: event.creator.email || '',
          displayName: event.creator.displayName ?? undefined,
          self: event.creator.self ?? undefined,
        }
      : undefined,
    organizer: event.organizer
      ? {
          email: event.organizer.email || '',
          displayName: event.organizer.displayName ?? undefined,
          self: event.organizer.self ?? undefined,
        }
      : undefined,
    start: {
      dateTime: event.start?.dateTime ?? undefined,
      date: event.start?.date ?? undefined,
      timeZone: event.start?.timeZone ?? undefined,
    },
    end: {
      dateTime: event.end?.dateTime ?? undefined,
      date: event.end?.date ?? undefined,
      timeZone: event.end?.timeZone ?? undefined,
    },
    endTimeUnspecified: event.endTimeUnspecified ?? undefined,
    recurrence: event.recurrence ?? undefined,
    recurringEventId: event.recurringEventId ?? undefined,
    originalStartTime: event.originalStartTime
      ? {
          dateTime: event.originalStartTime.dateTime ?? undefined,
          date: event.originalStartTime.date ?? undefined,
          timeZone: event.originalStartTime.timeZone ?? undefined,
        }
      : undefined,
    transparency: event.transparency as CalendarEvent['transparency'],
    visibility: event.visibility as CalendarEvent['visibility'],
    iCalUID: event.iCalUID ?? undefined,
    sequence: event.sequence ?? undefined,
    attendees: event.attendees?.map((a) => ({
      email: a.email || '',
      displayName: a.displayName ?? undefined,
      organizer: a.organizer ?? undefined,
      self: a.self ?? undefined,
      responseStatus: a.responseStatus as any,
      optional: a.optional ?? undefined,
      comment: a.comment ?? undefined,
    })),
    attendeesOmitted: event.attendeesOmitted ?? undefined,
    hangoutLink: event.hangoutLink ?? undefined,
    conferenceData: event.conferenceData
      ? {
          conferenceId: event.conferenceData.conferenceId ?? undefined,
          conferenceSolution: event.conferenceData.conferenceSolution
            ? {
                name: event.conferenceData.conferenceSolution.name ?? undefined,
                iconUri: event.conferenceData.conferenceSolution.iconUri ?? undefined,
              }
            : undefined,
          entryPoints: event.conferenceData.entryPoints?.map((ep) => ({
            entryPointType: ep.entryPointType as any,
            uri: ep.uri || '',
            label: ep.label ?? undefined,
            password: ep.password ?? undefined,
          })),
        }
      : undefined,
    reminders: event.reminders
      ? {
          useDefault: event.reminders.useDefault ?? undefined,
          overrides: event.reminders.overrides?.map((r) => ({
            method: r.method as 'email' | 'popup',
            minutes: r.minutes || 0,
          })),
        }
      : undefined,
    colorId: event.colorId ?? undefined,
  };
}

/**
 * List user's calendars
 */
export async function listCalendars(
  userId: string,
  options?: {
    maxResults?: number;
    pageToken?: string;
    showDeleted?: boolean;
    showHidden?: boolean;
  }
): Promise<CalendarListResponse> {
  const { calendar } = await getCalendarClient(userId);

  const response = await calendar.calendarList.list({
    maxResults: options?.maxResults || 100,
    pageToken: options?.pageToken,
    showDeleted: options?.showDeleted,
    showHidden: options?.showHidden,
  });

  return {
    calendars: (response.data.items || []).map(mapCalendar),
    nextPageToken: response.data.nextPageToken || undefined,
    nextSyncToken: response.data.nextSyncToken || undefined,
  };
}

/**
 * Get a specific calendar
 */
export async function getCalendar(userId: string, calendarId: string): Promise<Calendar> {
  const { calendar } = await getCalendarClient(userId);

  const response = await calendar.calendarList.get({
    calendarId,
  });

  return mapCalendar(response.data);
}

/**
 * List events from a calendar
 */
export async function listEvents(
  userId: string,
  params?: ListEventsParams
): Promise<EventListResponse> {
  const { calendar } = await getCalendarClient(userId);

  const calendarId = params?.calendarId || 'primary';

  const response = await calendar.events.list({
    calendarId,
    timeMin: params?.timeMin,
    timeMax: params?.timeMax,
    maxResults: params?.maxResults || 250,
    pageToken: params?.pageToken,
    singleEvents: params?.singleEvents !== false, // Default true
    orderBy: params?.orderBy || (params?.singleEvents !== false ? 'startTime' : undefined),
    q: params?.q,
    showDeleted: params?.showDeleted,
    showHiddenInvitations: params?.showHiddenInvitations,
    timeZone: params?.timeZone,
  });

  return {
    events: (response.data.items || []).map((event) => mapEvent(event, calendarId)),
    nextPageToken: response.data.nextPageToken || undefined,
    nextSyncToken: response.data.nextSyncToken || undefined,
    summary: response.data.summary ?? undefined,
    description: response.data.description ?? undefined,
    updated: response.data.updated ?? undefined,
    timeZone: response.data.timeZone ?? undefined,
  };
}

/**
 * Get a specific event
 */
export async function getEvent(
  userId: string,
  eventId: string,
  calendarId: string = 'primary'
): Promise<CalendarEvent> {
  const { calendar } = await getCalendarClient(userId);

  const response = await calendar.events.get({
    calendarId,
    eventId,
  });

  return mapEvent(response.data, calendarId);
}

/**
 * Create a new event
 */
export async function createEvent(
  userId: string,
  params: CreateEventParams
): Promise<CalendarEvent> {
  const { calendar } = await getCalendarClient(userId);

  const calendarId = params.calendarId || 'primary';

  const response = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: params.conferenceData ? 1 : undefined,
    requestBody: {
      summary: params.summary,
      description: params.description,
      location: params.location,
      start: params.start,
      end: params.end,
      attendees: params.attendees,
      reminders: params.reminders,
      conferenceData: params.conferenceData,
      recurrence: params.recurrence,
      transparency: params.transparency,
      visibility: params.visibility,
      colorId: params.colorId,
    },
  });

  return mapEvent(response.data, calendarId);
}

/**
 * Update an existing event
 */
export async function updateEvent(
  userId: string,
  params: UpdateEventParams
): Promise<CalendarEvent> {
  const { calendar } = await getCalendarClient(userId);

  const calendarId = params.calendarId || 'primary';

  const response = await calendar.events.update({
    calendarId,
    eventId: params.eventId,
    sendUpdates: params.sendUpdates || 'none',
    conferenceDataVersion: params.conferenceData ? 1 : undefined,
    requestBody: {
      summary: params.summary,
      description: params.description,
      location: params.location,
      start: params.start,
      end: params.end,
      attendees: params.attendees,
      reminders: params.reminders,
      conferenceData: params.conferenceData,
      recurrence: params.recurrence,
      transparency: params.transparency,
      visibility: params.visibility,
      colorId: params.colorId,
    },
  });

  return mapEvent(response.data, calendarId);
}

/**
 * Delete an event
 */
export async function deleteEvent(
  userId: string,
  eventId: string,
  calendarId: string = 'primary',
  sendUpdates: 'all' | 'externalOnly' | 'none' = 'none'
): Promise<void> {
  const { calendar } = await getCalendarClient(userId);

  await calendar.events.delete({
    calendarId,
    eventId,
    sendUpdates,
  });
}

/**
 * Quick add event using natural language
 */
export async function quickAddEvent(
  userId: string,
  text: string,
  calendarId: string = 'primary'
): Promise<CalendarEvent> {
  const { calendar } = await getCalendarClient(userId);

  const response = await calendar.events.quickAdd({
    calendarId,
    text,
  });

  return mapEvent(response.data, calendarId);
}

/**
 * Check free/busy status
 */
export async function getFreeBusy(
  userId: string,
  request: FreeBusyRequest
): Promise<FreeBusyResponse> {
  const { calendar } = await getCalendarClient(userId);

  const response = await calendar.freebusy.query({
    requestBody: request,
  });

  return {
    calendars: (response.data.calendars || {}) as FreeBusyResponse['calendars'],
    timeMin: response.data.timeMin || request.timeMin,
    timeMax: response.data.timeMax || request.timeMax,
  };
}

/**
 * Export all calendar functions
 */
export {
  CalendarError,
  type Calendar,
  type CalendarEvent,
  type CalendarListResponse,
  type EventListResponse,
  type CreateEventParams,
  type UpdateEventParams,
  type ListEventsParams,
  type FreeBusyRequest,
  type FreeBusyResponse,
  type EventTime,
} from './types';
