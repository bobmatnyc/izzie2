#!/usr/bin/env tsx
/**
 * Model Evaluation Script for Izzie
 *
 * Tests different models on standardized prompts to compare:
 * - Response quality (self-awareness, reasoning, tool use)
 * - Response time (latency)
 * - Token usage
 * - Cost per request
 *
 * Usage:
 *   pnpm eval:models              # Run all tests
 *   pnpm eval:models --verbose    # Show full responses
 *   pnpm eval:models --model sonnet-4.5  # Test specific model
 */

import 'dotenv/config';
import { getAIClient } from '../src/lib/ai/client';
import { MODELS, MODEL_COSTS, estimateCost, type ModelId } from '../src/lib/ai/models';
import { BUILD_INFO } from '../src/lib/build-info';
import * as fs from 'fs';
import * as path from 'path';

// Ensure dev-only
if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: This script should only run in development mode');
  process.exit(1);
}

// ============================================================================
// Test Configuration
// ============================================================================

interface TestCase {
  category: 'self-awareness' | 'reasoning' | 'capabilities' | 'context';
  name: string;
  systemPrompt: string;
  userPrompt: string;
  expectedContains: string[];
  weight: number; // Importance weight for scoring
}

const IZZIE_SYSTEM_PROMPT = `You are Izzie, a personal AI assistant.

## About Me (Izzie v${BUILD_INFO.version})

**My Identity:**
- Name: Izzie
- Version: ${BUILD_INFO.version}
- Build: ${BUILD_INFO.gitHash} (${BUILD_INFO.gitBranch})
- A personal AI assistant with memory and context awareness

**Important:** When asked "what version are you?", I respond with my version number (${BUILD_INFO.version}). I am NOT just Claude - I am Izzie, a specialized personal AI assistant.

### What I Can Do
- Email Management: Read, archive, label, draft, send emails
- Task Management: Create, complete, list tasks
- GitHub: List, create, update issues and comments
- Calendar: View and manage calendar events
- Memory: Remember preferences and past conversations

Keep responses concise and helpful.`;

const TEST_CASES: TestCase[] = [
  {
    category: 'self-awareness',
    name: 'Version Question',
    systemPrompt: IZZIE_SYSTEM_PROMPT,
    userPrompt: 'What version are you?',
    expectedContains: ['Izzie', BUILD_INFO.version],
    weight: 1.0,
  },
  {
    category: 'self-awareness',
    name: 'Identity Question',
    systemPrompt: IZZIE_SYSTEM_PROMPT,
    userPrompt: 'Who are you? Tell me about yourself.',
    expectedContains: ['Izzie', 'assistant', 'email', 'task'],
    weight: 1.0,
  },
  {
    category: 'capabilities',
    name: 'Capabilities Question',
    systemPrompt: IZZIE_SYSTEM_PROMPT,
    userPrompt: 'What can you help me with?',
    expectedContains: ['email', 'task', 'calendar'],
    weight: 0.8,
  },
  {
    category: 'reasoning',
    name: 'Schedule Conflict',
    systemPrompt: IZZIE_SYSTEM_PROMPT,
    userPrompt:
      'I have a meeting at 2pm but also need to pick up my kids at 2:30pm and the school is 45 minutes away. What should I do?',
    expectedContains: ['reschedule', 'conflict', 'leave'],
    weight: 1.0,
  },
  {
    category: 'reasoning',
    name: 'Priority Decision',
    systemPrompt: IZZIE_SYSTEM_PROMPT,
    userPrompt:
      'I have 3 tasks: urgent bug fix (due today), prepare presentation (due tomorrow), respond to client email (no deadline). How should I prioritize?',
    expectedContains: ['bug', 'urgent', 'first', 'presentation'],
    weight: 0.8,
  },
  {
    category: 'context',
    name: 'Context Awareness',
    systemPrompt:
      IZZIE_SYSTEM_PROMPT +
      '\n\n**User Context:**\n- Name: Masa\n- Prefers short responses\n- Works at TechCorp',
    userPrompt: 'What do you know about me?',
    expectedContains: ['Masa', 'TechCorp'],
    weight: 0.9,
  },
];

// Models to evaluate
const EVAL_MODELS: ModelId[] = [
  'anthropic/claude-haiku-4.5',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-opus-4',
  'anthropic/claude-opus-4.5',
];

// ============================================================================
// Evaluation Logic
// ============================================================================

interface EvalResult {
  model: ModelId;
  testCase: string;
  category: string;
  response: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  score: number; // 0-1 based on expectedContains matches
  passed: boolean;
}

interface ModelSummary {
  model: ModelId;
  avgLatencyMs: number;
  totalCostUsd: number;
  avgScore: number;
  categoryScores: Record<string, number>;
  passRate: number;
}

function scoreResponse(response: string, expectedContains: string[]): number {
  const lowerResponse = response.toLowerCase();
  const matches = expectedContains.filter((term) => lowerResponse.includes(term.toLowerCase()));
  return matches.length / expectedContains.length;
}

async function runTest(model: ModelId, testCase: TestCase): Promise<EvalResult> {
  const aiClient = getAIClient();

  const startTime = Date.now();

  try {
    const response = await aiClient.chat(
      [
        { role: 'system', content: testCase.systemPrompt },
        { role: 'user', content: testCase.userPrompt },
      ],
      {
        model,
        temperature: 0.7,
        maxTokens: 500,
      }
    );

    const latencyMs = Date.now() - startTime;
    const inputTokens = response.usage?.promptTokens || 0;
    const outputTokens = response.usage?.completionTokens || 0;
    const costUsd = estimateCost(model, inputTokens, outputTokens);
    const score = scoreResponse(response.content, testCase.expectedContains);

    return {
      model,
      testCase: testCase.name,
      category: testCase.category,
      response: response.content,
      latencyMs,
      inputTokens,
      outputTokens,
      costUsd,
      score,
      passed: score >= 0.5,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return {
      model,
      testCase: testCase.name,
      category: testCase.category,
      response: `ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`,
      latencyMs,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      score: 0,
      passed: false,
    };
  }
}

function summarizeResults(results: EvalResult[]): ModelSummary[] {
  const modelResults = new Map<ModelId, EvalResult[]>();

  for (const result of results) {
    if (!modelResults.has(result.model)) {
      modelResults.set(result.model, []);
    }
    modelResults.get(result.model)!.push(result);
  }

  const summaries: ModelSummary[] = [];

  for (const [model, modelResultList] of modelResults) {
    const avgLatencyMs =
      modelResultList.reduce((sum, r) => sum + r.latencyMs, 0) / modelResultList.length;
    const totalCostUsd = modelResultList.reduce((sum, r) => sum + r.costUsd, 0);
    const avgScore = modelResultList.reduce((sum, r) => sum + r.score, 0) / modelResultList.length;
    const passRate = modelResultList.filter((r) => r.passed).length / modelResultList.length;

    // Category scores
    const categoryScores: Record<string, number> = {};
    const categories = [...new Set(modelResultList.map((r) => r.category))];
    for (const category of categories) {
      const categoryResults = modelResultList.filter((r) => r.category === category);
      categoryScores[category] =
        categoryResults.reduce((sum, r) => sum + r.score, 0) / categoryResults.length;
    }

    summaries.push({
      model,
      avgLatencyMs,
      totalCostUsd,
      avgScore,
      categoryScores,
      passRate,
    });
  }

  return summaries.sort((a, b) => b.avgScore - a.avgScore);
}

function formatMarkdownReport(results: EvalResult[], summaries: ModelSummary[]): string {
  const now = new Date().toISOString().split('T')[0];

  let report = `# Izzie Model Evaluation Results

**Date:** ${now}
**Build:** ${BUILD_INFO.version} (${BUILD_INFO.gitHash})
**Tests:** ${TEST_CASES.length} test cases across ${EVAL_MODELS.length} models

## Summary

| Model | Avg Latency | Total Cost | Self-Aware | Reasoning | Capabilities | Context | Pass Rate |
|-------|-------------|------------|------------|-----------|--------------|---------|-----------|
`;

  for (const summary of summaries) {
    const shortName = summary.model.replace('anthropic/', '');
    const selfAware = summary.categoryScores['self-awareness'] || 0;
    const reasoning = summary.categoryScores['reasoning'] || 0;
    const capabilities = summary.categoryScores['capabilities'] || 0;
    const context = summary.categoryScores['context'] || 0;

    const emoji = (score: number) => (score >= 0.8 ? '✅' : score >= 0.5 ? '⚠️' : '❌');

    report += `| ${shortName} | ${summary.avgLatencyMs.toFixed(0)}ms | $${summary.totalCostUsd.toFixed(4)} | ${emoji(selfAware)} ${(selfAware * 100).toFixed(0)}% | ${emoji(reasoning)} ${(reasoning * 100).toFixed(0)}% | ${emoji(capabilities)} ${(capabilities * 100).toFixed(0)}% | ${emoji(context)} ${(context * 100).toFixed(0)}% | ${(summary.passRate * 100).toFixed(0)}% |\n`;
  }

  // Recommendation
  const best = summaries[0];
  const costEfficient = summaries.reduce((a, b) =>
    a.avgScore / a.totalCostUsd > b.avgScore / b.totalCostUsd ? a : b
  );

  report += `
## Recommendation

- **Best Quality:** \`${best.model}\` (${(best.avgScore * 100).toFixed(0)}% score)
- **Best Cost/Quality:** \`${costEfficient.model}\` (${(costEfficient.avgScore * 100).toFixed(0)}% score, $${costEfficient.totalCostUsd.toFixed(4)})

## Detailed Results

`;

  // Group by test case
  for (const testCase of TEST_CASES) {
    report += `### ${testCase.name} (${testCase.category})\n\n`;
    report += `**Prompt:** "${testCase.userPrompt}"\n\n`;
    report += `| Model | Score | Latency | Response (truncated) |\n`;
    report += `|-------|-------|---------|----------------------|\n`;

    for (const result of results.filter((r) => r.testCase === testCase.name)) {
      const shortName = result.model.replace('anthropic/', '');
      const truncated = result.response.slice(0, 80).replace(/\n/g, ' ') + '...';
      report += `| ${shortName} | ${(result.score * 100).toFixed(0)}% | ${result.latencyMs}ms | ${truncated} |\n`;
    }
    report += '\n';
  }

  return report;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const specificModel = args.find((a) => a.startsWith('--model='))?.split('=')[1];

  console.log('🧪 Izzie Model Evaluation');
  console.log(`   Build: ${BUILD_INFO.version} (${BUILD_INFO.gitHash})`);
  console.log(`   Tests: ${TEST_CASES.length} test cases`);
  console.log('');

  const modelsToTest = specificModel
    ? EVAL_MODELS.filter((m) => m.includes(specificModel))
    : EVAL_MODELS;

  if (modelsToTest.length === 0) {
    console.error(`No models matched: ${specificModel}`);
    process.exit(1);
  }

  console.log(`   Models: ${modelsToTest.map((m) => m.replace('anthropic/', '')).join(', ')}`);
  console.log('');

  const results: EvalResult[] = [];

  for (const model of modelsToTest) {
    const shortName = model.replace('anthropic/', '');
    console.log(`\n📊 Testing ${shortName}...`);

    for (const testCase of TEST_CASES) {
      process.stdout.write(`   ${testCase.name}... `);

      const result = await runTest(model, testCase);
      results.push(result);

      const emoji = result.passed ? '✅' : '❌';
      console.log(`${emoji} ${(result.score * 100).toFixed(0)}% (${result.latencyMs}ms)`);

      if (verbose) {
        console.log(`      Response: ${result.response.slice(0, 100)}...`);
      }

      // Rate limiting between calls
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Generate summary
  const summaries = summarizeResults(results);

  console.log('\n' + '='.repeat(60));
  console.log('📈 SUMMARY');
  console.log('='.repeat(60));

  for (const summary of summaries) {
    const shortName = summary.model.replace('anthropic/', '');
    console.log(`\n${shortName}:`);
    console.log(`   Score: ${(summary.avgScore * 100).toFixed(0)}%`);
    console.log(`   Latency: ${summary.avgLatencyMs.toFixed(0)}ms avg`);
    console.log(`   Cost: $${summary.totalCostUsd.toFixed(4)}`);
    console.log(`   Pass Rate: ${(summary.passRate * 100).toFixed(0)}%`);
  }

  // Save detailed report
  const outputDir = path.join(__dirname, 'eval-results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const report = formatMarkdownReport(results, summaries);
  const reportPath = path.join(outputDir, `eval-${new Date().toISOString().split('T')[0]}.md`);
  fs.writeFileSync(reportPath, report);
  console.log(`\n📄 Detailed report saved to: ${reportPath}`);

  // Save raw JSON for analysis
  const jsonPath = path.join(outputDir, `eval-${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ results, summaries }, null, 2));
  console.log(`📄 Raw data saved to: ${jsonPath}`);
}

main().catch((error) => {
  console.error('Eval failed:', error);
  process.exit(1);
});
