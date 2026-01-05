/**
 * Persistence Sync API Route
 *
 * POST /api/persistence/sync
 * Triggers sync operation to check and repair inconsistencies
 *
 * Request body:
 * {
 *   userId?: string;
 *   limit?: number;
 *   dryRun?: boolean;
 *   operation?: 'check' | 'repair' | 'full' | 'rebuild';
 * }
 *
 * Response:
 * {
 *   status: 'success',
 *   result: {
 *     totalChecked: number,
 *     inconsistencies: SyncInconsistency[],
 *     repaired: number,
 *     failed: number,
 *     duration: number
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncService } from '@/lib/persistence/sync';
import { z } from 'zod';

/**
 * Request schema
 */
const SyncRequestSchema = z.object({
  userId: z.string().optional(),
  limit: z.number().min(1).max(1000).optional().default(100),
  dryRun: z.boolean().optional().default(false),
  operation: z.enum(['check', 'repair', 'full', 'rebuild']).optional().default('check'),
  clearExisting: z.boolean().optional().default(false), // For rebuild only
});

/**
 * POST /api/persistence/sync
 * Trigger sync operation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const parsed = SyncRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    const { userId, limit, dryRun, operation, clearExisting } = parsed.data;

    let result;

    switch (operation) {
      case 'check':
        // Only check for inconsistencies
        const inconsistencies = await syncService.checkConsistency({ userId, limit });
        result = {
          totalChecked: limit,
          inconsistencies,
          repaired: 0,
          failed: 0,
          duration: 0,
        };
        break;

      case 'repair':
        // Check and repair inconsistencies
        const checkResult = await syncService.checkConsistency({ userId, limit });
        if (checkResult.length === 0) {
          result = {
            totalChecked: limit,
            inconsistencies: [],
            repaired: 0,
            failed: 0,
            duration: 0,
          };
        } else {
          result = await syncService.repairInconsistencies(checkResult);
        }
        break;

      case 'full':
        // Full sync: check and repair
        result = await syncService.fullSync({ userId, limit, dryRun });
        break;

      case 'rebuild':
        // Rebuild graph from vector store
        result = await syncService.rebuildGraph({ userId, limit, clearExisting });
        break;

      default:
        return NextResponse.json(
          {
            error: 'Invalid operation',
            message: `Operation '${operation}' is not supported`,
          },
          { status: 400 }
        );
    }

    return NextResponse.json({
      status: 'success',
      operation,
      dryRun,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API] Persistence sync error:', error);

    return NextResponse.json(
      {
        error: 'Failed to perform sync operation',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/persistence/sync
 * Get sync statistics
 */
export async function GET(request: NextRequest) {
  try {
    const stats = await syncService.getStats();

    return NextResponse.json({
      status: 'success',
      stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API] Persistence sync stats error:', error);

    return NextResponse.json(
      {
        error: 'Failed to get sync statistics',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
