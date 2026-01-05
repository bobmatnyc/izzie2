/**
 * Test script for metrics system
 * Run with: npx tsx src/lib/metrics/test-metrics.ts
 */

import { getMetricsCollector, logger } from './index';

// Simulate classification events
function simulateClassifications() {
  const collector = getMetricsCollector();

  console.log('=== Simulating Classification Events ===\n');

  // Simulate 10 cheap tier classifications (90% success rate)
  for (let i = 0; i < 10; i++) {
    logger.metric({
      timestamp: new Date(),
      type: 'classification',
      tier: 'cheap',
      confidence: 0.85 + Math.random() * 0.1,
      latencyMs: 200 + Math.random() * 100,
      cost: 0.0001 + Math.random() * 0.0001,
      success: Math.random() > 0.1,
      metadata: {
        webhookId: `webhook-${i}`,
        source: 'github',
        category: 'CODE_REVIEW',
        cacheHit: false,
        escalated: false,
      },
    });
  }

  // Simulate 3 standard tier classifications (escalated)
  for (let i = 10; i < 13; i++) {
    logger.metric({
      timestamp: new Date(),
      type: 'classification',
      tier: 'standard',
      confidence: 0.8 + Math.random() * 0.1,
      latencyMs: 500 + Math.random() * 200,
      cost: 0.002 + Math.random() * 0.001,
      success: true,
      metadata: {
        webhookId: `webhook-${i}`,
        source: 'linear',
        category: 'ISSUE_CREATED',
        cacheHit: false,
        escalated: true,
        escalationPath: ['mistral-7b-instruct', 'anthropic/claude-3.5-sonnet'],
      },
    });
  }

  // Simulate 1 premium tier classification (fully escalated)
  logger.metric({
    timestamp: new Date(),
    type: 'classification',
    tier: 'premium',
    confidence: 0.92,
    latencyMs: 1500,
    cost: 0.015,
    success: true,
    metadata: {
      webhookId: 'webhook-13',
      source: 'google',
      category: 'CALENDAR_UPDATE',
      cacheHit: false,
      escalated: true,
      escalationPath: [
        'mistral-7b-instruct',
        'anthropic/claude-3.5-sonnet',
        'anthropic/claude-opus-4',
      ],
      escalationCount: 2,
    },
  });

  // Simulate 3 cache hits
  for (let i = 14; i < 17; i++) {
    logger.metric({
      timestamp: new Date(),
      type: 'classification',
      tier: 'cheap',
      confidence: 0.88,
      latencyMs: 5 + Math.random() * 5,
      cost: 0.0001,
      success: true,
      metadata: {
        webhookId: `webhook-${i}`,
        source: 'github',
        category: 'CODE_REVIEW',
        cacheHit: true,
        escalated: false,
      },
    });
  }

  console.log('✓ Simulated 17 classification events\n');
}

// Simulate routing events
function simulateRouting() {
  console.log('=== Simulating Routing Events ===\n');

  for (let i = 0; i < 10; i++) {
    logger.metric({
      timestamp: new Date(),
      type: 'routing',
      latencyMs: 50 + Math.random() * 50,
      success: true,
      metadata: {
        webhookId: `webhook-${i}`,
        source: 'github',
        category: 'CODE_REVIEW',
        handler: 'notifier',
        confidence: 0.85,
        hasCustomRule: false,
      },
    });
  }

  console.log('✓ Simulated 10 routing events\n');
}

// Simulate dispatch events
function simulateDispatch() {
  console.log('=== Simulating Dispatch Events ===\n');

  for (let i = 0; i < 10; i++) {
    logger.metric({
      timestamp: new Date(),
      type: 'dispatch',
      latencyMs: 100 + Math.random() * 200,
      success: Math.random() > 0.05,
      metadata: {
        handler: 'notifier',
        webhookId: `webhook-${i}`,
        source: 'github',
        category: 'CODE_REVIEW',
      },
    });
  }

  console.log('✓ Simulated 10 dispatch events\n');
}

// Display metrics
function displayMetrics() {
  const collector = getMetricsCollector();

  console.log('=== Classification Metrics (Summary) ===\n');
  const metrics = collector.getMetrics();
  console.log(JSON.stringify(metrics, null, 2));

  console.log('\n=== POC Success Metrics ===\n');
  const pocMetrics = collector.getPOCMetrics();
  console.log(JSON.stringify(pocMetrics, null, 2));

  console.log('\n=== Detailed Metrics ===\n');
  const detailedMetrics = collector.getDetailedMetrics();
  console.log(JSON.stringify(detailedMetrics, null, 2));

  console.log('\n=== Recent Events (Last 5) ===\n');
  const recentEvents = collector.getRecentEvents(5);
  console.log(JSON.stringify(recentEvents, null, 2));
}

// Run test
async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   Metrics System Test                 ║');
  console.log('╚════════════════════════════════════════╝\n');

  simulateClassifications();
  simulateRouting();
  simulateDispatch();
  displayMetrics();

  console.log('\n✓ Test completed successfully!');
}

main().catch(console.error);
