// services/documentParsingService.js
import fs from 'fs/promises';
import { PDFParse } from 'pdf-parse'; // Fix: Default import for pdf-parse
import mammoth from 'mammoth';
import officeParser from 'officeparser'; // Required package for pptx/docx/xlsx alternative



// Helper: recursively extract text from the officeParser output (JSON)
function extractTextFromOfficeParserJSON(data) {
  let textParts = [];

  function traverse(node) {
    if (!node) return;
    if (typeof node === 'string') {
      textParts.push(node);
    } else if (Array.isArray(node)) {
      node.forEach(traverse);
    } else if (typeof node === 'object') {
      // Look for common text fields: 'text', 'value', 'content', 'children'
      if (node.text && typeof node.text === 'string') textParts.push(node.text);
      if (node.value && typeof node.value === 'string') textParts.push(node.value);
      if (node.content && typeof node.content === 'string') textParts.push(node.content);
      // Recursively traverse children arrays
      if (node.children && Array.isArray(node.children)) traverse(node.children);
      // Also check 'content' array (e.g., from officeParser)
      if (node.content && Array.isArray(node.content)) traverse(node.content);
      // For notes or other nested structures
      if (node.notes && Array.isArray(node.notes)) traverse(node.notes);
      // For each property that might contain an object/array
      for (let key in node) {
        if (node.hasOwnProperty(key) && typeof node[key] === 'object' && key !== 'children' && key !== 'content') {
          traverse(node[key]);
        }
      }
    }
  }

  traverse(data);
  return textParts.join(' ').replace(/\s+/g, ' ').trim();
}
/**
 * Extract text from various document formats
 * @param {string} filePath - Absolute path to the downloaded document
 * @param {string} extension - File extension (e.g., 'pdf', 'docx', 'pptx', 'txt')
 * @returns {Promise<string>} - Extracted text from the document
 */
export async function extractTextFromDocument(filePath, extension) {
  try {
    // Sanitize extension string (remove dot if present, make lowercase)
    const ext = extension.replace('.', '').toLowerCase().trim();

    console.log(`[DocumentParser] Initializing text extraction for format: ${ext}`);

    // 1. Plain Text files (.txt)
    if (ext === 'txt') {
      const text = await fs.readFile(filePath, 'utf-8');
      return text;
    }

    // 2. PDF files (.pdf)
    if (ext === 'pdf') {
      const dataBuffer = await fs.readFile(filePath);

      const parser = new PDFParse({ data: dataBuffer });

      try {
        const result = await parser.getText();

        const text = result?.text?.trim();

        if (!text) {
          throw new Error(
            "No readable text found inside PDF file. The PDF may be scanned, image-based, password protected, or empty."
          );
        }

        return text;
      } finally {
        await parser.destroy?.();
      }
    }

    // 3. Word Documents (.docx)
    if (ext === 'docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value; // Extracted raw text string
    }

    // 4. PowerPoint Presentations (.pptx, .ppt)
    if (ext === 'pptx' || ext === 'ppt') {
      return new Promise((resolve, reject) => {
        // officeParser has a callback-based or promise structure. Using parseConfig for safety.
        officeParser.parseOffice(filePath, function (data, err) {
          if (err) {
            return reject(new Error(`PowerPoint parsing failed: ${err}`));
          }
          // Extract plain text from the returned JSON structure
          const plainText = extractTextFromOfficeParserJSON(data);
          resolve(plainText); // Returns the whole extracted string across all slides
        });
      });
    }

    // Legacy or unsupported formats fallbacks
    if (ext === 'doc') {
      throw new Error("Legacy .doc format is not supported. Please convert it to .docx first.");
    }

    throw new Error(`Unsupported document extension: ${ext}`);

  } catch (error) {
    console.error(`[DocumentParser Error] Failed to extract text from file format [${extension}]:`, error.message);
    throw new Error(`Failed to parse document: ${error.message}`);
  }
}