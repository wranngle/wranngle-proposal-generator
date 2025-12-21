#!/usr/bin/env node

/**
 * AI Proposal Generator CLI
 * Generate 2-page client-facing proposals from AI Process Audit reports
 *
 * Output is organized by company in the output directory:
 *   output/{company}/proposal_{company}_{timestamp}.html
 */

import 'dotenv/config';
import { program } from 'commander';
import fs from 'fs';
import path from 'path';

import { generate, calculatePricingOnly, previewMilestones, renderFromJson } from './lib/pipeline.js';
import { slugify, generateOutputPath, ensureDir } from './lib/file_utils.js';

/**
 * Generate organized output path for a proposal
 * Uses company subdirectory for organization
 *
 * @param {string} clientName - Client name for folder/file naming
 * @param {string} ext - File extension (html, pdf, json)
 * @param {string} outputDir - Base output directory
 * @returns {string} Full path to output file
 */
function generateProposalOutputPath(clientName, ext, outputDir = 'output') {
  const result = generateOutputPath({
    outputDir,
    type: 'proposal',
    company: clientName || 'client',
    ext
  });
  return result.path;
}

/**
 * Extract client name from audit JSON or project plan
 * @param {string} auditPath - Path to audit JSON or project_plan JSON
 * @returns {string} Client name or default
 */
function extractClientName(auditPath) {
  try {
    const data = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
    return data.project_identity?.client_name ||
           data.project?.client?.name ||
           data.client?.account_name ||
           data.prepared_for?.account_name ||
           data.company_name ||
           'client';
  } catch {
    return 'client';
  }
}

import { validateProposal, formatErrors, formatWarnings } from './lib/validate.js';

program
  .name('ai-proposal')
  .description('Generate 2-page client-facing proposals from AI Process Audit reports')
  .version('1.0.0');

// Main generate command
program
  .command('generate <audit> [output]')
  .description('Generate proposal from audit report')
  .option('-o, --output <path>', 'Output directory or file path')
  .option('-p, --platform <type>', 'Platform: "upwork" | "direct"', 'direct')
  .option('--skip-pdf', 'Skip PDF generation')
  .option('--save-json', 'Save intermediate JSON')
  .option('--use-groq', 'Use Groq API')
  .option('-f, --force', 'Force generation')
  .action(async (auditPath, outputArg, options) => {
    try {
      // Validate API key
      if (!options.useGroq && !process.env.GEMINI_API_KEY) {
        console.error('Error: GEMINI_API_KEY environment variable required');
        console.error('Set it in .env file or use --use-groq flag');
        process.exit(1);
      }
      if (options.useGroq && !process.env.GROQ_API_KEY) {
        console.error('Error: GROQ_API_KEY environment variable required when using --use-groq');
        process.exit(1);
      }

      // Validate input exists
      if (!fs.existsSync(auditPath)) {
        console.error(`Error: Audit file not found: ${auditPath}`);
        process.exit(1);
      }

      // Determine output path - uses organized structure: output/{company}/
      let outputPath;
      const clientName = extractClientName(auditPath);
      const outputTarget = options.output || outputArg || 'output';

      if (fs.existsSync(outputTarget) && fs.statSync(outputTarget).isDirectory()) {
        outputPath = generateProposalOutputPath(clientName, 'html', outputTarget);
      } else if (outputTarget.endsWith('/') || outputTarget.endsWith('\\')) {
        const outputDir = outputTarget.slice(0, -1);
        ensureDir(outputDir);
        outputPath = generateProposalOutputPath(clientName, 'html', outputDir);
      } else if (!outputTarget.endsWith('.html')) {
        // Treat as directory
        ensureDir(outputTarget);
        outputPath = generateProposalOutputPath(clientName, 'html', outputTarget);
      } else {
        // Output is a specific filename - organize into company subfolder
        const dir = path.dirname(outputTarget);
        const filename = path.basename(outputTarget);
        const companySlug = slugify(clientName);
        const organizedDir = path.join(dir, companySlug);
        ensureDir(organizedDir);
        outputPath = path.join(organizedDir, filename);
      }

      console.log(`\nGenerating proposal from: ${auditPath}`);
      console.log(`Output: ${outputPath}`);
      console.log(`Platform: ${options.platform}`);
      if (options.useGroq) console.log('Using: Groq API');
      console.log('');

      const result = await generate(auditPath, outputPath, {
        platform: options.platform,
        skipPdf: options.skipPdf,
        saveJson: options.saveJson,
        useGroq: options.useGroq,
        force: options.force
      });

      if (result.success) {
        console.log('\n✓ Proposal generated successfully');
      } else {
        console.error('\n✗ Proposal generation failed');
        process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      if (process.env.DEBUG) console.error(error.stack);
      process.exit(1);
    }
  });

// Validate command
program
  .command('validate <proposal>')
  .description('Validate a proposal JSON file')
  .action(async (proposalPath) => {
    try {
      if (!fs.existsSync(proposalPath)) {
        console.error(`Error: File not found: ${proposalPath}`);
        process.exit(1);
      }

      const proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8'));
      const result = validateProposal(proposal);

      console.log(`\nValidating: ${proposalPath}\n`);

      if (result.valid) {
        console.log('✓ Proposal is valid');
      } else {
        console.log('✗ Validation failed');
        console.log('\nErrors:');
        console.log(formatErrors(result.errors));
      }

      if (result.warnings?.length > 0) {
        console.log('\nWarnings:');
        console.log(formatWarnings(result.warnings));
      }

      process.exit(result.valid ? 0 : 1);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Render command
program
  .command('render <proposal> <output>')
  .description('Render HTML from proposal JSON')
  .option('--skip-pdf', 'Skip PDF generation')
  .option('--template <file>', 'Custom HTML template')
  .option('-f, --force', 'Render even if validation fails')
  .action(async (proposalPath, outputPath, options) => {
    try {
      if (!fs.existsSync(proposalPath)) {
        console.error(`Error: File not found: ${proposalPath}`);
        process.exit(1);
      }

      console.log(`\nRendering: ${proposalPath}`);

      const result = await renderFromJson(proposalPath, outputPath, {
        skipPdf: options.skipPdf,
        templatePath: options.template,
        force: options.force
      });

      console.log(`\n✓ HTML: ${result.htmlPath}`);
      if (result.pdfPath) console.log(`✓ PDF:  ${result.pdfPath}`);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Calculate pricing command
program
  .command('calculate-pricing <audit>')
  .description('Calculate pricing from audit report (no generation)')
  .option('-c, --pricing-config <file>', 'Custom pricing configuration')
  .option('--json', 'Output as JSON')
  .action(async (auditPath, options) => {
    try {
      if (!fs.existsSync(auditPath)) {
        console.error(`Error: File not found: ${auditPath}`);
        process.exit(1);
      }

      let pricingOptions = {};
      if (options.pricingConfig) {
        pricingOptions = JSON.parse(fs.readFileSync(options.pricingConfig, 'utf8'));
      }

      const result = await calculatePricingOnly(auditPath, pricingOptions);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log('\n=== Pricing Calculation ===\n');
        console.log(`Base Price:      ${result.summary.base_price}`);
        console.log(`Multiplier:      ${result.summary.multiplier}x`);
        console.log(`Final Price:     ${result.summary.final_price}`);
        console.log('');
        console.log(`Monthly Bleed:   ${result.summary.monthly_bleed}`);
        console.log(`Payback Period:  ${result.summary.payback}`);
        console.log('\n=== Milestone Breakdown ===\n');
        const ms = result.pricing.milestones;
        console.log(`2.1 Design:  ${ms.design.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })} (${ms.design.percentage}%)`);
        console.log(`2.2 Build:   ${ms.build.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })} (${ms.build.percentage}%)`);
        console.log(`2.3 Test:    ${ms.test.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })} (${ms.test.percentage}%)`);
        console.log(`2.4 Deploy:  ${ms.deploy.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })} (${ms.deploy.percentage}%)`);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Preview milestones command
program
  .command('preview-milestones <audit>')
  .description('Preview milestone structure from audit')
  .option('--json', 'Output as JSON')
  .action(async (auditPath, options) => {
    try {
      if (!fs.existsSync(auditPath)) {
        console.error(`Error: File not found: ${auditPath}`);
        process.exit(1);
      }

      const phases = await previewMilestones(auditPath);

      if (options.json) {
        console.log(JSON.stringify(phases, null, 2));
      } else {
        console.log('\n=== Phase Structure ===\n');
        for (const phase of phases) {
          const stateIcon = { complete: '✓', current: '►', upcoming: '○' }[phase.state];
          console.log(`${stateIcon} Phase ${phase.phase_number}: ${phase.phase_name} [${phase.state}]`);

          if (phase.milestones) {
            for (const ms of phase.milestones) {
              const price = ms.price_allocation?.display || '';
              const duration = ms.duration?.display || '';
              console.log(`    ${ms.milestone_number} ${ms.milestone_name} ${duration} ${price}`);

              if (ms.deliverables?.length > 0) {
                for (const del of ms.deliverables.slice(0, 3)) {
                  console.log(`        - ${del.name}`);
                }
                if (ms.deliverables.length > 3) {
                  console.log(`        ... and ${ms.deliverables.length - 3} more`);
                }
              }
            }
          }
          console.log('');
        }
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Parse and run
program.parse();
