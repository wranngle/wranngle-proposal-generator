/**
 * Proposal Validation
 * Validates proposal JSON against schema
 *
 * Synced with ai_audit_report/lib/validate.js patterns
 */

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize AJV with draft-2020-12 support (same as ai_audit_report)
const ajv = new Ajv2020({
  allErrors: true,          // Report all errors, not just first
  verbose: true,            // Include schema and data in errors
  strict: false,            // Allow additional keywords
  allowUnionTypes: true     // Allow union types
});

// Add format validators (date-time, uri, email, etc.)
addFormats(ajv);

// Load schema (lazy loading pattern)
let proposalSchema = null;

function getProposalSchema() {
  if (!proposalSchema) {
    const schemaPath = path.join(__dirname, '../schemas/proposal_schema.json');
    proposalSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  }
  return proposalSchema;
}

/**
 * Validate proposal JSON against schema
 * @param {Object} proposal - Proposal JSON to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validateProposal(proposal, options = {}) {
  const {
    allowPlaceholders = false,   // Allow LLM placeholders (for draft validation)
    strictBusinessRules = true   // Enforce business rules
  } = options;

  const schema = getProposalSchema();
  const validate = ajv.compile(schema);
  const schemaValid = validate(proposal);

  const result = {
    valid: schemaValid,
    errors: [],
    warnings: [],
    placeholders: []
  };

  // Collect schema errors
  if (!schemaValid && validate.errors) {
    result.errors = validate.errors.map(err => ({
      type: 'schema',
      path: err.instancePath || err.dataPath || '',
      message: err.message,
      keyword: err.keyword,
      params: err.params
    }));
  }

  // Check for unresolved placeholders
  result.placeholders = findPlaceholders(proposal);
  if (!allowPlaceholders && result.placeholders.length > 0) {
    result.valid = false;
    result.placeholders.forEach(p => {
      result.errors.push({
        type: 'placeholder',
        path: p,
        message: `Unresolved LLM placeholder found`
      });
    });
  }

  // Add warnings (non-fatal checks)
  result.warnings = checkWarnings(proposal);

  return result;
}

/**
 * Check for non-fatal warnings
 */
function checkWarnings(proposal) {
  const warnings = [];

  // Check for unfilled placeholders
  const placeholders = findPlaceholders(proposal);
  if (placeholders.length > 0) {
    warnings.push({
      type: 'unfilled_placeholders',
      message: `Found ${placeholders.length} unfilled LLM placeholders`,
      paths: placeholders
    });
  }

  // Check pricing sanity
  if (proposal.pricing?.total?.amount) {
    const total = proposal.pricing.total.amount;

    if (total < 2500) {
      warnings.push({
        type: 'low_price',
        message: `Total price ${total} is below minimum recommended ($2,500)`
      });
    }

    // Check milestone allocations sum to total
    const milestoneSum = (proposal.pricing?.payment_schedule?.installments || [])
      .reduce((sum, inst) => sum + (inst.amount?.amount || 0), 0);

    if (Math.abs(milestoneSum - total) > 100) {
      warnings.push({
        type: 'milestone_mismatch',
        message: `Milestone sum (${milestoneSum}) doesn't match total (${total})`
      });
    }
  }

  // Check ROI sanity
  if (proposal.roi?.payback_period_months > 12) {
    warnings.push({
      type: 'long_payback',
      message: `Payback period (${proposal.roi.payback_period_months} months) exceeds 12 months`
    });
  }

  // Check phase structure
  if (proposal.phases?.length !== 3) {
    warnings.push({
      type: 'phase_count',
      message: `Expected 3 phases, found ${proposal.phases?.length || 0}`
    });
  }

  // Check Phase 2 milestones
  const phase2 = proposal.phases?.find(p => p.phase_number === 2);
  if (phase2 && phase2.milestones?.length !== 4) {
    warnings.push({
      type: 'milestone_count',
      message: `Phase 2 should have 4 milestones (2.1-2.4), found ${phase2.milestones?.length || 0}`
    });
  }

  // Check validity date
  if (proposal.document?.valid_until) {
    const validUntil = new Date(proposal.document.valid_until);
    if (validUntil < new Date()) {
      warnings.push({
        type: 'expired',
        message: 'Proposal validity date has passed'
      });
    }
  }

  return warnings;
}

/**
 * Find unfilled placeholders in proposal
 */
function findPlaceholders(obj, path = '', results = []) {
  if (typeof obj === 'string' && obj.includes('[LLM_PLACEHOLDER:')) {
    results.push(path);
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      findPlaceholders(item, `${path}[${index}]`, results);
    });
  } else if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      findPlaceholders(value, path ? `${path}.${key}` : key, results);
    }
  }
  return results;
}

/**
 * Quick check if proposal has required fields
 */
function hasRequiredFields(proposal) {
  const required = [
    'schema_version',
    'document.proposal_number',
    'prepared_for.account_name',
    'pricing.total.amount',
    'phases'
  ];

  for (const field of required) {
    const value = getValueAtPath(proposal, field);
    if (value === undefined || value === null) {
      return { valid: false, missing: field };
    }
  }

  return { valid: true };
}

/**
 * Get value at path in object
 */
function getValueAtPath(obj, path) {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }

  return current;
}

/**
 * Validate and repair common issues
 */
function validateAndRepair(proposal) {
  const result = validateProposal(proposal);
  const repairs = [];

  if (!result.valid) {
    // Attempt repairs for common issues
    for (const error of result.errors) {
      if (error.keyword === 'required') {
        const missingProp = error.params?.missingProperty;
        if (missingProp && canAutoRepair(missingProp)) {
          setDefaultValue(proposal, error.path, missingProp);
          repairs.push({ path: `${error.path}.${missingProp}`, action: 'added_default' });
        }
      }
    }

    // Re-validate after repairs
    if (repairs.length > 0) {
      const revalidated = validateProposal(proposal);
      return {
        ...revalidated,
        repairs: repairs
      };
    }
  }

  return result;
}

/**
 * Check if a property can be auto-repaired
 */
function canAutoRepair(propName) {
  const repairableProps = [
    'schema_version',
    'currency',
    'state',
    'pricing_model'
  ];
  return repairableProps.includes(propName);
}

/**
 * Set default value for a property
 */
function setDefaultValue(obj, basePath, propName) {
  const defaults = {
    schema_version: '1.0.0',
    currency: 'USD',
    state: 'current',
    pricing_model: 'fixed_price'
  };

  if (defaults[propName]) {
    const path = basePath ? `${basePath}.${propName}` : propName;
    setValueAtPath(obj, path, defaults[propName]);
  }
}

/**
 * Set value at path in object
 */
function setValueAtPath(obj, path, value) {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(p => p);
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part];
  }

  if (parts.length > 0) {
    current[parts[parts.length - 1]] = value;
  }
}

/**
 * Format validation errors for display
 */
function formatErrors(errors) {
  return errors.map(err => {
    const path = err.path || '';
    return `  ${path}: ${err.message}`;
  }).join('\n');
}

/**
 * Format warnings for display
 */
function formatWarnings(warnings) {
  return warnings.map(warn => {
    return `  [${warn.type}] ${warn.message}`;
  }).join('\n');
}

export {
  validateProposal,
  validateAndRepair,
  hasRequiredFields,
  findPlaceholders,
  formatErrors,
  formatWarnings
};

export default {
  validateProposal,
  validateAndRepair,
  hasRequiredFields,
  findPlaceholders,
  formatErrors,
  formatWarnings
};
