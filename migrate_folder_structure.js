/**
 * migrate_folder_structure.js
 *
 * One-time migration script to consolidate folder structure:
 * - samples/ -> input/ (rename folder)
 * - test_run/ -> old/test_run/ (archive)
 * - Creates .gitkeep files for empty directories
 *
 * Run with: node migrate_folder_structure.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created: ${dir}`);
  }
}

function createGitkeep(dir) {
  const gitkeepPath = path.join(dir, '.gitkeep');
  if (!fs.existsSync(gitkeepPath)) {
    fs.writeFileSync(gitkeepPath, '');
    console.log(`Created: ${gitkeepPath}`);
  }
}

function moveDirectory(source, dest) {
  if (!fs.existsSync(source)) {
    console.log(`Source does not exist: ${source}`);
    return false;
  }

  if (fs.existsSync(dest)) {
    console.log(`Destination already exists: ${dest}`);
    return false;
  }

  fs.renameSync(source, dest);
  console.log(`Moved: ${source} -> ${dest}`);
  return true;
}

function main() {
  console.log('=== wranngle-proposal-generator Folder Migration ===\n');

  const oldDir = path.join(__dirname, 'old');
  ensureDir(oldDir);

  // 1. Rename samples/ to input/
  const samplesDir = path.join(__dirname, 'samples');
  const inputDir = path.join(__dirname, 'input');

  if (fs.existsSync(samplesDir) && !fs.existsSync(inputDir)) {
    moveDirectory(samplesDir, inputDir);
  } else if (fs.existsSync(samplesDir) && fs.existsSync(inputDir)) {
    // If input already exists, move samples contents to old/samples
    const oldSamplesDir = path.join(oldDir, 'samples_migrated');
    moveDirectory(samplesDir, oldSamplesDir);
    console.log('Samples already migrated, moved old samples to old/samples_migrated');
  } else if (!fs.existsSync(samplesDir) && !fs.existsSync(inputDir)) {
    ensureDir(inputDir);
    createGitkeep(inputDir);
  }

  // 2. Move test_run/ to old/test_run/
  const testRunDir = path.join(__dirname, 'test_run');
  const oldTestRunDir = path.join(oldDir, 'test_run');

  if (fs.existsSync(testRunDir)) {
    if (fs.existsSync(oldTestRunDir)) {
      // Merge - rename current to test_run_migrated
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const migratedDir = path.join(oldDir, `test_run_${timestamp}`);
      moveDirectory(testRunDir, migratedDir);
    } else {
      moveDirectory(testRunDir, oldTestRunDir);
    }
  }

  // 3. Ensure output directory exists
  const outputDir = path.join(__dirname, 'output');
  ensureDir(outputDir);
  createGitkeep(outputDir);

  console.log('\n=== Migration Complete ===');
  console.log('\nNew structure:');
  console.log('  input/   - Input files (audit reports)');
  console.log('  output/  - Generated proposals (organized by company/project)');
  console.log('  old/     - Archived/historical files');
}

main();
