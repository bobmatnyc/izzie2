/**
 * User Settings Service
 * Manages per-user API keys (encrypted) and budget configurations
 * Part of BYOK (Bring Your Own Key) feature
 */

import { dbClient } from '@/lib/db';
import { userSettings, type UserSettings, type NewUserSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  generateSalt,
  deriveKey,
  encrypt,
  decrypt,
  type EncryptedData,
} from '@/lib/encryption';

/**
 * Public view of user settings (never exposes actual API key)
 */
export interface UserSettingsView {
  id: string;
  userId: string;
  hasApiKey: boolean;
  apiKeyLastFour: string | null;
  dailyBudgetCents: number | null;
  budgetResetHour: number;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for updating user settings
 */
export interface UpdateUserSettingsInput {
  apiKey?: string; // Plain text API key to encrypt and store
  dailyBudgetCents?: number | null;
  budgetResetHour?: number;
  timezone?: string;
}

/**
 * Get the encryption passphrase from environment
 * Throws if not configured
 */
function getEncryptionPassphrase(): string {
  const passphrase = process.env.ENCRYPTION_PASSPHRASE;
  if (!passphrase) {
    throw new Error(
      'ENCRYPTION_PASSPHRASE environment variable is not set. ' +
        'This is required for API key encryption.'
    );
  }
  return passphrase;
}

/**
 * Extract last 4 characters of an API key for display
 */
function extractLastFour(apiKey: string): string {
  if (apiKey.length <= 4) {
    return '****';
  }
  return apiKey.slice(-4);
}

/**
 * User Settings Service class
 */
export class UserSettingsService {
  /**
   * Get user settings by user ID
   * Returns null if no settings exist for the user
   */
  async getSettings(userId: string): Promise<UserSettingsView | null> {
    const db = dbClient.getDb();

    const result = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const settings = result[0];
    return this.toPublicView(settings);
  }

  /**
   * Update user settings
   * Creates settings if they don't exist
   */
  async updateSettings(
    userId: string,
    input: UpdateUserSettingsInput
  ): Promise<UserSettingsView> {
    const db = dbClient.getDb();

    // Get existing settings
    const existing = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    // Prepare update data
    const updateData: Partial<NewUserSettings> = {
      updatedAt: new Date(),
    };

    // Handle API key encryption if provided
    if (input.apiKey !== undefined) {
      if (input.apiKey === null || input.apiKey === '') {
        // Clear the API key
        updateData.encryptedApiKey = null;
        updateData.apiKeyIv = null;
        updateData.apiKeyTag = null;
        updateData.apiKeySalt = null;
        updateData.apiKeyLastFour = null;
      } else {
        // Encrypt the new API key
        const passphrase = getEncryptionPassphrase();
        const salt = generateSalt();
        const { key } = await deriveKey(passphrase, salt);
        const encrypted = encrypt(input.apiKey, key);

        updateData.encryptedApiKey = encrypted.ciphertext;
        updateData.apiKeyIv = encrypted.iv;
        updateData.apiKeyTag = encrypted.tag;
        updateData.apiKeySalt = salt;
        updateData.apiKeyLastFour = extractLastFour(input.apiKey);
      }
    }

    // Handle budget settings
    if (input.dailyBudgetCents !== undefined) {
      updateData.dailyBudgetCents = input.dailyBudgetCents;
    }

    if (input.budgetResetHour !== undefined) {
      // Validate hour range
      if (input.budgetResetHour < 0 || input.budgetResetHour > 23) {
        throw new Error('budgetResetHour must be between 0 and 23');
      }
      updateData.budgetResetHour = input.budgetResetHour;
    }

    if (input.timezone !== undefined) {
      updateData.timezone = input.timezone;
    }

    let settings: UserSettings;

    if (existing.length === 0) {
      // Create new settings
      const insertData: NewUserSettings = {
        userId,
        ...updateData,
        createdAt: new Date(),
      };

      const result = await db
        .insert(userSettings)
        .values(insertData)
        .returning();

      settings = result[0];
    } else {
      // Update existing settings
      const result = await db
        .update(userSettings)
        .set(updateData)
        .where(eq(userSettings.userId, userId))
        .returning();

      settings = result[0];
    }

    return this.toPublicView(settings);
  }

  /**
   * Get decrypted API key for a user
   * Used internally for making API calls
   * Returns null if no API key is configured
   */
  async getDecryptedApiKey(userId: string): Promise<string | null> {
    const db = dbClient.getDb();

    const result = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const settings = result[0];

    // Check if API key is configured
    if (
      !settings.encryptedApiKey ||
      !settings.apiKeyIv ||
      !settings.apiKeyTag ||
      !settings.apiKeySalt
    ) {
      return null;
    }

    // Decrypt the API key
    const passphrase = getEncryptionPassphrase();
    const { key } = await deriveKey(passphrase, settings.apiKeySalt);

    const encryptedData: EncryptedData = {
      ciphertext: settings.encryptedApiKey,
      iv: settings.apiKeyIv,
      tag: settings.apiKeyTag,
    };

    try {
      return decrypt(encryptedData, key);
    } catch (error) {
      // Decryption failed - this could happen if the encryption passphrase changed
      console.error('Failed to decrypt API key for user:', userId, error);
      return null;
    }
  }

  /**
   * Delete API key for a user
   * Keeps other settings intact
   */
  async deleteApiKey(userId: string): Promise<UserSettingsView | null> {
    const db = dbClient.getDb();

    // Check if settings exist
    const existing = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    if (existing.length === 0) {
      return null;
    }

    // Clear API key fields
    const result = await db
      .update(userSettings)
      .set({
        encryptedApiKey: null,
        apiKeyIv: null,
        apiKeyTag: null,
        apiKeySalt: null,
        apiKeyLastFour: null,
        updatedAt: new Date(),
      })
      .where(eq(userSettings.userId, userId))
      .returning();

    return this.toPublicView(result[0]);
  }

  /**
   * Check if a user has an API key configured
   */
  async hasApiKey(userId: string): Promise<boolean> {
    const db = dbClient.getDb();

    const result = await db
      .select({ encryptedApiKey: userSettings.encryptedApiKey })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    return result.length > 0 && result[0].encryptedApiKey !== null;
  }

  /**
   * Convert database record to public view
   * Never exposes the actual API key
   */
  private toPublicView(settings: UserSettings): UserSettingsView {
    return {
      id: settings.id,
      userId: settings.userId,
      hasApiKey: settings.encryptedApiKey !== null,
      apiKeyLastFour: settings.apiKeyLastFour,
      dailyBudgetCents: settings.dailyBudgetCents,
      budgetResetHour: settings.budgetResetHour ?? 0,
      timezone: settings.timezone ?? 'UTC',
      createdAt: settings.createdAt,
      updatedAt: settings.updatedAt,
    };
  }
}

/**
 * Singleton instance
 */
let userSettingsService: UserSettingsService | null = null;

/**
 * Get or create the user settings service instance
 */
export function getUserSettingsService(): UserSettingsService {
  if (!userSettingsService) {
    userSettingsService = new UserSettingsService();
  }
  return userSettingsService;
}

/**
 * Create a new user settings service instance
 * Useful for testing
 */
export function createUserSettingsService(): UserSettingsService {
  return new UserSettingsService();
}
