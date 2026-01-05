/**
 * Intent Parser Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { parseTimeReference } from '@/agents/scheduler/intent-parser';
import { SchedulingAction } from '@/agents/scheduler/types';

describe('Intent Parser', () => {
  describe('parseTimeReference', () => {
    it('should parse "today" correctly', () => {
      const result = parseTimeReference('today', 60);
      expect(result).toBeDefined();
      expect(result?.start).toBeDefined();
      expect(result?.end).toBeDefined();

      const start = new Date(result!.start);
      const end = new Date(result!.end);
      const now = new Date();

      // Start should be within the next few hours
      expect(start.getDate()).toBe(now.getDate());
      expect(start.getHours()).toBeGreaterThanOrEqual(now.getHours());

      // End should be end of day
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
    });

    it('should parse "tomorrow" correctly', () => {
      const result = parseTimeReference('tomorrow', 60);
      expect(result).toBeDefined();

      const start = new Date(result!.start);
      const end = new Date(result!.end);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      expect(start.getDate()).toBe(tomorrow.getDate());
      expect(start.getHours()).toBe(9); // Start at 9am
      expect(end.getHours()).toBe(17); // End at 5pm
    });

    it('should parse "next week" correctly', () => {
      const result = parseTimeReference('next week', 60);
      expect(result).toBeDefined();

      const start = new Date(result!.start);
      const end = new Date(result!.end);

      // Start should be next Monday
      expect(start.getDay()).toBe(1); // Monday

      // End should be Friday of the same week
      // Day of week should be Friday (5) or Saturday (6) depending on when Friday ends
      expect([5, 6]).toContain(end.getDay());
      // End should be 4-5 days after start (Monday to Friday)
      const dayDiff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      expect(dayDiff).toBeGreaterThanOrEqual(4);
      expect(dayDiff).toBeLessThanOrEqual(5);
    });

    it('should parse specific day of week', () => {
      const result = parseTimeReference('friday', 60);
      expect(result).toBeDefined();

      const start = new Date(result!.start);

      // Should be next Friday
      expect(start.getDay()).toBe(5); // Friday
      expect(start.getHours()).toBe(9); // Start at 9am
    });

    it('should provide default range for unknown references', () => {
      const result = parseTimeReference('sometime', 60);
      expect(result).toBeDefined();

      const start = new Date(result!.start);
      const end = new Date(result!.end);

      // End should be 7 days after start
      expect(end.getTime() - start.getTime()).toBeGreaterThanOrEqual(6 * 24 * 60 * 60 * 1000);
    });
  });
});
