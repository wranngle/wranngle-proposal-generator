# AI Proposal Generator

> ⚠️ **DEPRECATED**: This project has been superseded and is no longer maintained. This repository is archived for historical reference only.

Generate professional 2-page client-facing proposals from AI Process Audit reports.

## Overview

This pipeline transforms AI Process Audit reports (Traffic Light Reports) into branded Phase 2: Stabilize proposals with:

- **Dynamic pricing** calculated from audit findings
- **Milestone structure** (Design → Build → Test → Deploy)
- **ROI projections** based on identified revenue bleed
- **Platform-specific formatting** (Upwork vs Direct clients)
- **PDF generation** ready for client delivery

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your GEMINI_API_KEY

# Generate a proposal
node cli.js generate samples/audit_report.json proposal.html
```

## Commands

```bash
# Full proposal generation
node cli.js generate <audit.json> <output.html> [options]

Options:
  --platform <type>       Platform: "upwork" | "direct" (default: direct)
  --valid-days <n>        Proposal validity period (default: 14)
  --requirements <file>   Additional scope requirements
  --pricing-config <file> Custom pricing configuration
  --skip-pdf              Skip PDF generation (HTML only)
  --save-json             Save intermediate proposal JSON
  --use-groq              Use Groq API instead of Gemini

# Utility commands
node cli.js validate <proposal.json>
node cli.js render <proposal.json> <output.html>
node cli.js calculate-pricing <audit.json>
node cli.js preview-milestones <audit.json>
```

## Testing

Run the automated E2E test suite:

```bash
npm test
```

The test suite validates:
- All 6 critical fixes (truncation, milestone display, Phase 3 positioning, etc.)
- JSON schema compliance
- Complete proposal generation pipeline
- LLM output quality

See `test_run/README.md` for detailed test documentation.

## Output Structure

### Page 1: Pricing Summary
- Executive summary referencing Phase 1 audit
- Investment table with milestone breakdown
- ROI calculation (monthly bleed × 12)
- Payment terms and timeline
- Approve proposal CTA

### Page 2: Scope of Work
- Milestone detail cards (2.1-2.4)
- Deliverables per milestone
- Scope boundaries (In/Out)
- Change control statement

## Pricing Calculation

Pricing is dynamically calculated from:

1. **Audit findings** - Fix complexity tiers (Trivial/Moderate/Complex/Critical)
2. **Base rates** - Hourly rates by skill type
3. **Complexity multipliers** - System count, integration difficulty
4. **Milestone allocation** - 20% Design, 45% Build, 15% Test, 20% Deploy

Configure in `pricing/base_rates.json` and `pricing/complexity_multipliers.json`.

## Phase Structure

```
✓ Phase 1: Audit (Completed)
  └── Traffic Light Report with findings

► Phase 2: Stabilize (This Proposal)
  ├── Milestone 2.1: Design (20%)
  ├── Milestone 2.2: Build (45%)
  ├── Milestone 2.3: Test (15%)
  └── Milestone 2.4: Deploy (20%)

○ Phase 3: Scale (Future)
  └── Mentioned as partnership continuation
```

## Environment Variables

```bash
# Required
GEMINI_API_KEY=your-gemini-api-key

# Optional
GROQ_API_KEY=your-groq-api-key          # Fallback API
DEFAULT_VALIDITY_DAYS=14                 # Proposal expiration
DEFAULT_PLATFORM=direct                  # upwork | direct
PRODUCER_NAME=Your Company Name
PRODUCER_EMAIL=contact@example.com
```

## Project Structure

```
ai-proposal-generator/
├── cli.js                    # CLI entry point
├── lib/
│   ├── pipeline.js           # Main orchestration
│   ├── extract_proposal.js   # Parse audit reports
│   ├── pricing_calculator.js # Dynamic pricing
│   ├── milestone_builder.js  # Phase/milestone structure
│   ├── transform_proposal.js # Build proposal JSON
│   ├── llm_batch_executor.js # Narrative generation
│   ├── validate.js           # Schema validation
│   ├── pdf_generator.js      # PDF output
│   ├── model_config.js       # Gemini configuration
│   └── groq_adapter.js       # Groq fallback
├── prompts/
│   └── proposal_prompt_registry.json
├── schemas/
│   └── proposal_schema.json
├── templates/
│   └── proposal_template.html
├── pricing/
│   ├── base_rates.json
│   └── complexity_multipliers.json
└── samples/
```

## Related Repositories

This proposal generator is part of the Wranngle sales/proposal ecosystem:

| Repository | Purpose | Data Flow |
|------------|---------|-----------|
| **ai_audit_report** | Traffic Light Reports | **Input** - audit findings drive proposals |
| **ai_sales_engineering** | Project plan generation | Research enrichment, scope analysis |
| **n8n_workflow_development** | Technical research & n8n workflows | Provides integration research library |

### Ecosystem Flow

```
┌─────────────────────────────────┐
│       ai_audit_report           │
│   (Traffic Light Report)        │
│   └─ audit_findings.json        │
└────────────────┬────────────────┘
                 │ audit findings
                 ▼
┌─────────────────────────────────┐
│   wranngle-proposal-generator   │◄──────────────┐
│   (This Repository)             │               │
│   ├─ Dynamic pricing            │               │
│   ├─ Milestone structure        │  project      │
│   └─ 2-page PDF proposals       │  plans        │
└─────────────────────────────────┘               │
                                                  │
┌─────────────────────────────────┐               │
│     ai_sales_engineering        │───────────────┘
│   └─ Project plan generation    │
│   └─ Integration research       │
└────────────────┬────────────────┘
                 │ reads research
                 ▼
┌─────────────────────────────────┐
│   n8n_workflow_development      │
│   └─ context/technical-research │
│      └─ library-index.json      │
└─────────────────────────────────┘
```

### Shared Patterns

All repositories share:
- Same CSS/branding (Wranngle colors, Outfit/Inter fonts)
- Same LLM integration (Gemini primary, Groq fallback)
- Same Mustache templating approach
- Same Ajv validation patterns
- Same file organization (`input/`, `output/{company}/`)

---

## License

MIT License - See LICENSE file for details
