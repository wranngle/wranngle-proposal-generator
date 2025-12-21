/**
 * Extract Proposal Data from Audit Reports
 * Parses Traffic Light Reports and other audit formats into proposal intake data
 */

import fs from 'fs';
import path from 'path';

/**
 * Extract proposal-relevant data from an audit report
 * @param {string|Object} auditInput - Path to audit JSON or parsed object
 * @returns {Object} Extracted proposal intake data
 */
function extractFromAudit(auditInput) {
  let auditData;

  if (typeof auditInput === 'string') {
    const content = fs.readFileSync(auditInput, 'utf8');
    auditData = JSON.parse(content);
  } else {
    auditData = auditInput;
  }

  // Normalize different audit report formats
  const normalized = normalizeAuditFormat(auditData);

  return {
    // Client information
    client: extractClientInfo(normalized),

    // Audit reference data
    audit: extractAuditReference(normalized),

    // Workflow details
    workflow: extractWorkflowInfo(normalized),

    // Systems involved
    systems: extractSystems(normalized),

    // Key findings and fixes
    findings: extractFindings(normalized),
    recommended_fixes: extractRecommendedFixes(normalized),

    // Revenue bleed data
    bleed: extractBleedData(normalized),

    // Complexity indicators
    complexity_indicators: extractComplexityIndicators(normalized),

    // Raw data for LLM context
    raw_audit: normalized
  };
}

/**
 * Normalize scorecard from ai_audit_report format to expected format
 * Converts rows[] with finding objects to categories[] with findings arrays
 */
function normalizeScorecard(scorecard) {
  if (!scorecard) return { categories: [] };

  // If already has categories array, return as-is
  if (scorecard.categories) {
    return scorecard;
  }

  // Convert rows to categories
  if (scorecard.rows && Array.isArray(scorecard.rows)) {
    const categories = scorecard.rows.map(row => {
      // Extract finding text - could be string or object
      const findingText = typeof row.finding === 'string'
        ? row.finding
        : row.finding?.summary || row.finding?.risk || '';

      return {
        category_name: row.category,
        status: row.status,
        findings: [findingText].filter(Boolean)
      };
    });

    return {
      categories: categories,
      executive_summary: scorecard.executive_summary,
      overall: scorecard.overall
    };
  }

  return { categories: [] };
}

/**
 * Normalize different audit report formats to a common structure
 */
function normalizeAuditFormat(data) {
  // Handle Traffic Light Report format (from ai_audit_report)
  if (data.document && data.scorecard) {
    // Handle fixes - could be array directly or { items: [...] }
    let fixes = data.fixes || data.recommended_fixes || [];
    if (fixes.items && Array.isArray(fixes.items)) {
      fixes = fixes.items;
    }

    // Normalize scorecard - convert rows to categories format for compatibility
    const scorecard = normalizeScorecard(data.scorecard);

    return {
      format: 'traffic_light_report',
      document: data.document,
      client: data.prepared_for,
      producer: data.prepared_by,
      scorecard: scorecard,
      bleed: data.revenue_bleed || data.bleed,
      fixes: fixes,
      executive_summary: data.executive_summary || data.scorecard?.executive_summary,
      cta: data.cta,
      workflow: extractWorkflowFromScorecard(data.scorecard)
    };
  }

  // Handle simple audit format
  if (data.audit_date || data.findings) {
    return {
      format: 'simple_audit',
      document: {
        created_at: data.audit_date || data.date || new Date().toISOString(),
        document_id: data.audit_id || data.id
      },
      client: data.client || data.prepared_for || { account_name: data.client_name },
      scorecard: { categories: data.findings || data.categories || [] },
      bleed: data.bleed || data.revenue_bleed,
      fixes: data.fixes || data.recommended_fixes || [],
      workflow: data.workflow
    };
  }

  // Handle project_plan format (from ai_sales_engineering)
  if (data.project_identity || data.project?.client) {
    // Map project plan objectives to pseudo-findings for proposal
    const objectives = data.scope?.objectives || [];
    const findings = objectives.map(obj => ({
      category_name: 'Implementation Objectives',
      status: 'critical',
      findings: [obj]
    }));

    // Map scope items to fixes
    const fixes = (data.scope?.in_scope || []).slice(0, 5).map((item, i) => ({
      id: i + 1,
      problem: `Current process gap: ${item}`,
      fix: item,
      impact: 'Process improvement'
    }));

    return {
      format: 'project_plan',
      document: {
        created_at: data.meta?.generated_at || new Date().toISOString(),
        document_id: data.meta?.plan_id
      },
      client: {
        account_name: data.project_identity?.client_name || data.project?.client?.name,
        industry: data.project?.client?.industry,
        tier: data.project?.client?.tier
      },
      scorecard: { categories: findings },
      bleed: data.value?.revenue_bleed || null,
      fixes: fixes,
      workflow: {
        name: data.project?.summary || data.project_identity?.project_name,
        categories: objectives
      },
      // Pass through the full project plan for proposal builder
      project_plan: data
    };
  }

  // Handle raw intake format
  return {
    format: 'raw_intake',
    document: { created_at: new Date().toISOString() },
    client: data.client || {},
    scorecard: { categories: [] },
    bleed: data.bleed,
    fixes: data.fixes || [],
    workflow: data.workflow
  };
}

/**
 * Extract workflow info from scorecard categories
 */
function extractWorkflowFromScorecard(scorecard) {
  if (!scorecard?.categories) return null;

  // Look for workflow name in category names or findings
  const categories = scorecard.categories;
  const workflowHints = [];

  for (const cat of categories) {
    if (cat.category_name) {
      workflowHints.push(cat.category_name);
    }
    if (cat.findings) {
      for (const finding of cat.findings) {
        if (finding.includes('workflow') || finding.includes('process')) {
          workflowHints.push(finding);
        }
      }
    }
  }

  return {
    name: workflowHints[0] || 'Business Process',
    categories: categories.map(c => c.category_name)
  };
}

/**
 * Extract client information
 */
function extractClientInfo(normalized) {
  const client = normalized.client || {};

  return {
    account_name: client.account_name || client.name || client.company || 'Client',
    industry: client.industry || inferIndustry(normalized),
    primary_contact: {
      name: client.primary_contact?.name || client.contact_name,
      title: client.primary_contact?.title || client.contact_title,
      email: client.primary_contact?.email || client.email
    }
  };
}

/**
 * Infer industry from context clues
 */
function inferIndustry(normalized) {
  const text = JSON.stringify(normalized).toLowerCase();

  const industryKeywords = {
    healthcare: ['patient', 'medical', 'hipaa', 'clinical', 'hospital', 'health'],
    financial_services: ['bank', 'finance', 'loan', 'payment', 'transaction', 'compliance'],
    legal: ['legal', 'law', 'attorney', 'contract', 'litigation', 'case'],
    retail_ecommerce: ['retail', 'ecommerce', 'order', 'inventory', 'fulfillment', 'product'],
    manufacturing: ['manufacturing', 'production', 'supply chain', 'warehouse', 'assembly'],
    technology: ['software', 'saas', 'api', 'platform', 'tech'],
    professional_services: ['consulting', 'agency', 'service', 'client management']
  };

  for (const [industry, keywords] of Object.entries(industryKeywords)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return industry;
      }
    }
  }

  return 'professional_services';
}

/**
 * Extract audit reference data
 */
function extractAuditReference(normalized) {
  const doc = normalized.document || {};

  return {
    audit_id: doc.document_id || doc.audit_id,
    audit_date: doc.created_at || new Date().toISOString(),
    report_type: normalized.format === 'traffic_light_report' ? 'Traffic Light Report' : 'Audit Report',
    workflow_name: normalized.workflow?.name
  };
}

/**
 * Extract workflow information
 */
function extractWorkflowInfo(normalized) {
  const workflow = normalized.workflow || {};

  return {
    name: workflow.name || 'Business Process Automation',
    description: workflow.description,
    categories: workflow.categories || [],
    volume: workflow.volume || workflow.transaction_volume,
    frequency: workflow.frequency
  };
}

/**
 * Extract systems involved
 */
function extractSystems(normalized) {
  const systems = new Set();

  // From workflow
  if (normalized.workflow?.systems) {
    normalized.workflow.systems.forEach(s => systems.add(s));
  }

  // From findings
  if (normalized.scorecard?.categories) {
    for (const cat of normalized.scorecard.categories) {
      if (cat.systems) {
        cat.systems.forEach(s => systems.add(s));
      }
      // Extract system names from findings text
      const findingsText = (cat.findings || []).join(' ');
      const systemMatches = findingsText.match(/\b[A-Z][a-zA-Z]+(?:CRM|ERP|HRM|API|DB)\b/g);
      if (systemMatches) {
        systemMatches.forEach(s => systems.add(s));
      }
    }
  }

  // From fixes
  if (normalized.fixes) {
    for (const fix of normalized.fixes) {
      if (fix.systems) {
        fix.systems.forEach(s => systems.add(s));
      }
    }
  }

  return Array.from(systems);
}

/**
 * Extract key findings
 */
function extractFindings(normalized) {
  const findings = [];

  if (normalized.scorecard?.categories) {
    for (const cat of normalized.scorecard.categories) {
      if (cat.findings) {
        for (const finding of cat.findings) {
          findings.push({
            category: cat.category_name,
            status: cat.status,
            finding: finding
          });
        }
      }
    }
  }

  // Also check for executive summary key points
  if (normalized.executive_summary?.key_finding) {
    findings.unshift({
      category: 'Executive Summary',
      status: 'critical',
      finding: normalized.executive_summary.key_finding
    });
  }

  return findings;
}

/**
 * Extract recommended fixes
 */
function extractRecommendedFixes(normalized) {
  const fixes = normalized.fixes || [];

  return fixes.map((fix, index) => {
    // Handle impact - could be string or object with display/basis
    let impact = fix.impact;
    if (typeof impact === 'object') {
      impact = impact.basis || impact.display || impact.estimated_recovery?.display;
    }

    // Handle effort tier - could be string or nested under effort.tier
    let effortTier = fix.effort_tier || fix.effort;
    if (typeof effortTier === 'object') {
      effortTier = effortTier.tier || 'moderate';
    }

    return {
      fix_id: fix.fix_id || fix.id || `fix_${index + 1}`,
      problem: fix.problem || fix.issue,
      fix: fix.fix || fix.solution || fix.recommendation,
      impact: impact || fix.expected_impact,
      effort_tier: effortTier || 'moderate',
      priority: fix.priority || index + 1
    };
  });
}

/**
 * Extract revenue bleed data
 */
function extractBleedData(normalized) {
  const bleed = normalized.bleed || {};

  // Parse amount - handle multiple formats from different audit sources
  // ai_audit_report uses: bleed.total.amount
  // simple format uses: bleed.monthly_total.amount or bleed.amount
  let amount = bleed.total?.amount ||
    bleed.monthly_total?.amount ||
    bleed.amount ||
    bleed.monthly_amount ||
    0;

  if (typeof amount === 'string') {
    amount = parseFloat(amount.replace(/[^0-9.]/g, '')) || 0;
  }

  return {
    monthly_amount: amount,
    currency: bleed.currency || 'USD',
    period: bleed.period || 'month',
    breakdown: bleed.breakdown || bleed.line_items || [],
    display: formatMoney(amount)
  };
}

/**
 * Extract complexity indicators for pricing
 */
function extractComplexityIndicators(normalized) {
  const systems = extractSystems(normalized);
  const fixes = extractRecommendedFixes(normalized);

  // Count critical/complex items
  const criticalCount = fixes.filter(f =>
    f.effort_tier?.toLowerCase().includes('critical') ||
    f.effort_tier?.toLowerCase().includes('complex')
  ).length;

  // Detect integration types
  const integrationTypes = detectIntegrationTypes(normalized);

  return {
    systems_count: systems.length,
    fix_count: fixes.length,
    critical_count: criticalCount,
    integration_types: integrationTypes,
    has_ai_component: detectAIComponent(normalized),
    data_sensitivity: detectDataSensitivity(normalized)
  };
}

/**
 * Detect integration types from context
 */
function detectIntegrationTypes(normalized) {
  const types = new Set(['api_available']); // Default assumption
  const text = JSON.stringify(normalized).toLowerCase();

  if (text.includes('webhook')) types.add('webhook_only');
  if (text.includes('csv') || text.includes('import') || text.includes('export')) {
    types.add('csv_import');
  }
  if (text.includes('scraping') || text.includes('rpa') || text.includes('robotic')) {
    types.add('scraping_required');
  }
  if (text.includes('custom connector') || text.includes('no api')) {
    types.add('custom_connector');
  }

  return Array.from(types);
}

/**
 * Detect if AI components are involved
 */
function detectAIComponent(normalized) {
  const text = JSON.stringify(normalized).toLowerCase();
  const aiKeywords = ['ai', 'machine learning', 'ml', 'nlp', 'classification', 'prediction', 'model'];

  return aiKeywords.some(kw => text.includes(kw));
}

/**
 * Detect data sensitivity level
 */
function detectDataSensitivity(normalized) {
  const text = JSON.stringify(normalized).toLowerCase();

  if (text.includes('hipaa') || text.includes('phi') || text.includes('protected health')) {
    return 'hipaa_phi';
  }
  if (text.includes('pci') || text.includes('sox') || text.includes('financial compliance')) {
    return 'financial_regulated';
  }
  if (text.includes('classified') || text.includes('government')) {
    return 'government_classified';
  }
  if (text.includes('pii') || text.includes('personal data') || text.includes('gdpr')) {
    return 'pii_present';
  }

  return 'standard';
}

/**
 * Format money for display
 */
function formatMoney(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Validate extracted data has minimum required fields
 */
function validateExtraction(extracted) {
  const errors = [];

  if (!extracted.client?.account_name) {
    errors.push('Missing client account name');
  }

  if (!extracted.bleed?.monthly_amount && extracted.bleed?.monthly_amount !== 0) {
    errors.push('Missing revenue bleed amount');
  }

  if (!extracted.findings?.length && !extracted.recommended_fixes?.length) {
    errors.push('No findings or fixes found in audit');
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

export {
  extractFromAudit,
  normalizeAuditFormat,
  extractClientInfo,
  extractAuditReference,
  extractWorkflowInfo,
  extractSystems,
  extractFindings,
  extractRecommendedFixes,
  extractBleedData,
  extractComplexityIndicators,
  validateExtraction
};

export default {
  extractFromAudit,
  normalizeAuditFormat,
  extractClientInfo,
  extractAuditReference,
  extractWorkflowInfo,
  extractSystems,
  extractFindings,
  extractRecommendedFixes,
  extractBleedData,
  extractComplexityIndicators,
  validateExtraction
};
