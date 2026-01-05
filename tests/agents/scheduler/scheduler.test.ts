/**
 * Scheduler Agent Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchedulerAgent } from '@/agents/scheduler/scheduler';
import { SchedulingAction } from '@/agents/scheduler/types';
import type { FindTimeRequest } from '@/agents/scheduler/types';

// Mock calendar functions
vi.mock('@/lib/calendar', () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  getEvent: vi.fn(),
  listEvents: vi.fn(),
}));

// Mock availability finder
vi.mock('@/lib/calendar/availability', () => ({
  findAvailability: vi.fn(),
}));

describe('SchedulerAgent', () => {
  let scheduler: SchedulerAgent;

  beforeEach(() => {
    scheduler = new SchedulerAgent();
    vi.clearAllMocks();
  });

  describe('processRequest', () => {
    it('should handle find_time action', async () => {
      const { findAvailability } = await import('@/lib/calendar/availability');

      // Mock availability response
      vi.mocked(findAvailability).mockResolvedValue({
        slots: [
          {
            start: '2025-01-10T14:00:00Z',
            end: '2025-01-10T15:00:00Z',
            score: 0.9,
            scoreBreakdown: {
              timeOfDay: 0.9,
              dayOfWeek: 1.0,
              proximity: 0.8,
              quality: 1.0,
            },
            participants: [
              {
                calendarId: 'primary',
                timezone: 'America/New_York',
                localTime: {
                  start: '2025-01-10T09:00:00-05:00',
                  end: '2025-01-10T10:00:00-05:00',
                },
              },
            ],
          },
        ],
        searchedRange: {
          start: '2025-01-10T00:00:00Z',
          end: '2025-01-15T23:59:59Z',
        },
        participantCount: 1,
        requestDuration: 60,
      });

      const request: FindTimeRequest = {
        action: SchedulingAction.FIND_TIME,
        userId: 'user-123',
        participants: [
          {
            email: 'test@example.com',
            isRequired: true,
          },
        ],
        duration: 60,
        maxSuggestions: 5,
      };

      const response = await scheduler.processRequest(request);

      expect(response.success).toBe(true);
      expect(response.action).toBe(SchedulingAction.FIND_TIME);
      expect(response.suggestions).toBeDefined();
      expect(response.suggestions?.length).toBe(1);
      expect(response.suggestions?.[0].start).toBe('2025-01-10T14:00:00Z');
      expect(response.suggestions?.[0].score).toBe(0.9);
    });

    it('should handle empty availability results', async () => {
      const { findAvailability } = await import('@/lib/calendar/availability');

      // Mock empty availability response
      vi.mocked(findAvailability).mockResolvedValue({
        slots: [],
        searchedRange: {
          start: '2025-01-10T00:00:00Z',
          end: '2025-01-15T23:59:59Z',
        },
        participantCount: 1,
        requestDuration: 60,
      });

      const request: FindTimeRequest = {
        action: SchedulingAction.FIND_TIME,
        userId: 'user-123',
        participants: [
          {
            email: 'test@example.com',
            isRequired: true,
          },
        ],
        duration: 60,
        maxSuggestions: 5,
      };

      const response = await scheduler.processRequest(request);

      expect(response.success).toBe(true);
      expect(response.action).toBe(SchedulingAction.FIND_TIME);
      expect(response.suggestions).toBeDefined();
      expect(response.suggestions?.length).toBe(0);
      expect(response.message).toContain('No available time slots');
    });

    it('should handle errors gracefully', async () => {
      const { findAvailability } = await import('@/lib/calendar/availability');

      // Mock error
      vi.mocked(findAvailability).mockRejectedValue(new Error('Calendar API error'));

      const request: FindTimeRequest = {
        action: SchedulingAction.FIND_TIME,
        userId: 'user-123',
        participants: [
          {
            email: 'test@example.com',
            isRequired: true,
          },
        ],
        duration: 60,
        maxSuggestions: 5,
      };

      const response = await scheduler.processRequest(request);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error).toContain('Calendar API error');
    });
  });

  describe('cancel action', () => {
    it('should cancel event successfully', async () => {
      const { getEvent, deleteEvent } = await import('@/lib/calendar');

      // Mock existing event
      vi.mocked(getEvent).mockResolvedValue({
        id: 'event-123',
        calendarId: 'primary',
        status: 'confirmed',
        summary: 'Test Meeting',
        start: { dateTime: '2025-01-10T14:00:00Z' },
        end: { dateTime: '2025-01-10T15:00:00Z' },
      } as any);

      const request = {
        action: SchedulingAction.CANCEL,
        userId: 'user-123',
        eventId: 'event-123',
        notifyAttendees: true,
      };

      const response = await scheduler.processRequest(request);

      expect(response.success).toBe(true);
      expect(response.action).toBe(SchedulingAction.CANCEL);
      expect(response.event?.id).toBe('event-123');
      expect(response.message).toContain('cancelled successfully');

      expect(deleteEvent).toHaveBeenCalledWith('user-123', 'event-123', 'primary', 'all');
    });

    it('should handle non-existent event', async () => {
      const { getEvent } = await import('@/lib/calendar');

      // Mock event not found
      vi.mocked(getEvent).mockResolvedValue(null as any);

      const request = {
        action: SchedulingAction.CANCEL,
        userId: 'user-123',
        eventId: 'nonexistent-event',
        notifyAttendees: true,
      };

      const response = await scheduler.processRequest(request);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Could not find event');
    });
  });
});
