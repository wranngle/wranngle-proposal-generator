/**
 * Transform Proposal Builder
 * Builds complete proposal JSON from extracted audit data and pricing
 */

import { v4 as uuidv4 } from 'uuid';
import { calculatePricing, calculateROI, formatMoney } from './pricing_calculator.js';
import { buildPhases, calculateTotalDuration } from './milestone_builder.js';

// Default configuration
const DEFAULT_CONFIG = {
  brand: {
    brand_name: process.env.PRODUCER_NAME || 'Wranngle Systems LLC',
    logo_uri: process.env.LOGO_URI || 'https://i.ibb.co/sdfPMCVx/wranngle-color-transparent.png',
    primary_domain: process.env.PRODUCER_DOMAIN || 'wranngle.com'
  },
  producer: {
    producer_name: process.env.PRODUCER_NAME || 'Wranngle Systems LLC',
    producer_email: process.env.PRODUCER_EMAIL || 'hello@wranngle.com'
  },
  defaults: {
    valid_days: parseInt(process.env.DEFAULT_VALIDITY_DAYS) || 14,
    platform: process.env.DEFAULT_PLATFORM || 'direct',
    warranty_days: 30
  },
  cta: {
    // Note: CTA links are dynamically generated, not static Calendly links
    book_call_link: process.env.CTA_BOOK_CALL_LINK || '',
    approve_link_template: process.env.APPROVE_LINK_TEMPLATE || ''
  }
};

/**
 * Build complete proposal JSON from extracted data
 * @param {Object} extracted - Output from extract_proposal.js
 * @param {Object} options - Generation options
 * @returns {Object} Complete proposal JSON (with LLM placeholders)
 */
function buildProposal(extracted, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options.config };
  const platform = options.platform || config.defaults.platform;
  const validDays = options.valid_days || config.defaults.valid_days;

  // Calculate pricing from extracted data
  const pricing = calculatePricing(extracted.raw_audit || extracted, options.pricing_options || {});

  // Calculate ROI from bleed data
  const monthlyBleed = extracted.bleed?.monthly_amount || 0;
  const roi = calculateROI(monthlyBleed, pricing.final_price);

  // Build phase structure
  const phases = buildPhases(extracted.raw_audit || extracted, pricing, options);
  const totalDuration = calculateTotalDuration(phases);

  // Generate document metadata
  const now = new Date();
  const validUntil = new Date(now.getTime() + validDays * 24 * 60 * 60 * 1000);
  const proposalNumber = generateProposalNumber(now);

  // Build the proposal
  const proposal = {
    schema_version: '1.0.0',

    document: {
      document_id: uuidv4(),
      proposal_number: proposalNumber,
      created_at: now.toISOString(),
      valid_until: validUntil.toISOString(),
      valid_days: validDays,
      title: `Phase 2: Stabilize Proposal`,
      subtitle: `${extracted.workflow?.name || 'Workflow'} Automation Implementation`,
      brand: config.brand
    },

    prepared_for: {
      account_name: extracted.client?.account_name || 'Client',
      industry: extracted.client?.industry || 'professional_services',
      primary_contact: extracted.client?.primary_contact || {}
    },

    prepared_by: config.producer,

    audit_reference: {
      audit_id: extracted.audit?.audit_id,
      audit_date: formatDate(extracted.audit?.audit_date),
      workflow_name: extracted.workflow?.name,
      bleed_total: {
        amount: monthlyBleed,
        currency: 'USD',
        display: formatMoney(monthlyBleed)
      },
      bleed_period: 'month',
      key_findings: extractKeyFindings(extracted.findings, 3)
    },

    executive_summary: {
      body: '[LLM_PLACEHOLDER: executive_summary]',
      value_proposition: '[LLM_PLACEHOLDER: value_proposition]'
    },

    pricing: buildPricingSection(pricing, platform),

    roi: roi,

    phases: phases,

    total_duration: totalDuration,

    scope: buildScopeSection(extracted, options),

    terms: buildTermsSection(platform, validDays, config),

    cta: buildCTASection(proposalNumber, validUntil, platform, config),

    rendering: {
      mode: 'proposal',
      platform: platform,
      page: {
        size: 'letter',
        page_count: 2
      }
    }
  };

  return proposal;
}

/**
 * Generate proposal number
 */
function generateProposalNumber(date) {
  const year = date.getFullYear();
  const sequence = Math.floor(Math.random() * 9000) + 1000;
  return `WRN-${year}-${sequence}`;
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
  if (!dateStr) return new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Extract top N key findings
 */
function extractKeyFindings(findings, count = 3) {
  if (!findings || !findings.length) {
    return ['Workflow automation opportunities identified', 'Process efficiency gaps documented', 'Integration improvements recommended'];
  }

  // Prioritize critical findings
  const sorted = [...findings].sort((a, b) => {
    const statusOrder = { critical: 0, warning: 1, healthy: 2 };
    return (statusOrder[a.status] || 1) - (statusOrder[b.status] || 1);
  });

  return sorted.slice(0, count).map(f => f.finding || f);
}

/**
 * Build pricing section
 */
function buildPricingSection(pricing, platform) {
  const section = {
    currency: 'USD',
    pricing_model: 'fixed_price',
    subtotal: {
      amount: pricing.subtotal,
      currency: 'USD',
      display: formatMoney(pricing.subtotal)
    },
    total: {
      amount: pricing.final_price,
      currency: 'USD',
      display: formatMoney(pricing.final_price)
    },
    payment_schedule: {
      schedule_type: 'milestone_based',
      installments: []
    }
  };

  // Add milestone-based installments
  const milestones = pricing.milestones;
  section.payment_schedule.installments = [
    {
      milestone_id: '2.1',
      label: 'Milestone 2.1: Design',
      amount: { amount: milestones.design.amount, currency: 'USD', display: formatMoney(milestones.design.amount) },
      percentage: milestones.design.percentage,
      due_event: 'Design sign-off'
    },
    {
      milestone_id: '2.2',
      label: 'Milestone 2.2: Build',
      amount: { amount: milestones.build.amount, currency: 'USD', display: formatMoney(milestones.build.amount) },
      percentage: milestones.build.percentage,
      due_event: 'Build complete'
    },
    {
      milestone_id: '2.3',
      label: 'Milestone 2.3: Test',
      amount: { amount: milestones.test.amount, currency: 'USD', display: formatMoney(milestones.test.amount) },
      percentage: milestones.test.percentage,
      due_event: 'Testing approved'
    },
    {
      milestone_id: '2.4',
      label: 'Milestone 2.4: Deploy',
      amount: { amount: milestones.deploy.amount, currency: 'USD', display: formatMoney(milestones.deploy.amount) },
      percentage: milestones.deploy.percentage,
      due_event: 'Go-live complete'
    }
  ];

  // Add platform-specific fees
  if (platform === 'upwork') {
    section.platform_fees = {
      platform: 'upwork',
      fee_percentage: 0,
      fee_note: 'Upwork service fees paid separately by client'
    };
  } else {
    section.platform_fees = {
      platform: 'direct',
      fee_percentage: 0,
      fee_note: 'Direct engagement - no platform fees'
    };
  }

  // Add discount info if applicable
  if (pricing.discount?.total_percentage > 0) {
    section.discount_applied = {
      percentage: pricing.discount.total_percentage,
      amount: { amount: pricing.discount.amount, currency: 'USD', display: formatMoney(pricing.discount.amount) },
      reason: pricing.discount.discounts_applied?.[0]?.description || 'Volume discount'
    };
  }

  // Add audit credit
  if (pricing.audit_credit) {
    section.audit_credit = {
      amount: pricing.audit_credit.amount,
      display: pricing.audit_credit.display,
      description: pricing.audit_credit.description
    };
  }

  // Add early adopter discount
  if (pricing.early_adopter_discount) {
    section.early_adopter_discount = {
      percentage: pricing.early_adopter_discount.percentage,
      amount: pricing.early_adopter_discount.amount,
      display: pricing.early_adopter_discount.display,
      note: pricing.early_adopter_discount.note
    };
  }

  return section;
}

/**
 * Build scope section
 */
function buildScopeSection(extracted, options) {
  // Generate in-scope items from fixes
  const inScope = [];
  if (extracted.recommended_fixes?.length) {
    for (const fix of extracted.recommended_fixes.slice(0, 5)) {
      if (fix.fix) {
        inScope.push(fix.fix);
      }
    }
  }

  // Add standard in-scope items if needed
  if (inScope.length < 3) {
    inScope.push(
      `${extracted.workflow?.name || 'Workflow'} automation implementation`,
      'System integration and data synchronization',
      'User training and documentation'
    );
  }

  // Standard out-of-scope items
  const outOfScope = [
    'Third-party system licensing or subscription fees',
    'Hardware procurement or infrastructure changes',
    'Data migration from legacy systems not specified in scope',
    'Ongoing maintenance beyond 30-day warranty period'
  ];

  // Standard assumptions
  const assumptions = [
    'Client will provide timely access to required systems and credentials',
    'Key stakeholders available for requirements and testing sessions',
    'Existing system documentation is accurate and current',
    'No significant changes to business requirements during implementation'
  ];

  return {
    in_scope: inScope.length > 0 ? inScope : ['[LLM_PLACEHOLDER: scope_in_items]'],
    out_of_scope: outOfScope,
    assumptions: assumptions,
    change_control: 'Changes to scope after Design milestone sign-off may require separate pricing and timeline adjustment.'
  };
}

/**
 * Build terms section
 */
function buildTermsSection(platform, validDays, config) {
  const terms = {
    validity_period: `This proposal is valid for ${validDays} days from date of issue.`,
    warranty_period: `${config.defaults.warranty_days}-day bug fix warranty post-deployment`,
    ip_ownership: 'All custom code and configurations become client property upon final payment.'
  };

  if (platform === 'upwork') {
    terms.payment_terms = 'Payment via Upwork escrow upon milestone approval.';
    terms.cancellation_policy = 'Per Upwork Terms of Service. Completed milestones are non-refundable.';
  } else {
    terms.payment_terms = 'Invoice upon milestone completion, NET 15 payment terms.';
    terms.cancellation_policy = 'Either party may cancel with 5 business days written notice. Client pays for completed work.';
  }

  return terms;
}

/**
 * Build CTA section
 */
function buildCTASection(proposalNumber, validUntil, platform, config) {
  const expiresDisplay = validUntil.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  if (platform === 'upwork') {
    return {
      action_type: 'approve_proposal',
      headline: '[LLM_PLACEHOLDER: cta_headline]',
      subtext: '[LLM_PLACEHOLDER: cta_subtext]',
      link: 'https://www.upwork.com/messages',
      link_display: 'Reply on Upwork to approve',
      expires_display: `Proposal valid until ${expiresDisplay}`
    };
  }

  // Build approve link - use template if provided, otherwise empty (no external links per TOS)
  let approveLink = config.cta.approve_link_template ?
    config.cta.approve_link_template.replace('{proposal_number}', proposalNumber) :
    '';

  // Build secondary link - use provided link or empty (no external links per TOS)
  const secondaryLink = config.cta.book_call_link || '';

  return {
    action_type: 'approve_proposal',
    headline: '[LLM_PLACEHOLDER: cta_headline]',
    subtext: '[LLM_PLACEHOLDER: cta_subtext]',
    link: approveLink,
    link_display: 'Approve This Proposal',
    secondary_action: {
      label: 'Schedule a Call',
      link: secondaryLink
    },
    expires_display: `Proposal valid until ${expiresDisplay}`
  };
}

/**
 * Get all LLM placeholder paths in the proposal
 */
function getPlaceholderPaths(proposal, prefix = '') {
  const paths = [];

  function traverse(obj, path) {
    if (typeof obj === 'string' && obj.startsWith('[LLM_PLACEHOLDER:')) {
      paths.push(path);
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => traverse(item, `${path}[${index}]`));
    } else if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        traverse(value, path ? `${path}.${key}` : key);
      }
    }
  }

  traverse(proposal, prefix);
  return paths;
}

/**
 * Set value at a path in an object
 */
function setValueAtPath(obj, path, value) {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Get value at a path in an object
 */
function getValueAtPath(obj, path) {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = obj;

  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }

  return current;
}

export {
  buildProposal,
  getPlaceholderPaths,
  setValueAtPath,
  getValueAtPath,
  DEFAULT_CONFIG
};

export default {
  buildProposal,
  getPlaceholderPaths,
  setValueAtPath,
  getValueAtPath,
  DEFAULT_CONFIG
};
