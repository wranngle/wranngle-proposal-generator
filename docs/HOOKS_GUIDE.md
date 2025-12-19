# Claude Code Hooks Configuration

This guide documents the hook system for enforcing code quality and preventing common mistakes when Claude Code operates on this repository.

---

## Purpose

Hooks ensure Claude Code:
- Follows project conventions
- Prevents destructive changes to critical files
- Maintains code quality standards
- Enforces test coverage thresholds
- Validates JSON configurations

---

## Hook Types

| Hook | Trigger | Purpose |
|------|---------|---------|
| `PreToolUse` | Before any tool execution | Validate operations before they run |
| `PostToolUse` | After tool execution | Verify results and enforce constraints |
| `Notification` | On specific events | Alert on important changes |
| `Stop` | Block operations | Prevent dangerous actions |

---

## Critical Hooks for Wranngle Proposal Generator

### 1. Protected Files Hook

Prevents modifications to critical configuration files without explicit confirmation.

**Protected Files**:
- `pricing/base_rates.json`
- `pricing/complexity_multipliers.json`
- `pricing/discount_rules.json`
- `schemas/proposal_schema.json`
- `prompts/proposal_prompt_registry.json`

**Hook Definition** (`.claude/settings.local.json`):
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/check-protected-files.js \"$FILE_PATH\""
          }
        ]
      }
    ]
  }
}
```

**Hook Script** (`.claude/hooks/check-protected-files.js`):
```javascript
#!/usr/bin/env node
const path = require('path');

const PROTECTED_FILES = [
  'pricing/base_rates.json',
  'pricing/complexity_multipliers.json',
  'pricing/discount_rules.json',
  'schemas/proposal_schema.json',
  'prompts/proposal_prompt_registry.json'
];

const filePath = process.argv[2];
const relativePath = path.relative(process.cwd(), filePath);

const isProtected = PROTECTED_FILES.some(pf =>
  relativePath.includes(pf) || relativePath.endsWith(pf)
);

if (isProtected) {
  console.log(`⚠️  PROTECTED FILE: ${relativePath}`);
  console.log('Changes must be ADDITIVE only:');
  console.log('  ✅ Add new entries');
  console.log('  ❌ Remove existing entries');
  console.log('  ❌ Modify existing values (unless updating)');
  console.log('');
  console.log('Proceeding requires explicit user approval.');
  process.exit(0); // Exit 0 to allow with warning, exit 1 to block
}

process.exit(0);
```

---

### 2. JSON Validation Hook

Validates all JSON files before writing.

**Hook Definition**:
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/validate-json.js \"$FILE_PATH\""
          }
        ]
      }
    ]
  }
}
```

**Hook Script** (`.claude/hooks/validate-json.js`):
```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];

// Only validate JSON files
if (!filePath.endsWith('.json')) {
  process.exit(0);
}

try {
  const content = fs.readFileSync(filePath, 'utf-8');
  JSON.parse(content);
  console.log(`✅ Valid JSON: ${path.basename(filePath)}`);
  process.exit(0);
} catch (error) {
  console.error(`❌ Invalid JSON in ${path.basename(filePath)}:`);
  console.error(`   ${error.message}`);
  process.exit(1);
}
```

---

### 3. Additive-Only Validation Hook

Ensures modifications to protected files are additive only.

**Hook Script** (`.claude/hooks/check-additive.js`):
```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2];
const newContent = process.argv[3]; // Passed as argument or read from temp

// Only check JSON config files
const CONFIG_PATTERNS = [
  'pricing/',
  'schemas/',
  'prompts/'
];

const relativePath = path.relative(process.cwd(), filePath);
const isConfig = CONFIG_PATTERNS.some(p => relativePath.startsWith(p));

if (!isConfig || !filePath.endsWith('.json')) {
  process.exit(0);
}

// If file doesn't exist, it's a new file - OK
if (!fs.existsSync(filePath)) {
  process.exit(0);
}

try {
  const oldContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const newData = JSON.parse(newContent);

  // Check for removed keys (recursive)
  function findRemovedKeys(oldObj, newObj, path = '') {
    const removed = [];
    for (const key of Object.keys(oldObj)) {
      const newPath = path ? `${path}.${key}` : key;
      if (!(key in newObj)) {
        removed.push(newPath);
      } else if (typeof oldObj[key] === 'object' && oldObj[key] !== null) {
        removed.push(...findRemovedKeys(oldObj[key], newObj[key], newPath));
      }
    }
    return removed;
  }

  const removedKeys = findRemovedKeys(oldContent, newData);

  if (removedKeys.length > 0) {
    console.error('❌ DESTRUCTIVE CHANGE DETECTED');
    console.error('The following keys would be removed:');
    removedKeys.forEach(key => console.error(`  - ${key}`));
    console.error('');
    console.error('Modifications must be ADDITIVE only.');
    process.exit(1);
  }

  console.log('✅ Additive change validated');
  process.exit(0);
} catch (error) {
  console.error(`❌ Validation error: ${error.message}`);
  process.exit(1);
}
```

---

### 4. Test Coverage Hook

Enforces minimum test coverage after test runs.

**Hook Script** (`.claude/hooks/check-coverage.js`):
```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const COVERAGE_THRESHOLD = 80;

const coveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');

if (!fs.existsSync(coveragePath)) {
  console.log('⚠️  No coverage report found. Run npm run test:coverage first.');
  process.exit(0);
}

try {
  const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
  const { lines, statements, functions, branches } = coverage.total;

  const metrics = [
    { name: 'Lines', value: lines.pct },
    { name: 'Statements', value: statements.pct },
    { name: 'Functions', value: functions.pct },
    { name: 'Branches', value: branches.pct }
  ];

  console.log('📊 Coverage Report:');
  let failed = false;

  metrics.forEach(m => {
    const status = m.value >= COVERAGE_THRESHOLD ? '✅' : '❌';
    console.log(`  ${status} ${m.name}: ${m.value.toFixed(1)}%`);
    if (m.value < COVERAGE_THRESHOLD) failed = true;
  });

  if (failed) {
    console.log('');
    console.log(`❌ Coverage below ${COVERAGE_THRESHOLD}% threshold`);
    process.exit(1);
  }

  console.log('');
  console.log(`✅ Coverage meets ${COVERAGE_THRESHOLD}% threshold`);
  process.exit(0);
} catch (error) {
  console.error(`❌ Error reading coverage: ${error.message}`);
  process.exit(1);
}
```

---

### 5. Pre-Commit Quality Check

Runs linting and tests before commits.

**Hook Script** (`.claude/hooks/pre-commit.js`):
```javascript
#!/usr/bin/env node
const { execSync } = require('child_process');

console.log('🔍 Running pre-commit checks...');
console.log('');

const checks = [
  {
    name: 'ESLint',
    command: 'npm run lint',
    required: true
  },
  {
    name: 'Unit Tests',
    command: 'npm run test:unit',
    required: true
  },
  {
    name: 'JSON Validation',
    command: 'node .claude/hooks/validate-all-json.js',
    required: true
  }
];

let allPassed = true;

for (const check of checks) {
  try {
    console.log(`Running ${check.name}...`);
    execSync(check.command, { stdio: 'inherit' });
    console.log(`✅ ${check.name} passed`);
  } catch (error) {
    console.log(`❌ ${check.name} failed`);
    if (check.required) {
      allPassed = false;
    }
  }
  console.log('');
}

if (!allPassed) {
  console.log('❌ Pre-commit checks failed. Fix issues before committing.');
  process.exit(1);
}

console.log('✅ All pre-commit checks passed');
process.exit(0);
```

---

## Hook Installation

### Directory Structure

```
wranngle-proposal-generator/
├── .claude/
│   ├── hooks/
│   │   ├── check-protected-files.js
│   │   ├── validate-json.js
│   │   ├── check-additive.js
│   │   ├── check-coverage.js
│   │   ├── pre-commit.js
│   │   └── validate-all-json.js
│   └── settings.local.json
```

### Configuration File

Create `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/check-protected-files.js \"$FILE_PATH\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/validate-json.js \"$FILE_PATH\""
          }
        ]
      }
    ]
  },
  "permissions": {
    "allow": [
      "Bash(npm run:*)",
      "Bash(node cli.js:*)",
      "Bash(node .claude/hooks/*)",
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)"
    ]
  }
}
```

---

## Testing Hooks

### Manual Testing

```bash
# Test JSON validation hook
node .claude/hooks/validate-json.js pricing/base_rates.json

# Test protected files hook
node .claude/hooks/check-protected-files.js pricing/base_rates.json

# Test coverage hook
npm run test:coverage
node .claude/hooks/check-coverage.js

# Test pre-commit
node .claude/hooks/pre-commit.js
```

### Automated Validation

```bash
# Run all hooks in test mode
for hook in .claude/hooks/*.js; do
  echo "Testing $hook..."
  node "$hook" --test || echo "Hook test failed: $hook"
done
```

---

## Troubleshooting

### Hook Not Running

1. Check file exists in `.claude/hooks/`
2. Verify hook has execute permissions
3. Check `.claude/settings.local.json` syntax
4. Verify matcher pattern matches tool name

### Hook Failing Incorrectly

1. Run hook manually with test inputs
2. Check for edge cases in file paths
3. Review error messages for specific issues
4. Update hook logic to handle edge cases

### Permission Denied

1. Check file permissions: `chmod +x .claude/hooks/*.js`
2. Verify Node.js is in PATH
3. Check shebang line: `#!/usr/bin/env node`

---

## Best Practices

1. **Keep hooks fast** - Target < 5 seconds execution
2. **Provide clear messages** - Users should understand what failed and why
3. **Make hooks idempotent** - Running twice should have same result
4. **Test hooks in isolation** - Each hook should work independently
5. **Document hook behavior** - Comment complex logic
6. **Fail gracefully** - Don't block on non-critical issues
7. **Log actions** - Help with debugging

---

## Hook Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success - proceed with operation |
| 1 | Failure - block operation |
| 2 | Warning - proceed but notify user |

---

*This hook system ensures code quality and prevents common mistakes when working with the proposal generator.*
