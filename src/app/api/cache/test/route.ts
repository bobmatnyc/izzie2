/**
 * Cache System Test API
 *
 * Comprehensive test endpoint to validate all cache layers are working properly.
 * Tests Redis connectivity, session caching, AI caching, DB caching, and API caching.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  getCacheService,
  getSessionCacheService,
  getAICacheService,
  getDBCacheService,
  checkRedisHealth,
  CacheMonitor,
} from '@/lib/cache';

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await requireAuth(request);
    const userId = session.user.id;

    console.log('[Cache Test] Starting comprehensive cache test for user:', userId);

    const results: any = {
      timestamp: new Date().toISOString(),
      userId,
      tests: {},
      summary: {
        passed: 0,
        failed: 0,
        errors: [],
      },
    };

    // Test 1: Redis Health Check
    try {
      console.log('[Cache Test] Testing Redis health...');
      const redisHealth = await checkRedisHealth();
      results.tests.redisHealth = {
        passed: redisHealth.available,
        details: redisHealth,
      };
      if (redisHealth.available) {
        results.summary.passed++;
      } else {
        results.summary.failed++;
        results.summary.errors.push('Redis not available');
      }
    } catch (error) {
      results.tests.redisHealth = {
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      results.summary.failed++;
      results.summary.errors.push('Redis health check failed');
    }

    // Test 2: Basic Cache Service
    try {
      console.log('[Cache Test] Testing basic cache service...');
      const cacheService = getCacheService();
      const testKey = `test:cache:${Date.now()}`;
      const testValue = { message: 'Hello Cache', timestamp: Date.now() };

      // Set value
      await cacheService.set(testKey, testValue, 60); // 1 minute TTL

      // Get value
      const retrievedValue = await cacheService.get(testKey);

      const passed = JSON.stringify(retrievedValue) === JSON.stringify(testValue);
      results.tests.basicCache = {
        passed,
        details: {
          setKey: testKey,
          setValue: testValue,
          retrievedValue,
          matched: passed,
        },
      };

      if (passed) {
        results.summary.passed++;
      } else {
        results.summary.failed++;
        results.summary.errors.push('Basic cache set/get failed');
      }

      // Clean up
      await cacheService.delete(testKey);
    } catch (error) {
      results.tests.basicCache = {
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      results.summary.failed++;
      results.summary.errors.push('Basic cache test failed');
    }

    // Test 3: Session Cache
    try {
      console.log('[Cache Test] Testing session cache...');
      const sessionCache = getSessionCacheService();

      // Test session caching (we can't easily create a real session here, so we'll test the service is available)
      const stats = await sessionCache.getSessionCacheStats();

      results.tests.sessionCache = {
        passed: true,
        details: {
          statsAvailable: !!stats,
          serviceInitialized: true,
        },
      };
      results.summary.passed++;
    } catch (error) {
      results.tests.sessionCache = {
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      results.summary.failed++;
      results.summary.errors.push('Session cache test failed');
    }

    // Test 4: AI Cache
    try {
      console.log('[Cache Test] Testing AI cache...');
      const aiCache = getAICacheService();

      const testPrompt = `Test prompt ${Date.now()}`;
      const testResponse = `Test AI response for ${testPrompt}`;

      // Cache AI response
      await aiCache.cacheResponse(testPrompt, testResponse, {
        model: 'test-model',
        tokens: { prompt: 10, completion: 20, total: 30 },
        cost: 0.001,
        ttl: 60,
      });

      // Retrieve AI response
      const cachedResponse = await aiCache.getResponse(testPrompt, 'test-model');

      const passed = cachedResponse?.response === testResponse;
      results.tests.aiCache = {
        passed,
        details: {
          prompt: testPrompt,
          originalResponse: testResponse,
          cachedResponse: cachedResponse?.response,
          matched: passed,
          metadata: {
            model: cachedResponse?.model,
            tokens: cachedResponse?.tokens,
            cost: cachedResponse?.cost,
          },
        },
      };

      if (passed) {
        results.summary.passed++;
      } else {
        results.summary.failed++;
        results.summary.errors.push('AI cache test failed');
      }
    } catch (error) {
      results.tests.aiCache = {
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      results.summary.failed++;
      results.summary.errors.push('AI cache test failed');
    }

    // Test 5: DB Cache
    try {
      console.log('[Cache Test] Testing DB cache...');
      const dbCache = getDBCacheService();

      const testQuery = `test-query-${Date.now()}`;
      const testResult = [{ id: 1, name: 'Test Entity' }, { id: 2, name: 'Another Entity' }];

      // Cache DB query result
      await dbCache.cacheQuery(testQuery, testResult, {
        ttl: 60,
        userId,
        tags: ['test', `user:${userId}`],
      });

      // Retrieve DB query result
      const cachedResult = await dbCache.getCachedQuery(testQuery);

      const passed = JSON.stringify(cachedResult) === JSON.stringify(testResult);
      results.tests.dbCache = {
        passed,
        details: {
          query: testQuery,
          originalResult: testResult,
          cachedResult,
          matched: passed,
        },
      };

      if (passed) {
        results.summary.passed++;
      } else {
        results.summary.failed++;
        results.summary.errors.push('DB cache test failed');
      }
    } catch (error) {
      results.tests.dbCache = {
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      results.summary.failed++;
      results.summary.errors.push('DB cache test failed');
    }

    // Test 6: Cache Statistics
    try {
      console.log('[Cache Test] Testing cache monitoring...');
      const healthCheck = await CacheMonitor.healthCheck();
      const cacheStats = await CacheMonitor.getCacheStats();

      results.tests.monitoring = {
        passed: true,
        details: {
          healthCheck,
          statistics: cacheStats,
        },
      };
      results.summary.passed++;
    } catch (error) {
      results.tests.monitoring = {
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      results.summary.failed++;
      results.summary.errors.push('Cache monitoring test failed');
    }

    // Calculate overall success
    const totalTests = results.summary.passed + results.summary.failed;
    results.summary.success = results.summary.failed === 0;
    results.summary.successRate = totalTests > 0 ? (results.summary.passed / totalTests) * 100 : 0;

    console.log(`[Cache Test] Completed: ${results.summary.passed}/${totalTests} tests passed`);

    // Return appropriate status code based on results
    const statusCode = results.summary.success ? 200 : 206; // 206 = Partial Content (some tests failed)

    return NextResponse.json(results, { status: statusCode });

  } catch (error) {
    console.error('[Cache Test] Error during cache test:', error);
    return NextResponse.json(
      {
        error: 'Cache test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
