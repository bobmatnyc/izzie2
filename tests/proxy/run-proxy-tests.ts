#!/usr/bin/env tsx
/**
 * POC-4 Proxy Authorization Test Runner
 * Runs all proxy tests and generates accuracy report
 */

import { execSync } from 'child_process';
import { globalReporter } from './utils/accuracy-reporter';
import path from 'path';
import fs from 'fs/promises';

const REPORT_DIR = path.join(process.cwd(), 'test-reports');
const REPORT_FILE = path.join(REPORT_DIR, 'proxy-test-report.json');

async function main() {
  console.log('🚀 Running POC-4 Proxy Authorization Tests\n');

  try {
    // Ensure report directory exists
    await fs.mkdir(REPORT_DIR, { recursive: true });

    // Run tests with Vitest
    console.log('Running test suite...\n');

    try {
      execSync('vitest run tests/proxy --reporter=verbose', {
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_ENV: 'test',
        },
      });
    } catch (error) {
      // Tests may fail, but we still want to generate report
      console.log('\n⚠️  Some tests failed, but continuing to generate report...\n');
    }

    // Generate and display report
    console.log('\n' + '='.repeat(80));
    console.log('GENERATING ACCURACY REPORT');
    console.log('='.repeat(80) + '\n');

    globalReporter.printReport();

    // Save JSON report
    await globalReporter.saveReport(REPORT_FILE);
    console.log(`\n📄 Full report saved to: ${REPORT_FILE}\n`);

    // Check acceptance criteria
    const meetsAcceptanceCriteria = globalReporter.meetsAcceptanceCriteria();

    if (meetsAcceptanceCriteria) {
      console.log('✅ SUCCESS: All acceptance criteria met!\n');
      process.exit(0);
    } else {
      console.log('❌ FAILURE: Acceptance criteria NOT met\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error running tests:', error);
    process.exit(1);
  }
}

main();
