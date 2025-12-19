/**
 * Test helper utilities for Wranngle Proposal Generator
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load a fixture file from the fixtures directory
 * @param {string} filename - Name of the fixture file
 * @returns {Object} Parsed JSON content
 */
export function loadFixture(filename) {
  const fixturePath = path.join(__dirname, '../fixtures', filename);
  const content = fs.readFileSync(fixturePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Create a mock audit report with optional overrides
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock audit report
 */
export function createMockAudit(overrides = {}) {
  const baseAudit = {
    assessment_metadata: {
      assessment_id: 'test-audit-001',
      assessment_date: '2024-12-01',
      assessment_type: 'AI Process Audit',
      version: '1.0.0',
      ...(overrides.assessment_metadata || {})
    },
    client_info: {
      account_name: 'Test Client',
      industry: 'Manufacturing',
      company_size: 'medium',
      primary_contact: 'Test User',
      contact_email: 'test@example.com',
      ...(overrides.client_info || {})
    },
    workflow_analyzed: overrides.workflow_analyzed || 'Invoice Processing',
    findings: overrides.findings || [
      {
        finding_id: 'find-001',
        title: 'Sample Finding',
        severity: 'high',
        complexity: 'moderate',
        description: 'Sample finding description',
        estimated_hours: 16,
        systems_involved: ['System A', 'System B'],
        revenue_bleed_monthly: 2000
      }
    ],
    revenue_bleed: {
      monthly: 2000,
      annual: 24000,
      calculation_basis: 'Test calculation',
      ...(overrides.revenue_bleed || {})
    },
    systems_inventory: overrides.systems_inventory || [
      { system_name: 'System A', system_type: 'ERP', integration_capability: 'API' },
      { system_name: 'System B', system_type: 'CRM', integration_capability: 'API' }
    ],
    recommendations: overrides.recommendations || {
      primary: 'Test recommendation',
      secondary: ['Secondary recommendation']
    }
  };

  return { ...baseAudit, ...overrides };
}

/**
 * Create a mock pricing configuration
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock pricing config
 */
export function createMockPricingConfig(overrides = {}) {
  return {
    hourly_rates: {
      automation_specialist: 125,
      integration_developer: 150,
      senior_engineer: 175,
      project_management: 100,
      ...(overrides.hourly_rates || {})
    },
    minimum_project_cost: overrides.minimum_project_cost || 5000,
    complexity_multipliers: {
      trivial: 0.8,
      moderate: 1.0,
      complex: 1.3,
      critical: 1.5,
      ...(overrides.complexity_multipliers || {})
    },
    system_count_multipliers: {
      '1-2': 1.0,
      '3-5': 1.15,
      '6-10': 1.3,
      '10+': 1.5,
      ...(overrides.system_count_multipliers || {})
    },
    ...overrides
  };
}

/**
 * Create a mock pricing result
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock pricing result
 */
export function createMockPricing(overrides = {}) {
  return {
    total: overrides.total || 15000,
    breakdown: {
      base_cost: 12000,
      complexity_adjustment: 2400,
      system_adjustment: 600,
      ...(overrides.breakdown || {})
    },
    milestones: overrides.milestones || {
      design: { amount: 3000, percentage: 20 },
      build: { amount: 6750, percentage: 45 },
      test: { amount: 2250, percentage: 15 },
      deploy: { amount: 3000, percentage: 20 }
    },
    roi: overrides.roi || {
      monthly_recovery: 4500,
      annual_recovery: 54000,
      payback_months: 3.3
    }
  };
}

/**
 * Create a mock proposal object
 * @param {Object} overrides - Properties to override
 * @returns {Object} Mock proposal
 */
export function createMockProposal(overrides = {}) {
  return {
    assessment_metadata: {
      proposal_id: 'prop-001',
      generated_date: '2024-12-01',
      valid_until: '2024-12-15',
      ...(overrides.assessment_metadata || {})
    },
    prepared_for: {
      account_name: 'Test Client',
      industry: 'Manufacturing',
      contact_name: 'Test User',
      ...(overrides.prepared_for || {})
    },
    executive_summary: {
      body: 'Test executive summary',
      value_proposition: 'Test value proposition',
      ...(overrides.executive_summary || {})
    },
    phases: overrides.phases || [
      { phase_number: 1, name: 'Audit', state: 'completed' },
      {
        phase_number: 2,
        name: 'Stabilize',
        state: 'proposed',
        milestones: [
          { number: '2.1', name: 'Design', price: 3000, percentage: 20 },
          { number: '2.2', name: 'Build', price: 6750, percentage: 45 },
          { number: '2.3', name: 'Test', price: 2250, percentage: 15 },
          { number: '2.4', name: 'Deploy', price: 3000, percentage: 20 }
        ]
      },
      { phase_number: 3, name: 'Scale', state: 'future' }
    ],
    pricing: {
      total: { amount: 15000, display: '$15,000' },
      ...(overrides.pricing || {})
    },
    scope: {
      in_scope: ['Item 1', 'Item 2'],
      out_of_scope: ['Exclusion 1'],
      assumptions: ['Assumption 1'],
      ...(overrides.scope || {})
    },
    cta: {
      headline: 'Approve this proposal',
      subtext: 'Valid until December 15, 2024',
      ...(overrides.cta || {})
    },
    ...overrides
  };
}

/**
 * Assert that a proposal object has all required fields
 * @param {Object} proposal - Proposal to validate
 */
export function assertValidProposal(proposal) {
  // Required top-level fields
  expect(proposal).toHaveProperty('assessment_metadata');
  expect(proposal).toHaveProperty('prepared_for');
  expect(proposal).toHaveProperty('phases');
  expect(proposal).toHaveProperty('pricing');

  // Phases structure
  expect(proposal.phases).toHaveLength(3);
  expect(proposal.phases[0].phase_number).toBe(1);
  expect(proposal.phases[1].phase_number).toBe(2);
  expect(proposal.phases[2].phase_number).toBe(3);

  // Phase 2 milestones
  const phase2 = proposal.phases[1];
  expect(phase2.milestones).toBeDefined();
  expect(phase2.milestones).toHaveLength(4);
}

/**
 * Assert that milestone allocations sum to 100%
 * @param {Array} milestones - Array of milestone objects
 */
export function assertMilestoneAllocation(milestones) {
  const totalPercentage = milestones.reduce((sum, m) => sum + m.percentage, 0);
  expect(totalPercentage).toBe(100);
}

/**
 * Assert that pricing is consistent
 * @param {Object} pricing - Pricing object
 * @param {Array} milestones - Array of milestone objects
 */
export function assertPricingConsistency(pricing, milestones) {
  const milestoneTotal = milestones.reduce((sum, m) => sum + m.price, 0);
  // Allow for small floating point differences
  expect(Math.abs(milestoneTotal - pricing.total.amount)).toBeLessThan(1);
}

/**
 * Create a temporary file for testing
 * @param {string} content - File content
 * @param {string} extension - File extension
 * @returns {string} Path to temporary file
 */
export function createTempFile(content, extension = 'json') {
  const tempDir = path.join(__dirname, '../fixtures/temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const filename = `temp_${Date.now()}.${extension}`;
  const filepath = path.join(tempDir, filename);
  fs.writeFileSync(filepath, content);

  return filepath;
}

/**
 * Clean up temporary files
 */
export function cleanupTempFiles() {
  const tempDir = path.join(__dirname, '../fixtures/temp');
  if (fs.existsSync(tempDir)) {
    const files = fs.readdirSync(tempDir);
    files.forEach(file => {
      fs.unlinkSync(path.join(tempDir, file));
    });
  }
}

/**
 * Format money for display comparison
 * @param {number} amount - Amount in dollars
 * @returns {string} Formatted string
 */
export function formatMoney(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Wait for a specified duration
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Resolves after delay
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
