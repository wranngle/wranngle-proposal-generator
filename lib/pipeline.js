/**
 * AI Proposal Generator Pipeline
 * Main orchestration for proposal generation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Mustache from 'mustache';
import { extractFromAudit, validateExtraction } from './extract_proposal.js';
import { buildProposal, getPlaceholderPaths } from './transform_proposal.js';
import { calculatePricing, calculateROI, formatMoney } from './pricing_calculator.js';
import { fillProposalPlaceholders } from './llm_batch_executor.js';
import { validateProposal, validateAndRepair, formatErrors, formatWarnings } from './validate.js';
import { generatePDF, generatePDFFromString, validatePageFit } from './pdf_generator.js';
import { runFinalHtmlPass, manualPolishHTML } from './html_final_pass.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load template
const TEMPLATE_PATH = path.join(__dirname, '../templates/proposal_template.html');

/**
 * Full proposal generation pipeline
 * @param {string} auditPath - Path to audit JSON
 * @param {string} outputPath - Path for output HTML
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generation result
 */
async function generate(auditPath, outputPath, options = {}) {
  const startTime = Date.now();
  const results = {
    stages: {},
    success: false,
    outputPath: null,
    pdfPath: null
  };

  try {
    // Stage 1: Extract
    console.log('Stage 1: Extracting data from audit report...');
    const extracted = await runExtract(auditPath, options);
    results.stages.extract = { success: true, data: summarizeExtracted(extracted) };

    // Stage 2: Transform
    console.log('Stage 2: Building proposal structure...');
    const proposal = await runTransform(extracted, options);
    results.stages.transform = { success: true, placeholders: getPlaceholderPaths(proposal).length };

    // Stage 3: LLM Fill
    console.log('Stage 3: Generating narrative content...');
    const filledProposal = await runLLMFill(proposal, extracted, options);
    results.stages.llmFill = { success: true };

    // Stage 4: Validate
    console.log('Stage 4: Validating proposal...');
    const validation = await runValidate(filledProposal);
    results.stages.validate = validation;

    if (!validation.valid && !options.force) {
      console.error('Validation failed. Use --force to generate anyway.');
      console.error(formatErrors(validation.errors));
      return results;
    }

    // Stage 5: Render
    console.log('Stage 5: Rendering HTML...');
    const htmlPath = await runRender(filledProposal, outputPath, options);
    results.stages.render = { success: true, path: htmlPath };
    results.outputPath = htmlPath;

    // Stage 6: HTML Polish Pass (ALWAYS runs - mandatory LLM polish)
    console.log('Stage 6: Running final HTML polish...');
    const polishResult = await runFinalHtmlPass(htmlPath, {
      client_name: filledProposal.prepared_for?.account_name || 'Client',
      total_price: filledProposal.pricing?.total?.display || '$0',
      platform: filledProposal.rendering?.platform || 'direct'
    }, {
      useGroq: options.useGroq || false
    });

    results.stages.htmlPolish = {
      success: true,
      method: 'llm',
      changes: polishResult.changes
    };

    if (polishResult.changes?.length > 0) {
      console.log(`  Polish applied: ${polishResult.changes.length} improvement(s)`);
    }

    // Save intermediate JSON if requested
    if (options.saveJson) {
      const jsonPath = outputPath.replace(/\.html$/i, '.json');
      fs.writeFileSync(jsonPath, JSON.stringify(filledProposal, null, 2));
      results.jsonPath = jsonPath;
      console.log(`Saved proposal JSON: ${jsonPath}`);

      // Save HTML polish log if any changes were made
      if (results.stages.htmlPolish?.changes?.length > 0 && results.stages.htmlPolish.method !== 'skipped') {
        const polishLogPath = outputPath.replace(/\.html$/i, '_html_polish_log.json');
        fs.writeFileSync(polishLogPath, JSON.stringify(results.stages.htmlPolish.changes, null, 2));
        console.log(`Saved HTML polish log: ${polishLogPath}`);
      }
    }

    // Stage 7: PDF
    if (!options.skipPdf) {
      console.log('Stage 7: Generating PDF...');
      const pdfPath = await runPdfGenerate(htmlPath, options);
      results.stages.pdf = { success: true, path: pdfPath };
      results.pdfPath = pdfPath;
    }

    results.success = true;
    results.duration = Date.now() - startTime;

    console.log(`\nProposal generated successfully in ${results.duration}ms`);
    console.log(`  HTML: ${results.outputPath}`);
    if (results.pdfPath) console.log(`  PDF:  ${results.pdfPath}`);
    if (results.jsonPath) console.log(`  JSON: ${results.jsonPath}`);

    return results;

  } catch (error) {
    results.error = error.message;
    results.stack = error.stack;
    console.error('Pipeline failed:', error.message);
    throw error;
  }
}

/**
 * Extract stage
 */
async function runExtract(auditPath, options) {
  const extracted = extractFromAudit(auditPath);

  const validation = validateExtraction(extracted);
  if (!validation.valid) {
    console.warn('Extraction warnings:', validation.errors.join(', '));
  }

  return extracted;
}

/**
 * Transform stage
 */
async function runTransform(extracted, options) {
  const proposal = buildProposal(extracted, {
    platform: options.platform || 'direct',
    valid_days: options.validDays || 14,
    pricing_options: options.pricingOptions || {}
  });

  return proposal;
}

/**
 * LLM Fill stage
 */
async function runLLMFill(proposal, extracted, options) {
  const context = {
    // Add any additional context from options or requirements
    ...options.additionalContext
  };

  const filled = await fillProposalPlaceholders(proposal, context, {
    useGroq: options.useGroq || false
  });

  return filled;
}

/**
 * Validate stage
 */
async function runValidate(proposal) {
  const result = validateAndRepair(proposal);

  if (result.warnings?.length > 0) {
    console.warn('Validation warnings:');
    console.warn(formatWarnings(result.warnings));
  }

  return result;
}

/**
 * Render stage
 */
async function runRender(proposal, outputPath, options) {
  // Load template
  let template;
  if (options.templatePath) {
    template = fs.readFileSync(options.templatePath, 'utf8');
  } else if (fs.existsSync(TEMPLATE_PATH)) {
    template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  } else {
    // Use minimal fallback template
    template = generateFallbackTemplate();
  }

  // Prepare template data
  const templateData = prepareTemplateData(proposal);

  // Render with Mustache
  const html = Mustache.render(template, templateData);

  // Write output
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, html, 'utf8');

  return outputPath;
}

/**
 * PDF generation stage
 */
async function runPdfGenerate(htmlPath, options) {
  const pdfPath = htmlPath.replace(/\.html$/i, '.pdf');
  await generatePDF(htmlPath, pdfPath, options.pdfOptions || {});
  return pdfPath;
}

/**
 * Prepare data for template rendering
 */
function prepareTemplateData(proposal) {
  // Deep clone to avoid mutating original
  const data = JSON.parse(JSON.stringify(proposal));

  // Add computed fields for template
  data._year = new Date().getFullYear();
  data._generated_at = new Date().toISOString();

  // Format dates for display
  if (data.document?.created_at) {
    data.document.created_at_display = formatDateDisplay(data.document.created_at);
  }
  if (data.document?.valid_until) {
    data.document.valid_until_display = formatDateDisplay(data.document.valid_until);
  }

  // Phase helpers
  if (data.phases) {
    data.phase_audit = data.phases.find(p => p.phase_name === 'Audit');
    data.phase_stabilize = data.phases.find(p => p.phase_name === 'Stabilize');
    data.phase_scale = data.phases.find(p => p.phase_name === 'Scale');

    // Milestone helpers for Phase 2
    if (data.phase_stabilize?.milestones) {
      data.milestone_design = data.phase_stabilize.milestones.find(m => m.milestone_number === '2.1');
      data.milestone_build = data.phase_stabilize.milestones.find(m => m.milestone_number === '2.2');
      data.milestone_test = data.phase_stabilize.milestones.find(m => m.milestone_number === '2.3');
      data.milestone_deploy = data.phase_stabilize.milestones.find(m => m.milestone_number === '2.4');
    }
  }

  // Boolean helpers for conditionals
  data._is_upwork = data.rendering?.platform === 'upwork';
  data._is_direct = data.rendering?.platform === 'direct';
  data._has_discount = data.pricing?.discount_applied?.percentage > 0;
  data._has_secondary_cta = !!data.cta?.secondary_action;
  data._has_savings = !!(data.pricing?.audit_credit || data.pricing?.early_adopter_discount);

  return data;
}

/**
 * Format date for display
 */
function formatDateDisplay(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Summarize extracted data for logging
 */
function summarizeExtracted(extracted) {
  return {
    client: extracted.client?.account_name,
    industry: extracted.client?.industry,
    bleed: extracted.bleed?.display,
    findings: extracted.findings?.length || 0,
    fixes: extracted.recommended_fixes?.length || 0,
    systems: extracted.systems?.length || 0
  };
}

/**
 * Generate minimal fallback template
 */
function generateFallbackTemplate() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{document.title}} - {{prepared_for.account_name}}</title>
  <style>
    body { font-family: Inter, sans-serif; margin: 2rem; }
    h1 { color: #ff5f00; }
    .section { margin: 1.5rem 0; padding: 1rem; border: 1px solid #dac39f; }
  </style>
</head>
<body>
  <h1>{{document.title}}</h1>
  <p>Prepared for: {{prepared_for.account_name}}</p>
  <p>Proposal: {{document.proposal_number}}</p>

  <div class="section">
    <h2>Executive Summary</h2>
    <p>{{executive_summary.body}}</p>
  </div>

  <div class="section">
    <h2>Investment</h2>
    <p><strong>Total: {{pricing.total.display}}</strong></p>
  </div>

  <div class="section">
    <h2>ROI</h2>
    <p>Monthly Recovery: {{roi.monthly_recovery.display}}</p>
    <p>Payback Period: {{roi.payback_display}}</p>
  </div>

  <div class="section">
    <h2>Next Steps</h2>
    <p>{{cta.headline}}</p>
    <p><a href="{{cta.link}}">{{cta.link_display}}</a></p>
  </div>

  <footer>
    <p>Valid until {{document.valid_until_display}}</p>
    <p>{{prepared_by.producer_name}} | {{prepared_by.producer_email}}</p>
  </footer>
</body>
</html>`;
}

/**
 * Calculate pricing only (utility command)
 */
async function calculatePricingOnly(auditPath, options = {}) {
  const extracted = extractFromAudit(auditPath);
  const pricing = calculatePricing(extracted.raw_audit || extracted, options);
  const roi = calculateROI(extracted.bleed?.monthly_amount || 0, pricing.final_price);

  return {
    pricing,
    roi,
    summary: {
      base_price: formatMoney(pricing.base_price),
      multiplier: pricing.complexity_multiplier.toFixed(2),
      final_price: formatMoney(pricing.final_price),
      monthly_bleed: formatMoney(extracted.bleed?.monthly_amount || 0),
      payback: roi.payback_display
    }
  };
}

/**
 * Preview milestones only (utility command)
 */
async function previewMilestones(auditPath, options = {}) {
  const extracted = extractFromAudit(auditPath);
  const proposal = buildProposal(extracted, options);

  return proposal.phases;
}

/**
 * Render from existing proposal JSON
 */
async function renderFromJson(proposalPath, outputPath, options = {}) {
  const proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8'));

  const validation = validateProposal(proposal);
  if (!validation.valid && !options.force) {
    throw new Error('Invalid proposal JSON: ' + formatErrors(validation.errors));
  }

  const htmlPath = await runRender(proposal, outputPath, options);

  if (!options.skipPdf) {
    const pdfPath = await runPdfGenerate(htmlPath, options);
    return { htmlPath, pdfPath };
  }

  return { htmlPath };
}

export {
  generate,
  runExtract,
  runTransform,
  runLLMFill,
  runValidate,
  runRender,
  runPdfGenerate,
  calculatePricingOnly,
  previewMilestones,
  renderFromJson,
  prepareTemplateData
};

export default {
  generate,
  runExtract,
  runTransform,
  runLLMFill,
  runValidate,
  runRender,
  runPdfGenerate,
  calculatePricingOnly,
  previewMilestones,
  renderFromJson,
  prepareTemplateData
};
