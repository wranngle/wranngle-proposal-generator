# Prompt Engineering Principles for Wranngle Proposal Generator

This document defines the core principles governing all LLM prompts used in the proposal generation pipeline. These principles are derived from best practices and ensure consistent, high-quality output.

---

## Core Principles

### 1. Precision Over Interpretation

**Rule**: Extract and use exact information from source material.

- Extract exact information from audit reports
- Do not round unless explicitly rounded in source
- Preserve technical terminology exactly as stated
- NO external knowledge or assumptions
- Use exact client names, system names, and figures

**Example**:
```
BAD: "The client loses approximately $50,000 annually"
GOOD: "The client loses $4,167/month ($50,004 annually) in operational inefficiency"
```

---

### 2. Zero Hallucination Principle

**Rule**: NEVER invent facts. Only state what is explicitly present in source material.

If a value is not explicitly present in source:
- Set it to null or use placeholder for LLM generation
- Note the assumption in metadata if needed
- Preserve exact wording for quotes and references
- Do not extrapolate or calculate unstated values

**Enforcement**:
- All generated content must be traceable to source
- Forbidden phrases list prevents speculation
- Schema validation ensures required fields from source

**Example**:
```
BAD: "Based on industry standards, you could save 40% on labor costs"
GOOD: "Based on your audit findings, automating the invoice workflow addresses the $2,500/month manual processing cost identified"
```

---

### 3. Provenance Tracking

**Rule**: Every generated element should be traceable to its source.

Track sources for all data:
- **audit_report**: Data extracted from input audit JSON
- **pricing_config**: Values from pricing configuration files
- **llm_generated**: Content created by LLM from prompts
- **calculated**: Derived values with transparent formulas

**Implementation**:
```json
{
  "field": "total_price",
  "value": 15000,
  "provenance": {
    "source": "calculated",
    "formula": "base_hours * hourly_rate * complexity_multiplier",
    "inputs": {
      "base_hours": { "source": "audit_report", "path": "fixes[].estimated_hours" },
      "hourly_rate": { "source": "pricing_config", "path": "base_rates.automation" },
      "complexity_multiplier": { "source": "pricing_config", "path": "multipliers.medium" }
    }
  }
}
```

---

### 4. Confidence Scoring

**Rule**: Mark generated content with confidence indicators.

Confidence levels:
| Level | Score | Definition |
|-------|-------|------------|
| Explicit | 1.0 | Directly stated in source material |
| Clear | 0.8 | Clearly implied with strong evidence |
| Inferred | 0.5 | Reasonable inference from context |
| Weak | 0.2 | Ambiguous or limited evidence |
| Generated | 0.0 | Entirely LLM-generated narrative |

**Application**:
- Pricing data: Should be 1.0 (from config/calculation)
- Client info: Should be 1.0 (from audit)
- Executive summary: 0.0 (LLM-generated)
- Scope items: 0.5-0.8 (derived from audit findings)

---

### 5. Quality Checks Before Emission

**Rule**: Validate all output before returning to pipeline.

Required checks:
1. **JSON Validity**: Strict JSON, no comments, no trailing commas
2. **Schema Compliance**: Output matches proposal_schema.json
3. **Reference Resolution**: All entity references exist
4. **Placeholder Removal**: No `[LLM_PLACEHOLDER...]` remains
5. **Forbidden Phrases**: None of the blacklisted phrases present
6. **Length Constraints**: Within max_length limits
7. **Consistency**: Client name, pricing, dates match throughout

**Implementation**:
```javascript
// Before returning any LLM output
const checks = [
  validateJSON(output),
  validateSchema(output, schema),
  checkForbiddenPhrases(output, forbidden),
  checkPlaceholders(output),
  validateReferences(output)
];

if (!checks.every(c => c.valid)) {
  throw new ValidationError(checks.filter(c => !c.valid));
}
```

---

## Flexibility Clause

**ANY DIRECTIVE IS FLEXIBLE WITH ADDITIVE OR ENRICHING DIRECTIVES**

This means:
- Prompts can be enhanced with additional context
- Rules can be augmented with domain-specific guidance
- Constraints are minimum requirements, not maximums
- New quality checks can be added
- Additional forbidden phrases can be included

**What is NOT flexible**:
- Core principles cannot be violated
- Existing constraints cannot be weakened
- Quality standards cannot be lowered
- Provenance tracking cannot be disabled

---

## Prompt Structure Standard

All prompts in `proposal_prompt_registry.json` should follow this XML-like structure:

```xml
<role>
Clear role definition (e.g., "Professional proposal writer for Wranngle")
</role>

<context>
Relevant background information
- Client industry
- Audit findings
- Engagement phase
</context>

<data>
Variables from audit report and configuration
- {{client_name}}
- {{total_price}}
- {{key_findings}}
</data>

<instructions>
Specific, actionable instructions
- What to write
- How to structure it
- What to emphasize
</instructions>

<constraints>
Output requirements
- Format specifications
- Length limits
- Forbidden phrases
- Required elements
</constraints>
```

---

## Forbidden Phrases

The following phrases indicate speculation or inappropriate tone:

### Speculation Indicators
- "I recommend"
- "I suggest"
- "In my opinion"
- "It seems like"
- "Probably"
- "Might be"

### Inappropriate Marketing
- "cutting-edge"
- "revolutionary"
- "game-changing"
- "world-class"
- "best-in-class"
- "industry-leading"

### Pressure Tactics
- "Act now"
- "Don't miss"
- "Limited time"
- "Exclusive offer"

### Phase Confusion
- "Phase 0"
- "Discovery phase" (when referring to Phase 2)
- References to phases not in scope

### Incomplete Output
- "..."
- "[TODO]"
- "[FIXME]"
- "[LLM_PLACEHOLDER"
- "lorem ipsum"

---

## Output Constraints by Type

### String Fields
- Complete sentences only
- No trailing ellipsis
- Within max_length
- No forbidden phrases

### Array Fields
- Minimum and maximum item counts
- Each item is a complete statement
- No duplicates
- Items ordered by importance

### Numeric Fields
- From source or calculated
- Transparent calculation path
- Appropriate precision
- Consistent units (USD, months, hours)

---

## Integration with Pipeline

### Extract Stage
- Apply precision principle
- Track provenance from audit
- Confidence = 1.0 for direct extraction

### Transform Stage
- Apply calculation transparency
- Track provenance for computed fields
- Confidence based on calculation certainty

### LLM Fill Stage
- Apply all prompt principles
- Check forbidden phrases
- Confidence = 0.0 for generated content

### Validate Stage
- Apply quality checks
- Verify all principles enforced
- Block output if any check fails

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-12 | Initial principles document |

---

*These principles ensure consistent, high-quality proposal generation while maintaining data integrity and transparency.*
