# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

**AI Proposal Generator** - A Node.js pipeline that transforms AI Process Audit reports into professional 2-page client-facing proposals. The system calculates dynamic pricing, structures milestones, and generates branded PDF proposals.

## Brand Identity

**Company Name:** Configurable via environment variables

### Color Palette
- **CTA/Accent**: Sunset Orange `#ff5f00`
- **Critical/Bleed**: Violet `#cf3c69`, Dark Violet `#972144`
- **Background**: Sand `#fcfaf5`
- **Text**: Night `#12111a` (primary), `#6a6380` (muted)
- **Borders**: Sand-300 `#dac39f`
- **Success**: Cactus Green `#5D8C61`

### Typography
- **Headings**: Outfit (600-800 weight)
- **Body**: Inter (400-500 weight)

## Development Commands

```bash
# Setup
npm install

# Environment variables
cp .env.example .env
# Edit .env with your API keys and company information

# Generate proposal from audit report
node cli.js generate <audit-report.json> <output.html>

# With options
node cli.js generate samples/sample_audit.json proposal.html --platform upwork --save-json
node cli.js generate samples/sample_audit.json proposal.html --platform direct --valid-days 7

# Utility commands
node cli.js validate <proposal.json>
node cli.js render <proposal.json> <output.html>
node cli.js calculate-pricing <samples/sample_audit.json>
node cli.js preview-milestones <samples/sample_audit.json>
```

## Architecture

### Pipeline Stages
1. **Extract** (`lib/extract_proposal.js`) - Parse audit report + requirements → proposal intake
2. **Calculate Pricing** (`lib/pricing_calculator.js`) - Apply rates, multipliers → pricing breakdown
3. **Build Milestones** (`lib/milestone_builder.js`) - Structure Phase 1/2/3 with nested milestones
4. **Transform** (`lib/transform_proposal.js`) - Merge into proposal JSON with LLM placeholders
5. **LLM Fill** (`lib/llm_batch_executor.js`) - Generate narratives via Gemini/Groq
6. **Validate** (`lib/validate.js`) - Schema validation
7. **Render** (`lib/pipeline.js`) - Mustache template → HTML
8. **PDF** (`lib/pdf_generator.js`) - Puppeteer → 2-page PDF

### Key Files
- `cli.js` - CLI entry point
- `lib/pipeline.js` - Main orchestration
- `lib/pricing_calculator.js` - Dynamic pricing engine
- `lib/milestone_builder.js` - Phase/milestone structure
- `templates/proposal_template.html` - 2-page Mustache template
- `schemas/proposal_schema.json` - JSON Schema validation
- `pricing/base_rates.json` - Service rates configuration
- `prompts/proposal_prompt_registry.json` - LLM prompt definitions

## Canonical Phase Structure

### Phase 1: Audit (Completed)
- References the AI Process Audit (Traffic Light Report)
- Cites findings and revenue bleed
- Already completed before proposal generation

### Phase 2: Stabilize (Current Scope)
Nested milestones with budget allocation:
- **Milestone 2.1: Design** (20%) - Architecture, integration planning
- **Milestone 2.2: Build** (45%) - Development, integration
- **Milestone 2.3: Test** (15%) - Alpha, beta testing
- **Milestone 2.4: Deploy** (20%) - Production, training

### Phase 3: Scale (Future)
- Mentioned as future opportunity
- Not detailed in proposal

## 2-Page Document Structure

### Page 1: Pricing Summary
- Header (logo, proposal #, validity)
- Executive Summary Card
- Investment Summary Table
- ROI Callout Box
- Terms Summary
- CTA Button

### Page 2: Scope of Work
- Compact Header
- Milestone Detail Cards (2.1-2.4)
- Scope Boundaries (In/Out)
- Change Control Statement
- Footer

## Platform Adaptation

### Upwork
- Milestone-based escrow payments
- Upwork fees paid by client
- Concise, efficient formatting

### Direct
- Invoice-based (NET 15/30)
- Bank transfer options
- More detailed descriptions

## Pricing Calculation

Pricing is calculated from:
1. **Base rates** (`pricing/base_rates.json`) - Hourly rates by skill type
2. **Effort estimation** - Derived from audit fix complexity tiers
3. **Complexity multipliers** (`pricing/complexity_multipliers.json`) - System count, integration difficulty
4. **Milestone allocation** - Design 20%, Build 45%, Test 15%, Deploy 20%

## LLM Integration

Uses Gemini API with Groq fallback:
- Primary: `gemini-2.5-pro`
- Fallback chain: `gemini-2.5-flash` → `gemini-2.0-flash` → Groq

Narratives generated:
- `proposal_executive_summary`
- `value_proposition`
- `milestone_design_description`
- `milestone_build_description`
- `milestone_test_description`
- `milestone_deploy_description`

## Critical Constraints

1. **Never disclose AI vendors** (OpenAI, Anthropic, etc.) in generated proposals
2. **Never use placeholders** - all fields must be filled in or added to questions list
3. **Always include change control** - scope changes after Design milestone may require separate pricing
4. **Always reference Phase 1 Audit** - cite findings and revenue bleed from audit report
5. **2 pages maximum** - Page 1 for Pricing Summary, Page 2 for Scope of Work
