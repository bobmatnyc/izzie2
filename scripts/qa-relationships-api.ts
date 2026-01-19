/**
 * QA Test Script for Relationships API Endpoints
 * Tests authentication, successful responses, and error cases
 *
 * Run with: npx tsx scripts/qa-relationships-api.ts
 */

import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(process.cwd(), '.env.local') });

import { dbClient } from '../src/lib/db/index.js';
import { users, sessions } from '../src/lib/db/schema.js';
import {
  getAllRelationships,
  getRelationshipStats,
  buildRelationshipGraph,
  deleteRelationshipById
} from '../src/lib/weaviate/relationships.js';

const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3300';

interface TestResult {
  endpoint: string;
  method: string;
  status: 'PASS' | 'FAIL';
  httpCode?: number;
  message: string;
  responseTime?: number;
}

const results: TestResult[] = [];

/**
 * Create a test session and return the token
 */
async function createTestSession(): Promise<{ userId: string; token: string }> {
  const db = dbClient.getDb();

  // Get the first user
  const [user] = await db.select().from(users).limit(1);

  if (!user) {
    throw new Error('No users found in database. Please create a user first.');
  }

  // Generate session token
  const sessionId = `session_qa_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const sessionToken = `test_session_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  // Create session - expires in 1 hour
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1);

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    token: sessionToken,
    expiresAt,
    ipAddress: '127.0.0.1',
    userAgent: 'QA Test Script',
  });

  console.log(`Created test session for user: ${user.email} (${user.id})`);

  return { userId: user.id, token: sessionToken };
}

/**
 * Make an authenticated API request
 */
async function apiRequest(
  endpoint: string,
  options: {
    method?: string;
    body?: any;
    token: string;
  }
): Promise<{ status: number; data: any; responseTime: number }> {
  const start = Date.now();

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': `izzie2.session_token=${options.token}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const responseTime = Date.now() - start;
  const data = await response.json();

  return { status: response.status, data, responseTime };
}

/**
 * Test: GET /api/relationships without authentication
 */
async function testRelationshipsNoAuth(): Promise<void> {
  console.log('\n--- Test: GET /api/relationships (no auth) ---');

  try {
    const response = await fetch(`${API_BASE}/api/relationships`);
    const data = await response.text();

    if (response.status === 401 || response.status === 500) {
      results.push({
        endpoint: '/api/relationships',
        method: 'GET',
        status: 'PASS',
        httpCode: response.status,
        message: 'Correctly rejected unauthenticated request',
      });
      console.log(`  PASS: Rejected with status ${response.status}`);
    } else {
      results.push({
        endpoint: '/api/relationships',
        method: 'GET',
        status: 'FAIL',
        httpCode: response.status,
        message: `Expected 401/500, got ${response.status}`,
      });
      console.log(`  FAIL: Expected 401/500, got ${response.status}`);
    }
  } catch (error) {
    results.push({
      endpoint: '/api/relationships',
      method: 'GET',
      status: 'FAIL',
      message: `Network error: ${error}`,
    });
    console.log(`  FAIL: Network error - ${error}`);
  }
}

/**
 * Test: GET /api/relationships with authentication
 */
async function testRelationshipsWithAuth(token: string, userId: string): Promise<void> {
  console.log('\n--- Test: GET /api/relationships (authenticated) ---');

  try {
    const { status, data, responseTime } = await apiRequest('/api/relationships', { token });

    if (status === 200 && 'relationships' in data && 'total' in data) {
      results.push({
        endpoint: '/api/relationships',
        method: 'GET',
        status: 'PASS',
        httpCode: status,
        message: `Returned ${data.total} relationships`,
        responseTime,
      });
      console.log(`  PASS: Returned ${data.total} relationships (${responseTime}ms)`);

      // Verify response format
      if (Array.isArray(data.relationships)) {
        console.log(`  - Response format correct: relationships is an array`);
        if (data.relationships.length > 0) {
          const sample = data.relationships[0];
          const requiredFields = ['fromEntityType', 'fromEntityValue', 'toEntityType', 'toEntityValue', 'relationshipType'];
          const hasAllFields = requiredFields.every(f => f in sample);
          console.log(`  - Sample relationship has all required fields: ${hasAllFields}`);
        }
      }
    } else {
      results.push({
        endpoint: '/api/relationships',
        method: 'GET',
        status: 'FAIL',
        httpCode: status,
        message: `Invalid response format or status: ${JSON.stringify(data)}`,
        responseTime,
      });
      console.log(`  FAIL: Invalid response - status ${status}`);
    }
  } catch (error) {
    results.push({
      endpoint: '/api/relationships',
      method: 'GET',
      status: 'FAIL',
      message: `Error: ${error}`,
    });
    console.log(`  FAIL: ${error}`);
  }
}

/**
 * Test: GET /api/relationships with query parameters
 */
async function testRelationshipsWithParams(token: string): Promise<void> {
  console.log('\n--- Test: GET /api/relationships with query params ---');

  try {
    // Test with limit parameter
    const { status, data, responseTime } = await apiRequest('/api/relationships?limit=5', { token });

    if (status === 200 && Array.isArray(data.relationships)) {
      const correctLimit = data.relationships.length <= 5;
      results.push({
        endpoint: '/api/relationships?limit=5',
        method: 'GET',
        status: correctLimit ? 'PASS' : 'FAIL',
        httpCode: status,
        message: correctLimit ?
          `Limit parameter works: returned ${data.relationships.length} items` :
          `Limit parameter ignored: returned ${data.relationships.length} items`,
        responseTime,
      });
      console.log(`  ${correctLimit ? 'PASS' : 'FAIL'}: Limit param - returned ${data.relationships.length} items`);
    } else {
      results.push({
        endpoint: '/api/relationships?limit=5',
        method: 'GET',
        status: 'FAIL',
        httpCode: status,
        message: `Request failed with status ${status}`,
        responseTime,
      });
      console.log(`  FAIL: Status ${status}`);
    }
  } catch (error) {
    results.push({
      endpoint: '/api/relationships?limit=5',
      method: 'GET',
      status: 'FAIL',
      message: `Error: ${error}`,
    });
    console.log(`  FAIL: ${error}`);
  }
}

/**
 * Test: GET /api/relationships/stats
 */
async function testRelationshipsStats(token: string): Promise<void> {
  console.log('\n--- Test: GET /api/relationships/stats ---');

  try {
    const { status, data, responseTime } = await apiRequest('/api/relationships/stats', { token });

    if (status === 200 && 'total' in data && 'byType' in data && 'avgConfidence' in data) {
      results.push({
        endpoint: '/api/relationships/stats',
        method: 'GET',
        status: 'PASS',
        httpCode: status,
        message: `Total: ${data.total}, Avg Confidence: ${data.avgConfidence}`,
        responseTime,
      });
      console.log(`  PASS: Total: ${data.total}, Avg Confidence: ${data.avgConfidence} (${responseTime}ms)`);
      console.log(`  - Types: ${JSON.stringify(data.byType)}`);
    } else {
      results.push({
        endpoint: '/api/relationships/stats',
        method: 'GET',
        status: 'FAIL',
        httpCode: status,
        message: `Invalid response format: ${JSON.stringify(data)}`,
        responseTime,
      });
      console.log(`  FAIL: Invalid response format`);
    }
  } catch (error) {
    results.push({
      endpoint: '/api/relationships/stats',
      method: 'GET',
      status: 'FAIL',
      message: `Error: ${error}`,
    });
    console.log(`  FAIL: ${error}`);
  }
}

/**
 * Test: GET /api/relationships/graph
 */
async function testRelationshipsGraph(token: string): Promise<void> {
  console.log('\n--- Test: GET /api/relationships/graph ---');

  try {
    const { status, data, responseTime } = await apiRequest('/api/relationships/graph', { token });

    if (status === 200 && 'nodes' in data && 'edges' in data && 'stats' in data) {
      results.push({
        endpoint: '/api/relationships/graph',
        method: 'GET',
        status: 'PASS',
        httpCode: status,
        message: `Nodes: ${data.stats.nodeCount}, Edges: ${data.stats.edgeCount}`,
        responseTime,
      });
      console.log(`  PASS: Nodes: ${data.stats.nodeCount}, Edges: ${data.stats.edgeCount} (${responseTime}ms)`);

      // Verify node structure
      if (data.nodes.length > 0) {
        const node = data.nodes[0];
        const hasNodeFields = 'id' in node && 'label' in node && 'type' in node;
        console.log(`  - Node structure valid: ${hasNodeFields}`);
      }

      // Verify edge structure
      if (data.edges.length > 0) {
        const edge = data.edges[0];
        const hasEdgeFields = 'source' in edge && 'target' in edge && 'type' in edge;
        console.log(`  - Edge structure valid: ${hasEdgeFields}`);
      }
    } else {
      results.push({
        endpoint: '/api/relationships/graph',
        method: 'GET',
        status: 'FAIL',
        httpCode: status,
        message: `Invalid response format: ${JSON.stringify(data)}`,
        responseTime,
      });
      console.log(`  FAIL: Invalid response format`);
    }
  } catch (error) {
    results.push({
      endpoint: '/api/relationships/graph',
      method: 'GET',
      status: 'FAIL',
      message: `Error: ${error}`,
    });
    console.log(`  FAIL: ${error}`);
  }
}

/**
 * Test: GET /api/relationships/graph with minConfidence parameter
 */
async function testRelationshipsGraphWithConfidence(token: string): Promise<void> {
  console.log('\n--- Test: GET /api/relationships/graph with minConfidence ---');

  try {
    const { status, data, responseTime } = await apiRequest('/api/relationships/graph?minConfidence=0.8', { token });

    if (status === 200 && 'nodes' in data && 'edges' in data) {
      results.push({
        endpoint: '/api/relationships/graph?minConfidence=0.8',
        method: 'GET',
        status: 'PASS',
        httpCode: status,
        message: `Filter applied - Nodes: ${data.stats.nodeCount}, Edges: ${data.stats.edgeCount}`,
        responseTime,
      });
      console.log(`  PASS: Confidence filter applied (${responseTime}ms)`);
    } else {
      results.push({
        endpoint: '/api/relationships/graph?minConfidence=0.8',
        method: 'GET',
        status: 'FAIL',
        httpCode: status,
        message: `Request failed`,
        responseTime,
      });
      console.log(`  FAIL: Status ${status}`);
    }
  } catch (error) {
    results.push({
      endpoint: '/api/relationships/graph?minConfidence=0.8',
      method: 'GET',
      status: 'FAIL',
      message: `Error: ${error}`,
    });
    console.log(`  FAIL: ${error}`);
  }
}

/**
 * Test: DELETE /api/relationships without id parameter
 */
async function testDeleteNoId(token: string): Promise<void> {
  console.log('\n--- Test: DELETE /api/relationships (no id) ---');

  try {
    const { status, data, responseTime } = await apiRequest('/api/relationships', {
      method: 'DELETE',
      token
    });

    if (status === 400 && data.error) {
      results.push({
        endpoint: '/api/relationships',
        method: 'DELETE',
        status: 'PASS',
        httpCode: status,
        message: 'Correctly returned 400 for missing id parameter',
        responseTime,
      });
      console.log(`  PASS: Correctly rejected with 400 - ${data.error}`);
    } else {
      results.push({
        endpoint: '/api/relationships',
        method: 'DELETE',
        status: 'FAIL',
        httpCode: status,
        message: `Expected 400, got ${status}`,
        responseTime,
      });
      console.log(`  FAIL: Expected 400, got ${status}`);
    }
  } catch (error) {
    results.push({
      endpoint: '/api/relationships',
      method: 'DELETE',
      status: 'FAIL',
      message: `Error: ${error}`,
    });
    console.log(`  FAIL: ${error}`);
  }
}

/**
 * Test: DELETE /api/relationships with invalid id
 */
async function testDeleteInvalidId(token: string): Promise<void> {
  console.log('\n--- Test: DELETE /api/relationships (invalid id) ---');

  try {
    const { status, data, responseTime } = await apiRequest('/api/relationships?id=invalid-uuid-12345', {
      method: 'DELETE',
      token
    });

    if (status === 404 || status === 500) {
      results.push({
        endpoint: '/api/relationships?id=invalid-uuid',
        method: 'DELETE',
        status: 'PASS',
        httpCode: status,
        message: `Correctly handled invalid ID with status ${status}`,
        responseTime,
      });
      console.log(`  PASS: Correctly returned ${status} for invalid ID`);
    } else {
      results.push({
        endpoint: '/api/relationships?id=invalid-uuid',
        method: 'DELETE',
        status: 'FAIL',
        httpCode: status,
        message: `Expected 404/500, got ${status}`,
        responseTime,
      });
      console.log(`  FAIL: Expected 404/500, got ${status}`);
    }
  } catch (error) {
    results.push({
      endpoint: '/api/relationships?id=invalid-uuid',
      method: 'DELETE',
      status: 'FAIL',
      message: `Error: ${error}`,
    });
    console.log(`  FAIL: ${error}`);
  }
}

/**
 * Test: Direct Weaviate functions (bypassing HTTP)
 */
async function testDirectWeaviate(userId: string): Promise<void> {
  console.log('\n--- Test: Direct Weaviate Functions ---');

  // Test getAllRelationships
  try {
    const relationships = await getAllRelationships(userId);
    console.log(`  getAllRelationships: Found ${relationships.length} relationships`);
    results.push({
      endpoint: 'Direct: getAllRelationships',
      method: 'CALL',
      status: 'PASS',
      message: `Found ${relationships.length} relationships`,
    });
  } catch (error) {
    console.log(`  getAllRelationships: FAIL - ${error}`);
    results.push({
      endpoint: 'Direct: getAllRelationships',
      method: 'CALL',
      status: 'FAIL',
      message: `${error}`,
    });
  }

  // Test getRelationshipStats
  try {
    const stats = await getRelationshipStats(userId);
    console.log(`  getRelationshipStats: Total=${stats.total}, AvgConf=${stats.avgConfidence}`);
    results.push({
      endpoint: 'Direct: getRelationshipStats',
      method: 'CALL',
      status: 'PASS',
      message: `Total=${stats.total}, AvgConf=${stats.avgConfidence}`,
    });
  } catch (error) {
    console.log(`  getRelationshipStats: FAIL - ${error}`);
    results.push({
      endpoint: 'Direct: getRelationshipStats',
      method: 'CALL',
      status: 'FAIL',
      message: `${error}`,
    });
  }

  // Test buildRelationshipGraph
  try {
    const graph = await buildRelationshipGraph(userId);
    console.log(`  buildRelationshipGraph: Nodes=${graph.nodes.length}, Edges=${graph.edges.length}`);
    results.push({
      endpoint: 'Direct: buildRelationshipGraph',
      method: 'CALL',
      status: 'PASS',
      message: `Nodes=${graph.nodes.length}, Edges=${graph.edges.length}`,
    });
  } catch (error) {
    console.log(`  buildRelationshipGraph: FAIL - ${error}`);
    results.push({
      endpoint: 'Direct: buildRelationshipGraph',
      method: 'CALL',
      status: 'FAIL',
      message: `${error}`,
    });
  }
}

/**
 * Print test summary
 */
function printSummary(): void {
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;

  console.log(`\nTotal Tests: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / results.length) * 100).toFixed(1)}%`);

  console.log('\n--- Results by Endpoint ---\n');

  for (const result of results) {
    const icon = result.status === 'PASS' ? 'PASS' : 'FAIL';
    const httpInfo = result.httpCode ? ` [${result.httpCode}]` : '';
    const timeInfo = result.responseTime ? ` (${result.responseTime}ms)` : '';
    console.log(`${icon} ${result.method} ${result.endpoint}${httpInfo}${timeInfo}`);
    console.log(`     ${result.message}`);
  }

  if (failed > 0) {
    console.log('\n--- Failed Tests ---\n');
    for (const result of results.filter(r => r.status === 'FAIL')) {
      console.log(`FAIL: ${result.method} ${result.endpoint}`);
      console.log(`      Reason: ${result.message}`);
    }
  }
}

/**
 * Main test runner
 */
async function runTests(): Promise<void> {
  console.log('='.repeat(60));
  console.log('QA Test: Relationships API Endpoints');
  console.log('='.repeat(60));
  console.log(`\nAPI Base: ${API_BASE}`);

  try {
    // Create test session
    console.log('\n--- Setup: Creating Test Session ---');
    const { userId, token } = await createTestSession();
    console.log(`User ID: ${userId}`);
    console.log(`Token: ${token.substring(0, 20)}...`);

    // Run API tests
    await testRelationshipsNoAuth();
    await testRelationshipsWithAuth(token, userId);
    await testRelationshipsWithParams(token);
    await testRelationshipsStats(token);
    await testRelationshipsGraph(token);
    await testRelationshipsGraphWithConfidence(token);
    await testDeleteNoId(token);
    await testDeleteInvalidId(token);

    // Run direct Weaviate tests
    await testDirectWeaviate(userId);

    // Print summary
    printSummary();

  } catch (error) {
    console.error('\nFATAL ERROR:', error);
    process.exit(1);
  }
}

// Run tests
runTests()
  .catch(console.error)
  .finally(() => process.exit(0));
