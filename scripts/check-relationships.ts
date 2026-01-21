/**
 * Diagnostic script to check Weaviate Relationship collection data
 *
 * Queries the Relationship collection and logs:
 * - Total relationship count
 * - First 10 relationships with all fields
 * - Relationships with missing fromEntityValue or toEntityValue
 * - Relationships with missing fromEntityType or toEntityType
 */

import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });
import { getWeaviateClient, closeWeaviateClient } from '../src/lib/weaviate/client';
import { RELATIONSHIP_COLLECTION } from '../src/lib/weaviate/schema';

const LOG_PREFIX = '[Check Relationships]';

interface RelationshipData {
  fromEntityType?: string;
  fromEntityValue?: string;
  toEntityType?: string;
  toEntityValue?: string;
  relationshipType?: string;
  confidence?: number;
  evidence?: string;
  sourceId?: string;
  userId?: string;
  inferredAt?: string;
}

async function checkRelationships(): Promise<void> {
  console.log(`${LOG_PREFIX} Starting relationship diagnostics...`);
  console.log('='.repeat(60));

  try {
    const client = await getWeaviateClient();

    // Check if collection exists
    const exists = await client.collections.exists(RELATIONSHIP_COLLECTION);
    if (!exists) {
      console.log(`${LOG_PREFIX} ERROR: Relationship collection does not exist!`);
      return;
    }

    const collection = client.collections.get(RELATIONSHIP_COLLECTION);

    // Get all relationships to count (fetch objects approach since aggregate has issues)
    const allForCount = await collection.query.fetchObjects({
      limit: 10000, // Large limit to get total
      returnProperties: ['fromEntityType'], // Minimal property to reduce payload
    });
    const totalCount = allForCount.objects.length;
    console.log(`\n${LOG_PREFIX} Total relationship count: ${totalCount}`);

    if (totalCount === 0) {
      console.log(`${LOG_PREFIX} No relationships found in the collection.`);
      return;
    }

    // Get first 10 relationships with all fields
    console.log(`\n${LOG_PREFIX} First 10 relationships (all fields):`);
    console.log('-'.repeat(60));

    const queryResult = await collection.query.fetchObjects({
      limit: 10,
      returnProperties: [
        'fromEntityType',
        'fromEntityValue',
        'toEntityType',
        'toEntityValue',
        'relationshipType',
        'confidence',
        'evidence',
        'sourceId',
        'userId',
        'inferredAt',
      ],
    });

    queryResult.objects.forEach((obj, index) => {
      const props = obj.properties as RelationshipData;
      console.log(`\n--- Relationship ${index + 1} ---`);
      console.log(`  UUID: ${obj.uuid}`);
      console.log(`  fromEntityType: ${props.fromEntityType ?? 'UNDEFINED'}`);
      console.log(`  fromEntityValue: ${props.fromEntityValue ?? 'UNDEFINED'}`);
      console.log(`  toEntityType: ${props.toEntityType ?? 'UNDEFINED'}`);
      console.log(`  toEntityValue: ${props.toEntityValue ?? 'UNDEFINED'}`);
      console.log(`  relationshipType: ${props.relationshipType ?? 'UNDEFINED'}`);
      console.log(`  confidence: ${props.confidence ?? 'UNDEFINED'}`);
      console.log(`  evidence: ${(props.evidence ?? 'UNDEFINED').substring(0, 100)}...`);
      console.log(`  sourceId: ${props.sourceId ?? 'UNDEFINED'}`);
      console.log(`  userId: ${props.userId ?? 'UNDEFINED'}`);
      console.log(`  inferredAt: ${props.inferredAt ?? 'UNDEFINED'}`);
    });

    // Check for relationships with missing entity values
    console.log(`\n${LOG_PREFIX} Checking for missing entity values...`);
    console.log('-'.repeat(60));

    const allRelationships = await collection.query.fetchObjects({
      limit: 1000, // Fetch more to check for issues
      returnProperties: [
        'fromEntityType',
        'fromEntityValue',
        'toEntityType',
        'toEntityValue',
        'relationshipType',
        'userId',
      ],
    });

    let missingFromValue = 0;
    let missingToValue = 0;
    let missingFromType = 0;
    let missingToType = 0;
    let emptyFromValue = 0;
    let emptyToValue = 0;
    let emptyFromType = 0;
    let emptyToType = 0;

    const issueExamples: { uuid: string; issue: string; data: RelationshipData }[] = [];

    allRelationships.objects.forEach((obj) => {
      const props = obj.properties as RelationshipData;

      // Check for undefined/null values
      if (props.fromEntityValue === undefined || props.fromEntityValue === null) {
        missingFromValue++;
        if (issueExamples.length < 5) {
          issueExamples.push({ uuid: obj.uuid, issue: 'missing fromEntityValue', data: props });
        }
      } else if (props.fromEntityValue === '') {
        emptyFromValue++;
        if (issueExamples.length < 5) {
          issueExamples.push({ uuid: obj.uuid, issue: 'empty fromEntityValue', data: props });
        }
      }

      if (props.toEntityValue === undefined || props.toEntityValue === null) {
        missingToValue++;
        if (issueExamples.length < 5) {
          issueExamples.push({ uuid: obj.uuid, issue: 'missing toEntityValue', data: props });
        }
      } else if (props.toEntityValue === '') {
        emptyToValue++;
        if (issueExamples.length < 5) {
          issueExamples.push({ uuid: obj.uuid, issue: 'empty toEntityValue', data: props });
        }
      }

      if (props.fromEntityType === undefined || props.fromEntityType === null) {
        missingFromType++;
        if (issueExamples.length < 5) {
          issueExamples.push({ uuid: obj.uuid, issue: 'missing fromEntityType', data: props });
        }
      } else if (props.fromEntityType === '') {
        emptyFromType++;
        if (issueExamples.length < 5) {
          issueExamples.push({ uuid: obj.uuid, issue: 'empty fromEntityType', data: props });
        }
      }

      if (props.toEntityType === undefined || props.toEntityType === null) {
        missingToType++;
        if (issueExamples.length < 5) {
          issueExamples.push({ uuid: obj.uuid, issue: 'missing toEntityType', data: props });
        }
      } else if (props.toEntityType === '') {
        emptyToType++;
        if (issueExamples.length < 5) {
          issueExamples.push({ uuid: obj.uuid, issue: 'empty toEntityType', data: props });
        }
      }
    });

    console.log(`\nAnalyzed ${allRelationships.objects.length} relationships:`);
    console.log(`  fromEntityValue - undefined/null: ${missingFromValue}, empty: ${emptyFromValue}`);
    console.log(`  toEntityValue - undefined/null: ${missingToValue}, empty: ${emptyToValue}`);
    console.log(`  fromEntityType - undefined/null: ${missingFromType}, empty: ${emptyFromType}`);
    console.log(`  toEntityType - undefined/null: ${missingToType}, empty: ${emptyToType}`);

    if (issueExamples.length > 0) {
      console.log(`\n${LOG_PREFIX} Examples of relationships with issues:`);
      console.log('-'.repeat(60));
      issueExamples.forEach((example, index) => {
        console.log(`\n--- Issue Example ${index + 1}: ${example.issue} ---`);
        console.log(`  UUID: ${example.uuid}`);
        console.log(`  fromEntityType: "${example.data.fromEntityType}"`);
        console.log(`  fromEntityValue: "${example.data.fromEntityValue}"`);
        console.log(`  toEntityType: "${example.data.toEntityType}"`);
        console.log(`  toEntityValue: "${example.data.toEntityValue}"`);
        console.log(`  relationshipType: "${example.data.relationshipType}"`);
        console.log(`  userId: "${example.data.userId}"`);
      });
    } else {
      console.log(`\n${LOG_PREFIX} No issues found - all relationships have valid entity values and types.`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log(`${LOG_PREFIX} SUMMARY`);
    console.log('='.repeat(60));
    console.log(`Total relationships: ${totalCount}`);
    console.log(`Analyzed: ${allRelationships.objects.length}`);
    const hasIssues =
      missingFromValue +
        missingToValue +
        missingFromType +
        missingToType +
        emptyFromValue +
        emptyToValue +
        emptyFromType +
        emptyToType >
      0;
    console.log(`Data quality: ${hasIssues ? 'ISSUES FOUND' : 'OK'}`);

    if (hasIssues) {
      console.log(`\nIssue counts:`);
      if (missingFromValue > 0) console.log(`  - ${missingFromValue} with undefined fromEntityValue`);
      if (emptyFromValue > 0) console.log(`  - ${emptyFromValue} with empty fromEntityValue`);
      if (missingToValue > 0) console.log(`  - ${missingToValue} with undefined toEntityValue`);
      if (emptyToValue > 0) console.log(`  - ${emptyToValue} with empty toEntityValue`);
      if (missingFromType > 0) console.log(`  - ${missingFromType} with undefined fromEntityType`);
      if (emptyFromType > 0) console.log(`  - ${emptyFromType} with empty fromEntityType`);
      if (missingToType > 0) console.log(`  - ${missingToType} with undefined toEntityType`);
      if (emptyToType > 0) console.log(`  - ${emptyToType} with empty toEntityType`);
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error during diagnostics:`, error);
  } finally {
    await closeWeaviateClient();
    console.log(`\n${LOG_PREFIX} Done.`);
  }
}

// Run the diagnostic
checkRelationships();
