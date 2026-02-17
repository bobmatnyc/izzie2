/**
 * User Settings API
 * Manages BYOK (Bring Your Own Key) settings including:
 * - OpenRouter API key (encrypted)
 * - Daily budget configuration
 * - Current daily spend tracking
 *
 * GET  - Returns settings with hasApiKey, apiKeyLastFour, budget info, and current spend
 * PUT  - Updates settings including API key management
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  getUserSettingsService,
  type UpdateUserSettingsInput,
} from '@/lib/services/user-settings.service';
import { getCurrentDailySpendCents } from '@/lib/services/daily-spend.service';

const LOG_PREFIX = '[User Settings API]';

// Common timezones for validation
const VALID_TIMEZONES = Intl.supportedValuesOf('timeZone');

/**
 * GET /api/user/settings
 * Returns user settings with computed daily spend
 *
 * Response:
 * {
 *   settings: {
 *     hasApiKey: boolean,
 *     apiKeyLastFour: string | null,
 *     dailyBudgetCents: number | null,
 *     budgetResetHour: number,
 *     timezone: string,
 *     currentDailySpendCents: number
 *   }
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const settingsService = getUserSettingsService();
    const settings = await settingsService.getSettings(userId);

    // Calculate current daily spend
    const timezone = settings?.timezone ?? 'UTC';
    const budgetResetHour = settings?.budgetResetHour ?? 0;
    const currentDailySpendCents = await getCurrentDailySpendCents(
      userId,
      timezone,
      budgetResetHour
    );

    // Return settings with defaults if no settings exist
    return NextResponse.json({
      settings: {
        hasApiKey: settings?.hasApiKey ?? false,
        apiKeyLastFour: settings?.apiKeyLastFour ?? null,
        dailyBudgetCents: settings?.dailyBudgetCents ?? null,
        budgetResetHour: settings?.budgetResetHour ?? 0,
        timezone: settings?.timezone ?? 'UTC',
        currentDailySpendCents,
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} GET error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/user/settings
 * Updates user settings
 *
 * Request body:
 * {
 *   apiKey?: string | null,        // API key to set (null or empty to remove)
 *   dailyBudgetCents?: number | null, // Daily budget in cents (null = unlimited)
 *   budgetResetHour?: number,      // 0-23
 *   timezone?: string              // IANA timezone
 * }
 *
 * Response:
 * {
 *   success: true,
 *   settings: { ... }
 * }
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const userId = session.user.id;

    const body = await request.json();
    const { apiKey, dailyBudgetCents, budgetResetHour, timezone } = body;

    // Validate budgetResetHour if provided
    if (budgetResetHour !== undefined) {
      if (
        typeof budgetResetHour !== 'number' ||
        !Number.isInteger(budgetResetHour) ||
        budgetResetHour < 0 ||
        budgetResetHour > 23
      ) {
        return NextResponse.json(
          { error: 'budgetResetHour must be an integer between 0 and 23' },
          { status: 400 }
        );
      }
    }

    // Validate timezone if provided
    if (timezone !== undefined) {
      if (typeof timezone !== 'string' || !VALID_TIMEZONES.includes(timezone)) {
        return NextResponse.json(
          { error: 'Invalid timezone. Must be a valid IANA timezone.' },
          { status: 400 }
        );
      }
    }

    // Validate dailyBudgetCents if provided
    if (dailyBudgetCents !== undefined && dailyBudgetCents !== null) {
      if (
        typeof dailyBudgetCents !== 'number' ||
        !Number.isInteger(dailyBudgetCents) ||
        dailyBudgetCents < 0
      ) {
        return NextResponse.json(
          { error: 'dailyBudgetCents must be a non-negative integer or null' },
          { status: 400 }
        );
      }
    }

    // Validate apiKey if provided (basic format check)
    if (apiKey !== undefined && apiKey !== null && apiKey !== '') {
      if (typeof apiKey !== 'string') {  // pragma: allowlist secret
        return NextResponse.json({ error: 'apiKey must be a string' }, { status: 400 });
      }

      // OpenRouter API keys typically start with 'sk-or-'
      if (!apiKey.startsWith('sk-or-') && !apiKey.startsWith('sk-')) {
        return NextResponse.json(
          { error: 'Invalid API key format. OpenRouter API keys start with sk-or-' },
          { status: 400 }
        );
      }
    }

    // Build update input
    const updateInput: UpdateUserSettingsInput = {};

    if (apiKey !== undefined) {
      // Empty string or null means remove the API key
      updateInput.apiKey = apiKey === '' ? null : apiKey;
    }

    if (dailyBudgetCents !== undefined) {
      updateInput.dailyBudgetCents = dailyBudgetCents;
    }

    if (budgetResetHour !== undefined) {
      updateInput.budgetResetHour = budgetResetHour;
    }

    if (timezone !== undefined) {
      updateInput.timezone = timezone;
    }

    // Update settings
    const settingsService = getUserSettingsService();
    const updatedSettings = await settingsService.updateSettings(userId, updateInput);

    // Get current daily spend with updated settings
    const currentDailySpendCents = await getCurrentDailySpendCents(
      userId,
      updatedSettings.timezone,
      updatedSettings.budgetResetHour
    );

    console.log(`${LOG_PREFIX} Updated settings for user:`, userId);

    return NextResponse.json({
      success: true,
      settings: {
        hasApiKey: updatedSettings.hasApiKey,
        apiKeyLastFour: updatedSettings.apiKeyLastFour,
        dailyBudgetCents: updatedSettings.dailyBudgetCents,
        budgetResetHour: updatedSettings.budgetResetHour,
        timezone: updatedSettings.timezone,
        currentDailySpendCents,
      },
    });
  } catch (error) {
    console.error(`${LOG_PREFIX} PUT error:`, error);

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Handle encryption-specific errors
    if (error instanceof Error && error.message.includes('ENCRYPTION_PASSPHRASE')) {
      return NextResponse.json(
        { error: 'Server encryption not configured. Please contact support.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/user/settings/api-key
 * This endpoint is for removing just the API key
 * Use PUT with apiKey: null instead
 */
