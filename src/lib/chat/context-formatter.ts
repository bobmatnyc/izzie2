/**
 * Chat Context Formatter
 *
 * Formats retrieved entities and memories into prompt-friendly context.
 * Creates structured, readable context for AI personalization.
 */

import type { ChatContext, PendingTask } from './context-retrieval';
import type { Entity, EntityType } from '../extraction/types';
import type { MemoryWithStrength, MemoryCategory } from '../memory/types';
import type { CalendarEvent } from '../calendar/types';

const LOG_PREFIX = '[ContextFormatter]';

/**
 * Format entities by type into readable sections
 */
function formatEntitiesByType(entities: Entity[]): string {
  if (entities.length === 0) {
    return '';
  }

  // Group entities by type
  const entitiesByType = entities.reduce(
    (acc, entity) => {
      if (!acc[entity.type]) {
        acc[entity.type] = [];
      }
      acc[entity.type].push(entity);
      return acc;
    },
    {} as Record<EntityType, Entity[]>
  );

  // Entity type labels for display
  const typeLabels: Record<EntityType, string> = {
    person: 'People',
    company: 'Companies',
    project: 'Projects',
    date: 'Important Dates',
    topic: 'Topics',
    location: 'Locations',
    action_item: 'Action Items',
  };

  const sections: string[] = [];

  for (const [type, typeEntities] of Object.entries(entitiesByType)) {
    const label = typeLabels[type as EntityType] || type;

    // Sort by confidence (highest first)
    const sortedEntities = typeEntities.sort((a, b) => b.confidence - a.confidence);

    // Format entity items
    const items = sortedEntities.map((entity) => {
      const parts = [entity.value];

      // Add context if available
      if (entity.context) {
        parts.push(`(${entity.context})`);
      }

      // Add action item details
      if (entity.type === 'action_item') {
        const details: string[] = [];
        if (entity.assignee) details.push(`assigned to ${entity.assignee}`);
        if (entity.deadline) details.push(`due ${entity.deadline}`);
        if (entity.priority && entity.priority !== 'medium') {
          details.push(`${entity.priority} priority`);
        }
        if (details.length > 0) {
          parts.push(`- ${details.join(', ')}`);
        }
      }

      return `  - ${parts.join(' ')}`;
    });

    sections.push(`### ${label}\n${items.join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Format upcoming calendar events into readable section
 */
function formatCalendarEvents(events: CalendarEvent[]): string {
  if (!events || events.length === 0) {
    return '';
  }

  // DEBUG: Log raw calendar events input
  console.log('[ContextFormatter] Raw calendar events count:', events.length);
  events.slice(0, 5).forEach((e, i) => {
    console.log(`[ContextFormatter] Event ${i}: "${e.summary}" at ${e.start.dateTime || e.start.date} (tz: ${e.start.timeZone})`);
  });

  const items = events.map((event) => {
    // Parse start time
    const startDate = new Date(event.start.dateTime || event.start.date || '');
    // Always use America/New_York for the user since that's their actual timezone.
    // The event.start.timeZone from Google can be wrong (e.g., Puerto_Rico for an Eastern event)
    // when the dateTime string has an embedded offset that differs from the named timezone.
    const timezone = 'America/New_York';

    const dateStr = startDate.toLocaleDateString('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    // Format time (all-day events vs timed events)
    const timeStr = event.start.dateTime
      ? startDate.toLocaleTimeString('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      : 'All day';

    // Format attendees
    const attendeesList =
      event.attendees && event.attendees.length > 0
        ? event.attendees
            .filter((a) => !a.self)
            .map((a) => a.displayName || a.email)
            .join(', ')
        : '';

    // Build event line
    const parts = [`${dateStr} ${timeStr}: ${event.summary}`];
    if (attendeesList) {
      parts.push(`(with: ${attendeesList})`);
    }
    if (event.location) {
      parts.push(`at ${event.location}`);
    }

    return `  - ${parts.join(' ')}`;
  });

  // DEBUG: Log formatted calendar events
  console.log('[ContextFormatter] Calendar events:', JSON.stringify(items, null, 2));

  return `### Upcoming Calendar (Next 7 Days)\n${items.join('\n')}`;
}

/**
 * Format pending tasks into readable section
 */
function formatPendingTasks(tasks: PendingTask[]): string {
  if (!tasks || tasks.length === 0) {
    return '';
  }

  // Group tasks by priority
  const highPriority = tasks.filter((t) => t.priority === 'high');
  const mediumPriority = tasks.filter((t) => t.priority === 'medium');
  const lowPriority = tasks.filter((t) => t.priority === 'low');

  const items: string[] = [];

  // Format high priority tasks (with emoji indicator)
  if (highPriority.length > 0) {
    highPriority.forEach((task) => {
      const parts = [`🔴 ${task.title}`];
      if (task.due) {
        const dueDate = new Date(task.due);
        const now = new Date();
        const daysUntilDue = Math.ceil(
          (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilDue < 0) {
          parts.push(`(OVERDUE by ${Math.abs(daysUntilDue)} days)`);
        } else if (daysUntilDue === 0) {
          parts.push(`(Due TODAY)`);
        } else {
          parts.push(`(Due in ${daysUntilDue} days)`);
        }
      }
      if (task.listTitle) {
        parts.push(`[${task.listTitle}]`);
      }
      items.push(`  - ${parts.join(' ')}`);
    });
  }

  // Format medium priority tasks
  if (mediumPriority.length > 0) {
    mediumPriority.forEach((task) => {
      const parts = [`🟡 ${task.title}`];
      if (task.due) {
        const dueDate = new Date(task.due);
        const dateStr = dueDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
        parts.push(`(Due ${dateStr})`);
      }
      if (task.listTitle) {
        parts.push(`[${task.listTitle}]`);
      }
      items.push(`  - ${parts.join(' ')}`);
    });
  }

  // Format low priority tasks (limit to 3 for brevity)
  if (lowPriority.length > 0) {
    lowPriority.slice(0, 3).forEach((task) => {
      const parts = [task.title];
      if (task.listTitle) {
        parts.push(`[${task.listTitle}]`);
      }
      items.push(`  - ${parts.join(' ')}`);
    });

    if (lowPriority.length > 3) {
      items.push(`  - ... and ${lowPriority.length - 3} more tasks`);
    }
  }

  return `### Pending Tasks (${tasks.length} total)\n${items.join('\n')}`;
}

/**
 * Format memories by category into readable sections
 */
function formatMemoriesByCategory(memories: MemoryWithStrength[]): string {
  if (memories.length === 0) {
    return '';
  }

  // Group memories by category
  const memoriesByCategory = memories.reduce(
    (acc, memory) => {
      if (!acc[memory.category]) {
        acc[memory.category] = [];
      }
      acc[memory.category].push(memory);
      return acc;
    },
    {} as Record<MemoryCategory, MemoryWithStrength[]>
  );

  // Category labels for display
  const categoryLabels: Record<MemoryCategory, string> = {
    preference: 'Your Preferences',
    fact: 'Facts',
    event: 'Recent Events',
    decision: 'Decisions',
    sentiment: 'Context & Sentiment',
    reminder: 'Reminders',
    relationship: 'Relationships',
  };

  // Priority order for categories (most important first)
  const categoryOrder: MemoryCategory[] = [
    'preference',
    'event',
    'decision',
    'fact',
    'relationship',
    'reminder',
    'sentiment',
  ];

  const sections: string[] = [];

  for (const category of categoryOrder) {
    const categoryMemories = memoriesByCategory[category];
    if (!categoryMemories || categoryMemories.length === 0) continue;

    const label = categoryLabels[category] || category;

    // Sort by strength (most relevant first)
    const sortedMemories = categoryMemories.sort((a, b) => b.strength - a.strength);

    // Format memory items
    const items = sortedMemories.map((memory) => {
      const parts = [memory.content];

      // Add freshness indicator for very fresh or very old memories
      if (memory.strength > 0.8) {
        parts.push('(recent)');
      } else if (memory.strength < 0.5) {
        parts.push('(older)');
      }

      // Add confidence indicator for low-confidence memories
      if (memory.confidence < 0.7) {
        parts.push('(uncertain)');
      }

      return `  - ${parts.join(' ')}`;
    });

    sections.push(`### ${label}\n${items.join('\n')}`);
  }

  return sections.join('\n\n');
}

/**
 * Format complete context into AI prompt
 */
export function formatContextForPrompt(context: ChatContext): string {
  const sections: string[] = [];

  // Add header
  sections.push('## Relevant Context');
  sections.push('');

  // Add entities section
  const entitiesSection = formatEntitiesByType(context.entities);
  if (entitiesSection) {
    sections.push(entitiesSection);
  }

  // Add memories section
  const memoriesSection = formatMemoriesByCategory(context.memories);
  if (memoriesSection) {
    if (entitiesSection) {
      sections.push(''); // Add spacing between sections
    }
    sections.push(memoriesSection);
  }

  // Add calendar events section
  const calendarSection = formatCalendarEvents(context.upcomingEvents);
  if (calendarSection) {
    if (entitiesSection || memoriesSection) {
      sections.push(''); // Add spacing between sections
    }
    sections.push(calendarSection);
  }

  // Add pending tasks section
  const tasksSection = formatPendingTasks(context.pendingTasks);
  if (tasksSection) {
    if (entitiesSection || memoriesSection || calendarSection) {
      sections.push(''); // Add spacing between sections
    }
    sections.push(tasksSection);
  }

  // If no context available
  if (!entitiesSection && !memoriesSection && !calendarSection && !tasksSection) {
    sections.push('No relevant personal context found for this query.');
  }

  const formatted = sections.join('\n');

  console.log(`${LOG_PREFIX} Formatted context (${formatted.length} chars)`);

  return formatted;
}

/**
 * Build system prompt with context
 */
export function buildSystemPrompt(context: ChatContext, userMessage: string): string {
  const contextSection = formatContextForPrompt(context);

  return `You are a helpful AI assistant with access to the user's personal context from their emails, calendar, tasks, and previous conversations.

${contextSection}

**Instructions:**
- Use the context above to provide personalized, relevant responses
- Reference specific people, companies, projects, and memories when helpful
- For upcoming calendar events, help the user prepare or answer questions about their schedule
- For pending tasks, proactively remind the user about overdue or high-priority items when relevant
- Be conversational and natural - don't just list facts from context
- If context is relevant, weave it into your response naturally
- If context isn't relevant to the user's question, acknowledge that and provide a helpful general response
- For preferences, respect the user's stated preferences in your suggestions
- For action items and reminders, highlight them when relevant to the query

User query: ${userMessage}`;
}

/**
 * Format context for debugging/logging (compact version)
 */
export function formatContextSummary(context: ChatContext): string {
  const parts: string[] = [];

  if (context.entities.length > 0) {
    const entityTypes = Object.entries(
      context.entities.reduce(
        (acc, e) => {
          acc[e.type] = (acc[e.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      )
    ).map(([type, count]) => `${count} ${type}`);

    parts.push(`Entities: ${entityTypes.join(', ')}`);
  }

  if (context.memories.length > 0) {
    const memoryCategories = Object.entries(
      context.memories.reduce(
        (acc, m) => {
          acc[m.category] = (acc[m.category] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      )
    ).map(([cat, count]) => `${count} ${cat}`);

    parts.push(`Memories: ${memoryCategories.join(', ')}`);
  }

  if (context.upcomingEvents.length > 0) {
    parts.push(`Events: ${context.upcomingEvents.length} upcoming`);
  }

  if (context.pendingTasks.length > 0) {
    parts.push(`Tasks: ${context.pendingTasks.length} pending`);
  }

  return parts.length > 0 ? parts.join(' | ') : 'No context';
}
