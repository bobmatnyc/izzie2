/**
 * Graph Test Endpoint
 *
 * Verify Neo4j connection and test basic operations.
 */

import { NextResponse } from 'next/server';
import {
  neo4jClient,
  initializeGraph,
  createEntityNode,
  createEmailNode,
  createMentionedIn,
  createCoOccurrence,
  getEntityByName,
  getTopEntities,
} from '@/lib/graph';
import type { Entity } from '@/lib/extraction/types';

export async function GET() {
  const results: any = {
    status: 'starting',
    checks: {},
    errors: [],
  };

  try {
    // Check 1: Neo4j configuration
    results.checks.configured = neo4jClient.isConfigured();
    if (!results.checks.configured) {
      results.status = 'error';
      results.errors.push(
        'Neo4j not configured. Set NEO4J_URI, NEO4J_USER, and NEO4J_PASSWORD environment variables.'
      );
      return NextResponse.json(results, { status: 500 });
    }

    // Check 2: Connection
    try {
      results.checks.connected = await neo4jClient.verifyConnection();
      if (!results.checks.connected) {
        throw new Error('Connection verification failed');
      }
    } catch (error) {
      results.status = 'error';
      results.checks.connected = false;
      results.errors.push(`Connection failed: ${error}`);
      return NextResponse.json(results, { status: 500 });
    }

    // Check 3: Initialize (create indexes)
    try {
      await initializeGraph();
      results.checks.initialized = true;
    } catch (error) {
      results.errors.push(`Initialization failed: ${error}`);
      results.checks.initialized = false;
    }

    // Check 4: Create test nodes
    try {
      const testEmail = {
        id: 'test-email-1',
        subject: 'Test Email',
        timestamp: new Date(),
        significanceScore: 0.8,
      };

      await createEmailNode(testEmail);

      const testEntity: Entity = {
        type: 'person',
        value: 'Test Person',
        normalized: 'test_person',
        confidence: 0.95,
        source: 'metadata',
      };

      await createEntityNode(testEntity, testEmail.id);
      await createMentionedIn(testEntity, testEmail.id);

      results.checks.nodeCreation = true;
    } catch (error) {
      results.errors.push(`Node creation failed: ${error}`);
      results.checks.nodeCreation = false;
    }

    // Check 5: Query test
    try {
      const entity = await getEntityByName('test_person', 'Person');
      results.checks.query = !!entity;
      results.testEntity = entity;
    } catch (error) {
      results.errors.push(`Query failed: ${error}`);
      results.checks.query = false;
    }

    // Check 6: Relationship test
    try {
      const testEntity1: Entity = {
        type: 'person',
        value: 'Alice',
        normalized: 'alice',
        confidence: 0.9,
        source: 'body',
      };

      const testEntity2: Entity = {
        type: 'person',
        value: 'Bob',
        normalized: 'bob',
        confidence: 0.9,
        source: 'body',
      };

      await createEntityNode(testEntity1, 'test-email-1');
      await createEntityNode(testEntity2, 'test-email-1');
      await createCoOccurrence(testEntity1, testEntity2, 'test-email-1');

      results.checks.relationships = true;
    } catch (error) {
      results.errors.push(`Relationship creation failed: ${error}`);
      results.checks.relationships = false;
    }

    // Check 7: Stats
    try {
      const stats = await neo4jClient.getStats();
      results.stats = stats;
      results.checks.stats = true;
    } catch (error) {
      results.errors.push(`Stats retrieval failed: ${error}`);
      results.checks.stats = false;
    }

    // Check 8: Top entities query
    try {
      const topPeople = await getTopEntities('Person', 5);
      results.topPeople = topPeople;
      results.checks.topEntities = true;
    } catch (error) {
      results.errors.push(`Top entities query failed: ${error}`);
      results.checks.topEntities = false;
    }

    // Overall status
    const allChecks = Object.values(results.checks);
    const passedChecks = allChecks.filter((check) => check === true).length;
    const totalChecks = allChecks.length;

    results.status =
      passedChecks === totalChecks
        ? 'success'
        : passedChecks > totalChecks / 2
          ? 'partial'
          : 'error';

    results.summary = {
      passed: passedChecks,
      total: totalChecks,
      percentage: Math.round((passedChecks / totalChecks) * 100),
    };

    return NextResponse.json(results, {
      status: results.status === 'success' ? 200 : 500,
    });
  } catch (error) {
    results.status = 'error';
    results.errors.push(`Unexpected error: ${error}`);
    return NextResponse.json(results, { status: 500 });
  }
}

/**
 * DELETE endpoint to clean up test data
 */
export async function DELETE() {
  try {
    if (!neo4jClient.isConfigured()) {
      return NextResponse.json(
        { error: 'Neo4j not configured' },
        { status: 500 }
      );
    }

    // Delete test data
    await neo4jClient.runQuery(`
      MATCH (n)
      WHERE n.id = 'test-email-1' OR n.normalized IN ['test_person', 'alice', 'bob']
      DETACH DELETE n
    `);

    return NextResponse.json({
      status: 'success',
      message: 'Test data cleaned up',
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Cleanup failed: ${error}` },
      { status: 500 }
    );
  }
}
