/**
 * Test Personas for POC-4 Proxy Authorization
 * Synthetic user profiles with different risk tolerances and preferences
 */

export interface TestPersona {
  name: string;
  description: string;
  confidenceThreshold: number;
  requiresConfirmation: boolean;
  preferredScope: 'single' | 'session' | 'standing' | 'conditional';
  riskTolerance: 'minimal' | 'low' | 'medium' | 'high';
  reviewsAllActions?: boolean;
  prefersAutomation?: boolean;
  maxActionsPerDay?: number;
  maxActionsPerWeek?: number;
  allowedHours?: { start: number; end: number };
}

export const personas: Record<string, TestPersona> = {
  conservative: {
    name: 'Conservative User',
    description: 'Very cautious, wants high confidence and confirmation for all actions',
    confidenceThreshold: 0.95,
    requiresConfirmation: true,
    preferredScope: 'single',
    riskTolerance: 'low',
    maxActionsPerDay: 5,
    maxActionsPerWeek: 20,
  },

  trusting: {
    name: 'Trusting User',
    description: 'Comfortable with AI autonomy, lower confidence threshold',
    confidenceThreshold: 0.8,
    requiresConfirmation: false,
    preferredScope: 'standing',
    riskTolerance: 'high',
    prefersAutomation: true,
  },

  securityConscious: {
    name: 'Security-Conscious User',
    description: 'Maximum security, highest confidence, reviews everything',
    confidenceThreshold: 0.99,
    requiresConfirmation: true,
    preferredScope: 'single',
    riskTolerance: 'minimal',
    reviewsAllActions: true,
    maxActionsPerDay: 3,
    allowedHours: { start: 9, end: 17 }, // Business hours only
  },

  busy: {
    name: 'Busy Executive',
    description: 'Needs automation but with reasonable guardrails',
    confidenceThreshold: 0.85,
    requiresConfirmation: false,
    preferredScope: 'standing',
    riskTolerance: 'medium',
    prefersAutomation: true,
    maxActionsPerDay: 15,
    maxActionsPerWeek: 75,
    allowedHours: { start: 6, end: 22 }, // Extended hours
  },

  balanced: {
    name: 'Balanced User',
    description: 'Middle ground between automation and control',
    confidenceThreshold: 0.9,
    requiresConfirmation: true,
    preferredScope: 'conditional',
    riskTolerance: 'medium',
    maxActionsPerDay: 10,
    maxActionsPerWeek: 50,
  },

  newUser: {
    name: 'New User',
    description: 'Just starting, wants to try cautiously',
    confidenceThreshold: 0.92,
    requiresConfirmation: true,
    preferredScope: 'session',
    riskTolerance: 'low',
    maxActionsPerDay: 2,
    maxActionsPerWeek: 10,
  },
};

/**
 * Get a persona by name
 */
export function getPersona(name: keyof typeof personas): TestPersona {
  return personas[name];
}

/**
 * Get all persona names
 */
export function getPersonaNames(): string[] {
  return Object.keys(personas);
}
