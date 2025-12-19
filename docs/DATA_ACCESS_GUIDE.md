# Data Access Guide

This document defines the data sources, access patterns, and modification rules for the Wranngle Proposal Generator.

---

## Source Data Locations

### 1. Audit Reports (Input)

| Property | Value |
|----------|-------|
| **Location** | `samples/*.json` or user-provided path |
| **Format** | AI Process Audit JSON (Traffic Light Report) |
| **Access Pattern** | Read-only via `lib/extract_proposal.js` |
| **Validation** | Must match audit report structure |
| **Modification** | NEVER - input data is sacred |

**Required Fields**:
- `client_info.account_name` - Client name
- `client_info.industry` - Industry vertical
- `workflow_analyzed` - Primary workflow name
- `findings[]` - Array of audit findings
- `revenue_bleed.monthly` - Monthly revenue loss

---

### 2. Pricing Configuration

| Property | Value |
|----------|-------|
| **Location** | `pricing/base_rates.json`, `pricing/complexity_multipliers.json`, `pricing/discount_rules.json` |
| **Format** | JSON configuration files |
| **Access Pattern** | Read-only, loaded at pipeline start |
| **Modification** | ADDITIVE only - add new entries, never remove |

**Files**:

#### `pricing/base_rates.json`
```json
{
  "hourly_rates": {
    "automation_specialist": 125,
    "integration_developer": 150,
    "senior_engineer": 175,
    "project_management": 100
  },
  "minimum_project_cost": 5000
}
```

#### `pricing/complexity_multipliers.json`
```json
{
  "system_count": {
    "1-2": 1.0,
    "3-5": 1.2,
    "6-10": 1.4,
    "10+": 1.6
  },
  "integration_difficulty": {
    "low": 1.0,
    "medium": 1.15,
    "high": 1.3,
    "critical": 1.5
  }
}
```

---

### 3. Schemas

| Property | Value |
|----------|-------|
| **Location** | `schemas/proposal_schema.json` |
| **Purpose** | JSON Schema validation for generated proposals |
| **Access Pattern** | Read-only via `lib/validate.js` |
| **Extension** | ADDITIVE only - add optional properties |

**Modification Rules**:
- Add new optional properties with defaults
- Never remove required fields
- Never change field types
- Add to `additionalProperties` if needed

---

### 4. Templates

| Property | Value |
|----------|-------|
| **Location** | `templates/proposal_template.html` |
| **Format** | Mustache template |
| **Access Pattern** | Read by `lib/pipeline.js`, rendered with proposal data |
| **Customization** | Extend with new sections, never remove existing |

**Template Variables**:
```mustache
{{client_name}}           - Client account name
{{total_price}}           - Formatted total price
{{#milestones}}           - Milestone array
  {{name}}                - Milestone name
  {{price}}               - Milestone price
{{/milestones}}
{{executive_summary}}     - LLM-generated summary
{{value_proposition}}     - LLM-generated value prop
```

---

### 5. Prompts

| Property | Value |
|----------|-------|
| **Location** | `prompts/proposal_prompt_registry.json` |
| **Format** | Structured prompt definitions with metadata |
| **Access Pattern** | Read by `lib/llm_batch_executor.js` |
| **Extension** | ADDITIVE only - add prompts, enhance existing |

**Adding New Prompts**:
```json
{
  "prompt_id": "new_section_v1",
  "description": "Generate new section content",
  "schema_path": "section.field",
  "output_type": "string",
  "system_prompt": "...",
  "user_prompt_template": "...",
  "output_constraints": {
    "max_length": 300
  }
}
```

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      INPUT LAYER                                 │
├─────────────────────────────────────────────────────────────────┤
│  Audit Report (JSON)         Pricing Config         Schema       │
│  samples/*.json              pricing/*.json         schemas/     │
└────────────┬─────────────────────┬───────────────────┬──────────┘
             │                     │                   │
             ▼                     ▼                   │
┌─────────────────────────────────────────────────────────────────┐
│                    PROCESSING LAYER                              │
├─────────────────────────────────────────────────────────────────┤
│  Extract                 Calculate Pricing                       │
│  lib/extract_proposal.js lib/pricing_calculator.js              │
│           │                      │                               │
│           ▼                      ▼                               │
│  Build Milestones        Transform to Proposal                   │
│  lib/milestone_builder.js lib/transform_proposal.js             │
│           │                      │                               │
│           └──────────┬───────────┘                               │
│                      ▼                                           │
│  LLM Fill Placeholders ◄── Prompt Registry                      │
│  lib/llm_batch_executor.js  prompts/*.json                      │
│                      │                                           │
│                      ▼                                           │
│  Validate ◄────────────────── Schema                            │
│  lib/validate.js              schemas/*.json ◄──────────────────┤
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      OUTPUT LAYER                                │
├─────────────────────────────────────────────────────────────────┤
│  Render HTML ◄──────── Template                                  │
│  lib/pipeline.js        templates/*.html                        │
│           │                                                      │
│           ▼                                                      │
│  HTML Polish Pass                                                │
│  lib/html_final_pass.js                                         │
│           │                                                      │
│           ▼                                                      │
│  Generate PDF                                                    │
│  lib/pdf_generator.js                                           │
│           │                                                      │
│           ▼                                                      │
│  OUTPUT: proposal.html, proposal.pdf, proposal.json              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Access Patterns for Claude Code

### Reading Source Data

```javascript
import fs from 'fs';
import path from 'path';

// Always use absolute paths
const auditPath = path.resolve(process.cwd(), 'samples/audit.json');
const auditData = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));

// Validate before processing
import { validateAuditReport } from './lib/validate.js';
const validation = validateAuditReport(auditData);
if (!validation.valid) {
  throw new Error(`Invalid audit report: ${validation.errors.join(', ')}`);
}
```

### Reading Configuration

```javascript
import { loadPricingConfig } from './lib/pricing_calculator.js';

// Config is read-only, loaded once at start
const config = loadPricingConfig();
// Use config.base_rates, config.multipliers, etc.
```

### Modifying Configuration (ADDITIVE ONLY)

```javascript
import fs from 'fs';
import path from 'path';

// Load existing config
const configPath = path.resolve(process.cwd(), 'pricing/base_rates.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// ADD new entries (NEVER remove existing)
config.hourly_rates.new_skill_type = 160;

// Validate new config structure
if (!validatePricingConfig(config)) {
  throw new Error('Invalid configuration modification');
}

// Write back with formatting
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
```

### Extending Schemas (ADDITIVE ONLY)

```javascript
import fs from 'fs';

// Load existing schema
const schema = JSON.parse(fs.readFileSync('schemas/proposal_schema.json', 'utf-8'));

// ADD new optional properties only
schema.properties.new_section = {
  "type": "object",
  "description": "New section for enhanced proposals",
  "properties": {
    "field1": { "type": "string" }
  }
};

// NEVER:
// - Remove existing properties
// - Change required array to remove items
// - Modify existing property types
// - Change validation rules to be less strict
```

---

## Provenance Tracking

Every data point should be traceable to its source:

| Source Type | Description | Example |
|-------------|-------------|---------|
| `audit_report` | Directly from input audit JSON | Client name, revenue bleed |
| `pricing_config` | From pricing configuration files | Hourly rates, multipliers |
| `calculated` | Derived with transparent formula | Total price, milestone allocations |
| `llm_generated` | Created by LLM from prompts | Executive summary, descriptions |

### Implementation Pattern

```javascript
const proposalField = {
  value: 15000,
  provenance: {
    source: 'calculated',
    formula: 'base_hours * hourly_rate * complexity_multiplier',
    inputs: {
      base_hours: { source: 'audit_report', path: 'fixes[].estimated_hours' },
      hourly_rate: { source: 'pricing_config', path: 'base_rates.automation' },
      complexity_multiplier: { source: 'pricing_config', path: 'multipliers.medium' }
    }
  }
};
```

---

## Modification Rules Summary

| Data Source | Read | Add | Modify | Remove |
|-------------|------|-----|--------|--------|
| Audit Reports | ✅ | ❌ | ❌ | ❌ |
| Pricing Config | ✅ | ✅ | ❌* | ❌ |
| Schemas | ✅ | ✅ | ❌* | ❌ |
| Templates | ✅ | ✅ | ✅** | ❌ |
| Prompts | ✅ | ✅ | ✅*** | ❌ |

**Notes**:
- \* Values can be updated but keys/structure must remain
- \*\* Template sections can be modified but not removed
- \*\*\* Prompt content can be enhanced but not reduced

---

## Error Handling

### File Not Found
```javascript
try {
  const data = JSON.parse(fs.readFileSync(path, 'utf-8'));
} catch (error) {
  if (error.code === 'ENOENT') {
    throw new Error(`Required file not found: ${path}`);
  }
  throw error;
}
```

### Invalid JSON
```javascript
try {
  const data = JSON.parse(content);
} catch (error) {
  throw new Error(`Invalid JSON in ${path}: ${error.message}`);
}
```

### Schema Validation Failure
```javascript
const validation = validate(data, schema);
if (!validation.valid) {
  const errors = validation.errors.map(e => `${e.path}: ${e.message}`);
  throw new Error(`Schema validation failed:\n${errors.join('\n')}`);
}
```

---

## Best Practices

1. **Always validate before processing** - Check inputs before pipeline starts
2. **Use absolute paths** - Avoid relative path issues
3. **Load configs once** - Don't reload configs mid-pipeline
4. **Track provenance** - Know where every value came from
5. **Fail fast** - Validate early, provide clear error messages
6. **Never mutate inputs** - Audit reports are sacred
7. **Document changes** - Comment any config modifications

---

*This guide ensures data integrity and consistent access patterns across the proposal generation pipeline.*
