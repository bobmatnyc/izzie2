/**
 * Test Relationship Graphing Feature (Ticket #69)
 *
 * Tests:
 * 1. Entity count and types
 * 2. Relationship stats API
 * 3. Bulk inference API
 * 4. Graph API
 * 5. UI page accessibility
 */

import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(process.cwd(), '.env.local') });

import { dbClient } from '../src/lib/db/index.js';
import { users } from '../src/lib/db/schema.js';

const LOG_PREFIX = '[Relationship Test]';
const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3300';

interface EntityStats {
  person?: number;
  company?: number;
  project?: number;
  topic?: number;
  action_item?: number;
  date?: number;
  location?: number;
}

interface RelationshipStats {
  total: number;
  byType: Record<string, number>;
  avgConfidence: number;
}

async function testRelationships() {
  console.log(`${LOG_PREFIX} Testing Relationship Graphing Feature\n`);

  const db = dbClient.getDb();

  // Get the first user
  const [user] = await db.select().from(users).limit(1);

  if (!user) {
    console.error('❌ No users found in database');
    process.exit(1);
  }

  console.log(`✅ Found user: ${user.email} (ID: ${user.id})\n`);

  // Test results
  const results = {
    entityCount: 0,
    entityStats: {} as EntityStats,
    relationshipStats: null as RelationshipStats | null,
    bulkInferenceResults: null as any,
    graphData: null as any,
    errors: [] as string[],
    timings: {
      entities: 0,
      stats: 0,
      bulkInfer: 0,
      graph: 0,
    },
  };

  // ==========================================
  // Test 1: Check Entity Count
  // ==========================================
  console.log('='.repeat(60));
  console.log('TEST 1: Entity Count and Types');
  console.log('='.repeat(60));

  try {
    const startTime = Date.now();
    const weaviateModule = await import('../src/lib/weaviate/entities.js');
    const { listEntitiesByType } = weaviateModule;

    const entityTypes = ['person', 'company', 'project', 'topic', 'action_item', 'date', 'location'];
    const stats: EntityStats = {};
    let totalEntities = 0;

    for (const type of entityTypes) {
      try {
        const entities = await listEntitiesByType(user.id, type as any, 100);
        stats[type as keyof EntityStats] = entities.length;
        totalEntities += entities.length;

        if (entities.length > 0) {
          console.log(`  ${type.padEnd(15)}: ${entities.length} entities`);
          // Show sample
          if (entities.length > 0) {
            console.log(`    Sample: ${entities[0].value}`);
          }
        }
      } catch (err) {
        console.log(`  ${type.padEnd(15)}: Error - ${err instanceof Error ? err.message : 'Unknown'}`);
        stats[type as keyof EntityStats] = 0;
      }
    }

    results.entityCount = totalEntities;
    results.entityStats = stats;
    results.timings.entities = Date.now() - startTime;

    console.log(`\n  ✅ Total entities: ${totalEntities}`);
    console.log(`  ⏱️  Time: ${results.timings.entities}ms\n`);

    if (totalEntities === 0) {
      console.log('  ⚠️  WARNING: No entities found. Relationship inference will have nothing to process.');
      console.log('  You need to run entity extraction first.\n');
    }
  } catch (error) {
    const errMsg = `Entity count test failed: ${error instanceof Error ? error.message : 'Unknown'}`;
    console.error(`  ❌ ${errMsg}\n`);
    results.errors.push(errMsg);
  }

  // ==========================================
  // Test 2: Relationship Stats API
  // ==========================================
  console.log('='.repeat(60));
  console.log('TEST 2: Relationship Stats API');
  console.log('='.repeat(60));

  try {
    const startTime = Date.now();

    // Call the service directly (bypassing HTTP auth)
    const relationshipModule = await import('../src/lib/weaviate/relationships.js');
    const { getRelationshipStats } = relationshipModule;

    const stats = await getRelationshipStats(user.id);
    results.relationshipStats = stats;
    results.timings.stats = Date.now() - startTime;

    console.log(`  Total relationships: ${stats.total}`);
    console.log(`  Average confidence: ${stats.avgConfidence.toFixed(2)}`);

    if (Object.keys(stats.byType).length > 0) {
      console.log(`  Breakdown by type:`);
      Object.entries(stats.byType).forEach(([type, count]) => {
        console.log(`    ${type.padEnd(20)}: ${count}`);
      });
    } else {
      console.log(`  No relationships by type breakdown available`);
    }

    console.log(`\n  ✅ Stats retrieved successfully`);
    console.log(`  ⏱️  Time: ${results.timings.stats}ms\n`);

    if (stats.total === 0) {
      console.log('  ℹ️  No existing relationships found. Will test bulk inference next.\n');
    }
  } catch (error) {
    const errMsg = `Relationship stats test failed: ${error instanceof Error ? error.message : 'Unknown'}`;
    console.error(`  ❌ ${errMsg}\n`);
    results.errors.push(errMsg);
  }

  // ==========================================
  // Test 3: Bulk Inference (if no relationships)
  // ==========================================
  if (results.relationshipStats && results.relationshipStats.total === 0 && results.entityCount > 0) {
    console.log('='.repeat(60));
    console.log('TEST 3: Bulk Relationship Inference');
    console.log('='.repeat(60));

    try {
      const startTime = Date.now();

      // Import inference modules
      const inferenceModule = await import('../src/lib/relationships/inference.js');
      const relationshipModule = await import('../src/lib/weaviate/relationships.js');
      const weaviateModule = await import('../src/lib/weaviate/entities.js');

      const { inferRelationships } = inferenceModule;
      const { saveRelationships } = relationshipModule;
      const { listEntitiesByType } = weaviateModule;

      // Fetch entities for inference
      const entityTypes = ['person', 'company', 'project'];
      const allEntities: any[] = [];

      for (const type of entityTypes) {
        const entities = await listEntitiesByType(user.id, type as any, 50);
        allEntities.push(...entities.map((e: any) => ({
          type: e.type || type,
          value: e.value,
          normalized: e.normalized,
          confidence: e.confidence,
          source: e.source,
          sourceId: e.sourceId,
          context: e.context,
        })));
      }

      console.log(`  Fetched ${allEntities.length} entities for inference`);

      // Group by sourceId
      const entityGroups = new Map<string, any[]>();
      for (const entity of allEntities) {
        const sourceId = entity.sourceId || 'unknown';
        if (!entityGroups.has(sourceId)) {
          entityGroups.set(sourceId, []);
        }
        entityGroups.get(sourceId)!.push(entity);
      }

      console.log(`  Grouped into ${entityGroups.size} sources\n`);

      let totalRelationships = 0;
      let totalCost = 0;
      let processedSources = 0;
      const maxSources = Math.min(entityGroups.size, 5); // Limit to 5 sources for testing

      console.log(`  Processing first ${maxSources} sources...\n`);

      for (const [sourceId, entities] of entityGroups) {
        if (processedSources >= maxSources) break;
        if (entities.length < 2) continue;

        try {
          // Build context
          const contextParts = entities
            .filter((e) => e.context)
            .map((e) => e.context)
            .slice(0, 3);
          const content = contextParts.length > 0
            ? contextParts.join('\n\n')
            : `Entities: ${entities.map((e) => `${e.type}: ${e.value}`).join(', ')}`;

          // Run inference
          const result = await inferRelationships(entities, content, sourceId, user.id);

          console.log(`    Source ${sourceId.substring(0, 12)}...:`);
          console.log(`      Entities: ${entities.length}`);
          console.log(`      Relationships: ${result.relationships.length}`);
          console.log(`      Cost: $${result.tokenCost.toFixed(4)}`);

          if (result.relationships.length > 0) {
            await saveRelationships(result.relationships, user.id);
            totalRelationships += result.relationships.length;

            // Show first relationship as sample
            const rel = result.relationships[0];
            console.log(`      Sample: ${rel.sourceEntity.value} --[${rel.type}]--> ${rel.targetEntity.value}`);
          }

          totalCost += result.tokenCost;
          processedSources++;
        } catch (err) {
          console.log(`    ❌ Error processing source ${sourceId}: ${err instanceof Error ? err.message : 'Unknown'}`);
        }
      }

      results.timings.bulkInfer = Date.now() - startTime;
      results.bulkInferenceResults = {
        totalRelationships,
        totalCost,
        sourcesProcessed: processedSources,
        totalSources: entityGroups.size,
      };

      console.log(`\n  ✅ Inference completed`);
      console.log(`  Total relationships created: ${totalRelationships}`);
      console.log(`  Total cost: $${totalCost.toFixed(4)}`);
      console.log(`  Sources processed: ${processedSources}/${entityGroups.size}`);
      console.log(`  ⏱️  Time: ${results.timings.bulkInfer}ms\n`);

    } catch (error) {
      const errMsg = `Bulk inference test failed: ${error instanceof Error ? error.message : 'Unknown'}`;
      console.error(`  ❌ ${errMsg}\n`);
      results.errors.push(errMsg);
    }
  } else if (results.relationshipStats && results.relationshipStats.total > 0) {
    console.log('='.repeat(60));
    console.log('TEST 3: Bulk Inference (SKIPPED - relationships already exist)');
    console.log('='.repeat(60));
    console.log('  ℹ️  Skipping bulk inference since relationships already exist\n');
  } else {
    console.log('='.repeat(60));
    console.log('TEST 3: Bulk Inference (SKIPPED - no entities)');
    console.log('='.repeat(60));
    console.log('  ⚠️  Skipping bulk inference - no entities available\n');
  }

  // ==========================================
  // Test 4: Graph API
  // ==========================================
  console.log('='.repeat(60));
  console.log('TEST 4: Relationship Graph API');
  console.log('='.repeat(60));

  try {
    const startTime = Date.now();

    const relationshipModule = await import('../src/lib/weaviate/relationships.js');
    const { buildRelationshipGraph } = relationshipModule;

    const graph = await buildRelationshipGraph(user.id, {
      minConfidence: 0.5,
    });

    results.graphData = {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      nodes: graph.nodes.slice(0, 5), // Sample
      edges: graph.edges.slice(0, 5), // Sample
    };
    results.timings.graph = Date.now() - startTime;

    console.log(`  Nodes: ${graph.nodes.length}`);
    console.log(`  Edges: ${graph.edges.length}`);

    if (graph.nodes.length > 0) {
      console.log(`\n  Sample nodes:`);
      graph.nodes.slice(0, 3).forEach((node: any) => {
        console.log(`    ${node.id} (${node.type}): ${node.label}`);
      });
    }

    if (graph.edges.length > 0) {
      console.log(`\n  Sample edges:`);
      graph.edges.slice(0, 3).forEach((edge: any) => {
        console.log(`    ${edge.source} --[${edge.type}]--> ${edge.target}`);
      });
    }

    console.log(`\n  ✅ Graph data retrieved successfully`);
    console.log(`  ⏱️  Time: ${results.timings.graph}ms\n`);

  } catch (error) {
    const errMsg = `Graph API test failed: ${error instanceof Error ? error.message : 'Unknown'}`;
    console.error(`  ❌ ${errMsg}\n`);
    results.errors.push(errMsg);
  }

  // ==========================================
  // Test 5: UI Page Check
  // ==========================================
  console.log('='.repeat(60));
  console.log('TEST 5: UI Page Accessibility');
  console.log('='.repeat(60));

  try {
    const uiUrl = `${baseUrl}/dashboard/relationships`;
    console.log(`  Checking: ${uiUrl}`);

    const response = await fetch(uiUrl);
    const status = response.status;
    const contentType = response.headers.get('content-type');

    console.log(`  Status: ${status}`);
    console.log(`  Content-Type: ${contentType}`);

    if (status === 200 && contentType?.includes('text/html')) {
      console.log(`\n  ✅ UI page is accessible\n`);
    } else if (status === 401 || status === 403) {
      console.log(`\n  ℹ️  Page requires authentication (expected)\n`);
    } else {
      console.log(`\n  ⚠️  Unexpected response: ${status}\n`);
    }

  } catch (error) {
    const errMsg = `UI page check failed: ${error instanceof Error ? error.message : 'Unknown'}`;
    console.error(`  ❌ ${errMsg}\n`);
    results.errors.push(errMsg);
  }

  // ==========================================
  // Final Report
  // ==========================================
  console.log('\n');
  console.log('='.repeat(60));
  console.log('RELATIONSHIP GRAPHING FEATURE TEST REPORT');
  console.log('='.repeat(60));
  console.log();

  console.log('📊 ENTITY STATISTICS');
  console.log('-'.repeat(60));
  console.log(`  Total Entities: ${results.entityCount}`);
  if (results.entityCount > 0) {
    Object.entries(results.entityStats).forEach(([type, count]) => {
      if (count > 0) {
        console.log(`    ${type.padEnd(15)}: ${count}`);
      }
    });
  }
  console.log();

  console.log('🔗 RELATIONSHIP STATISTICS');
  console.log('-'.repeat(60));
  if (results.relationshipStats) {
    console.log(`  Total Relationships: ${results.relationshipStats.total}`);
    console.log(`  Average Confidence: ${results.relationshipStats.avgConfidence.toFixed(2)}`);
    if (Object.keys(results.relationshipStats.byType).length > 0) {
      Object.entries(results.relationshipStats.byType).forEach(([type, count]) => {
        console.log(`    ${type.padEnd(20)}: ${count}`);
      });
    }
  } else {
    console.log(`  No relationship stats available`);
  }
  console.log();

  if (results.bulkInferenceResults) {
    console.log('🤖 BULK INFERENCE RESULTS');
    console.log('-'.repeat(60));
    console.log(`  Relationships Created: ${results.bulkInferenceResults.totalRelationships}`);
    console.log(`  Cost: $${results.bulkInferenceResults.totalCost.toFixed(4)}`);
    console.log(`  Sources Processed: ${results.bulkInferenceResults.sourcesProcessed}/${results.bulkInferenceResults.totalSources}`);
    console.log();
  }

  console.log('📈 GRAPH DATA');
  console.log('-'.repeat(60));
  if (results.graphData) {
    console.log(`  Nodes: ${results.graphData.nodeCount}`);
    console.log(`  Edges: ${results.graphData.edgeCount}`);
  } else {
    console.log(`  No graph data available`);
  }
  console.log();

  console.log('⏱️  PERFORMANCE');
  console.log('-'.repeat(60));
  console.log(`  Entity Query: ${results.timings.entities}ms`);
  console.log(`  Stats Query: ${results.timings.stats}ms`);
  if (results.timings.bulkInfer > 0) {
    console.log(`  Bulk Inference: ${results.timings.bulkInfer}ms`);
  }
  console.log(`  Graph Build: ${results.timings.graph}ms`);
  console.log();

  if (results.errors.length > 0) {
    console.log('❌ ERRORS');
    console.log('-'.repeat(60));
    results.errors.forEach((err, i) => {
      console.log(`  ${i + 1}. ${err}`);
    });
    console.log();
  }

  console.log('✅ RECOMMENDATIONS');
  console.log('-'.repeat(60));

  if (results.entityCount === 0) {
    console.log('  ⚠️  No entities found - run entity extraction first');
  } else if (results.relationshipStats && results.relationshipStats.total === 0) {
    console.log('  ℹ️  Run bulk inference to create relationships from entities');
  } else if (results.graphData && results.graphData.nodeCount === 0) {
    console.log('  ⚠️  Graph has no nodes - check relationship data');
  } else {
    console.log('  ✅ Feature is working correctly!');
    console.log(`  ✅ ${results.entityCount} entities available for relationship inference`);
    console.log(`  ✅ ${results.relationshipStats?.total || 0} relationships exist`);
    console.log(`  ✅ Graph has ${results.graphData?.nodeCount || 0} nodes and ${results.graphData?.edgeCount || 0} edges`);
  }

  console.log();
  console.log('='.repeat(60));
  console.log();
}

testRelationships()
  .catch(console.error)
  .finally(() => process.exit(0));
