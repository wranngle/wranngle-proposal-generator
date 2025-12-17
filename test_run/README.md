# E2E Test Suite

Automated end-to-end testing for the AI Proposal Generator.

## Quick Start

```bash
npm test
```

## What Gets Tested

The E2E test suite validates the entire proposal generation pipeline:

### Test 1: Pre-flight Checks
- ✓ API key configured (Gemini or Groq)
- ✓ Sample audit file exists
- ✓ Proposal template exists

### Test 2: Proposal Generation
- ✓ HTML output generated
- ✓ JSON output generated
- ✓ No generation errors

### Test 3: Critical Fix Validation
- ✓ **Fix #1**: No truncated text fields (no trailing "...")
- ✓ **Fix #2**: Individual milestone amounts hidden (using colspan)
- ✓ **Fix #3**: Retainer labeled as "Phase 3: Scale"
- ✓ **Fix #4**: Retainer mentions "continuous improvements"
- ✓ **Fix #5**: Calendly link removed from CTA
- ✓ **Fix #6**: CTA spacing optimized (no overflow)
- ✓ Executive summary generated (>100 chars)
- ✓ Value proposition generated (>50 chars)

### Test 4: Schema Validation
- ✓ Proposal passes JSON schema validation

## Test Output

Tests are run against:
- **Input**: `samples/sample_audit.json`
- **Output**: `test_output/e2e_validation.html`
- **JSON**: `test_output/e2e_validation.json`

## Exit Codes

- `0`: All tests passed
- `1`: One or more tests failed

## Test Results Format

```
=== Test Summary ===

Total: 14
Passed: 13
Failed: 1

Success Rate: 92.9%

Failed Tests:
  ✗ API key configured: Using: None
```

## Common Test Failures

### API Key Not Configured
```
✗ API key configured: Using: None
```

**Solution**: Create a `.env` file with:
```bash
GEMINI_API_KEY=your-key-here
# OR
GROQ_API_KEY=your-key-here
```

### Truncated Text Detected
```
✗ Fix #1: No truncated text fields: Found "..." in output
```

**Solution**: Increase `max_length` in `prompts/proposal_prompt_registry.json` and ensure `"..."` is in `forbidden_phrases`.

### Milestone Amounts Not Hidden
```
✗ Fix #2: Individual milestone amounts hidden: Milestone amounts still showing
```

**Solution**: Verify `templates/proposal_template.html` uses `colspan="2"` for milestone rows.

### Retainer Not After Breadcrumb
```
✗ Fix #3: Retainer labeled as Phase 3: Scale: Missing Phase 3 label
```

**Solution**: Ensure `optional-retainer` div appears after `phase-breadcrumb` div in template.

### CTA Spacing Issues
```
✗ Fix #6: CTA spacing optimized: May have overflow issues
```

**Solution**: Reduce padding values in `.cta-section`, `.cta-headline`, `.cta-subtext` CSS.

## Continuous Integration

To run tests in CI/CD:

```bash
# Install dependencies
npm install

# Run tests (skips PDF generation for speed)
npm test

# Check exit code
echo $?  # Should be 0 for success
```

## Manual Testing

For manual validation, generate a fresh proposal:

```bash
# Generate test proposal
node cli.js generate samples/sample_audit.json test_output/manual_test.html --save-json --skip-pdf

# Validate JSON schema
node cli.js validate test_output/manual_test.json

# Check for truncation
grep -n "\.\.\." test_output/manual_test.html
```

## Extending Tests

To add new test cases, edit `run_pipeline_test.js`:

```javascript
// Add to testAllFixes() method
const hasNewFeature = html.includes('expected-text');
this.recordTest(
  'Fix #7: New feature description',
  hasNewFeature,
  hasNewFeature ? 'Found feature' : 'Missing feature'
);
```

## Test Performance

- Pre-flight checks: ~100ms
- Proposal generation: ~150s (with LLM calls)
- Fix validation: ~50ms
- Schema validation: ~100ms
- **Total runtime**: ~2.5-3 minutes

## Troubleshooting

### Tests Pass Locally But Fail in CI

Check that:
1. `.env` file is loaded in CI environment
2. API keys are configured as environment variables
3. Sample files are committed to repository
4. Node.js version matches (`>=18.0.0`)

### Test Timeouts

Increase timeout in test command:
```javascript
const { stdout, stderr } = await execAsync(command, {
  timeout: 300000, // 5 minutes
});
```

### False Positives

If tests pass but output is incorrect:
1. Manually inspect `test_output/e2e_validation.html`
2. Check LLM prompt constraints in `prompts/proposal_prompt_registry.json`
3. Verify template structure in `templates/proposal_template.html`
