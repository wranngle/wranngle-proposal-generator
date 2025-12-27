# Template & HTML Specialist

## Role
You are an expert in the Wranngle proposal template system and HTML/PDF generation. You understand Mustache templating, responsive design for PDF, and brand consistency.

## Expertise
- Mustache template syntax and rendering
- 2-page proposal layout and structure
- Brand color scheme and typography
- Puppeteer PDF generation configuration
- Responsive HTML for PDF rendering
- Platform-specific formatting (Upwork vs Direct)

## Brand Guidelines

### Colors
| Usage | Color | Hex |
|-------|-------|-----|
| CTA/Accent | Sunset Orange | #ff5f00 |
| Background | Sand | #fcfaf5 |
| Text | Night | #12111a |
| Secondary | Light Gray | #f5f5f5 |
| Border | Medium Gray | #e0e0e0 |

### Typography
| Element | Font | Weight |
|---------|------|--------|
| Headings | Outfit | 600-800 |
| Body | Inter | 400-500 |
| Numbers | Outfit | 700 |
| Labels | Inter | 500 |

### Spacing
- Page margins: 0.5in
- Section spacing: 24px
- Card padding: 16px
- Line height: 1.5

## Template Structure

### Page 1: Pricing Summary
1. **Header**: Logo, proposal title, date
2. **Executive Summary**: 2-3 sentences from LLM
3. **Investment Table**: Milestones with prices
4. **ROI Section**: Annual recovery, payback period
5. **Payment Terms**: Timeline and conditions
6. **CTA Button**: "Approve Proposal"

### Page 2: Scope of Work
1. **Milestone Cards**: 2.1-2.4 with deliverables
2. **In Scope**: Bulleted list of inclusions
3. **Out of Scope**: Clear exclusions
4. **Assumptions**: Project dependencies
5. **Change Control**: Statement about scope changes
6. **Phase 3 Teaser**: Future partnership mention

## Key Files
- `templates/proposal_template.html` - Main Mustache template
- `lib/pdf_generator.js` - Puppeteer configuration
- `lib/html_final_pass.js` - Final HTML polish
- `lib/pipeline.js` - Template rendering logic

## Mustache Variables
```mustache
{{client_name}} - Client/account name
{{total_price}} - Formatted total price
{{#milestones}}{{name}} {{price}}{{/milestones}}
{{#scope_in}}{{.}}{{/scope_in}}
{{#scope_out}}{{.}}{{/scope_out}}
{{executive_summary}}
{{value_proposition}}
{{cta_headline}}
{{valid_until}}
```

## Constraints
- NEVER exceed 2 pages
- Maintain brand consistency
- Ensure PDF renders correctly via Puppeteer
- Test on both Upwork and Direct platforms
- No content truncation or overflow
- All prices must be formatted consistently

## PDF Generation Settings
```javascript
{
  format: 'Letter',
  margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
  printBackground: true,
  preferCSSPageSize: true
}
```

## Common Tasks
1. **Fix overflow**: Reduce content or adjust spacing
2. **Update branding**: Modify CSS color variables
3. **Add new section**: Update template, ensure page fit
4. **Fix PDF rendering**: Check Puppeteer config, test locally
5. **Platform customization**: Conditional sections for Upwork/Direct

## Page Fit Validation
Before generating PDF:
1. Render HTML in browser
2. Check page breaks
3. Verify no content overflow
4. Test with maximum content lengths
5. Validate responsive behavior

🟢 Ready 

1. Executive Summary 

"Wranngle is a AI consultancy dedicated to saving people's most valuable resource: Time. We operate as a counterbalance to the chaotic and often reckless AI innovation space, providing rigorous, ethically grounded automation architectures. Unlike generalist agencies or cheap freelancers who prioritize speed over safety, Wranngle focuses on 'taming wild AI.' We minimize risk through strict governance and structured auditing, ensuring everyone can harness the prosperity of automation without the exposure to data leaks or operational fragility." 

🟢 Ready 

2. Company Description 

"Wranngle was founded to bridge the gap between 'messy innovation' and 'enterprise reliability.' The firm operates on a 'Privacy-First' and 'Zero Lock-in' philosophy. Our mission is to tame the inherent risks of AI—hallucinations, security vulnerabilities, and uncontrolled costs—by applying engineering rigor to workflows and AI Agents. We serve as the Architect, not just the Builder." 

🟢 Ready 

3. Market Analysis 

"Our competitive landscape shifts as we scale: 

 

 

Immediate (Months 0-6): We compete against Low-Cost Freelancers (Upwork) who deliver 'spaghetti code' without documentation. We win on reliability and safety. 

 

 

Mid-Term (Months 6-12): We compete against DIY Founders attempting to bootstrap automation. We win on complexity handling and time-savings. 

 

 

Long-Term (Year 2+): We compete against Big Agencies and Bloated MSPs (Managed Service Providers) who are slow to adapt to AI under the guise of moderation. We win on agility and specialized AI Ops + cybersecurity expertise." 

🟢 Ready 

4. Products & Services 

"We utilize a tiered 'Phase' delivery model: 

 

 

Phase 1: The AI Process Audit ($100). A diagnostic deep-dive into a single business process to identify 'Revenue Bleed.' Includes a questionnaire, virtual consultation, and one revision. This is our 'Foot in the Door.' 

 

 

Phase 2: Stabilize (Fixed Price + Maintenance). The construction and standardization of the specific automation identified in the Audit. Includes a comprehensive transparent project plan and proposal. Includes a recurring support agreement to maintain that single process. 

 

 

Phase 3: Scale ($5,000/mo Retainer for SMBs). A fractional CAIO (Chief AI Officer) service. Comprehensive consulting, development, and strategic roadmapping for the entire organization. 

 

 

Phase 4: Enterprise. [Placeholder for Custom Compliance/SLA Offerings]" 

🟢 Ready 

5. Financial Analysis 

"Wranngle Systems operates on a 'Lean & Liquid' financial model designed to withstand early-stage volatility without external capital. 

 

 

Monthly Overhead (Burn Rate): ~$1,000/mo (Covers Insurance, Cloud Infrastructure, Software Licenses, and Legal Compliance). 

 

 

Break-Even Point: 10 Audits per month covers 100% of operational overhead. 

 

 

Profit Centers: Net profit is generated exclusively from Phase 2 (Fixed Price) and Phase 3 (Retainer) contracts." 


