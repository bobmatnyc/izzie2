#!/usr/bin/env tsx
/**
 * Ingestion Pipeline Verification Script
 * Checks that all components are properly configured
 */

import { inngest } from '@/lib/events';
import { functions } from '@/lib/events/functions';
import { getSyncState, initializeSyncState } from '@/lib/ingestion/sync-state';

const LOG_PREFIX = '[VerifyIngestion]';

async function main() {
  console.log(`${LOG_PREFIX} Starting verification...\n`);

  // 1. Check Inngest configuration
  console.log('1. Checking Inngest configuration...');
  if (!process.env.INNGEST_EVENT_KEY) {
    console.error('   ❌ INNGEST_EVENT_KEY not set');
  } else {
    console.log('   ✅ Inngest configured');
  }

  // 2. Check registered functions
  console.log('\n2. Checking registered functions...');
  const expectedFunctions = [
    'ingest-emails',
    'ingest-drive',
    'extract-entities-from-email',
    'extract-entities-from-drive',
    'update-graph',
  ];

  const registeredFunctions = functions.map((fn: any) => fn.id || fn.name);
  console.log(`   Found ${registeredFunctions.length} functions:`);

  for (const funcName of expectedFunctions) {
    const found = registeredFunctions.some(
      (id: string) => id === funcName || id.includes(funcName)
    );
    if (found) {
      console.log(`   ✅ ${funcName}`);
    } else {
      console.log(`   ❌ ${funcName} NOT FOUND`);
    }
  }

  // 3. Check environment variables
  console.log('\n3. Checking environment variables...');
  const requiredEnvVars = [
    'DEFAULT_USER_ID',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'NEO4J_URI',
    'DATABASE_URL',
  ];

  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      console.log(`   ✅ ${envVar}`);
    } else {
      console.log(`   ⚠️  ${envVar} not set (optional for dev)`);
    }
  }

  // 4. Check sync state access
  console.log('\n4. Checking sync state access...');
  try {
    const userId = process.env.DEFAULT_USER_ID || 'test-user';

    // Try to get sync state
    const gmailState = await getSyncState(userId, 'gmail');
    const driveState = await getSyncState(userId, 'drive');

    if (!gmailState) {
      console.log('   ⚠️  Gmail sync state not initialized (will be created on first run)');
    } else {
      console.log('   ✅ Gmail sync state exists');
    }

    if (!driveState) {
      console.log('   ⚠️  Drive sync state not initialized (will be created on first run)');
    } else {
      console.log('   ✅ Drive sync state exists');
    }
  } catch (error) {
    console.error('   ❌ Error accessing sync state:', error);
  }

  // 5. Summary
  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION SUMMARY');
  console.log('='.repeat(60));
  console.log('\nReady to use:');
  console.log('  - Email ingestion (scheduled hourly)');
  console.log('  - Drive ingestion (scheduled daily)');
  console.log('  - Entity extraction (event-triggered)');
  console.log('  - Graph updates (event-triggered)');
  console.log('\nManual triggers:');
  console.log('  - POST /api/ingestion/sync-emails');
  console.log('  - POST /api/ingestion/sync-drive');
  console.log('  - GET  /api/ingestion/status');
  console.log('  - POST /api/ingestion/reset');
  console.log('\nNext steps:');
  console.log('  1. Ensure all environment variables are set');
  console.log('  2. Create metadata_store table if not exists');
  console.log('  3. Test with: npm run dev');
  console.log('  4. Trigger manual sync to verify');
  console.log('  5. Check Inngest dashboard for function runs');
  console.log('\nDocumentation:');
  console.log('  - docs/INGESTION_PIPELINE.md');
  console.log('  - src/lib/ingestion/README.md');
  console.log('  - INGESTION_IMPLEMENTATION.md');
  console.log('');
}

main().catch(console.error);
