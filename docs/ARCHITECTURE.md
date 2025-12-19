# Wranngle Proposal Generator - Architecture

This document describes the system architecture of the Wranngle Proposal Generator.

---

## Overview

The Proposal Generator is a Node.js CLI tool that transforms AI Process Audit reports into client-ready 2-page proposals with dynamic pricing, milestone structures, and LLM-generated narratives.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INPUT LAYER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  Audit Report         Pricing Config        Schema           Prompts        │
│  (samples/*.json)     (pricing/*.json)      (schemas/)       (prompts/)     │
└─────────┬─────────────────────┬───────────────────┬───────────────┬────────┘
          │                     │                   │               │
          ▼                     ▼                   │               │
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PROCESSING LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐    ┌──────────────────┐    ┌────────────────────┐        │
│   │   Extract    │───▶│ Calculate Pricing │───▶│  Build Milestones  │        │
│   │ (audit data) │    │ (dynamic pricing) │    │  (phase structure) │        │
│   └──────────────┘    └──────────────────┘    └────────────────────┘        │
│          │                     │                        │                    │
│          │                     │                        │                    │
│          ▼                     ▼                        ▼                    │
│   ┌──────────────────────────────────────────────────────────────┐          │
│   │              Transform to Proposal JSON                       │          │
│   │            (build complete proposal structure)                │          │
│   └──────────────────────────────────────────────────────────────┘          │
│                               │                                              │
│                               ▼                                              │
│   ┌──────────────────────────────────────────────────────────────┐          │
│   │           LLM Fill Placeholders (Gemini/Groq)                │◀─ Prompts│
│   │           (generate narrative content)                        │          │
│   └──────────────────────────────────────────────────────────────┘          │
│                               │                                              │
│                               ▼                                              │
│   ┌──────────────────────────────────────────────────────────────┐          │
│   │                    Validate (JSON Schema)                     │◀─ Schema │
│   │                  (ensure proposal integrity)                  │          │
│   └──────────────────────────────────────────────────────────────┘          │
│                                                                              │
└─────────┬────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             OUTPUT LAYER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│   │   Render HTML    │───▶│  HTML Polish Pass │───▶│   Generate PDF   │      │
│   │   (Mustache)     │    │   (final review)  │    │   (Puppeteer)    │      │
│   └──────────────────┘    └──────────────────┘    └──────────────────┘      │
│                                                              │               │
│                                                              ▼               │
│   OUTPUT: proposal.html, proposal.pdf, proposal.json (optional)             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Module Responsibilities

### Core Pipeline Modules

| Module | File | Responsibility |
|--------|------|----------------|
| **CLI** | `cli.js` | Command-line interface, argument parsing |
| **Pipeline** | `lib/pipeline.js` | Main orchestration, stage coordination |
| **Extract** | `lib/extract_proposal.js` | Parse audit JSON, extract key data |
| **Pricing** | `lib/pricing_calculator.js` | Dynamic pricing calculation |
| **Milestones** | `lib/milestone_builder.js` | Phase/milestone structure (20/45/15/20) |
| **Transform** | `lib/transform_proposal.js` | Build complete proposal JSON |
| **LLM Executor** | `lib/llm_batch_executor.js` | Batch LLM calls, placeholder replacement |
| **Validate** | `lib/validate.js` | JSON Schema validation |
| **HTML Polish** | `lib/html_final_pass.js` | Final HTML review pass |
| **PDF Generator** | `lib/pdf_generator.js` | Puppeteer PDF generation |

### Supporting Modules

| Module | File | Responsibility |
|--------|------|----------------|
| **Model Config** | `lib/model_config.js` | Gemini API configuration |
| **Groq Adapter** | `lib/groq_adapter.js` | Groq API fallback |

---

## Data Flow

### Stage 1: Extract
```javascript
Input:  Audit JSON (samples/*.json)
Output: Extracted data object
        - client_info: { account_name, industry, contact }
        - findings: [{ title, severity, complexity, hours, bleed }]
        - systems: [{ name, type, integration_capability }]
        - revenue_bleed: { monthly, annual }
```

### Stage 2: Calculate Pricing
```javascript
Input:  Extracted data + Pricing config
Output: Pricing object
        - total: number
        - breakdown: { base_cost, complexity_adjustment, system_adjustment }
        - by_complexity: { trivial, moderate, complex, critical }
```

### Stage 3: Build Milestones
```javascript
Input:  Pricing total
Output: Milestone allocation
        - design: 20% ($X)
        - build: 45% ($X)
        - test: 15% ($X)
        - deploy: 20% ($X)
```

### Stage 4: Transform
```javascript
Input:  Extracted data + Pricing + Milestones
Output: Proposal JSON (with LLM placeholders)
        - assessment_metadata
        - prepared_for
        - executive_summary: "[LLM_PLACEHOLDER:executive_summary_proposal_v1]"
        - phases: [{ milestones: [...] }]
        - pricing: { total, breakdown }
        - scope: { in_scope, out_of_scope, assumptions }
        - cta: { headline, subtext }
```

### Stage 5: LLM Fill
```javascript
Input:  Proposal JSON with placeholders
Output: Proposal JSON with generated content
        - Replaces all [LLM_PLACEHOLDER:prompt_id] strings
        - Uses prompts from proposal_prompt_registry.json
```

### Stage 6: Validate
```javascript
Input:  Filled proposal JSON
Output: Validation result
        - valid: boolean
        - errors: [{ path, message }]
        - warnings: [{ path, message }]
```

### Stage 7: Render HTML
```javascript
Input:  Valid proposal JSON + Template
Output: HTML string
        - Mustache template rendering
        - Platform-specific sections (Upwork vs Direct)
```

### Stage 8: HTML Polish
```javascript
Input:  HTML string
Output: Polished HTML string
        - LLM review for consistency
        - Grammar and phrasing fixes
        - No structural changes
```

### Stage 9: Generate PDF
```javascript
Input:  HTML string + Puppeteer config
Output: PDF file
        - 2-page Letter format
        - Print-ready styling
        - Page fit validation
```

---

## Configuration Files

### Pricing Configuration

```
pricing/
├── base_rates.json           # Hourly rates by skill type
├── complexity_multipliers.json # Multipliers by complexity/system count
└── discount_rules.json       # Discount conditions and amounts
```

### Schema Configuration

```
schemas/
└── proposal_schema.json      # JSON Schema for proposal validation
```

### Prompt Configuration

```
prompts/
├── proposal_prompt_registry.json  # LLM prompt definitions
└── PROMPT_ENGINEERING_PRINCIPLES.md # Prompt guidelines
```

### Template

```
templates/
└── proposal_template.html    # Mustache template for HTML rendering
```

---

## Key Design Decisions

### 1. Pipeline Architecture
- **Why**: Clear separation of concerns, easy debugging, stage-by-stage validation
- **Trade-off**: More files, but each is focused and testable

### 2. LLM Placeholder Pattern
- **Why**: Decouple structure building from content generation
- **Trade-off**: Two-pass approach, but allows caching and retry

### 3. JSON Schema Validation
- **Why**: Ensures proposal integrity before rendering
- **Trade-off**: Additional validation step, but catches errors early

### 4. Mustache Templates
- **Why**: Simple, logic-less templates for PDF generation
- **Trade-off**: Limited logic, but predictable output

### 5. Dual LLM Support (Gemini + Groq)
- **Why**: Fallback for reliability, cost optimization
- **Trade-off**: Complexity in adapter pattern, but improved uptime

---

## Error Handling Strategy

### Validation Errors
- Schema validation failures stop pipeline
- Detailed error messages with JSON paths
- Repair suggestions where possible

### LLM Errors
- Automatic retry (configurable attempts)
- Fallback to Groq if Gemini fails
- Placeholder preservation on failure

### PDF Generation Errors
- Page fit validation before generation
- Browser launch timeout handling
- Graceful degradation to HTML-only

---

## Extension Points

### Adding New Fields
1. Update `schemas/proposal_schema.json` (additive)
2. Add extraction logic in `lib/extract_proposal.js`
3. Add to transform in `lib/transform_proposal.js`
4. Update template if needed

### Adding New Prompts
1. Add prompt definition to `prompts/proposal_prompt_registry.json`
2. Add placeholder in transform output
3. Test with sample audit

### Adding New Pricing Rules
1. Add to `pricing/*.json` (additive only)
2. Update calculation logic if needed
3. Test with sample audits

---

## Performance Considerations

### LLM Calls
- Batch concurrent calls (max 5)
- Cache responses where possible
- Timeout: 30 seconds per call

### PDF Generation
- Single-page render optimization
- Browser instance reuse
- Memory cleanup after generation

### File I/O
- Read configs once at pipeline start
- Stream large files if needed
- Validate early, fail fast

---

*This architecture ensures maintainability, testability, and extensibility while delivering reliable proposal generation.*
