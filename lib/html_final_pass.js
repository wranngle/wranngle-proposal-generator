/**
 * Final HTML LLM Pass
 * Reviews and corrects the complete HTML proposal for coherence and quality
 *
 * This is the final stage before PDF generation, ensuring the document
 * is polished and consistent throughout.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Mustache from 'mustache';
import { MODEL_CONFIGS, MODEL_FALLBACK_ORDER, getNextFallbackModel, isRateLimitError, parseRetryAfter } from './model_config.js';
import { GroqAdapter } from './groq_adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Gemini API base URL
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1/models';

// Load prompt registry
const PROMPT_REGISTRY = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../prompts/proposal_prompt_registry.json'), 'utf8')
);

/**
 * Run final HTML review pass
 * @param {string} htmlPath - Path to the rendered HTML file
 * @param {Object} context - Context with client info, pricing, etc.
 * @param {Object} options - Execution options
 * @returns {Promise<string>} Path to the corrected HTML file
 */
async function runFinalHtmlPass(htmlPath, context = {}, options = {}) {
  const useGroq = options.useGroq || false;
  const skipFinalPass = options.skipFinalPass || false;

  // Skip if explicitly disabled
  if (skipFinalPass) {
    console.log('  Final HTML pass skipped (--skip-final-pass)');
    return {
      htmlPath,
      changes: [{ type: 'skipped', reason: 'Final pass explicitly skipped' }],
      method: 'skipped'
    };
  }

  // Read the rendered HTML
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // Get the final review prompt
  const promptDef = PROMPT_REGISTRY.prompts.find(p => p.prompt_id === 'final_html_review_v1');
  if (!promptDef) {
    console.warn('  Final HTML review prompt not found, using manual polish');
    const { html: manuallyPolished, changes } = manualPolishHTML(htmlContent);
    fs.writeFileSync(htmlPath, manuallyPolished, 'utf8');
    return {
      htmlPath,
      changes,
      method: 'manual'
    };
  }

  // Build context for the prompt
  const promptContext = {
    client_name: context.client_name || 'Client',
    total_price: context.total_price || '$0',
    platform: context.platform || 'direct',
    html_content: htmlContent
  };

  // Render the user prompt
  const userPrompt = Mustache.render(promptDef.user_prompt_template, promptContext);

  console.log('  Running final quality review...');

  try {
    // Call LLM
    let correctedHtml;
    if (useGroq) {
      const adapter = new GroqAdapter({ apiKey: process.env.GROQ_API_KEY });
      correctedHtml = await adapter.generate(promptDef.system_prompt, userPrompt);
    } else {
      correctedHtml = await generateWithGemini(promptDef.system_prompt, userPrompt);
    }

    // Validate the response is valid HTML
    if (!isValidHtml(correctedHtml)) {
      console.warn('  Final pass returned invalid HTML, keeping original');
      return htmlPath;
    }

    // Check for forbidden phrases
    const hasForbidden = checkForbiddenPhrases(correctedHtml, promptDef.output_constraints?.forbidden_phrases);
    if (hasForbidden.length > 0) {
      console.warn(`  Warning: Final HTML contains forbidden phrases: ${hasForbidden.join(', ')}`);
    }

    // Count changes made (rough estimate based on length difference)
    const changePercent = Math.abs(correctedHtml.length - htmlContent.length) / htmlContent.length * 100;
    if (changePercent > 10) {
      console.warn(`  Warning: Final pass made significant changes (${changePercent.toFixed(1)}% difference)`);
      // If changes are too large, keep original (LLM might have hallucinated)
      if (changePercent > 25) {
        console.warn('  Changes too extensive, keeping original HTML');
        return htmlPath;
      }
    }

    // Write the corrected HTML back
    fs.writeFileSync(htmlPath, correctedHtml, 'utf8');

    // Summarize what changed
    const changes = summarizeHTMLChanges(htmlContent, correctedHtml);
    console.log(`  Final pass complete (${changePercent.toFixed(1)}% adjusted)`);

    return {
      htmlPath,
      changes,
      method: 'llm'
    };

  } catch (error) {
    console.error(`  Final HTML pass failed: ${error.message}`);
    console.log('  Falling back to manual polish...');

    // Use manual polish fallback
    const { html: manuallyPolished, changes } = manualPolishHTML(htmlContent);

    // Write the manually polished HTML back
    fs.writeFileSync(htmlPath, manuallyPolished, 'utf8');

    return {
      htmlPath,
      changes,
      method: 'manual'
    };
  }
}

/**
 * Generate with Gemini using REST API
 */
async function generateWithGemini(systemPrompt, userPrompt, retries = 2) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
  const body = {
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: {
      maxOutputTokens: 32000, // Large token limit for full HTML
      temperature: 0.1 // Low temperature for minimal changes
    }
  };

  let currentModel = MODEL_FALLBACK_ORDER[0];
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Use v1beta for Gemini 3 models, v1 for others
      const apiVersion = currentModel.startsWith('gemini-3') ? 'v1beta' : 'v1';
      const baseUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models`;
      const url = `${baseUrl}/${currentModel}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      // Extract HTML from response (in case LLM wrapped it in markdown)
      return extractHtml(content);

    } catch (error) {
      lastError = error;

      if (isRateLimitError(error)) {
        const nextModel = getNextFallbackModel(currentModel);
        if (nextModel) {
          console.log(`  Rate limit, falling back to ${nextModel}`);
          currentModel = nextModel;
          await sleep(2000);
          continue;
        }

        const retryAfter = parseRetryAfter(error);
        console.log(`  Rate limit, waiting ${Math.ceil(retryAfter / 1000)}s...`);
        await sleep(retryAfter);
        continue;
      }

      if (attempt < retries) {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      break;
    }
  }

  throw lastError;
}

/**
 * Extract HTML from LLM response (handles markdown code blocks)
 */
function extractHtml(content) {
  // If wrapped in markdown code block, extract it
  const htmlMatch = content.match(/```html?\s*([\s\S]*?)```/);
  if (htmlMatch) {
    return htmlMatch[1].trim();
  }

  // If it starts with <!DOCTYPE or <html, use as-is
  if (content.trim().startsWith('<!DOCTYPE') || content.trim().startsWith('<html')) {
    return content.trim();
  }

  // Otherwise return as-is
  return content.trim();
}

/**
 * Basic HTML validation
 */
function isValidHtml(html) {
  // Must start with doctype or html tag
  const trimmed = html.trim().toLowerCase();
  if (!trimmed.startsWith('<!doctype') && !trimmed.startsWith('<html')) {
    return false;
  }

  // Must have closing html tag
  if (!trimmed.includes('</html>')) {
    return false;
  }

  // Must have body
  if (!trimmed.includes('<body') || !trimmed.includes('</body>')) {
    return false;
  }

  return true;
}

/**
 * Check for forbidden phrases
 */
function checkForbiddenPhrases(html, forbidden = []) {
  const found = [];
  const lowerHtml = html.toLowerCase();

  for (const phrase of forbidden) {
    if (lowerHtml.includes(phrase.toLowerCase())) {
      found.push(phrase);
    }
  }

  return found;
}

/**
 * Manual HTML polish fallback - applies deterministic fixes when LLM is unavailable
 * This ensures proposals are always polished even when API limits are hit
 * @param {string} html - The rendered HTML document
 * @returns {{html: string, changes: Array}} - Polished HTML and list of changes
 */
function manualPolishHTML(html) {
  const changes = [];
  let polished = html;

  // 1. Remove [INSUFFICIENT_EVIDENCE] markers and replace with sensible defaults
  const insufficientMatches = polished.match(/\[INSUFFICIENT_EVIDENCE[^\]]*\]/g) || [];
  if (insufficientMatches.length > 0) {
    polished = polished.replace(/\[INSUFFICIENT_EVIDENCE[^\]]*\]/g, 'Data not available');
    changes.push({
      type: 'fix_insufficient_evidence',
      count: insufficientMatches.length,
      reason: `Replaced ${insufficientMatches.length} insufficient evidence markers with "Data not available"`
    });
  }

  // 2. Remove markdown code block markers
  const markdownMatches = polished.match(/```(?:json|html|text)?/g) || [];
  if (markdownMatches.length > 0) {
    polished = polished.replace(/```(?:json|html|text)?/g, '');
    changes.push({
      type: 'remove_markdown',
      count: markdownMatches.length,
      reason: `Removed ${markdownMatches.length} markdown code block markers`
    });
  }

  // 3. Remove remaining [LLM_PLACEHOLDER: ...] markers with proposal-specific defaults
  const placeholderMatches = polished.match(/\[LLM_PLACEHOLDER:[^\]]+\]/g) || [];
  if (placeholderMatches.length > 0) {
    polished = polished.replace(/\[LLM_PLACEHOLDER:\s*([^\]]+)\]/g, (match, field) => {
      // Proposal-specific defaults
      if (field.includes('executive_summary')) return 'This proposal outlines the implementation plan based on Phase 1 audit findings.';
      if (field.includes('value_proposition')) return 'Recover operational efficiency through targeted automation.';
      if (field.includes('milestone_description')) return 'Deliverables and implementation activities for this milestone.';
      if (field.includes('phase_description')) return 'Phase activities and expected outcomes.';
      if (field.includes('scope_in')) return 'Implementation of automation workflows as specified.';
      if (field.includes('scope_out')) return 'Items outside the defined project boundaries.';
      if (field.includes('assumption')) return 'Standard project assumptions apply.';
      if (field.includes('cta_headline')) return 'Ready to move forward?';
      if (field.includes('cta_subtext')) return 'Approve this proposal to begin implementation.';
      return 'See details above.';
    });
    changes.push({
      type: 'fix_placeholders',
      count: placeholderMatches.length,
      reason: `Replaced ${placeholderMatches.length} unfilled placeholders with default text`
    });
  }

  // 4. Clean up template variables like [specific data point]
  const templateVarMatches = polished.match(/\[(?:specific|start|end|missing|level|client|workflow)[^\]]*\]/gi) || [];
  if (templateVarMatches.length > 0) {
    polished = polished
      .replace(/\[specific data point\]/gi, 'key metrics')
      .replace(/\[start date\]/gi, 'the project start date')
      .replace(/\[end date\]/gi, 'the project end date')
      .replace(/\[missing period\/segment\]/gi, 'certain time periods')
      .replace(/\[specific data category\]/gi, 'certain categories')
      .replace(/\[level of detail\]/gi, 'detailed')
      .replace(/\[specific area of impact\]/gi, 'specific areas')
      .replace(/\[client name\]/gi, 'the client')
      .replace(/\[workflow name\]/gi, 'the workflow');
    changes.push({
      type: 'fix_template_vars',
      count: templateVarMatches.length,
      reason: `Replaced ${templateVarMatches.length} template variables with readable text`
    });
  }

  // 5. Fix broken sentences (no ending punctuation)
  const brokenSentencePattern = />([^<>]+[a-zA-Z])<\/(?:p|div|span|td)/g;
  let match;
  let brokenCount = 0;
  const originalPolished = polished;
  while ((match = brokenSentencePattern.exec(originalPolished)) !== null) {
    const text = match[1];
    // Check if the text doesn't end with punctuation but looks like a sentence
    if (text.length > 20 && !text.match(/[.!?:,]$/)) {
      polished = polished.replace(match[0], `>${text}.</` + match[0].split('</')[1]);
      brokenCount++;
    }
  }
  if (brokenCount > 0) {
    changes.push({
      type: 'fix_punctuation',
      count: brokenCount,
      reason: `Added missing punctuation to ${brokenCount} sentences`
    });
  }

  // 6. Ensure no double spaces
  const doubleSpaces = (polished.match(/  +/g) || []).length;
  if (doubleSpaces > 10) {
    polished = polished.replace(/  +/g, ' ');
    changes.push({
      type: 'fix_whitespace',
      count: doubleSpaces,
      reason: 'Normalized whitespace'
    });
  }

  if (changes.length === 0) {
    changes.push({
      type: 'no_changes',
      reason: 'HTML already clean, no manual fixes needed'
    });
  }

  console.log(`  Manual polish complete: ${changes.length} fixes applied`);
  changes.forEach(c => console.log(`    - ${c.reason}`));

  return { html: polished, changes };
}

/**
 * Summarize changes between original and polished HTML
 * Returns a list of detected changes
 */
function summarizeHTMLChanges(original, polished) {
  const changes = [];

  // Check for [INSUFFICIENT_EVIDENCE] removal
  const insufficientBefore = (original.match(/\[INSUFFICIENT_EVIDENCE\]/g) || []).length;
  const insufficientAfter = (polished.match(/\[INSUFFICIENT_EVIDENCE\]/g) || []).length;
  if (insufficientBefore > insufficientAfter) {
    changes.push({
      type: 'fix_insufficient_evidence',
      count: insufficientBefore - insufficientAfter,
      reason: `Fixed ${insufficientBefore - insufficientAfter} insufficient evidence markers`
    });
  }

  // Check for markdown artifact removal
  const markdownBefore = (original.match(/```/g) || []).length;
  const markdownAfter = (polished.match(/```/g) || []).length;
  if (markdownBefore > markdownAfter) {
    changes.push({
      type: 'remove_markdown',
      count: markdownBefore - markdownAfter,
      reason: `Removed ${markdownBefore - markdownAfter} markdown code block markers`
    });
  }

  // Check for placeholder removal
  const placeholderBefore = (original.match(/\[LLM_PLACEHOLDER:/g) || []).length;
  const placeholderAfter = (polished.match(/\[LLM_PLACEHOLDER:/g) || []).length;
  if (placeholderBefore > placeholderAfter) {
    changes.push({
      type: 'fix_placeholders',
      count: placeholderBefore - placeholderAfter,
      reason: `Fixed ${placeholderBefore - placeholderAfter} unfilled placeholders`
    });
  }

  // Simple text length comparison
  const originalTextLength = original.replace(/<[^>]*>/g, '').length;
  const polishedTextLength = polished.replace(/<[^>]*>/g, '').length;
  const lengthDiff = Math.abs(polishedTextLength - originalTextLength);
  const lengthChangePercent = (lengthDiff / originalTextLength * 100).toFixed(1);

  if (lengthDiff > 50) {
    changes.push({
      type: 'text_rewrite',
      reason: `Text content changed by ${lengthChangePercent}% (${lengthDiff} characters)`
    });
  }

  // If no specific changes detected, note that polish ran
  if (changes.length === 0) {
    changes.push({
      type: 'minor_polish',
      reason: 'Minor text improvements applied'
    });
  }

  return changes;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export {
  runFinalHtmlPass,
  manualPolishHTML,
  summarizeHTMLChanges,
  isValidHtml,
  checkForbiddenPhrases
};

export default {
  runFinalHtmlPass,
  manualPolishHTML,
  summarizeHTMLChanges,
  isValidHtml,
  checkForbiddenPhrases
};
