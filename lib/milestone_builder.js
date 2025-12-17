/**
 * Milestone Builder for AI Proposals
 * Constructs the canonical Phase 1/2/3 structure with nested milestones
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Build the complete phase structure for a proposal
 * @param {Object} auditData - Parsed audit report data
 * @param {Object} pricing - Pricing breakdown from pricing_calculator
 * @param {Object} options - Additional options
 * @returns {Array} Array of three phases
 */
export function buildPhases(auditData, pricing, options = {}) {
  return [
    buildPhase1Audit(auditData),
    buildPhase2Stabilize(auditData, pricing, options),
    buildPhase3Scale(auditData, options)
  ];
}

/**
 * Build Phase 1: Audit (completed)
 */
export function buildPhase1Audit(auditData) {
  const auditDate = auditData.document?.created_at ||
    auditData.audit_date ||
    new Date().toISOString();

  return {
    phase_id: uuidv4(),
    phase_number: 1,
    phase_name: 'Audit',
    state: 'complete',
    description: '[LLM_PLACEHOLDER: phase_1_description]',
    milestones: [
      {
        milestone_id: uuidv4(),
        milestone_number: '1.1',
        milestone_name: 'AI Process Audit',
        description: 'Comprehensive analysis of current workflow, systems, and operational efficiency.',
        deliverables: [
          {
            name: 'Traffic Light Report',
            description: 'Single-page diagnostic with category health scores and revenue bleed analysis'
          },
          {
            name: 'Key Findings',
            description: 'Prioritized list of issues with effort/impact assessment'
          },
          {
            name: 'Recommended Fixes',
            description: 'Actionable improvements with expected ROI'
          }
        ],
        duration: {
          value: auditData.audit_duration_days || 3,
          unit: 'business_days',
          display: `${auditData.audit_duration_days || 3} business days`
        },
        price_allocation: {
          amount: 0,
          currency: 'USD',
          display: 'Completed'
        }
      }
    ]
  };
}

/**
 * Build Phase 2: Stabilize (current proposal)
 */
export function buildPhase2Stabilize(auditData, pricing, options = {}) {
  const milestoneAllocations = pricing.milestones;
  const workflowName = auditData.workflow?.name ||
    auditData.workflow_name ||
    'workflow automation';

  // Estimate durations based on pricing
  const durations = estimateDurations(pricing.final_price, options);

  return {
    phase_id: uuidv4(),
    phase_number: 2,
    phase_name: 'Stabilize',
    state: 'current',
    description: '[LLM_PLACEHOLDER: phase_2_description]',
    milestones: [
      buildMilestone21Design(auditData, milestoneAllocations.design, durations.design),
      buildMilestone22Build(auditData, milestoneAllocations.build, durations.build),
      buildMilestone23Test(auditData, milestoneAllocations.test, durations.test),
      buildMilestone24Deploy(auditData, milestoneAllocations.deploy, durations.deploy)
    ]
  };
}

/**
 * Milestone 2.1: Design
 */
function buildMilestone21Design(auditData, allocation, duration) {
  return {
    milestone_id: uuidv4(),
    milestone_number: '2.1',
    milestone_name: 'Design',
    description: '[LLM_PLACEHOLDER: milestone_2_1_description]',
    deliverables: [
      {
        name: 'Requirements Document',
        description: 'Finalized functional and technical requirements',
        acceptance_criteria: [
          'All stakeholder requirements captured',
          'Success metrics defined',
          'Client sign-off obtained'
        ]
      },
      {
        name: 'Solution Architecture',
        description: 'Technical design for system integrations and data flows',
        acceptance_criteria: [
          'Integration points mapped for all systems',
          'Data schema defined',
          'Security requirements addressed'
        ]
      },
      {
        name: 'Implementation Plan',
        description: 'Detailed project timeline and resource allocation',
        acceptance_criteria: [
          'Task breakdown with dependencies',
          'Risk mitigation strategies',
          'Communication cadence established'
        ]
      }
    ],
    duration: duration,
    price_allocation: {
      amount: allocation.amount,
      currency: 'USD',
      display: formatMoney(allocation.amount)
    }
  };
}

/**
 * Milestone 2.2: Build
 */
function buildMilestone22Build(auditData, allocation, duration) {
  const fixes = auditData.recommended_fixes || [];
  const deliverables = [];

  // Core system development
  deliverables.push({
    name: 'Core Automation System',
    description: 'Primary workflow automation implementation',
    acceptance_criteria: [
      'All critical path automations functional',
      'Error handling implemented',
      'Logging and monitoring in place'
    ]
  });

  // Integration development
  const systems = auditData.systems ||
    auditData.workflow?.systems_involved || [];
  if (systems.length > 1) {
    deliverables.push({
      name: 'System Integrations',
      description: `Connections between ${systems.slice(0, 3).join(', ')}${systems.length > 3 ? ' and others' : ''}`,
      acceptance_criteria: [
        'API connections established and tested',
        'Data synchronization verified',
        'Failover handling configured'
      ]
    });
  }

  // AI components if applicable
  const hasAI = fixes.some(f =>
    (f.fix || f.description || '').toLowerCase().includes('ai') ||
    (f.fix || f.description || '').toLowerCase().includes('automat')
  );
  if (hasAI) {
    deliverables.push({
      name: 'AI Processing Components',
      description: 'Machine learning or AI-powered automation elements',
      acceptance_criteria: [
        'Model accuracy meets requirements',
        'Processing latency within SLA',
        'Edge cases handled gracefully'
      ]
    });
  }

  // Internal testing
  deliverables.push({
    name: 'Internal Testing Complete',
    description: 'Developer testing and code review',
    acceptance_criteria: [
      'Unit tests passing',
      'Integration tests complete',
      'Code review approved'
    ]
  });

  return {
    milestone_id: uuidv4(),
    milestone_number: '2.2',
    milestone_name: 'Build',
    description: '[LLM_PLACEHOLDER: milestone_2_2_description]',
    deliverables: deliverables,
    duration: duration,
    price_allocation: {
      amount: allocation.amount,
      currency: 'USD',
      display: formatMoney(allocation.amount)
    }
  };
}

/**
 * Milestone 2.3: Test
 */
function buildMilestone23Test(auditData, allocation, duration) {
  return {
    milestone_id: uuidv4(),
    milestone_number: '2.3',
    milestone_name: 'Test',
    description: '[LLM_PLACEHOLDER: milestone_2_3_description]',
    deliverables: [
      {
        name: 'Alpha Testing',
        description: 'Internal QA with synthetic data',
        acceptance_criteria: [
          'All test scenarios passed',
          'Performance benchmarks met',
          'Bug fixes completed'
        ]
      },
      {
        name: 'Beta Testing',
        description: 'Client stakeholder testing with real workflows',
        acceptance_criteria: [
          'User acceptance criteria met',
          'Feedback incorporated',
          'Sign-off from key stakeholders'
        ]
      },
      {
        name: 'Performance Validation',
        description: 'Load testing and optimization',
        acceptance_criteria: [
          'Response times within SLA',
          'System stable under expected load',
          'No memory leaks or resource issues'
        ]
      }
    ],
    duration: duration,
    price_allocation: {
      amount: allocation.amount,
      currency: 'USD',
      display: formatMoney(allocation.amount)
    }
  };
}

/**
 * Milestone 2.4: Deploy
 */
function buildMilestone24Deploy(auditData, allocation, duration) {
  return {
    milestone_id: uuidv4(),
    milestone_number: '2.4',
    milestone_name: 'Deploy',
    description: '[LLM_PLACEHOLDER: milestone_2_4_description]',
    deliverables: [
      {
        name: 'Production Deployment',
        description: 'Live system deployment with monitoring',
        acceptance_criteria: [
          'System live in production',
          'Monitoring dashboards active',
          'Alerting configured'
        ]
      },
      {
        name: 'User Training',
        description: 'Training sessions for end users and administrators',
        acceptance_criteria: [
          'All designated users trained',
          'Training materials delivered',
          'Q&A sessions completed'
        ]
      },
      {
        name: 'Documentation Package',
        description: 'Technical and user documentation',
        acceptance_criteria: [
          'User guide delivered',
          'Admin documentation complete',
          'Troubleshooting guide provided'
        ]
      },
      {
        name: 'Go-Live Support',
        description: 'Dedicated support during initial production period',
        acceptance_criteria: [
          'Support coverage confirmed',
          'Escalation paths defined',
          'Warranty period begins'
        ]
      }
    ],
    duration: duration,
    price_allocation: {
      amount: allocation.amount,
      currency: 'USD',
      display: formatMoney(allocation.amount)
    }
  };
}

/**
 * Build Phase 3: Scale (future)
 */
export function buildPhase3Scale(auditData, options = {}) {
  return {
    phase_id: uuidv4(),
    phase_number: 3,
    phase_name: 'Scale',
    state: 'upcoming',
    description: '[LLM_PLACEHOLDER: phase_3_description]',
    milestones: [
      {
        milestone_id: uuidv4(),
        milestone_number: '3.1',
        milestone_name: 'Optimize',
        description: 'Performance optimization and efficiency improvements based on production metrics.',
        deliverables: [
          { name: 'Performance Analysis', description: 'Review of production metrics and bottlenecks' },
          { name: 'Optimization Implementation', description: 'Targeted improvements to speed and efficiency' }
        ]
      },
      {
        milestone_id: uuidv4(),
        milestone_number: '3.2',
        milestone_name: 'Expand',
        description: 'Extension to additional workflows, teams, or business units.',
        deliverables: [
          { name: 'Expansion Roadmap', description: 'Plan for scaling to additional use cases' },
          { name: 'Additional Integrations', description: 'New system connections as needed' }
        ]
      }
    ]
  };
}

/**
 * Estimate milestone durations based on price
 */
export function estimateDurations(totalPrice, options = {}) {
  // Base duration estimation: roughly 1 week per $5K
  const totalWeeks = Math.max(2, Math.ceil(totalPrice / 5000));

  // Apply timeline pressure if specified
  const pressureMultiplier = {
    standard: 1.0,
    expedited: 0.7,
    rush: 0.5,
    emergency: 0.3
  }[options.timeline_pressure || 'standard'] || 1.0;

  const adjustedWeeks = Math.max(2, Math.ceil(totalWeeks * pressureMultiplier));

  // Distribute across milestones (roughly matching price allocation)
  const designWeeks = Math.max(1, Math.ceil(adjustedWeeks * 0.2));
  const buildWeeks = Math.max(1, Math.ceil(adjustedWeeks * 0.45));
  const testWeeks = Math.max(1, Math.ceil(adjustedWeeks * 0.15));
  const deployWeeks = Math.max(1, Math.ceil(adjustedWeeks * 0.2));

  return {
    total: formatDuration(adjustedWeeks, 'weeks'),
    design: formatDuration(designWeeks, 'weeks'),
    build: formatDuration(buildWeeks, 'weeks'),
    test: formatDuration(testWeeks, 'weeks'),
    deploy: formatDuration(deployWeeks, 'weeks')
  };
}

/**
 * Format duration object
 */
export function formatDuration(value, unit) {
  const displayUnit = value === 1 ? unit.replace(/s$/, '') : unit;
  return {
    value: value,
    unit: unit,
    display: `${value} ${displayUnit}`
  };
}

/**
 * Format money for display
 */
export function formatMoney(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Calculate total duration from all milestones
 */
export function calculateTotalDuration(phases) {
  let totalWeeks = 0;

  for (const phase of phases) {
    if (phase.state !== 'upcoming') {
      for (const milestone of (phase.milestones || [])) {
        if (milestone.duration?.unit === 'weeks') {
          totalWeeks += milestone.duration.value;
        } else if (milestone.duration?.unit === 'business_days') {
          totalWeeks += milestone.duration.value / 5;
        }
      }
    }
  }

  return formatDuration(Math.ceil(totalWeeks), 'weeks');
}

export default {
  buildPhases,
  buildPhase1Audit,
  buildPhase2Stabilize,
  buildPhase3Scale,
  calculateTotalDuration,
  estimateDurations,
  formatDuration,
  formatMoney
};
