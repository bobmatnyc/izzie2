/**
 * Chat Session Types
 *
 * Types for session management with compression and current task tracking.
 * Based on research-validated patterns:
 * - Window size = 5 (industry standard)
 * - Incremental summarization
 * - Current task as privileged memory
 */

/**
 * Current task state (privileged memory, updated each turn)
 * Inspired by MemGPT's core memory concept
 */
export interface CurrentTask {
  goal: string; // What user is trying to accomplish
  context: string; // Key constraints, preferences, decisions made
  blockers: string[]; // Things preventing progress
  progress: string; // What's been done so far
  nextSteps: string[]; // Immediate next actions
  updatedAt: Date;
}

/**
 * Individual chat message
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    tokensUsed?: number;
    model?: string;
  };
}

/**
 * Complete chat session with layered memory
 */
export interface ChatSession {
  id: string;
  userId: string;
  title?: string;

  // Memory layers (in order of context priority)
  currentTask: CurrentTask | null; // Privileged, overwritten each turn
  compressedHistory: string | null; // Incrementally summarized old messages
  recentMessages: ChatMessage[]; // Last 5 pairs (10 messages) verbatim

  // For recovery
  archivedMessages?: ChatMessage[]; // Original messages before compression

  // Metadata
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Memory to save from chat conversation
 */
export interface MemoryToSave {
  category: 'preference' | 'fact' | 'event' | 'decision' | 'sentiment' | 'reminder' | 'relationship';
  content: string;
  importance: number; // 0.0-1.0
  context?: string;
}

/**
 * Structured LLM response format
 */
export interface StructuredLLMResponse {
  response: string; // Conversational response to user
  currentTask: CurrentTask | null; // Updated task state (null if just chatting)
  // Only present when compression was performed by LLM
  updatedCompressedHistory?: string;
  // Optional memories to persist from conversation
  memoriesToSave?: MemoryToSave[];
}

/**
 * Constants
 */
export const WINDOW_SIZE = 5; // Keep 5 message pairs verbatim
export const EVICTION_PERCENTAGE = 0.7; // Keep 70% overlap when compressing

/**
 * Response format instruction for LLM
 */
export const RESPONSE_FORMAT_INSTRUCTION = `
## Tool Usage

You have function calling capabilities. When you need to use a tool:
- Simply invoke it through the API's function calling mechanism
- Do NOT write out tool names or XML in your response text
- Wait for the tool result, then respond naturally to the user

WRONG: <list_google_tasks_lists></list_google_tasks_lists>
WRONG: <archive_gmail_by_search></archive_gmail_by_search>
RIGHT: Use function calling via the API

The API handles tool execution automatically - just use the tools when needed.

## Response Format

After any tool calls complete (or if no tools were needed), respond with valid JSON:
{
  "response": "Your conversational response to the user",
  "currentTask": {
    "goal": "What the user is trying to accomplish (or null if just chatting)",
    "context": "Key constraints and decisions made",
    "blockers": ["List of blockers, empty array if none"],
    "progress": "What has been accomplished so far",
    "nextSteps": ["Immediate next actions"]
  },
  "memoriesToSave": [
    {
      "category": "preference",
      "content": "User prefers to be called 'Masa'",
      "importance": 0.9,
      "context": "Name preference"
    }
  ]
}

Guidelines for currentTask:
- Set to null if user is just chatting/asking questions without a specific task
- Update goal when user starts a new task or changes direction
- Update progress after completing steps
- Clear blockers when resolved
- Keep nextSteps focused on immediate actions (1-3 items)
- Always include updatedAt timestamp

Guidelines for memoriesToSave:
- ONLY include when user shares a preference, fact, correction, or important information worth remembering
- Categories: preference, fact, event, decision, sentiment, reminder, relationship
- Importance levels:
  - 0.9: High - Name preferences, critical personal information
  - 0.7: Medium - General preferences, important facts about user
  - 0.6: Low - Minor facts, general information
- Include context to help understand the memory later
- Examples:
  - Name preference: {"category": "preference", "content": "Prefers to be called Masa", "importance": 0.9}
  - Work info: {"category": "fact", "content": "Works as a software engineer at Acme Corp", "importance": 0.7}
  - Meeting preference: {"category": "preference", "content": "Prefers morning meetings", "importance": 0.7}
`;
