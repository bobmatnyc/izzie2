/**
 * Scheduler Agent
 * Core scheduling logic with calendar integration
 */

import {
  createEvent,
  updateEvent,
  deleteEvent,
  getEvent,
  listEvents,
  type CreateEventParams,
  type UpdateEventParams,
  type CalendarEvent,
} from '@/lib/calendar';
import {
  findAvailability,
  type AvailabilityRequest,
  type AvailableSlot,
  type Participant as CalendarParticipant,
} from '@/lib/calendar/availability';
import { parseIntent, resolveParticipants, parseTimeReference } from './intent-parser';
import type {
  SchedulerRequest,
  ScheduleRequest,
  RescheduleRequest,
  CancelRequest,
  FindTimeRequest,
  SchedulingResponse,
  TimeSlot,
  Participant,
} from './types';
import { SchedulingAction } from './types';

/**
 * Main Scheduler Agent class
 */
export class SchedulerAgent {
  /**
   * Process a scheduling request
   */
  async processRequest(request: SchedulerRequest): Promise<SchedulingResponse> {
    try {
      switch (request.action) {
        case SchedulingAction.SCHEDULE:
          return await this.handleSchedule(request);
        case SchedulingAction.RESCHEDULE:
          return await this.handleReschedule(request);
        case SchedulingAction.CANCEL:
          return await this.handleCancel(request);
        case SchedulingAction.FIND_TIME:
          return await this.handleFindTime(request);
        default:
          throw new Error(`Unknown action: ${(request as any).action}`);
      }
    } catch (error) {
      console.error('[Scheduler Agent] Request processing failed:', error);
      return {
        success: false,
        action: request.action,
        message: 'Failed to process scheduling request',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Process natural language scheduling command
   */
  async processNaturalLanguage(
    input: string,
    userId: string
  ): Promise<SchedulingResponse> {
    try {
      console.log('[Scheduler Agent] Parsing natural language:', input);

      // Parse intent from natural language
      const intent = await parseIntent(input);

      console.log('[Scheduler Agent] Extracted intent:', {
        action: intent.action,
        confidence: intent.confidence,
        data: intent.extractedData,
      });

      // Build structured request from intent
      const request = await this.buildRequestFromIntent(intent, userId);

      // Process the request
      return await this.processRequest(request);
    } catch (error) {
      console.error('[Scheduler Agent] Natural language processing failed:', error);
      return {
        success: false,
        action: SchedulingAction.SCHEDULE,
        message: 'Failed to understand scheduling request',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle schedule action
   */
  private async handleSchedule(request: ScheduleRequest): Promise<SchedulingResponse> {
    const { userId, title, description, participants, duration, location, timeConstraints, autoSchedule, maxSuggestions } = request;

    // Convert participants to calendar participants
    const calendarParticipants = await this.toCalendarParticipants(participants, userId);

    // Build availability request
    const dateRange = timeConstraints?.earliestDate && timeConstraints?.latestDate
      ? {
          start: timeConstraints.earliestDate,
          end: timeConstraints.latestDate,
        }
      : this.getDefaultDateRange();

    const availabilityRequest: AvailabilityRequest = {
      participants: calendarParticipants,
      dateRange,
      duration,
      bufferMinutes: timeConstraints?.bufferMinutes ?? 0,
      preferences: timeConstraints
        ? {
            preferredTimeOfDay: timeConstraints.preferredTimeOfDay,
            preferredDays: timeConstraints.preferredDays,
            avoidDays: timeConstraints.avoidDays,
            preferSooner: true,
          }
        : undefined,
      limit: maxSuggestions,
    };

    console.log('[Scheduler Agent] Finding availability...', {
      participantCount: calendarParticipants.length,
      duration,
      dateRange,
    });

    // Find available slots
    const availability = await findAvailability(availabilityRequest);

    if (availability.slots.length === 0) {
      return {
        success: false,
        action: SchedulingAction.SCHEDULE,
        message: 'No available time slots found for all participants',
        suggestions: [],
      };
    }

    // Auto-schedule if requested and we have a high-quality slot
    if (autoSchedule && availability.slots[0].score >= 0.7) {
      const slot = availability.slots[0];
      const event = await this.createCalendarEvent(
        userId,
        title,
        description,
        slot.start,
        slot.end,
        participants.map((p) => ({ email: p.email, displayName: p.displayName })),
        location
      );

      return {
        success: true,
        action: SchedulingAction.SCHEDULE,
        event: {
          id: event.id,
          title: event.summary || title,
          start: event.start.dateTime || event.start.date || '',
          end: event.end.dateTime || event.end.date || '',
          htmlLink: event.htmlLink,
          attendees: event.attendees,
        },
        message: `Meeting scheduled successfully for ${new Date(slot.start).toLocaleString()}`,
      };
    }

    // Return suggestions for user to choose
    const suggestions = availability.slots.map((slot) => this.mapSlotToTimeSlot(slot, participants));

    return {
      success: true,
      action: SchedulingAction.SCHEDULE,
      suggestions,
      message: `Found ${suggestions.length} available time slot${suggestions.length !== 1 ? 's' : ''}`,
    };
  }

  /**
   * Handle reschedule action
   */
  private async handleReschedule(request: RescheduleRequest): Promise<SchedulingResponse> {
    const { userId, eventId, calendarId = 'primary', newStartTime, reason, timeConstraints, autoSchedule, maxSuggestions } = request;

    // Get existing event
    const existingEvent = await getEvent(userId, eventId, calendarId);

    if (!existingEvent) {
      return {
        success: false,
        action: SchedulingAction.RESCHEDULE,
        message: 'Event not found',
        error: 'Could not find event to reschedule',
      };
    }

    // Calculate duration from existing event
    const existingStart = new Date(existingEvent.start.dateTime || existingEvent.start.date || '');
    const existingEnd = new Date(existingEvent.end.dateTime || existingEvent.end.date || '');
    const duration = Math.round((existingEnd.getTime() - existingStart.getTime()) / (1000 * 60));

    // If specific time provided, reschedule directly
    if (newStartTime) {
      const newStart = new Date(newStartTime);
      const newEnd = new Date(newStart.getTime() + duration * 60 * 1000);

      const updateParams: UpdateEventParams = {
        eventId,
        calendarId,
        start: { dateTime: newStart.toISOString() },
        end: { dateTime: newEnd.toISOString() },
        description: reason
          ? `${existingEvent.description || ''}\n\nRescheduled: ${reason}`
          : existingEvent.description,
        sendUpdates: 'all',
      };

      const updatedEvent = await updateEvent(userId, updateParams);

      return {
        success: true,
        action: SchedulingAction.RESCHEDULE,
        event: {
          id: updatedEvent.id,
          title: updatedEvent.summary || '',
          start: updatedEvent.start.dateTime || updatedEvent.start.date || '',
          end: updatedEvent.end.dateTime || updatedEvent.end.date || '',
          htmlLink: updatedEvent.htmlLink,
          attendees: updatedEvent.attendees,
        },
        message: `Meeting rescheduled to ${newStart.toLocaleString()}`,
      };
    }

    // Otherwise, find new available slots
    // Extract participants from existing event
    const participants: Participant[] =
      existingEvent.attendees?.map((a) => ({
        email: a.email,
        displayName: a.displayName,
        isRequired: true,
      })) || [];

    // Convert to calendar participants
    const calendarParticipants = await this.toCalendarParticipants(participants, userId);

    // Build availability request
    const dateRange = timeConstraints?.earliestDate && timeConstraints?.latestDate
      ? {
          start: timeConstraints.earliestDate,
          end: timeConstraints.latestDate,
        }
      : this.getDefaultDateRange();

    const availabilityRequest: AvailabilityRequest = {
      participants: calendarParticipants,
      dateRange,
      duration,
      bufferMinutes: timeConstraints?.bufferMinutes ?? 0,
      preferences: timeConstraints
        ? {
            preferredTimeOfDay: timeConstraints.preferredTimeOfDay,
            preferredDays: timeConstraints.preferredDays,
            avoidDays: timeConstraints.avoidDays,
            preferSooner: true,
          }
        : undefined,
      limit: maxSuggestions,
    };

    const availability = await findAvailability(availabilityRequest);

    if (availability.slots.length === 0) {
      return {
        success: false,
        action: SchedulingAction.RESCHEDULE,
        message: 'No available time slots found for rescheduling',
        suggestions: [],
      };
    }

    // Auto-reschedule if requested
    if (autoSchedule && availability.slots[0].score >= 0.7) {
      const slot = availability.slots[0];
      const updateParams: UpdateEventParams = {
        eventId,
        calendarId,
        start: { dateTime: slot.start },
        end: { dateTime: slot.end },
        description: reason
          ? `${existingEvent.description || ''}\n\nRescheduled: ${reason}`
          : existingEvent.description,
        sendUpdates: 'all',
      };

      const updatedEvent = await updateEvent(userId, updateParams);

      return {
        success: true,
        action: SchedulingAction.RESCHEDULE,
        event: {
          id: updatedEvent.id,
          title: updatedEvent.summary || '',
          start: updatedEvent.start.dateTime || updatedEvent.start.date || '',
          end: updatedEvent.end.dateTime || updatedEvent.end.date || '',
          htmlLink: updatedEvent.htmlLink,
          attendees: updatedEvent.attendees,
        },
        message: `Meeting rescheduled to ${new Date(slot.start).toLocaleString()}`,
      };
    }

    // Return suggestions
    const suggestions = availability.slots.map((slot) => this.mapSlotToTimeSlot(slot, participants));

    return {
      success: true,
      action: SchedulingAction.RESCHEDULE,
      suggestions,
      message: `Found ${suggestions.length} time slot${suggestions.length !== 1 ? 's' : ''} for rescheduling`,
    };
  }

  /**
   * Handle cancel action
   */
  private async handleCancel(request: CancelRequest): Promise<SchedulingResponse> {
    const { userId, eventId, calendarId = 'primary', reason, notifyAttendees } = request;

    // Get event details before deleting
    const event = await getEvent(userId, eventId, calendarId);

    if (!event) {
      return {
        success: false,
        action: SchedulingAction.CANCEL,
        message: 'Event not found',
        error: 'Could not find event to cancel',
      };
    }

    // Delete the event
    await deleteEvent(userId, eventId, calendarId, notifyAttendees ? 'all' : 'none');

    return {
      success: true,
      action: SchedulingAction.CANCEL,
      event: {
        id: event.id,
        title: event.summary || '',
        start: event.start.dateTime || event.start.date || '',
        end: event.end.dateTime || event.end.date || '',
      },
      message: `Meeting "${event.summary}" cancelled successfully`,
    };
  }

  /**
   * Handle find time action
   */
  private async handleFindTime(request: FindTimeRequest): Promise<SchedulingResponse> {
    const { userId, participants, duration, timeConstraints, maxSuggestions } = request;

    // Convert participants
    const calendarParticipants = await this.toCalendarParticipants(participants, userId);

    // Build availability request
    const dateRange = timeConstraints?.earliestDate && timeConstraints?.latestDate
      ? {
          start: timeConstraints.earliestDate,
          end: timeConstraints.latestDate,
        }
      : this.getDefaultDateRange();

    const availabilityRequest: AvailabilityRequest = {
      participants: calendarParticipants,
      dateRange,
      duration,
      bufferMinutes: timeConstraints?.bufferMinutes ?? 0,
      preferences: timeConstraints
        ? {
            preferredTimeOfDay: timeConstraints.preferredTimeOfDay,
            preferredDays: timeConstraints.preferredDays,
            avoidDays: timeConstraints.avoidDays,
            preferSooner: true,
          }
        : undefined,
      limit: maxSuggestions,
    };

    const availability = await findAvailability(availabilityRequest);

    const suggestions = availability.slots.map((slot) => this.mapSlotToTimeSlot(slot, participants));

    return {
      success: true,
      action: SchedulingAction.FIND_TIME,
      suggestions,
      message:
        suggestions.length > 0
          ? `Found ${suggestions.length} available time slot${suggestions.length !== 1 ? 's' : ''}`
          : 'No available time slots found',
    };
  }

  /**
   * Convert scheduler participants to calendar participants
   */
  private async toCalendarParticipants(
    participants: Participant[],
    userId: string
  ): Promise<CalendarParticipant[]> {
    // For now, assume all participants use the requesting user's calendar access
    // In production, you'd look up each participant's userId
    return participants.map((p) => ({
      calendarId: p.email === userId ? 'primary' : p.email, // Use email as calendar ID
      userId, // Use requesting user's credentials
      email: p.email,
      displayName: p.displayName,
      workingHours: p.workingHours,
      isRequired: p.isRequired,
    }));
  }

  /**
   * Create a calendar event
   */
  private async createCalendarEvent(
    userId: string,
    title: string,
    description: string | undefined,
    startTime: string,
    endTime: string,
    attendees: Array<{ email: string; displayName?: string }>,
    location?: string
  ): Promise<CalendarEvent> {
    const params: CreateEventParams = {
      summary: title,
      description,
      start: { dateTime: startTime },
      end: { dateTime: endTime },
      attendees,
      location,
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    };

    return await createEvent(userId, params);
  }

  /**
   * Map availability slot to time slot
   */
  private mapSlotToTimeSlot(slot: AvailableSlot, participants: Participant[]): TimeSlot {
    return {
      start: slot.start,
      end: slot.end,
      score: slot.score,
      scoreBreakdown: slot.scoreBreakdown,
      participants: slot.participants.map((p) => ({
        email: p.calendarId,
        timezone: p.timezone,
        localTime: p.localTime,
      })),
    };
  }

  /**
   * Get default date range (next 2 weeks)
   */
  private getDefaultDateRange(): { start: string; end: string } {
    const now = new Date();
    const start = new Date(now);
    start.setHours(start.getHours() + 1, 0, 0, 0); // Start in 1 hour

    const end = new Date(start);
    end.setDate(end.getDate() + 14); // Search 2 weeks ahead

    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }

  /**
   * Build structured request from natural language intent
   */
  private async buildRequestFromIntent(
    intent: any,
    userId: string
  ): Promise<SchedulerRequest> {
    const { action, extractedData } = intent;

    switch (action) {
      case SchedulingAction.SCHEDULE: {
        const participants = extractedData.participants
          ? await resolveParticipants(extractedData.participants, userId)
          : [];

        // Parse time reference if provided
        const dateRange = extractedData.timeReference
          ? parseTimeReference(extractedData.timeReference, extractedData.duration || 60)
          : null;

        return {
          action: SchedulingAction.SCHEDULE,
          userId,
          title: extractedData.title || 'Meeting',
          participants,
          duration: extractedData.duration || 60,
          timeConstraints: dateRange
            ? {
                earliestDate: dateRange.start,
                latestDate: dateRange.end,
                preferredTimeOfDay: 'any',
                bufferMinutes: 0,
              }
            : undefined,
          autoSchedule: false,
          maxSuggestions: 5,
        };
      }

      case SchedulingAction.FIND_TIME: {
        const participants = extractedData.participants
          ? await resolveParticipants(extractedData.participants, userId)
          : [];

        const dateRange = extractedData.timeReference
          ? parseTimeReference(extractedData.timeReference, extractedData.duration || 60)
          : null;

        return {
          action: SchedulingAction.FIND_TIME,
          userId,
          participants,
          duration: extractedData.duration || 60,
          timeConstraints: dateRange
            ? {
                earliestDate: dateRange.start,
                latestDate: dateRange.end,
                preferredTimeOfDay: 'any',
                bufferMinutes: 0,
              }
            : undefined,
          maxSuggestions: 5,
        };
      }

      case SchedulingAction.RESCHEDULE:
        return {
          action: SchedulingAction.RESCHEDULE,
          userId,
          eventId: extractedData.eventId || '',
          reason: extractedData.reason,
          autoSchedule: false,
          maxSuggestions: 5,
        };

      case SchedulingAction.CANCEL:
        return {
          action: SchedulingAction.CANCEL,
          userId,
          eventId: extractedData.eventId || '',
          reason: extractedData.reason,
          notifyAttendees: true,
        };

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
}

/**
 * Singleton instance
 */
let schedulerInstance: SchedulerAgent | null = null;

export function getScheduler(): SchedulerAgent {
  if (!schedulerInstance) {
    schedulerInstance = new SchedulerAgent();
  }
  return schedulerInstance;
}
