/**
 * Pricing Calculator for AI Proposals
 * Calculates dynamic pricing from audit findings and complexity factors
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load pricing configuration
const BASE_RATES = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../pricing/base_rates.json'), 'utf8')
);
const COMPLEXITY_MULTIPLIERS = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../pricing/complexity_multipliers.json'), 'utf8')
);
const DISCOUNT_RULES = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../pricing/discount_rules.json'), 'utf8')
);

/**
 * Calculate total project price from audit findings
 * @param {Object} auditData - Parsed audit report data
 * @param {Object} options - Additional pricing options
 * @returns {Object} Pricing breakdown
 */
export function calculatePricing(auditData, options = {}) {
  const findings = auditData.findings || auditData.scorecard?.categories || [];
  const complexity = assessComplexity(auditData, options);

  // Calculate base price from effort estimation
  let basePrice = calculateBasePrice(findings, auditData);

  // Apply complexity multipliers
  const multiplier = calculateTotalMultiplier(complexity);
  let adjustedPrice = basePrice * multiplier;

  // Apply discounts if any
  const discount = calculateDiscount(adjustedPrice, options);
  let finalPrice = adjustedPrice - discount.amount;

  // Round the pre-discount price to get subtotal
  let subtotal = roundToIncrement(finalPrice, BASE_RATES.rounding_increment);

  // Calculate milestone allocations from SUBTOTAL (before credits/discounts)
  const milestones = allocateMilestones(subtotal);

  // Calculate audit credit (default $100 for Phase 1 audit)
  const auditCreditAmount = options.audit_credit_amount || 100;
  const auditCredit = {
    amount: auditCreditAmount,
    display: formatMoney(auditCreditAmount),
    description: 'AI Process Audit credit applied'
  };

  // Calculate early adopter discount (10% if enabled)
  let earlyAdopterDiscount = null;
  const afterCredit = subtotal - auditCreditAmount;

  if (options.early_adopter !== false) {
    const earlyAdopterPercent = options.early_adopter_percent || 10;
    // Calculate the target final price first (after all discounts and rounding)
    const rawFinal = afterCredit * (1 - earlyAdopterPercent / 100);
    finalPrice = roundToIncrement(rawFinal, BASE_RATES.rounding_increment);
    finalPrice = Math.max(finalPrice, BASE_RATES.minimum_project_value);

    // Back-calculate the discount amount so the math adds up exactly
    const earlyAdopterAmount = afterCredit - finalPrice;
    earlyAdopterDiscount = {
      percentage: earlyAdopterPercent,
      amount: earlyAdopterAmount,
      display: formatMoney(earlyAdopterAmount),
      note: 'Thank you for being an early adopter as we grow'
    };
  } else {
    finalPrice = roundToIncrement(afterCredit, BASE_RATES.rounding_increment);
    finalPrice = Math.max(finalPrice, BASE_RATES.minimum_project_value);
  }

  return {
    base_price: basePrice,
    complexity_multiplier: multiplier,
    complexity_factors: complexity,
    adjusted_price: adjustedPrice,
    discount: discount,
    subtotal: subtotal,
    audit_credit: auditCredit,
    early_adopter_discount: earlyAdopterDiscount,
    final_price: finalPrice,
    milestones: milestones,
    currency: 'USD',
    pricing_model: 'fixed_price'
  };
}

/**
 * Calculate base price from audit findings
 */
function calculateBasePrice(findings, auditData) {
  let totalHours = 0;
  const hourlyRates = BASE_RATES.hourly_rates;
  const effortTiers = BASE_RATES.effort_tiers;

  // Process each finding/fix
  const fixes = auditData.recommended_fixes || [];
  for (const fix of fixes) {
    const tier = mapToEffortTier(fix.effort_tier || fix.complexity || 'moderate');
    const hours = effortTiers[tier]?.default_hours || 16;
    totalHours += hours;
  }

  // If no fixes found, estimate from category count
  if (totalHours === 0) {
    const categoryCount = findings.length || 3;
    totalHours = categoryCount * effortTiers.moderate.default_hours;
  }

  // Calculate weighted hourly rate
  const weightedRate = calculateWeightedRate(hourlyRates);

  return totalHours * weightedRate;
}

/**
 * Map various effort descriptions to standard tiers
 */
function mapToEffortTier(effort) {
  const normalized = String(effort).toLowerCase();
  if (normalized.includes('trivial') || normalized.includes('simple') || normalized.includes('quick')) {
    return 'trivial';
  }
  if (normalized.includes('critical') || normalized.includes('major') || normalized.includes('complex')) {
    return 'critical';
  }
  if (normalized.includes('complex') || normalized.includes('significant')) {
    return 'complex';
  }
  return 'moderate';
}

/**
 * Calculate weighted average hourly rate
 */
function calculateWeightedRate(rates) {
  // Weight by typical project composition
  const weights = {
    ai_engineering: 0.25,
    integration_development: 0.35,
    system_design: 0.15,
    testing_qa: 0.10,
    project_management: 0.10,
    training_documentation: 0.05
  };

  let weightedSum = 0;
  for (const [type, weight] of Object.entries(weights)) {
    weightedSum += (rates[type]?.rate || 150) * weight;
  }

  return weightedSum;
}

/**
 * Assess project complexity from audit data
 */
export function assessComplexity(auditData, options) {
  const complexity = {};

  // Systems count
  const systemsCount = auditData.systems?.length ||
    auditData.workflow?.systems_involved?.length || 2;
  complexity.systems_count = getSystemsMultiplier(systemsCount);

  // Integration difficulty
  const integrationTypes = auditData.integration_types || ['api_available'];
  complexity.integration_difficulty = getIntegrationMultiplier(integrationTypes);

  // Data sensitivity
  const industry = auditData.client?.industry || auditData.prepared_for?.industry || 'technology';
  complexity.data_sensitivity = getDataSensitivityMultiplier(industry, options);

  // Timeline pressure
  const timelinePressure = options.timeline_pressure || 'standard';
  complexity.timeline_pressure = COMPLEXITY_MULTIPLIERS.timeline_pressure.speeds[timelinePressure]?.multiplier || 1.0;

  // Client readiness
  const clientReadiness = options.client_readiness || 'standard';
  complexity.client_readiness = COMPLEXITY_MULTIPLIERS.client_technical_readiness.levels[clientReadiness]?.multiplier || 1.0;

  // Industry complexity
  const industryKey = normalizeIndustry(industry);
  complexity.industry = COMPLEXITY_MULTIPLIERS.industry_complexity.industries[industryKey]?.multiplier || 1.0;

  return complexity;
}

/**
 * Get systems count multiplier
 */
function getSystemsMultiplier(count) {
  const ranges = COMPLEXITY_MULTIPLIERS.systems_count.ranges;
  if (count <= 2) return ranges['1-2'].multiplier;
  if (count <= 4) return ranges['3-4'].multiplier;
  if (count <= 6) return ranges['5-6'].multiplier;
  return ranges['7+'].multiplier;
}

/**
 * Get integration difficulty multiplier (use highest)
 */
function getIntegrationMultiplier(types) {
  const integrationTypes = COMPLEXITY_MULTIPLIERS.integration_difficulty.types;
  let maxMultiplier = 1.0;

  for (const type of types) {
    const normalized = type.toLowerCase().replace(/\s+/g, '_');
    const mult = integrationTypes[normalized]?.multiplier || 1.0;
    maxMultiplier = Math.max(maxMultiplier, mult);
  }

  return maxMultiplier;
}

/**
 * Get data sensitivity multiplier based on industry
 */
function getDataSensitivityMultiplier(industry, options) {
  // Check explicit override
  if (options.data_sensitivity) {
    return COMPLEXITY_MULTIPLIERS.data_sensitivity.levels[options.data_sensitivity]?.multiplier || 1.0;
  }

  // Infer from industry
  const normalized = normalizeIndustry(industry);
  const industryToSensitivity = {
    healthcare: 'hipaa_phi',
    financial_services: 'financial_regulated',
    legal: 'pii_present',
    government: 'government_classified'
  };

  const sensitivity = industryToSensitivity[normalized] || 'standard';
  return COMPLEXITY_MULTIPLIERS.data_sensitivity.levels[sensitivity]?.multiplier || 1.0;
}

/**
 * Normalize industry string to config key
 */
function normalizeIndustry(industry) {
  const normalized = String(industry).toLowerCase()
    .replace(/[^a-z]/g, '_')
    .replace(/_+/g, '_');

  const mappings = {
    'tech': 'technology',
    'software': 'technology',
    'saas': 'technology',
    'professional': 'professional_services',
    'consulting': 'professional_services',
    'retail': 'retail_ecommerce',
    'ecommerce': 'retail_ecommerce',
    'e_commerce': 'retail_ecommerce',
    'health': 'healthcare',
    'medical': 'healthcare',
    'finance': 'financial_services',
    'banking': 'financial_services',
    'insurance': 'financial_services',
    'law': 'legal',
    'legal_services': 'legal',
    'gov': 'government',
    'public_sector': 'government',
    'edu': 'education',
    'school': 'education',
    'university': 'education'
  };

  return mappings[normalized] || normalized;
}

/**
 * Calculate total multiplier from all complexity factors
 */
function calculateTotalMultiplier(complexity) {
  // Multiply all factors together
  let total = 1.0;
  for (const factor of Object.values(complexity)) {
    total *= factor;
  }
  return total;
}

/**
 * Calculate applicable discounts
 */
function calculateDiscount(price, options) {
  const discounts = [];

  // Volume discount
  const volumeTier = DISCOUNT_RULES.volume_discounts.tiers.find(
    t => price >= t.min_value && (t.max_value === null || price <= t.max_value)
  );
  if (volumeTier && volumeTier.discount_percentage > 0) {
    discounts.push({
      type: 'volume',
      percentage: volumeTier.discount_percentage,
      description: volumeTier.description
    });
  }

  // Commitment discount
  if (options.commitment_type && options.commitment_type !== 'single_project') {
    const commitment = DISCOUNT_RULES.commitment_discounts.options[options.commitment_type];
    if (commitment) {
      discounts.push({
        type: 'commitment',
        percentage: commitment.discount_percentage,
        description: commitment.description
      });
    }
  }

  // Early payment discount
  if (options.payment_terms && options.payment_terms !== 'net_15') {
    const earlyPay = DISCOUNT_RULES.early_payment_discounts.options[options.payment_terms];
    if (earlyPay) {
      discounts.push({
        type: 'early_payment',
        percentage: earlyPay.discount_percentage,
        description: earlyPay.description
      });
    }
  }

  // Referral discount
  if (options.is_referral) {
    discounts.push({
      type: 'referral',
      percentage: DISCOUNT_RULES.referral_discounts.first_project_discount,
      description: DISCOUNT_RULES.referral_discounts.description_text
    });
  }

  // Apply stacking rule
  let totalPercentage = 0;
  if (DISCOUNT_RULES.discount_stacking === 'highest_only' && discounts.length > 0) {
    const highest = discounts.reduce((a, b) => a.percentage > b.percentage ? a : b);
    totalPercentage = highest.percentage;
  } else {
    totalPercentage = discounts.reduce((sum, d) => sum + d.percentage, 0);
  }

  // Cap at maximum
  totalPercentage = Math.min(totalPercentage, DISCOUNT_RULES.maximum_combined_discount);

  const amount = price * (totalPercentage / 100);

  return {
    discounts_applied: discounts,
    total_percentage: totalPercentage,
    amount: amount,
    requires_approval: totalPercentage > DISCOUNT_RULES.notes.approval_required_above
  };
}

/**
 * Round price to nearest increment
 */
function roundToIncrement(price, increment) {
  return Math.round(price / increment) * increment;
}

/**
 * Allocate price across milestones
 * Uses "remainder adjustment" on last milestone to ensure sum equals total
 */
function allocateMilestones(totalPrice) {
  const allocation = BASE_RATES.milestone_allocation;

  // Calculate first three milestones with rounding
  const designAmount = roundToIncrement(totalPrice * (allocation.design.percentage / 100), 100);
  const buildAmount = roundToIncrement(totalPrice * (allocation.build.percentage / 100), 100);
  const testAmount = roundToIncrement(totalPrice * (allocation.test.percentage / 100), 100);

  // Last milestone gets the remainder to ensure sum = total
  const deployAmount = totalPrice - designAmount - buildAmount - testAmount;

  return {
    design: {
      milestone_number: '2.1',
      milestone_name: 'Design',
      percentage: allocation.design.percentage,
      amount: designAmount,
      description: allocation.design.description
    },
    build: {
      milestone_number: '2.2',
      milestone_name: 'Build',
      percentage: allocation.build.percentage,
      amount: buildAmount,
      description: allocation.build.description
    },
    test: {
      milestone_number: '2.3',
      milestone_name: 'Test',
      percentage: allocation.test.percentage,
      amount: testAmount,
      description: allocation.test.description
    },
    deploy: {
      milestone_number: '2.4',
      milestone_name: 'Deploy',
      percentage: allocation.deploy.percentage,
      amount: deployAmount,
      description: allocation.deploy.description
    }
  };
}

/**
 * Calculate ROI metrics
 */
export function calculateROI(monthlyBleed, investmentTotal) {
  const annualRecovery = monthlyBleed * 12;
  const paybackMonths = investmentTotal / monthlyBleed;

  return {
    monthly_recovery: {
      amount: monthlyBleed,
      currency: 'USD',
      display: formatMoney(monthlyBleed)
    },
    annual_recovery: {
      amount: annualRecovery,
      currency: 'USD',
      display: formatMoney(annualRecovery)
    },
    payback_period_months: Math.ceil(paybackMonths * 10) / 10,
    payback_display: formatPaybackPeriod(paybackMonths)
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
 * Format payback period for display
 */
export function formatPaybackPeriod(months) {
  if (months < 1) {
    const weeks = Math.ceil(months * 4.33);
    return `${weeks} week${weeks !== 1 ? 's' : ''}`;
  }
  const roundedMonths = Math.ceil(months * 10) / 10;
  if (roundedMonths === 1) return '1 month';
  return `${roundedMonths} months`;
}

/**
 * Get fixed package recommendation based on scope
 */
export function getPackageRecommendation(auditData) {
  const fixes = auditData.recommended_fixes || [];
  const systemsCount = auditData.systems?.length || 2;

  // Score based on complexity indicators
  let complexityScore = fixes.length;
  complexityScore += systemsCount * 0.5;

  const criticalCount = fixes.filter(f =>
    (f.effort_tier || '').toLowerCase().includes('critical')
  ).length;
  complexityScore += criticalCount * 2;

  const packages = BASE_RATES.fixed_packages;
  if (complexityScore <= 3) return { ...packages.simple_automation, key: 'simple_automation' };
  if (complexityScore <= 6) return { ...packages.standard_implementation, key: 'standard_implementation' };
  if (complexityScore <= 10) return { ...packages.complex_system, key: 'complex_system' };
  return { ...packages.enterprise_solution, key: 'enterprise_solution' };
}

export default {
  calculatePricing,
  calculateROI,
  formatMoney,
  formatPaybackPeriod,
  getPackageRecommendation,
  assessComplexity
};
