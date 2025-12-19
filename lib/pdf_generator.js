/**
 * PDF Generator for Proposals
 * Converts HTML proposals to 2-page PDFs using Puppeteer
 *
 * Synced with ai_audit_report/lib/pdf_generator.js patterns
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

/**
 * Default PDF options for 2-page proposals
 */
const DEFAULT_PDF_OPTIONS = {
  format: 'Letter',
  printBackground: true,
  preferCSSPageSize: true,
  margin: {
    top: '0',
    right: '0',
    bottom: '0',
    left: '0'
  }
};

/**
 * Generate PDF from HTML file
 * @param {string} htmlPath - Path to the HTML file
 * @param {string} pdfPath - Output path for the PDF (optional, defaults to same name with .pdf)
 * @param {Object} options - PDF generation options
 * @returns {Promise<{success: boolean, pdfPath: string, size: number}>}
 */
export async function generatePDF(htmlPath, pdfPath = null, options = {}) {
  // Resolve paths
  const absoluteHtmlPath = path.resolve(htmlPath);

  if (!fs.existsSync(absoluteHtmlPath)) {
    throw new Error(`HTML file not found: ${absoluteHtmlPath}`);
  }

  // Default PDF path: same as HTML but with .pdf extension
  if (!pdfPath) {
    pdfPath = absoluteHtmlPath.replace(/\.html?$/i, '.pdf');
  }
  const absolutePdfPath = path.resolve(pdfPath);

  // Ensure output directory exists
  const outputDir = path.dirname(absolutePdfPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Merge options
  const pdfOptions = {
    ...DEFAULT_PDF_OPTIONS,
    ...options,
    path: absolutePdfPath
  };

  let browser = null;

  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();

    // Set viewport for consistent rendering (Letter size at 96 DPI)
    await page.setViewport({
      width: 816,  // 8.5 inches at 96 DPI
      height: 1056, // 11 inches at 96 DPI
      deviceScaleFactor: 2
    });

    // Load HTML file using file:// URL
    const fileUrl = `file://${absoluteHtmlPath}`;
    await page.goto(fileUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Wait for fonts to load
    await page.evaluateHandle('document.fonts.ready');

    // Small delay for any final rendering
    await new Promise(resolve => setTimeout(resolve, 500));

    // Generate PDF
    await page.pdf(pdfOptions);

    // Get file size
    const stats = fs.statSync(absolutePdfPath);

    // Verify page count (rough estimate for 2-page proposals)
    const pageCount = estimatePageCount(stats.size);
    if (pageCount !== 2) {
      console.warn(`Warning: Generated PDF has ~${pageCount} pages (expected 2)`);
    }

    return {
      success: true,
      pdfPath: absolutePdfPath,
      size: stats.size,
      sizeDisplay: `${(stats.size / 1024).toFixed(1)} KB`
    };

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Generate PDF from HTML string content
 * @param {string} htmlContent - HTML content as string
 * @param {string} pdfPath - Output path for the PDF
 * @param {Object} options - PDF generation options
 * @returns {Promise<{success: boolean, pdfPath: string, size: number}>}
 */
export async function generatePDFFromString(htmlContent, pdfPath, options = {}) {
  const absolutePdfPath = path.resolve(pdfPath);

  // Ensure output directory exists
  const outputDir = path.dirname(absolutePdfPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Merge options
  const pdfOptions = {
    ...DEFAULT_PDF_OPTIONS,
    ...options,
    path: absolutePdfPath
  };

  let browser = null;

  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();

    // Set viewport for letter size
    await page.setViewport({
      width: 816,
      height: 1056,
      deviceScaleFactor: 2
    });

    // Set content directly
    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Wait for fonts to load
    await page.evaluateHandle('document.fonts.ready');

    // Wait for images
    await page.evaluate(async () => {
      const images = document.querySelectorAll('img');
      await Promise.all(Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.addEventListener('load', resolve);
          img.addEventListener('error', resolve);
        });
      }));
    });

    // Small delay for final rendering
    await new Promise(resolve => setTimeout(resolve, 500));

    // Generate PDF
    await page.pdf(pdfOptions);

    const stats = fs.statSync(absolutePdfPath);

    return {
      success: true,
      pdfPath: absolutePdfPath,
      size: stats.size,
      sizeDisplay: `${(stats.size / 1024).toFixed(1)} KB`
    };

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Estimate page count from PDF file size (rough heuristic)
 * A 2-page proposal PDF with fonts can be 200-550KB depending on content
 * Higher deviceScaleFactor (2x) results in larger files
 */
function estimatePageCount(sizeBytes) {
  const sizeKB = sizeBytes / 1024;
  // With deviceScaleFactor: 2, PDFs are ~2x larger
  // 2-page proposals typically 400-850KB with embedded fonts
  if (sizeKB < 250) return 1;
  if (sizeKB < 850) return 2;
  if (sizeKB < 1200) return 3;
  return Math.ceil(sizeKB / 400);
}

/**
 * Take screenshot of HTML for preview
 * @param {string} htmlPath - Path to HTML file
 * @param {string} outputPath - Path for output image
 * @param {Object} options - Screenshot options
 */
export async function takeScreenshot(htmlPath, outputPath, options = {}) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // Set viewport
    await page.setViewport({
      width: options.width || 816,
      height: options.height || 1056,
      deviceScaleFactor: options.scale || 2
    });

    // Load HTML
    const absoluteHtmlPath = path.resolve(htmlPath);
    const fileUrl = `file://${absoluteHtmlPath}`;
    await page.goto(fileUrl, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // Wait for fonts
    await page.evaluateHandle('document.fonts.ready');

    // Take screenshot
    await page.screenshot({
      path: outputPath,
      fullPage: options.fullPage !== false
    });

    return outputPath;
  } finally {
    await browser.close();
  }
}

/**
 * Validate HTML can render to 2 pages
 * @param {string} htmlContent - HTML content to check
 * @returns {Promise<Object>} Validation result
 */
export async function validatePageFit(htmlContent) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    await page.setViewport({
      width: 816,
      height: 1056
    });

    await page.setContent(htmlContent, {
      waitUntil: 'domcontentloaded'
    });

    // Check content height
    const dimensions = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      return {
        scrollHeight: Math.max(body.scrollHeight, html.scrollHeight),
        clientHeight: html.clientHeight,
        pageHeight: 1056 // Letter height at 96 DPI
      };
    });

    const estimatedPages = Math.ceil(dimensions.scrollHeight / dimensions.pageHeight);

    return {
      valid: estimatedPages <= 2,
      estimatedPages: estimatedPages,
      contentHeight: dimensions.scrollHeight,
      maxHeight: dimensions.pageHeight * 2,
      overflow: Math.max(0, dimensions.scrollHeight - dimensions.pageHeight * 2)
    };
  } finally {
    await browser.close();
  }
}

export {
  estimatePageCount as getPageCount
};

export default {
  generatePDF,
  generatePDFFromString,
  takeScreenshot,
  validatePageFit,
  getPageCount: estimatePageCount
};
