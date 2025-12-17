#!/usr/bin/env node

/**
 * E2E Test Suite for AI Proposal Generator
 * Tests all critical fixes and ensures no regression
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name, passed, details = '') {
  const icon = passed ? '✓' : '✗';
  const color = passed ? 'green' : 'red';
  log(`  ${icon} ${name}`, color);
  if (details) {
    log(`    ${details}`, 'cyan');
  }
}

class E2ETestSuite {
  constructor() {
    this.testResults = [];
    this.auditPath = path.join(projectRoot, 'samples', 'sample_audit.json');
    this.outputDir = path.join(projectRoot, 'test_output');
    // Will be set after generation with auto-generated filename
    this.outputHtml = null;
    this.outputJson = null;
  }

  /**
   * Run all E2E tests
   */
  async runAll() {
    log('\n=== AI Proposal Generator E2E Tests ===\n', 'blue');

    try {
      // Ensure test output directory exists
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      // Test 1: Pre-flight checks
      await this.testPreflightChecks();

      // Test 2: Generate proposal
      await this.testGenerateProposal();

      // Test 3: Validate fixes
      await this.testAllFixes();

      // Test 4: Schema validation
      await this.testSchemaValidation();

      // Print summary
      this.printSummary();

      // Exit with appropriate code
      const failed = this.testResults.filter(r => !r.passed).length;
      process.exit(failed > 0 ? 1 : 0);

    } catch (error) {
      log(`\n✗ Test suite failed with error: ${error.message}`, 'red');
      console.error(error);
      process.exit(1);
    }
  }

  /**
   * Test 1: Pre-flight environment checks
   */
  async testPreflightChecks() {
    log('Test 1: Pre-flight Checks', 'yellow');

    // Check API key
    const hasGemini = !!process.env.GEMINI_API_KEY;
    const hasGroq = !!process.env.GROQ_API_KEY;
    const hasApiKey = hasGemini || hasGroq;
    const apiType = hasGemini ? 'Gemini' : hasGroq ? 'Groq' : 'None';
    this.recordTest('API key configured', hasApiKey, `Using: ${apiType}`);

    // Check audit file exists
    const auditExists = fs.existsSync(this.auditPath);
    this.recordTest('Sample audit file exists', auditExists, this.auditPath);

    // Check template exists
    const templatePath = path.join(projectRoot, 'templates', 'proposal_template.html');
    const templateExists = fs.existsSync(templatePath);
    this.recordTest('Proposal template exists', templateExists);

    console.log('');
  }

  /**
   * Test 2: Generate proposal
   */
  async testGenerateProposal() {
    log('Test 2: Proposal Generation', 'yellow');

    const cliPath = path.join(projectRoot, 'cli.js');
    const useGroq = process.env.GROQ_API_KEY ? '--use-groq' : '';

    // Pass ONLY directory to force auto-generated slugified filename
    const command = `node "${cliPath}" generate "${this.auditPath}" "${this.outputDir}/" --save-json --skip-pdf ${useGroq}`;

    log(`  Running: ${command}`, 'cyan');

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: projectRoot,
        timeout: 180000, // 3 minute timeout
        env: { ...process.env }
      });

      // Parse stdout to find generated filename
      // Look for "HTML: test_output/proposal_....html"
      const htmlMatch = stdout.match(/HTML:\s+(.+\.html)/);
      const jsonMatch = stdout.match(/JSON:\s+(.+\.json)/);

      if (htmlMatch) {
        const htmlPath = htmlMatch[1].trim();
        // If path is already absolute, use it; otherwise join with projectRoot
        this.outputHtml = path.isAbsolute(htmlPath) ? htmlPath : path.join(projectRoot, htmlPath);
      }
      if (jsonMatch) {
        const jsonPath = jsonMatch[1].trim();
        this.outputJson = path.isAbsolute(jsonPath) ? jsonPath : path.join(projectRoot, jsonPath);
      }

      const htmlExists = this.outputHtml && fs.existsSync(this.outputHtml);
      const jsonExists = this.outputJson && fs.existsSync(this.outputJson);

      this.recordTest('HTML output generated', htmlExists, this.outputHtml || 'Not found in output');
      this.recordTest('JSON output generated', jsonExists, this.outputJson || 'Not found in output');

      if (htmlExists) {
        const basename = path.basename(this.outputHtml);
        const isSlugified = /^proposal_[a-z0-9_]+_\d{4}-\d{2}-\d{2}_\d{6}\.html$/.test(basename);
        this.recordTest('Filename is slugified + timestamped', isSlugified, basename);
      }

      if (stderr && !stderr.includes('Validation warnings')) {
        log(`  Warning output: ${stderr}`, 'yellow');
      }

    } catch (error) {
      this.recordTest('Proposal generation', false, error.message);
    }

    console.log('');
  }

  /**
   * Test 3: Validate all critical fixes
   */
  async testAllFixes() {
    log('Test 3: Critical Fix Validation', 'yellow');

    if (!fs.existsSync(this.outputHtml)) {
      log('  Skipping - HTML file not found', 'yellow');
      console.log('');
      return;
    }

    const html = fs.readFileSync(this.outputHtml, 'utf8');
    const json = JSON.parse(fs.readFileSync(this.outputJson, 'utf8'));

    // Fix #1: No truncated text (check for ellipsis)
    const hasTruncation = html.includes('...');
    this.recordTest(
      'Fix #1: No truncated text fields',
      !hasTruncation,
      hasTruncation ? 'Found "..." in output' : 'No truncation detected'
    );

    // Fix #2: Milestone amounts hidden (should use colspan="2")
    const hasColspan = html.includes('colspan="2"');
    const hasIndividualMilestoneAmounts = html.match(/<tr[^>]*>\s*<td><strong>Milestone[^<]*<\/strong><\/td>\s*<td class="amount">/);
    this.recordTest(
      'Fix #2: Individual milestone amounts hidden',
      hasColspan && !hasIndividualMilestoneAmounts,
      hasColspan ? 'Using colspan for milestone rows' : 'Milestone amounts still showing'
    );

    // Fix #3: Retainer labeled as Phase 3: Scale
    const hasPhase3Label = html.includes('Phase 3: Scale');
    const hasRetainerAfterBreadcrumb = this.checkRetainerPosition(html);
    this.recordTest(
      'Fix #3: Retainer labeled as Phase 3: Scale',
      hasPhase3Label && hasRetainerAfterBreadcrumb,
      hasPhase3Label ? 'Phase 3 label found' : 'Missing Phase 3 label'
    );

    // Fix #4: Continuous improvements mentioned
    const hasContinuousImprovements = html.includes('continuous improvements');
    this.recordTest(
      'Fix #4: Retainer mentions continuous improvements',
      hasContinuousImprovements,
      hasContinuousImprovements ? 'Found in retainer description' : 'Missing from description'
    );

    // Fix #5: No Calendly link (secondary CTA removed)
    const hasCalendlyLink = html.includes('calendly') || html.includes('schedule a call');
    this.recordTest(
      'Fix #5: Calendly link removed',
      !hasCalendlyLink,
      hasCalendlyLink ? 'Found Calendly reference' : 'No Calendly link found'
    );

    // Fix #6: CTA box doesn't overflow (check spacing values)
    const hasTightCTASpacing = this.checkCTASpacing(html);
    this.recordTest(
      'Fix #6: CTA spacing optimized',
      hasTightCTASpacing,
      hasTightCTASpacing ? 'Reduced spacing detected' : 'May have overflow issues'
    );

    // Additional validation: Executive summary length
    const execSummary = json.executive_summary?.body || '';
    const valueProps = json.executive_summary?.value_proposition || '';
    this.recordTest(
      'Executive summary generated',
      execSummary.length > 100,
      `${execSummary.length} characters`
    );
    this.recordTest(
      'Value proposition generated',
      valueProps.length > 50,
      `${valueProps.length} characters`
    );

    console.log('');
  }

  /**
   * Test 4: Schema validation
   */
  async testSchemaValidation() {
    log('Test 4: Schema Validation', 'yellow');

    if (!fs.existsSync(this.outputJson)) {
      log('  Skipping - JSON file not found', 'yellow');
      console.log('');
      return;
    }

    const cliPath = path.join(projectRoot, 'cli.js');
    const command = `node "${cliPath}" validate "${this.outputJson}"`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: projectRoot,
        timeout: 10000
      });

      const isValid = stdout.includes('valid') || !stdout.includes('Error');
      this.recordTest('Proposal passes schema validation', isValid, stdout.trim());

    } catch (error) {
      // Validation command might exit with error code on warnings
      const hasErrors = error.stdout?.includes('Error') || false;
      this.recordTest('Schema validation', !hasErrors, error.stdout || error.message);
    }

    console.log('');
  }

  /**
   * Check if retainer appears after phase breadcrumb
   */
  checkRetainerPosition(html) {
    // Find the actual HTML elements, not the CSS classes
    // Look for the opening div tag with the class
    const breadcrumbIndex = html.indexOf('<div class="phase-breadcrumb">');
    const retainerIndex = html.indexOf('<div class="optional-retainer">');
    return retainerIndex > breadcrumbIndex && retainerIndex > 0 && breadcrumbIndex > 0;
  }

  /**
   * Check if CTA has tight spacing
   */
  checkCTASpacing(html) {
    // Check for reduced padding in CTA section
    const hasTightPadding = html.includes('padding: 0.08in') || html.includes('padding: 0.06in');
    // Check that we're not using large spacing
    const hasLargePadding = html.match(/\.cta-[^{]*{\s*[^}]*padding:\s*0\.1[2-9]in/);
    return hasTightPadding && !hasLargePadding;
  }

  /**
   * Record test result
   */
  recordTest(name, passed, details = '') {
    this.testResults.push({ name, passed, details });
    logTest(name, passed, details);
  }

  /**
   * Print test summary
   */
  printSummary() {
    const total = this.testResults.length;
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = total - passed;

    log('\n=== Test Summary ===\n', 'blue');
    log(`Total: ${total}`, 'cyan');
    log(`Passed: ${passed}`, 'green');
    log(`Failed: ${failed}`, failed > 0 ? 'red' : 'green');

    const percentage = ((passed / total) * 100).toFixed(1);
    log(`\nSuccess Rate: ${percentage}%\n`, percentage === '100.0' ? 'green' : 'yellow');

    if (failed > 0) {
      log('Failed Tests:', 'red');
      this.testResults
        .filter(r => !r.passed)
        .forEach(r => log(`  ✗ ${r.name}: ${r.details}`, 'red'));
      console.log('');
    }
  }
}

// Run tests
const suite = new E2ETestSuite();
suite.runAll();
