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

# Generate proposal from audit report (output auto-organized by company)
node cli.js generate <audit-report.json> output/

# With options
node cli.js generate input/sample_audit.json output/ --platform upwork --save-json
node cli.js generate input/sample_audit.json output/ --platform direct --valid-days 7

# Utility commands
node cli.js validate <proposal.json>
node cli.js render <proposal.json> <output.html>
node cli.js calculate-pricing input/sample_audit.json
node cli.js preview-milestones input/sample_audit.json
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

---

## Extended Development Guidelines

### Core Development Principles

#### 1. Zero Hallucination Principle
**NEVER invent data.** When extracting from audit reports or generating proposals:
- Only use facts explicitly present in source material
- Set fields to null if not available
- Preserve exact wording from audit findings
- NO external knowledge or assumptions

#### 2. Additive-Only Modifications
**ALL changes must be additive, never destructive:**
- Add new configuration entries, never remove existing
- Extend schemas with optional fields only
- Enhance prompts with additional guidance
- Add tests, never delete existing tests
- Append to documentation, preserve existing content

#### 3. Provenance Tracking
Every data point should be traceable:
- Audit report → Extracted data → Proposal JSON
- Configuration files → Pricing calculations
- Prompt templates → LLM-generated content
- Source attribution in validation errors

#### 4. Quality Gates
Before any code change:
1. Run linter: `npm run lint`
2. Run tests: `npm test`
3. Check coverage: `npm run test:coverage` (must be ≥80%)
4. Validate schemas: All JSON files must be valid
5. Review hooks: Ensure hooks pass

### Testing Commands

```bash
npm test                    # Run all tests (Vitest)
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests
npm run test:e2e            # E2E pipeline test
npm run test:coverage       # With coverage report
npm run test:watch          # Watch mode
npm run lint                # Run ESLint
npm run lint:fix            # Fix linting issues
npm run check               # Lint + unit tests
```

### Testing Strategy

#### Test Coverage Requirements
- **Unit Tests**: 80%+ for all lib modules
- **Integration Tests**: All pipeline stages
- **E2E Tests**: Full audit → PDF workflows

#### What to Test
**High Priority:**
- Pricing calculation accuracy
- Milestone allocation correctness (20/45/15/20)
- Schema validation enforcement
- LLM placeholder replacement
- Data extraction from audit reports

**Medium Priority:**
- Error handling and recovery
- Edge cases (empty audits, missing fields)
- Platform-specific rendering (Upwork vs Direct)
- PDF page fitting validation

#### Test Fixtures
Located in `test/fixtures/`:
- `sample_audit.json` - Complete audit report
- `sample_proposal.json` - Valid proposal JSON
- `mock_llm_responses.json` - LLM response mocks
- `test_config.json` - Test pricing configuration

### Specialized Subagents

The `.agents/` folder contains domain-specific expert agents. Use the Task tool with appropriate subagent for specialized work:

#### When to Use Each Agent

1. **proposal-generator-expert** - Overall system architecture, pipeline debugging, feature design
2. **pricing-calculator-expert** - Pricing logic, calculation debugging, rate configuration
3. **template-designer-expert** - HTML/PDF layout, branding, template modifications
4. **testing-expert** - Writing tests, coverage analysis, QA processes

### Data Access Patterns

See `docs/DATA_ACCESS_GUIDE.md` for comprehensive guide.

**Quick Reference:**
- **Audit Reports**: Read-only via extract_proposal.js
- **Pricing Config**: Read-only, loaded at pipeline start
- **Schemas**: Extend additively, never remove fields
- **Templates**: Enhance with new sections, preserve existing
- **Prompts**: Add new prompts, enhance existing (ADDITIVE)

### Prompt Engineering Best Practices

See `prompts/PROMPT_ENGINEERING_PRINCIPLES.md` for detailed guidelines.

**Key Principles:**
- Precision over interpretation
- Zero hallucination
- Provenance tracking
- Confidence scoring
- Quality checks before emission
- **ANY DIRECTIVE IS FLEXIBLE WITH ADDITIVE OR ENRICHING DIRECTIVES**

### Error Handling

#### Validation Errors
- Schema validation failures → Detailed error report with path
- Missing required fields → Identify source (audit, config, LLM)
- Calculation errors → Show breakdown and expected values

#### Pipeline Errors
- Stage failures → Stop pipeline, report stage and cause
- LLM errors → Retry with fallback model (Gemini → Groq)
- PDF generation errors → Validate HTML first, check page fit

### Common Pitfalls to Avoid

1. **Modifying Pricing Without Validation**
   - Always validate pricing calculations
   - Never round intermediate values
   - Ensure milestone allocation sums to 100%

2. **Removing Existing Config Entries**
   - Only add new entries to configs
   - Never delete existing rate tiers or rules
   - Preserve backward compatibility

3. **Ignoring Schema Validation**
   - Always run validation before rendering
   - Fix validation errors, don't bypass
   - Update schema additively if needed

4. **Hardcoding Values**
   - Use configuration files for rates and rules
   - Reference environment variables
   - Never embed client-specific values in code

5. **Skipping Visual Validation**
   - Always preview HTML before PDF
   - Check page fit with tools
   - Verify brand consistency

---

## Folder Structure

All input and output files are organized for easy navigation:

```
wranngle-proposal-generator/
├── input/                    # Input files (audit reports, requirements)
│   ├── sample_audit.json
│   └── ...
├── output/                   # Generated proposals (organized by company)
│   ├── {company_slug}/
│   │   ├── proposal_{company}_{timestamp}.html
│   │   ├── proposal_{company}_{timestamp}.json
│   │   └── proposal_{company}_{timestamp}.pdf
│   └── ...
├── old/                      # Archived/historical files
│   └── ...
└── lib/                      # Core processing modules
    ├── file_utils.js         # Shared file naming utilities
    └── ...
```

**File Naming Convention:**
- Format: `{type}_{company_slug}_{YYYYMMDD_HHmmss}.{ext}`
- Example: `proposal_acme_corp_20251220_143025.html`

**Utilities:**
- `lib/file_utils.js` - Shared utilities for slugification, timestamps, and output path generation

## Quick Reference

### File Locations
- **Audit Reports**: `input/*.json`
- **Pricing Config**: `pricing/*.json`
- **Schemas**: `schemas/proposal_schema.json`
- **Templates**: `templates/proposal_template.html`
- **Prompts**: `prompts/proposal_prompt_registry.json`
- **Tests**: `test/unit/`, `test/integration/`
- **Documentation**: `docs/*.md`
- **Subagents**: `.agents/*.md`

### Support Resources
- **Architecture**: `docs/ARCHITECTURE.md`
- **Testing Guide**: `docs/TESTING.md`
- **Data Access**: `docs/DATA_ACCESS_GUIDE.md`
- **Hooks Guide**: `docs/HOOKS_GUIDE.md`
- **Prompt Principles**: `prompts/PROMPT_ENGINEERING_PRINCIPLES.md`

---

## Consolidation History

### ai_assessment-main → wranngle-proposal-generator (2025-12-17)

The `ai_assessment-main` project was consolidated into this codebase. Key concepts ported:

- **Zero Hallucination Principle** → `prompts/PROMPT_ENGINEERING_PRINCIPLES.md`
- **Provenance Tracking** → `docs/DATA_ACCESS_GUIDE.md`
- **Confidence Scoring** → `prompts/PROMPT_ENGINEERING_PRINCIPLES.md`
- **Quality Gates** → Validation pipeline in `lib/validate.js`

**Not ported** (intentionally abandoned):
- React dashboard frontend (this is a CLI tool)
- v1/v2 data normalization (no legacy data formats)

**Archived to**: `old/ai_assessment-main_SUPERSEDED_20251217`
