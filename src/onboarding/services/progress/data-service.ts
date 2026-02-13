/**
 * Onboarding Data Service
 *
 * Tracks discovered entities, relationships, and processing statistics.
 * Provides aggregation and summary building capabilities.
 */

import type { Entity, InlineRelationship } from '@/lib/extraction/types';
import type {
  ProcessingState,
  ProgressUpdate,
  ProcessingSummary,
  DiscoveredEntity,
  DiscoveredRelationship,
} from '../../types';
import type {
  IOnboardingDataService,
  EmailMetadata,
  DataStats,
  DataChangeCallback,
} from './interfaces';

const LOG_PREFIX = '[DataService]';

export class OnboardingDataService implements IOnboardingDataService {
  // Processing stats
  private emailsProcessed = 0;
  private totalEmails = 0;
  private eventsProcessed = 0; // Calendar events processed
  private totalEvents = 0; // Total calendar events
  private currentDay = '';
  private currentBatch = 0;
  private totalBatches = 0;
  private startTime = 0;

  // Discovered data
  private entities: Map<string, DiscoveredEntity> = new Map();
  private relationships: Map<string, DiscoveredRelationship> = new Map();

  // Callbacks
  private dataChangeCallbacks: Set<DataChangeCallback> = new Set();

  setTotalEmails(count: number): void {
    this.totalEmails = count;
  }

  setTotalEvents(count: number): void {
    this.totalEvents = count;
  }

  setCurrentDay(day: string): void {
    this.currentDay = day;
    this.notifyDataChange();
  }

  setBatchProgress(current: number, total: number): void {
    this.currentBatch = current;
    this.totalBatches = total;
    this.notifyDataChange();
  }

  recordEmail(
    email: EmailMetadata,
    entities: Entity[],
    relationships: InlineRelationship[],
    _isSpam: boolean,
    _spamScore: number
  ): void {
    this.emailsProcessed++;

    // Track entities
    for (const entity of entities) {
      const key = `${entity.type}:${entity.normalized}`;
      const existing = this.entities.get(key);

      if (existing) {
        existing.emailIds.push(email.id);
        existing.lastSeen = email.date;
        existing.occurrenceCount++;
      } else {
        this.entities.set(key, {
          ...entity,
          emailIds: [email.id],
          firstSeen: email.date,
          lastSeen: email.date,
          occurrenceCount: 1,
        });
      }
    }

    // Track relationships
    for (const rel of relationships) {
      const key = `${rel.fromType}:${rel.fromValue}|${rel.relationshipType}|${rel.toType}:${rel.toValue}`;
      const existing = this.relationships.get(key);

      if (existing) {
        existing.sourceEmailIds.push(email.id);
        existing.lastSeen = email.date;
        existing.occurrenceCount++;
      } else {
        this.relationships.set(key, {
          ...rel,
          sourceEmailIds: [email.id],
          firstSeen: email.date,
          lastSeen: email.date,
          occurrenceCount: 1,
        });
      }
    }

    this.notifyDataChange();
  }

  recordCalendarEvent(
    event: { id: string; date: Date },
    entities: Entity[],
    relationships: InlineRelationship[]
  ): void {
    this.eventsProcessed++;

    // Track entities (similar to email but use event ID)
    for (const entity of entities) {
      const key = `${entity.type}:${entity.normalized}`;
      const existing = this.entities.get(key);

      if (existing) {
        existing.emailIds.push(event.id); // Reuse emailIds for source tracking
        existing.lastSeen = event.date;
        existing.occurrenceCount++;
      } else {
        this.entities.set(key, {
          ...entity,
          emailIds: [event.id],
          firstSeen: event.date,
          lastSeen: event.date,
          occurrenceCount: 1,
        });
      }
    }

    // Track relationships
    for (const rel of relationships) {
      const key = `${rel.fromType}:${rel.fromValue}|${rel.relationshipType}|${rel.toType}:${rel.toValue}`;
      const existing = this.relationships.get(key);

      if (existing) {
        existing.sourceEmailIds.push(event.id); // Reuse for source tracking
        existing.lastSeen = event.date;
        existing.occurrenceCount++;
      } else {
        this.relationships.set(key, {
          ...rel,
          sourceEmailIds: [event.id],
          firstSeen: event.date,
          lastSeen: event.date,
          occurrenceCount: 1,
        });
      }
    }

    this.notifyDataChange();
  }

  getEntities(): DiscoveredEntity[] {
    return Array.from(this.entities.values());
  }

  getRelationships(): DiscoveredRelationship[] {
    return Array.from(this.relationships.values());
  }

  buildProgressUpdate(state: ProcessingState): ProgressUpdate {
    return {
      type: 'progress',
      state,
      currentDay: this.currentDay,
      emailsProcessed: this.emailsProcessed,
      totalEmails: this.totalEmails,
      eventsProcessed: this.eventsProcessed,
      totalEvents: this.totalEvents,
      entitiesFound: this.entities.size,
      relationshipsFound: this.relationships.size,
      currentBatch: this.currentBatch,
      totalBatches: this.totalBatches,
    };
  }

  buildSummary(): ProcessingSummary {
    const entities = Array.from(this.entities.values());
    const relationships = Array.from(this.relationships.values());

    // Count unique by type
    const uniquePeople = entities.filter((e) => e.type === 'person').length;
    const uniqueCompanies = entities.filter((e) => e.type === 'company').length;
    const uniqueProjects = entities.filter((e) => e.type === 'project').length;

    // Top entities by occurrence
    const topEntities = entities
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
      .slice(0, 10)
      .map((e) => ({
        type: e.type,
        value: e.value,
        count: e.occurrenceCount,
      }));

    // Top relationships by occurrence
    const topRelationships = relationships
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount)
      .slice(0, 10)
      .map((r) => ({
        from: r.fromValue,
        to: r.toValue,
        type: r.relationshipType,
        count: r.occurrenceCount,
      }));

    // Date range
    const allDates = entities.flatMap((e) => [e.firstSeen, e.lastSeen]);
    const startDate =
      allDates.length > 0
        ? new Date(Math.min(...allDates.map((d) => d.getTime())))
        : new Date();
    const endDate =
      allDates.length > 0
        ? new Date(Math.max(...allDates.map((d) => d.getTime())))
        : new Date();

    return {
      totalEmailsProcessed: this.emailsProcessed,
      totalEntitiesFound: entities.length,
      totalRelationshipsFound: relationships.length,
      uniquePeople,
      uniqueCompanies,
      uniqueProjects,
      processingTimeMs: Date.now() - this.startTime,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      topEntities,
      topRelationships,
    };
  }

  reset(): void {
    this.emailsProcessed = 0;
    this.totalEmails = 0;
    this.eventsProcessed = 0;
    this.totalEvents = 0;
    this.currentDay = '';
    this.currentBatch = 0;
    this.totalBatches = 0;
    this.startTime = Date.now();
    this.entities.clear();
    this.relationships.clear();
    console.log(`${LOG_PREFIX} Reset all data`);
  }

  getStats(): DataStats {
    return {
      emailsProcessed: this.emailsProcessed,
      totalEmails: this.totalEmails,
      currentDay: this.currentDay,
      currentBatch: this.currentBatch,
      totalBatches: this.totalBatches,
      entitiesFound: this.entities.size,
      relationshipsFound: this.relationships.size,
      startTime: this.startTime,
    };
  }

  /** Called when starting processing to record start time */
  markStartTime(): void {
    this.startTime = Date.now();
  }

  onDataChange(callback: DataChangeCallback): () => void {
    this.dataChangeCallbacks.add(callback);
    return () => {
      this.dataChangeCallbacks.delete(callback);
    };
  }

  private notifyDataChange(): void {
    const stats = this.getStats();
    for (const callback of this.dataChangeCallbacks) {
      try {
        callback(stats);
      } catch (error) {
        console.error(`${LOG_PREFIX} Data change callback error:`, error);
      }
    }
  }
}
