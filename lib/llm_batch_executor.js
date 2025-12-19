/**
 * LLM Batch Executor for Proposal Narratives
 * Generates narrative content for proposal placeholders using Gemini/Groq
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

// Map placeholder names to prompt IDs
const PLACEHOLDER_TO_PROMPT = {
  'executive_summary': 'executive_summary_proposal_v1',
  'value_proposition': 'value_proposition_v1',
  'phase_1_description': 'phase_description_v1',
  'phase_2_description': 'phase_description_v1',
  'phase_3_description': 'phase_description_v1',
  'milestone_2_1_description': 'milestone_description_v1',
  'milestone_2_2_description': 'milestone_description_v1',
  'milestone_2_3_description': 'milestone_description_v1',
  'milestone_2_4_description': 'milestone_description_v1',
  'scope_in_items': 'scope_in_items_v1',
  'scope_out_items': 'scope_out_items_v1',
  'assumptions': 'assumptions_v1',
  'cta_headline': 'cta_headline_v1',
  'cta_subtext': 'cta_subtext_v1'
};

/**
 * Fill all LLM placeholders in a proposal
 * @param {Object} proposal - Proposal with placeholders
 * @param {Object} context - Additional context for prompts
 * @param {Object} options - Execution options
 * @returns {Object} Proposal with filled content
 */
async function fillProposalPlaceholders(proposal, context = {}, options = {}) {
  const useGroq = options.useGroq || false;
  const placeholders = findAllPlaceholders(proposal);

  console.log(`Found ${placeholders.length} placeholders to fill`);

  // Build context from proposal data
  const fullContext = buildPromptContext(proposal, context);

  // Generate all content
  const results = await generateAllContent(placeholders, fullContext, useGroq, options);

  // Apply results to proposal
  const filledProposal = JSON.parse(JSON.stringify(proposal));
  for (const result of results) {
    setValueAtPath(filledProposal, result.path, result.content);
  }

  return filledProposal;
}

/**
 * Find all placeholder paths in proposal
 */
function findAllPlaceholders(obj, path = '', results = []) {
  if (typeof obj === 'string') {
    const match = obj.match(/\[LLM_PLACEHOLDER:\s*([^\]]+)\]/);
    if (match) {
      results.push({
        path: path,
        placeholder_name: match[1].trim(),
        original: obj
      });
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      findAllPlaceholders(item, `${path}[${index}]`, results);
    });
  } else if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const newPath = path ? `${path}.${key}` : key;
      findAllPlaceholders(value, newPath, results);
    }
  }
  return results;
}

/**
 * Build context object for prompt templates
 */
function buildPromptContext(proposal, additionalContext = {}) {
  const context = {
    // Client info
    client_name: proposal.prepared_for?.account_name || 'Client',
    industry: proposal.prepared_for?.industry || 'professional_services',

    // Audit info
    audit_date: proposal.audit_reference?.audit_date || 'Recent',
    workflow_name: proposal.audit_reference?.workflow_name || 'Business Process',
    bleed_amount: proposal.audit_reference?.bleed_total?.display || '$0',
    key_findings: (proposal.audit_reference?.key_findings || []).join('\n- '),

    // Recommended fixes from audit (for bespoke SOW cards)
    recommended_fixes: (proposal.scope?.in_scope || []).join('\n- '),
    technical_solutions: extractTechnicalSolutions(proposal),

    // Pricing info
    total_price: proposal.pricing?.total?.display || '$0',
    annual_recovery: proposal.roi?.annual_recovery?.display || '$0',
    monthly_recovery: proposal.roi?.monthly_recovery?.display || '$0',
    payback_months: proposal.roi?.payback_period_months || 0,

    // Validity
    valid_until: proposal.document?.valid_until ?
      new Date(proposal.document.valid_until).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
      }) : 'TBD',

    // Platform
    platform: proposal.rendering?.platform || 'direct',

    // Systems
    systems_list: extractSystems(proposal).join(', ') || 'primary systems',

    // Timeline
    timeline: extractTotalTimeline(proposal),

    ...additionalContext
  };

  // Add phase-specific context
  if (proposal.phases) {
    for (const phase of proposal.phases) {
      context[`phase_${phase.phase_number}_name`] = phase.phase_name;
      context[`phase_${phase.phase_number}_state`] = phase.state;

      if (phase.milestones) {
        for (const milestone of phase.milestones) {
          const msKey = milestone.milestone_number.replace('.', '_');
          context[`milestone_${msKey}_name`] = milestone.milestone_name;
          context[`milestone_${msKey}_duration`] = milestone.duration?.display || '';
          context[`milestone_${msKey}_price`] = milestone.price_allocation?.display || '';
          context[`milestone_${msKey}_deliverables`] = (milestone.deliverables || [])
            .map(d => `- ${d.name}: ${d.description || ''}`).join('\n');
        }
      }
    }
  }

  return context;
}

/**
 * Extract technical solutions from proposal scope for bespoke SOW cards
 */
function extractTechnicalSolutions(proposal) {
  const solutions = proposal.scope?.in_scope || [];
  if (solutions.length === 0) return 'Custom automation implementation';

  // Format as a concise technical summary
  return solutions.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join('\n');
}

/**
 * Extract systems from proposal
 */
function extractSystems(proposal) {
  const systems = new Set();

  // From phases/milestones
  if (proposal.phases) {
    for (const phase of proposal.phases) {
      if (phase.milestones) {
        for (const milestone of phase.milestones) {
          if (milestone.deliverables) {
            for (const del of milestone.deliverables) {
              // Extract system names from deliverable text
              const matches = (del.description || '').match(/\b[A-Z][a-zA-Z]*(?:CRM|ERP|API)\b/g);
              if (matches) matches.forEach(s => systems.add(s));
            }
          }
        }
      }
    }
  }

  return Array.from(systems);
}

/**
 * Extract total timeline from proposal
 */
function extractTotalTimeline(proposal) {
  let totalWeeks = 0;

  if (proposal.phases) {
    for (const phase of proposal.phases) {
      if (phase.state === 'current' && phase.milestones) {
        for (const milestone of phase.milestones) {
          if (milestone.duration?.unit === 'weeks') {
            totalWeeks += milestone.duration.value;
          }
        }
      }
    }
  }

  return totalWeeks > 0 ? `${totalWeeks} weeks` : 'TBD';
}

/**
 * Generate all content using LLM
 */
async function generateAllContent(placeholders, context, useGroq, options) {
  const results = [];
  let adapter;

  if (useGroq) {
    adapter = new GroqAdapter({ apiKey: process.env.GROQ_API_KEY });
  } else {
    adapter = {
      apiKey: process.env.GEMINI_API_KEY,
      currentModel: MODEL_FALLBACK_ORDER[0],
      fallbackHistory: []
    };
  }

  // Process placeholders with batching
  const batchConfig = PROMPT_REGISTRY.batch_config || { max_concurrent: 5 };

  for (let i = 0; i < placeholders.length; i += batchConfig.max_concurrent) {
    const batch = placeholders.slice(i, i + batchConfig.max_concurrent);

    const batchResults = await Promise.all(
      batch.map(async (placeholder) => {
        try {
          const content = await generateSingleContent(placeholder, context, adapter, useGroq);
          return {
            path: placeholder.path,
            content: content,
            success: true
          };
        } catch (error) {
          console.error(`Error generating ${placeholder.placeholder_name}:`, error.message);
          return {
            path: placeholder.path,
            content: placeholder.original, // Keep placeholder on error
            success: false,
            error: error.message
          };
        }
      })
    );

    results.push(...batchResults);

    // Small delay between batches
    if (i + batchConfig.max_concurrent < placeholders.length) {
      await sleep(500);
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`Generated ${successCount}/${results.length} narrative sections`);

  return results;
}

/**
 * Generate content for a single placeholder
 */
async function generateSingleContent(placeholder, context, adapter, useGroq) {
  const promptId = PLACEHOLDER_TO_PROMPT[placeholder.placeholder_name];

  if (!promptId) {
    console.warn(`No prompt mapping for: ${placeholder.placeholder_name}`);
    return `[Content for ${placeholder.placeholder_name}]`;
  }

  const promptDef = PROMPT_REGISTRY.prompts.find(p => p.prompt_id === promptId);

  if (!promptDef) {
    console.warn(`Prompt definition not found: ${promptId}`);
    return `[Content for ${placeholder.placeholder_name}]`;
  }

  // Enhance context for specific placeholders
  const enhancedContext = enhanceContextForPlaceholder(placeholder.placeholder_name, context);

  // Render prompt template
  const userPrompt = Mustache.render(promptDef.user_prompt_template, enhancedContext);

  // Call LLM
  let content;
  if (useGroq) {
    content = await generateWithGroq(adapter, promptDef.system_prompt, userPrompt);
  } else {
    content = await generateWithGemini(adapter, promptDef.system_prompt, userPrompt);
  }

  // Post-process based on output type
  content = postProcessOutput(content, promptDef);

  // Validate against constraints
  validateOutput(content, promptDef.output_constraints);

  return content;
}

/**
 * Enhance context for specific placeholder types
 */
function enhanceContextForPlaceholder(placeholderName, baseContext) {
  const context = { ...baseContext };

  // Add phase-specific context
  if (placeholderName.includes('phase_1')) {
    context.phase_number = 1;
    context.phase_name = 'Audit';
    context.state = 'complete';
  } else if (placeholderName.includes('phase_2')) {
    context.phase_number = 2;
    context.phase_name = 'Stabilize';
    context.state = 'current';
  } else if (placeholderName.includes('phase_3')) {
    context.phase_number = 3;
    context.phase_name = 'Scale';
    context.state = 'upcoming';
  }

  // Add milestone-specific context
  const msMatch = placeholderName.match(/milestone_(\d)_(\d)/);
  if (msMatch) {
    const msNum = `${msMatch[1]}.${msMatch[2]}`;
    context.milestone_number = msNum;
    context.milestone_name = context[`milestone_${msMatch[1]}_${msMatch[2]}_name`] || getMilestoneName(msNum);
    context.duration = context[`milestone_${msMatch[1]}_${msMatch[2]}_duration`] || '';
    context.price_allocation = context[`milestone_${msMatch[1]}_${msMatch[2]}_price`] || '';
    context.percentage = getMilestonePercentage(msNum);
    context.deliverables = context[`milestone_${msMatch[1]}_${msMatch[2]}_deliverables`] || '';
  }

  return context;
}

/**
 * Get milestone name by number
 */
function getMilestoneName(msNum) {
  const names = {
    '2.1': 'Design',
    '2.2': 'Build',
    '2.3': 'Test',
    '2.4': 'Deploy'
  };
  return names[msNum] || 'Milestone';
}

/**
 * Get milestone percentage by number
 */
function getMilestonePercentage(msNum) {
  const percentages = {
    '2.1': 20,
    '2.2': 45,
    '2.3': 15,
    '2.4': 20
  };
  return percentages[msNum] || 25;
}

/**
 * Generate with Gemini using REST API (same pattern as ai_audit_report)
 */
async function generateWithGemini(adapter, systemPrompt, userPrompt, retries = 2) {
  if (!adapter.apiKey) {
    throw new Error('Gemini API key not set');
  }

  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
  const body = {
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: {
      maxOutputTokens: 2000,
      temperature: 0.3
    }
  };

  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Use v1beta for Gemini 3 models, v1 for others
      const apiVersion = adapter.currentModel.startsWith('gemini-3') ? 'v1beta' : 'v1';
      const baseUrl = `https://generativelanguage.googleapis.com/${apiVersion}/models`;
      const url = `${baseUrl}/${adapter.currentModel}:generateContent?key=${adapter.apiKey}`;

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

      return content.trim();
    } catch (error) {
      lastError = error;

      if (isRateLimitError(error)) {
        const nextModel = getNextFallbackModel(adapter.currentModel);
        if (nextModel) {
          console.log(`Rate limit hit, falling back to ${nextModel}`);
          adapter.currentModel = nextModel;
          adapter.fallbackHistory.push({ from: adapter.currentModel, to: nextModel });
          await sleep(2000);
          continue;
        }

        const retryAfter = parseRetryAfter(error);
        console.log(`Rate limit hit, waiting ${Math.ceil(retryAfter / 1000)}s...`);
        await sleep(retryAfter);
        continue;
      }

      const isRetryable = error.message.includes('fetch failed') || error.message.includes('network');
      if (isRetryable && attempt < retries) {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      break;
    }
  }

  throw lastError;
}

/**
 * Generate with Groq
 */
async function generateWithGroq(adapter, systemPrompt, userPrompt) {
  return adapter.generate(systemPrompt, userPrompt);
}

/**
 * Strip LLM preambles and postambles that leak through
 * Handles common patterns like "Of course! Here are...", "Sure, here's...", etc.
 */
function stripLLMPreamble(content) {
  if (!content || typeof content !== 'string') return content;

  // Common LLM preamble patterns to strip
  const preamblePatterns = [
    /^(?:Of course[.!]?\s*)?Here (?:are|is) (?:a |several |some |the )?(?:compelling[,]?\s*)?(?:professional[,]?\s*)?(?:CTA|call-to-action|headline|summary|description|text|content|option|item|suggestion|recommendation)[s]?[^:]*[:.]?\s*/i,
    /^(?:Sure[!,]?\s*)?(?:Here(?:'s| is| are)[^:]*[:.]?\s*)/i,
    /^(?:Certainly[!,.]?\s*)?(?:Here(?:'s| is| are)[^:]*[:.]?\s*)/i,
    /^(?:Absolutely[!,.]?\s*)?(?:Here(?:'s| is| are)[^:]*[:.]?\s*)/i,
    /^(?:I'd be happy to help[.!]?\s*)/i,
    /^(?:I can help (?:you )?with that[.!]?\s*)/i,
    /^(?:Great[!,]?\s*)?(?:Let me |I'll )[^.]*[.]\s*/i,
    /^(?:Based on [^,]*,\s*)?(?:here(?:'s| is| are)[^:]*[:.]?\s*)/i,
  ];

  let result = content;

  // Apply preamble stripping
  for (const pattern of preamblePatterns) {
    result = result.replace(pattern, '');
  }

  // Strip trailing meta-commentary
  const postamblePatterns = [
    /\s*(?:Let me know if you[^.]*[.]|Feel free to[^.]*[.]|I hope this helps[.!]?|Would you like[^?]*[?])$/i,
    /\s*(?:Is there anything else[^?]*[?]|Do you need[^?]*[?])$/i,
  ];

  for (const pattern of postamblePatterns) {
    result = result.replace(pattern, '');
  }

  return result.trim();
}

/**
 * Post-process LLM output based on type
 * Enforces constraints to ensure 2-page proposal fit
 */
function postProcessOutput(content, promptDef) {
  const outputType = promptDef.output_type || 'string';
  const constraints = promptDef.output_constraints || {};

  // Strip LLM preambles/postambles that leak through
  content = stripLLMPreamble(content);

  if (outputType === 'array_of_strings') {
    // Parse bulleted list to array
    let lines = content.split('\n')
      .map(line => line.replace(/^[-*•]\s*/, '').trim())
      .filter(line => line.length > 0);

    // Enforce max_items constraint
    if (constraints.max_items && lines.length > constraints.max_items) {
      lines = lines.slice(0, constraints.max_items);
    }

    // Enforce item_max_length constraint
    if (constraints.item_max_length) {
      lines = lines.map(line => truncateToSentence(line, constraints.item_max_length));
    }

    return lines;
  }

  if (outputType === 'html_fragment') {
    // Ensure proper HTML wrapping
    if (!content.startsWith('<')) {
      content = `<p>${content}</p>`;
    }
    // Enforce max_length for HTML
    if (constraints.max_length && content.length > constraints.max_length * 1.5) {
      content = truncateToSentence(content, constraints.max_length);
    }
    return content;
  }

  // Default: string - ENFORCE max_length by truncating at sentence boundary
  content = content.trim();

  // Remove markdown formatting that adds visual bulk
  content = content.replace(/\*\*([^*]+)\*\*/g, '$1'); // Remove bold
  content = content.replace(/\n\n+/g, ' '); // Collapse multiple newlines to single space

  if (constraints.max_length && content.length > constraints.max_length) {
    content = truncateToSentence(content, constraints.max_length);
  }

  return content;
}

/**
 * Truncate string to max length at sentence boundary
 */
function truncateToSentence(text, maxLength) {
  if (text.length <= maxLength) return text;

  // Find the last sentence boundary before maxLength
  const truncated = text.substring(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastExclaim = truncated.lastIndexOf('!');

  const lastBoundary = Math.max(lastPeriod, lastQuestion, lastExclaim);

  if (lastBoundary > maxLength * 0.5) {
    // Found a good sentence boundary in the second half
    return text.substring(0, lastBoundary + 1);
  }

  // No good boundary, truncate at word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.8) {
    return text.substring(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Validate output against constraints
 */
function validateOutput(content, constraints) {
  if (!constraints) return;

  const text = Array.isArray(content) ? content.join(' ') : content;

  if (constraints.max_length && text.length > constraints.max_length) {
    console.warn(`Output exceeds max length: ${text.length} > ${constraints.max_length}`);
  }

  if (constraints.forbidden_phrases) {
    for (const phrase of constraints.forbidden_phrases) {
      if (text.toLowerCase().includes(phrase.toLowerCase())) {
        console.warn(`Output contains forbidden phrase: "${phrase}"`);
      }
    }
  }

  if (Array.isArray(content)) {
    if (constraints.min_items && content.length < constraints.min_items) {
      console.warn(`Output has fewer items than min: ${content.length} < ${constraints.min_items}`);
    }
    if (constraints.max_items && content.length > constraints.max_items) {
      console.warn(`Output has more items than max: ${content.length} > ${constraints.max_items}`);
    }
  }
}

/**
 * Set value at path in object
 */
function setValueAtPath(obj, path, value) {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export {
  fillProposalPlaceholders,
  findAllPlaceholders,
  buildPromptContext,
  generateSingleContent,
  PLACEHOLDER_TO_PROMPT
};

export default {
  fillProposalPlaceholders,
  findAllPlaceholders,
  buildPromptContext,
  generateSingleContent,
  PLACEHOLDER_TO_PROMPT
};
