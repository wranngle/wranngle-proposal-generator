# Testing Guide

This document describes the testing strategy, patterns, and best practices for the Wranngle Proposal Generator.

---

## Overview

The project uses **Vitest** for unit and integration testing, with a target of **80%+ code coverage** for all lib modules.

---

## Test Structure

```
test/
├── unit/                     # Unit tests for individual modules
│   ├── pricing_calculator.test.js
│   ├── milestone_builder.test.js
│   ├── validate.test.js
│   ├── extract_proposal.test.js
│   ├── transform_proposal.test.js
│   └── pdf_generator.test.js
├── integration/              # Integration tests for pipeline stages
│   ├── pipeline_stages.test.js
│   ├── llm_integration.test.js
│   └── end_to_end.test.js
├── fixtures/                 # Test data
│   ├── sample_audit.json
│   ├── sample_proposal.json
│   ├── mock_llm_responses.json
│   └── test_config.json
└── utils/                    # Test utilities
    ├── test-helpers.js
    ├── mock-llm.js
    └── fixtures-loader.js
```

---

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run E2E tests (existing pipeline test)
npm run test:e2e

# Run with watch mode (development)
npm run test:watch

# Run with visual UI
npm run test:ui

# Run with coverage report
npm run test:coverage
```

### Coverage Thresholds

| Metric | Threshold |
|--------|-----------|
| Lines | 80% |
| Functions | 80% |
| Branches | 75% |
| Statements | 80% |

---

## Test Categories

### Unit Tests

Test individual functions in isolation.

**Focus Areas**:
- Pure function correctness
- Edge cases and boundary conditions
- Error handling
- Input validation

**Example**:
```javascript
import { describe, it, expect } from 'vitest';
import { calculatePricing } from '../../lib/pricing_calculator.js';

describe('calculatePricing', () => {
  it('should calculate total correctly', () => {
    const extracted = { fixes: [{ complexity: 'moderate', estimated_hours: 16 }] };
    const result = calculatePricing(extracted);
    expect(result.total).toBeGreaterThan(0);
  });

  it('should handle empty fixes', () => {
    const extracted = { fixes: [] };
    const result = calculatePricing(extracted);
    expect(result.total).toBe(0);
  });
});
```

### Integration Tests

Test module interactions and data flow.

**Focus Areas**:
- Pipeline stage transitions
- Data consistency across stages
- Configuration loading
- Multi-module coordination

**Example**:
```javascript
import { describe, it, expect } from 'vitest';
import { extractFromAudit } from '../../lib/extract_proposal.js';
import { calculatePricing } from '../../lib/pricing_calculator.js';

describe('Extract → Pricing Integration', () => {
  it('should pass extracted data to pricing correctly', async () => {
    const extracted = await extractFromAudit('test/fixtures/sample_audit.json');
    const pricing = calculatePricing(extracted);

    expect(pricing.total).toBeGreaterThan(0);
    expect(pricing.breakdown).toBeDefined();
  });
});
```

### E2E Tests

Test full proposal generation workflow.

**Focus Areas**:
- Complete audit → PDF workflow
- CLI command execution
- Output file validation
- Schema compliance

---

## Test Fixtures

### sample_audit.json
Complete, valid audit report for testing the full pipeline.

### sample_proposal.json
Expected proposal output for comparison testing.

### mock_llm_responses.json
Deterministic LLM responses for consistent testing.

### test_config.json
Isolated pricing configuration for tests.

---

## Mocking Strategies

### Mocking LLM Calls

```javascript
import { vi, describe, it, expect } from 'vitest';

// Mock the model config module
vi.mock('../../lib/model_config.js', () => ({
  generateContent: vi.fn().mockResolvedValue({
    text: 'Mocked response'
  })
}));

// Or use the mock-llm utility
import { mockLLMResponse } from '../utils/mock-llm.js';

describe('LLM Integration', () => {
  it('should handle mocked responses', async () => {
    mockLLMResponse('executive_summary', 'Test summary');
    // ... test code
  });
});
```

### Mocking File System

```javascript
import { vi } from 'vitest';
import fs from 'fs';

vi.mock('fs');

describe('File operations', () => {
  it('should read config file', () => {
    fs.readFileSync.mockReturnValue(JSON.stringify({ rate: 100 }));
    // ... test code
  });
});
```

### Mocking Puppeteer

```javascript
vi.mock('puppeteer', () => ({
  launch: vi.fn().mockResolvedValue({
    newPage: vi.fn().mockResolvedValue({
      setContent: vi.fn(),
      pdf: vi.fn().mockResolvedValue(Buffer.from('PDF')),
      close: vi.fn()
    }),
    close: vi.fn()
  })
}));
```

---

## Test Patterns

### Arrange-Act-Assert

```javascript
it('should calculate milestone allocation', () => {
  // Arrange
  const total = 10000;

  // Act
  const milestones = buildMilestones(total);

  // Assert
  expect(milestones.design.amount).toBe(2000);
  expect(milestones.build.amount).toBe(4500);
});
```

### Testing Edge Cases

```javascript
describe('Edge Cases', () => {
  it('should handle zero pricing', () => {
    const result = calculatePricing({ fixes: [] });
    expect(result.total).toBe(0);
  });

  it('should handle missing fields', () => {
    const result = calculatePricing({});
    expect(result.total).toBe(0);
  });

  it('should handle null input', () => {
    expect(() => calculatePricing(null)).toThrow();
  });
});
```

### Testing Error Scenarios

```javascript
describe('Error Handling', () => {
  it('should throw on invalid audit format', async () => {
    await expect(extractFromAudit('invalid.json'))
      .rejects.toThrow('Invalid audit format');
  });

  it('should return validation errors', () => {
    const result = validateProposal({ /* invalid data */ });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
```

---

## Test Utilities

### test-helpers.js

```javascript
// Load fixtures
export function loadFixture(filename) { ... }

// Create mock data
export function createMockAudit(overrides = {}) { ... }
export function createMockPricing(overrides = {}) { ... }
export function createMockProposal(overrides = {}) { ... }

// Assertions
export function assertValidProposal(proposal) { ... }
export function assertMilestoneAllocation(milestones) { ... }
export function assertPricingConsistency(pricing, milestones) { ... }

// File helpers
export function createTempFile(content, extension) { ... }
export function cleanupTempFiles() { ... }
```

### Usage

```javascript
import {
  loadFixture,
  createMockAudit,
  assertValidProposal
} from '../utils/test-helpers.js';

describe('Proposal Generation', () => {
  it('should generate valid proposal', async () => {
    const audit = createMockAudit({ client_info: { account_name: 'Test' } });
    const proposal = await generateProposal(audit);
    assertValidProposal(proposal);
  });
});
```

---

## Coverage Goals by Module

| Module | Target | Priority |
|--------|--------|----------|
| pricing_calculator.js | 90% | High |
| milestone_builder.js | 90% | High |
| validate.js | 85% | High |
| extract_proposal.js | 80% | High |
| transform_proposal.js | 80% | Medium |
| llm_batch_executor.js | 75% | Medium |
| pipeline.js | 75% | Medium |
| pdf_generator.js | 70% | Low |

---

## Continuous Integration

Tests run automatically on:
- Every push to main/develop
- Every pull request

See `.github/workflows/test.yml` for CI configuration.

### CI Pipeline

1. Install dependencies
2. Run linter
3. Run unit tests
4. Run integration tests
5. Generate coverage report
6. Check coverage thresholds

---

## Best Practices

### Do's

- ✅ Write tests before fixing bugs
- ✅ Test edge cases and error paths
- ✅ Use descriptive test names
- ✅ Keep tests fast (<100ms per unit test)
- ✅ Use fixtures for complex test data
- ✅ Clean up after tests (temp files, etc.)

### Don'ts

- ❌ Test implementation details
- ❌ Write flaky tests
- ❌ Share state between tests
- ❌ Make real API calls in unit tests
- ❌ Skip writing tests for "simple" code

---

## Debugging Tests

### Run Single Test

```bash
npx vitest run -t "should calculate total"
```

### Run with Logging

```bash
DEBUG=* npm test
```

### Run with UI

```bash
npm run test:ui
```

---

## Adding New Tests

1. Create test file in appropriate directory
2. Import module under test
3. Import test utilities
4. Write describe/it blocks
5. Run tests locally
6. Check coverage
7. Commit with tests passing

---

*Following these guidelines ensures reliable, maintainable tests that catch bugs early and document expected behavior.*
