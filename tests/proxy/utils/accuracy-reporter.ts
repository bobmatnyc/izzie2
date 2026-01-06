/**
 * Accuracy Reporter for POC-4 Proxy Tests
 * Tracks test results and calculates accuracy metrics
 */

export interface TestResult {
  testName: string;
  scenario: string;
  persona: string;
  actionClass: string;
  confidence: number;
  expectedOutcome: 'authorized' | 'denied' | 'error';
  actualOutcome: 'authorized' | 'denied' | 'error';
  correct: boolean;
  isFalsePositive: boolean; // Action authorized when it shouldn't be
  isFalseNegative: boolean; // Action denied when it should succeed
  reason?: string;
  duration: number;
}

export interface AccuracyReport {
  totalTests: number;
  passed: number;
  failed: number;
  accuracy: number;
  falsePositives: number;
  falseNegatives: number;
  byPersona: Record<
    string,
    {
      total: number;
      correct: number;
      accuracy: number;
    }
  >;
  byActionClass: Record<
    string,
    {
      total: number;
      correct: number;
      accuracy: number;
    }
  >;
  results: TestResult[];
  timestamp: string;
}

export class AccuracyReporter {
  private results: TestResult[] = [];

  /**
   * Add a test result
   */
  addResult(result: TestResult) {
    this.results.push(result);
  }

  /**
   * Record a test execution
   */
  recordTest(
    testName: string,
    scenario: string,
    persona: string,
    actionClass: string,
    confidence: number,
    expected: 'authorized' | 'denied' | 'error',
    actual: 'authorized' | 'denied' | 'error',
    reason?: string,
    duration?: number
  ): TestResult {
    const correct = expected === actual;
    const isFalsePositive = expected === 'denied' && actual === 'authorized';
    const isFalseNegative = expected === 'authorized' && actual === 'denied';

    const result: TestResult = {
      testName,
      scenario,
      persona,
      actionClass,
      confidence,
      expectedOutcome: expected,
      actualOutcome: actual,
      correct,
      isFalsePositive,
      isFalseNegative,
      reason,
      duration: duration || 0,
    };

    this.addResult(result);
    return result;
  }

  /**
   * Generate accuracy report
   */
  generateReport(): AccuracyReport {
    const totalTests = this.results.length;
    const passed = this.results.filter((r) => r.correct).length;
    const failed = totalTests - passed;
    const accuracy = totalTests > 0 ? (passed / totalTests) * 100 : 0;

    const falsePositives = this.results.filter((r) => r.isFalsePositive).length;
    const falseNegatives = this.results.filter((r) => r.isFalseNegative).length;

    // Group by persona
    const byPersona: Record<string, { total: number; correct: number; accuracy: number }> = {};
    this.results.forEach((r) => {
      if (!byPersona[r.persona]) {
        byPersona[r.persona] = { total: 0, correct: 0, accuracy: 0 };
      }
      byPersona[r.persona].total++;
      if (r.correct) byPersona[r.persona].correct++;
    });

    Object.keys(byPersona).forEach((persona) => {
      const stats = byPersona[persona];
      stats.accuracy = (stats.correct / stats.total) * 100;
    });

    // Group by action class
    const byActionClass: Record<string, { total: number; correct: number; accuracy: number }> = {};
    this.results.forEach((r) => {
      if (!byActionClass[r.actionClass]) {
        byActionClass[r.actionClass] = { total: 0, correct: 0, accuracy: 0 };
      }
      byActionClass[r.actionClass].total++;
      if (r.correct) byActionClass[r.actionClass].correct++;
    });

    Object.keys(byActionClass).forEach((actionClass) => {
      const stats = byActionClass[actionClass];
      stats.accuracy = (stats.correct / stats.total) * 100;
    });

    return {
      totalTests,
      passed,
      failed,
      accuracy: Math.round(accuracy * 100) / 100,
      falsePositives,
      falseNegatives,
      byPersona,
      byActionClass,
      results: this.results,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Print report to console
   */
  printReport() {
    const report = this.generateReport();

    console.log('\n' + '='.repeat(80));
    console.log('POC-4 PROXY AUTHORIZATION TEST REPORT');
    console.log('='.repeat(80));
    console.log(`\nTimestamp: ${report.timestamp}`);
    console.log(`\nTotal Tests: ${report.totalTests}`);
    console.log(`Passed: ${report.passed} (${report.accuracy.toFixed(2)}%)`);
    console.log(`Failed: ${report.failed}`);

    // Critical metrics
    console.log('\n' + '-'.repeat(80));
    console.log('CRITICAL METRICS');
    console.log('-'.repeat(80));
    console.log(`False Positives: ${report.falsePositives} (MUST BE 0)`);
    console.log(`False Negatives: ${report.falseNegatives}`);
    console.log(`Accuracy: ${report.accuracy.toFixed(2)}% (TARGET: ≥95%)`);

    // Pass/Fail criteria
    const meetsAccuracyTarget = report.accuracy >= 95;
    const noFalsePositives = report.falsePositives === 0;

    console.log('\n' + '-'.repeat(80));
    console.log('ACCEPTANCE CRITERIA');
    console.log('-'.repeat(80));
    console.log(`✓ Accuracy ≥95%: ${meetsAccuracyTarget ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`✓ Zero false positives: ${noFalsePositives ? '✅ PASS' : '❌ FAIL'}`);

    // By persona
    console.log('\n' + '-'.repeat(80));
    console.log('ACCURACY BY PERSONA');
    console.log('-'.repeat(80));
    Object.entries(report.byPersona)
      .sort(([, a], [, b]) => b.accuracy - a.accuracy)
      .forEach(([persona, stats]) => {
        console.log(
          `${persona.padEnd(25)} ${stats.correct}/${stats.total} (${stats.accuracy.toFixed(1)}%)`
        );
      });

    // By action class
    console.log('\n' + '-'.repeat(80));
    console.log('ACCURACY BY ACTION CLASS');
    console.log('-'.repeat(80));
    Object.entries(report.byActionClass)
      .sort(([, a], [, b]) => b.accuracy - a.accuracy)
      .forEach(([actionClass, stats]) => {
        console.log(
          `${actionClass.padEnd(30)} ${stats.correct}/${stats.total} (${stats.accuracy.toFixed(1)}%)`
        );
      });

    // False positives detail (CRITICAL)
    if (report.falsePositives > 0) {
      console.log('\n' + '-'.repeat(80));
      console.log('⚠️  FALSE POSITIVES (ACTIONS AUTHORIZED WHEN THEY SHOULD NOT BE)');
      console.log('-'.repeat(80));
      report.results
        .filter((r) => r.isFalsePositive)
        .forEach((r, i) => {
          console.log(`${i + 1}. ${r.testName}`);
          console.log(`   Scenario: ${r.scenario}`);
          console.log(`   Persona: ${r.persona}`);
          console.log(`   Action: ${r.actionClass}`);
          console.log(`   Confidence: ${r.confidence}`);
          console.log(`   Reason: ${r.reason || 'N/A'}`);
          console.log();
        });
    }

    // False negatives detail
    if (report.falseNegatives > 0) {
      console.log('\n' + '-'.repeat(80));
      console.log('FALSE NEGATIVES (ACTIONS DENIED WHEN THEY SHOULD SUCCEED)');
      console.log('-'.repeat(80));
      report.results
        .filter((r) => r.isFalseNegative)
        .forEach((r, i) => {
          console.log(`${i + 1}. ${r.testName}`);
          console.log(`   Scenario: ${r.scenario}`);
          console.log(`   Persona: ${r.persona}`);
          console.log(`   Action: ${r.actionClass}`);
          console.log(`   Confidence: ${r.confidence}`);
          console.log(`   Reason: ${r.reason || 'N/A'}`);
          console.log();
        });
    }

    console.log('='.repeat(80));
    console.log();

    // Final verdict
    if (meetsAccuracyTarget && noFalsePositives) {
      console.log('✅ ALL ACCEPTANCE CRITERIA MET');
    } else {
      console.log('❌ ACCEPTANCE CRITERIA NOT MET');
      if (!noFalsePositives) {
        console.log('   - False positives detected (CRITICAL)');
      }
      if (!meetsAccuracyTarget) {
        console.log('   - Accuracy below 95% target');
      }
    }
    console.log();
  }

  /**
   * Export report as JSON
   */
  exportJSON(): string {
    return JSON.stringify(this.generateReport(), null, 2);
  }

  /**
   * Save report to file
   */
  async saveReport(filepath: string) {
    const fs = await import('fs/promises');
    await fs.writeFile(filepath, this.exportJSON());
  }

  /**
   * Check if acceptance criteria are met
   */
  meetsAcceptanceCriteria(): boolean {
    const report = this.generateReport();
    return report.accuracy >= 95 && report.falsePositives === 0;
  }

  /**
   * Reset reporter
   */
  reset() {
    this.results = [];
  }
}

/**
 * Global reporter instance
 */
export const globalReporter = new AccuracyReporter();
