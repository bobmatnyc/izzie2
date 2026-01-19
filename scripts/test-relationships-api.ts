/**
 * Test script for Relationship API endpoints
 * Run with: npx tsx scripts/test-relationships-api.ts
 */

import type { Entity } from '@/lib/extraction/types';

const API_BASE = 'http://localhost:3000/api';

// Sample test data
const testEntities: Entity[] = [
  { type: 'person', value: 'John Smith', normalized: 'john smith', confidence: 0.95, source: 'body' },
  { type: 'company', value: 'Acme Corp', normalized: 'acme corp', confidence: 0.92, source: 'body' },
  { type: 'project', value: 'Project Phoenix', normalized: 'project phoenix', confidence: 0.88, source: 'body' },
  { type: 'topic', value: 'Machine Learning', normalized: 'machine learning', confidence: 0.90, source: 'body' },
];

const testContent = `John Smith recently joined Acme Corp as VP of Engineering.
He will be leading Project Phoenix, which focuses on Machine Learning applications.
John previously worked with Sarah Johnson at TechStartup Inc.`;

async function testInferPreview() {
  console.log('\n=== Testing POST /api/relationships/infer (Preview) ===');

  try {
    const response = await fetch(`${API_BASE}/relationships/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'test-email-123',
        content: testContent,
        entities: testEntities,
      }),
    });

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (data.relationships) {
      console.log(`\n✓ Inferred ${data.count} relationships in ${data.processingTime}ms`);
      console.log(`✓ Token cost: $${data.tokenCost.toFixed(4)}`);
      console.log(`✓ Preview mode: ${data.preview}`);
    }
  } catch (error) {
    console.error('✗ Error:', error);
  }
}

async function testCreateRelationships() {
  console.log('\n=== Testing POST /api/relationships (Create & Save) ===');

  try {
    const response = await fetch(`${API_BASE}/relationships`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'test-email-456',
        content: testContent,
        entities: testEntities,
      }),
    });

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Response:', JSON.stringify(data, null, 2));

    if (data.relationships) {
      console.log(`\n✓ Created and saved ${data.count} relationships`);
    }
  } catch (error) {
    console.error('✗ Error:', error);
  }
}

async function testGetRelationships() {
  console.log('\n=== Testing GET /api/relationships ===');

  try {
    const response = await fetch(`${API_BASE}/relationships?limit=10`);
    const data = await response.json();

    console.log('Status:', response.status);
    console.log('Total relationships:', data.total);

    if (data.relationships && data.relationships.length > 0) {
      console.log('\nSample relationship:');
      console.log(JSON.stringify(data.relationships[0], null, 2));
    }
  } catch (error) {
    console.error('✗ Error:', error);
  }
}

async function testGetStats() {
  console.log('\n=== Testing GET /api/relationships/stats ===');

  try {
    const response = await fetch(`${API_BASE}/relationships/stats`);
    const data = await response.json();

    console.log('Status:', response.status);
    console.log('Stats:', JSON.stringify(data, null, 2));

    if (data.total > 0) {
      console.log(`\n✓ Total relationships: ${data.total}`);
      console.log(`✓ Average confidence: ${data.avgConfidence}`);
      console.log('✓ Distribution by type:', Object.entries(data.byType).map(([k, v]) => `${k}: ${v}`).join(', '));
    }
  } catch (error) {
    console.error('✗ Error:', error);
  }
}

async function testGetGraph() {
  console.log('\n=== Testing GET /api/relationships/graph ===');

  try {
    const response = await fetch(`${API_BASE}/relationships/graph?limit=50&minConfidence=0.5`);
    const data = await response.json();

    console.log('Status:', response.status);
    console.log('Graph stats:', JSON.stringify(data.stats, null, 2));

    if (data.nodes && data.edges) {
      console.log(`\n✓ Graph nodes: ${data.nodes.length}`);
      console.log(`✓ Graph edges: ${data.edges.length}`);

      if (data.nodes.length > 0) {
        console.log('\nSample node:');
        console.log(JSON.stringify(data.nodes[0], null, 2));
      }

      if (data.edges.length > 0) {
        console.log('\nSample edge:');
        console.log(JSON.stringify(data.edges[0], null, 2));
      }
    }
  } catch (error) {
    console.error('✗ Error:', error);
  }
}

async function runTests() {
  console.log('🚀 Testing Relationship API Endpoints\n');
  console.log('Note: These tests require authentication. Run with authenticated session.\n');

  // Run tests in sequence
  await testInferPreview();
  await testCreateRelationships();
  await testGetRelationships();
  await testGetStats();
  await testGetGraph();

  console.log('\n✅ All tests completed!\n');
}

// Run tests
runTests().catch(console.error);
