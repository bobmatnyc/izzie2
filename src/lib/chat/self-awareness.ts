/**
 * Self-Awareness Context for Izzie
 *
 * Provides Izzie with knowledge about her own architecture,
 * capabilities, and connected data sources.
 */

import { chatTools } from './tools';
import { BUILD_INFO } from '@/lib/build-info';

export interface ConnectorStatus {
  name: string;
  type: 'email' | 'calendar' | 'storage' | 'database';
  connected: boolean;
  description: string;
  capabilities: string[];
}

export interface SelfAwarenessContext {
  identity: {
    name: string;
    version: string;
    description: string;
  };
  architecture: {
    contextWindow: string;
    memorySystem: string;
    entitySystem: string;
    sessionManagement: string;
  };
  connectors: ConnectorStatus[];
  capabilities: string[];
}

/**
 * Tool category definitions for grouping capabilities
 */
const TOOL_CATEGORIES: Record<string, { prefix: string; keywords: string[] }> = {
  tasks: {
    prefix: 'Task Management',
    keywords: ['task', 'task_list'],
  },
  email: {
    prefix: 'Email',
    keywords: ['email', 'archive', 'label', 'draft', 'send'],
  },
  github: {
    prefix: 'GitHub',
    keywords: ['github', 'issue', 'comment'],
  },
  research: {
    prefix: 'Research',
    keywords: ['research'],
  },
};

/**
 * Categorize a tool name based on keywords
 */
function categorizeToolName(toolName: string): string {
  for (const [category, config] of Object.entries(TOOL_CATEGORIES)) {
    if (config.keywords.some((keyword) => toolName.includes(keyword))) {
      return category;
    }
  }
  return 'other';
}

/**
 * Generate capability descriptions from registered tools
 * Groups tools by category for cleaner output
 */
function generateToolCapabilities(): string[] {
  const grouped: Record<string, string[]> = {};

  for (const [name, tool] of Object.entries(chatTools)) {
    const category = categorizeToolName(name);
    if (!grouped[category]) {
      grouped[category] = [];
    }
    // Extract first sentence of description for concise capability
    const firstSentence = tool.description.split('.')[0];
    grouped[category].push(firstSentence);
  }

  const capabilities: string[] = [];

  // Generate grouped capability strings
  for (const [category, descriptions] of Object.entries(grouped)) {
    const config = TOOL_CATEGORIES[category];
    const prefix = config?.prefix || 'Other';

    // Combine similar tools into one capability statement
    if (descriptions.length > 1) {
      capabilities.push(`${prefix}: ${descriptions.join('; ')}`);
    } else {
      capabilities.push(`${prefix}: ${descriptions[0]}`);
    }
  }

  return capabilities;
}

/**
 * Get the current self-awareness context
 */
export async function getSelfAwarenessContext(userId: string): Promise<SelfAwarenessContext> {
  // TODO: In future, check actual connection status from DB
  // For now, return static architecture info

  return {
    identity: {
      name: 'Izzie',
      version: BUILD_INFO.version,
      description: `A personal AI assistant with memory and context awareness (build: ${BUILD_INFO.gitHash}, ${BUILD_INFO.gitBranch})`,
    },
    architecture: {
      contextWindow:
        'Sliding window with last 5 message pairs kept verbatim, older messages compressed into summaries',
      memorySystem:
        'Extracts memories (facts, preferences, events, decisions, sentiments, reminders, relationships) from connected sources with temporal decay - frequently accessed memories stay relevant longer',
      entitySystem:
        'Extracts and tracks entities (people, companies, projects, topics, locations, action items, dates) from emails with deduplication and user identity awareness',
      sessionManagement:
        'Maintains conversation sessions with current task tracking, compressed history, and context retrieval from Weaviate vector database',
    },
    connectors: [
      {
        name: 'Gmail',
        type: 'email',
        connected: true,
        description: 'Access to email messages for entity and memory extraction',
        capabilities: [
          'Read email content and metadata',
          'Extract entities (people, companies, projects)',
          'Extract memories (facts, preferences, events)',
          'Track communication patterns',
        ],
      },
      {
        name: 'Google Calendar',
        type: 'calendar',
        connected: true,
        description: 'Access to calendar events and schedules',
        capabilities: [
          'Read upcoming events',
          'Extract meeting participants',
          'Track scheduling patterns',
        ],
      },
      {
        name: 'Google Drive',
        type: 'storage',
        connected: true,
        description: 'Access to documents and files',
        capabilities: [
          'Read document content',
          'Extract topics and projects',
          'Track document activity',
        ],
      },
      {
        name: 'Weaviate',
        type: 'database',
        connected: true,
        description: 'Vector database for semantic search of entities and memories',
        capabilities: [
          'Semantic search across all extracted data',
          'Fast retrieval of relevant context',
          'Decay-weighted memory ranking',
        ],
      },
    ],
    capabilities: [
      // Memory and context capabilities
      'Remember facts, preferences, and context from your emails and documents',
      'Track people, companies, and projects you interact with',
      'Maintain conversation context across long sessions',
      'Track your current task and help you stay focused',
      'Search semantically across all your connected data',
      'Learn your preferences and communication patterns over time',
      // Dynamically generated tool capabilities
      ...generateToolCapabilities(),
    ],
  };
}

/**
 * Format self-awareness context for inclusion in system prompt
 */
export function formatSelfAwarenessForPrompt(context: SelfAwarenessContext): string {
  const connectorList = context.connectors
    .filter((c) => c.connected)
    .map((c) => `- ${c.name}: ${c.description}`)
    .join('\n');

  const capabilityList = context.capabilities.map((c) => `- ${c}`).join('\n');

  return `## About Me (${context.identity.name} v${context.identity.version})

**My Identity:**
- Name: ${context.identity.name}
- Version: ${context.identity.version}
- ${context.identity.description}

**Important:** When asked "what version are you?" or "what's your version?", I should respond with my version number (${context.identity.version}). I am NOT just Claude - I am Izzie, a specialized personal AI assistant with my own version, capabilities, and connected data sources.

### My Architecture
- **Context Window**: ${context.architecture.contextWindow}
- **Memory System**: ${context.architecture.memorySystem}
- **Entity System**: ${context.architecture.entitySystem}
- **Session Management**: ${context.architecture.sessionManagement}

### Connected Data Sources
${connectorList}

### What I Can Do
${capabilityList}

When asked about myself, my version, my capabilities, architecture, or connected data sources, I should explain these accurately and specifically. I know my version number, what I'm built on, and what makes me unique.`;
}
