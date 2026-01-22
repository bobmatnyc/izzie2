/**
 * Scheduler Agent Types
 * Type definitions and Zod schemas for scheduling operations
 */

import { z } from 'zod';
import type { CalendarEvent } from '@/lib/calendar';

/**
 * Scheduling action types
 */
export const SchedulingAction = {
  SCHEDULE: 'schedule',
  RESCHEDULE: 'reschedule',
  CANCEL: 'cancel',
  FIND_TIME: 'find_time',
  ACCEPT_INVITE: 'accept_invite',
  DECLINE_INVITE: 'decline_invite',
  TENTATIVE_INVITE: 'tentative_invite',
} as const;

export type SchedulingAction = (typeof SchedulingAction)[keyof typeof SchedulingAction];

/**
 * Participant schema for scheduling requests
 */
export const ParticipantSchema = z.object({
  email: z.string().email(),
  displayName: z.string().optional(),
  isRequired: z.boolean().default(true),
  workingHours: z
    .object({
      timezone: z.string(),
      days: z.record(
        z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
        z.object({
          start: z.string().regex(/^\d{2}:\d{2}$/),
          end: z.string().regex(/^\d{2}:\d{2}$/),
        })
      ),
    })
    .optional(),
});

export type Participant = z.infer<typeof ParticipantSchema>;

/**
 * Time constraints for scheduling
 */
export const TimeConstraintsSchema = z.object({
  preferredTimeOfDay: z.enum(['morning', 'afternoon', 'evening', 'any']).default('any'),
  preferredDays: z.array(z.number().min(1).max(7)).optional(),
  avoidDays: z.array(z.number().min(1).max(7)).optional(),
  earliestDate: z.string().datetime().optional(),
  latestDate: z.string().datetime().optional(),
  bufferMinutes: z.number().min(0).default(0),
});

export type TimeConstraints = z.infer<typeof TimeConstraintsSchema>;

/**
 * Schedule request schema
 */
export const ScheduleRequestSchema = z.object({
  action: z.literal(SchedulingAction.SCHEDULE),
  userId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  participants: z.array(ParticipantSchema).min(1),
  duration: z.number().min(1).max(480), // 1 minute to 8 hours
  location: z.string().optional(),
  timeConstraints: TimeConstraintsSchema.optional(),
  autoSchedule: z.boolean().default(false), // If true, automatically schedule best slot
  maxSuggestions: z.number().min(1).max(10).default(5),
});

export type ScheduleRequest = z.infer<typeof ScheduleRequestSchema>;

/**
 * Reschedule request schema
 */
export const RescheduleRequestSchema = z.object({
  action: z.literal(SchedulingAction.RESCHEDULE),
  userId: z.string(),
  eventId: z.string(),
  calendarId: z.string().optional(),
  newStartTime: z.string().datetime().optional(), // If provided, reschedule to this time
  reason: z.string().optional(),
  timeConstraints: TimeConstraintsSchema.optional(), // If newStartTime not provided, find new time
  autoSchedule: z.boolean().default(false),
  maxSuggestions: z.number().min(1).max(10).default(5),
});

export type RescheduleRequest = z.infer<typeof RescheduleRequestSchema>;

/**
 * Cancel request schema
 */
export const CancelRequestSchema = z.object({
  action: z.literal(SchedulingAction.CANCEL),
  userId: z.string(),
  eventId: z.string(),
  calendarId: z.string().optional(),
  reason: z.string().optional(),
  notifyAttendees: z.boolean().default(true),
});

export type CancelRequest = z.infer<typeof CancelRequestSchema>;

/**
 * Find time request schema
 */
export const FindTimeRequestSchema = z.object({
  action: z.literal(SchedulingAction.FIND_TIME),
  userId: z.string(),
  participants: z.array(ParticipantSchema).min(1),
  duration: z.number().min(1).max(480),
  timeConstraints: TimeConstraintsSchema.optional(),
  maxSuggestions: z.number().min(1).max(10).default(5),
});

export type FindTimeRequest = z.infer<typeof FindTimeRequestSchema>;

/**
 * RSVP request schema
 */
export const RSVPRequestSchema = z.object({
  action: z.enum([
    SchedulingAction.ACCEPT_INVITE,
    SchedulingAction.DECLINE_INVITE,
    SchedulingAction.TENTATIVE_INVITE,
  ]),
  userId: z.string(),
  eventId: z.string(),
  calendarId: z.string().optional(),
});

export type RSVPRequest = z.infer<typeof RSVPRequestSchema>;

/**
 * Union type for all scheduler requests
 */
export const SchedulerRequestSchema = z.discriminatedUnion('action', [
  ScheduleRequestSchema,
  RescheduleRequestSchema,
  CancelRequestSchema,
  FindTimeRequestSchema,
]);

export type SchedulerRequest =
  | ScheduleRequest
  | RescheduleRequest
  | CancelRequest
  | FindTimeRequest
  | RSVPRequest;

/**
 * Time slot suggestion
 */
export const TimeSlotSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  score: z.number().min(0).max(1),
  scoreBreakdown: z.object({
    timeOfDay: z.number(),
    dayOfWeek: z.number(),
    proximity: z.number(),
    quality: z.number(),
  }),
  participants: z.array(
    z.object({
      email: z.string().email(),
      timezone: z.string(),
      localTime: z.object({
        start: z.string(),
        end: z.string(),
      }),
    })
  ),
});

export type TimeSlot = z.infer<typeof TimeSlotSchema>;

/**
 * Scheduling response schema
 */
export const SchedulingResponseSchema = z.object({
  success: z.boolean(),
  action: z.enum([
    SchedulingAction.SCHEDULE,
    SchedulingAction.RESCHEDULE,
    SchedulingAction.CANCEL,
    SchedulingAction.FIND_TIME,
    SchedulingAction.ACCEPT_INVITE,
    SchedulingAction.DECLINE_INVITE,
    SchedulingAction.TENTATIVE_INVITE,
  ]),
  event: z
    .object({
      id: z.string(),
      title: z.string(),
      start: z.string().datetime(),
      end: z.string().datetime(),
      htmlLink: z.string().optional(),
      attendees: z
        .array(
          z.object({
            email: z.string(),
            displayName: z.string().optional(),
            responseStatus: z.string().optional(),
          })
        )
        .optional(),
    })
    .optional(),
  suggestions: z.array(TimeSlotSchema).optional(),
  message: z.string(),
  error: z.string().optional(),
});

export type SchedulingResponse = z.infer<typeof SchedulingResponseSchema>;

/**
 * Natural language scheduling intent
 */
export interface SchedulingIntent {
  action: SchedulingAction;
  confidence: number;
  extractedData: {
    title?: string;
    participants?: string[];
    duration?: number;
    timeReference?: string;
    eventId?: string;
    reason?: string;
  };
  rawInput: string;
}
