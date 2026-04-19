/**
 * utils/fileParser.js
 * ─────────────────────────────────────────────────────────────────────────
 * Utility for reading uploaded files (PDF, DOCX, TXT) as plain text.
 *
 * PDF  → Uses the bundled PDF.js library (lib/pdf.min.js) to properly
 *         decode all PDF types including compressed streams (FlateDecode).
 *         This is the ONLY reliable approach for real-world PDFs.
 *
 * DOCX → Extracts text from word/document.xml inside the ZIP archive
 *         using byte-search + XML regex (no external dependency needed).
 *
 * TXT  → Native FileReader.readAsText (UTF-8).
 *
 * PDF.js setup:
 *   • lib/pdf.min.js    — loaded in popup.html before this script
 *   • lib/pdf.worker.min.js — pointed to via GlobalWorkerOptions.workerSrc
 *     (must be in web_accessible_resources in manifest.json)
 * ─────────────────────────────────────────────────────────────────────────
 */

'use strict';

const FileParserUtil = (() => {

  // ── PDF.js Worker Config ───────────────────────────────────────────────

  /**
   * Configure the PDF.js worker source.
   * We use chrome.runtime.getURL to get the extension-local path.
   * This must be called before any getDocument() call.
   */
  function configurePdfWorker() {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js not loaded. Make sure lib/pdf.min.js is included in popup.html before fileParser.js.');
    }
    const workerUrl = chrome.runtime.getURL('lib/pdf.worker.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  }

  // ── PDF Reader (PDF.js) ────────────────────────────────────────────────

  /**
   * Extract all text from a PDF file using PDF.js.
   * Handles:
   *   • Compressed streams (FlateDecode / deflate) — the most common type
   *   • Multi-page documents (iterates all pages)
   *   • Unicode / encoded fonts
   *
   * @param {File} file
   * @returns {Promise<string>}
   */
  async function readPdf(file) {
    configurePdfWorker();

    // Read file as ArrayBuffer
    const arrayBuffer = await readAsArrayBuffer(file);

    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument({
      data            : arrayBuffer,
      useWorkerFetch  : false,
      isEvalSupported : false,
      useSystemFonts  : true,
    });

    let pdf;
    try {
      pdf = await loadingTask.promise;
    } catch (err) {
      throw new Error(`PDF.js could not parse this file: ${err.message}`);
    }

    const numPages = pdf.numPages;
    const pageTexts = [];

    // Extract text from every page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      try {
        const page        = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();

        // textContent.items is an array of { str, hasEOL, ... }
        // We group items by their vertical position to preserve line breaks
        const lines = buildLinesFromItems(textContent.items);
        pageTexts.push(lines);
      } catch (err) {
        console.warn(`[FileParser] Could not extract text from page ${pageNum}:`, err.message);
      }
    }

    const fullText = pageTexts.join('\n\n').trim();

    if (!fullText) {
      return 'PDF appears to contain only images or scanned pages. Please paste your resume as text in the textarea below.';
    }

    return cleanExtractedText(fullText);
  }

  /**
   * Group PDF text items into lines based on their Y coordinate.
   * Items with the same Y (within a small tolerance) are on the same line.
   *
   * @param {Array} items - PDF.js text content items
   * @returns {string} Multi-line text
   */
  function buildLinesFromItems(items) {
    if (!items || items.length === 0) return '';

    // Sort items by transform[5] (Y position, descending = top to bottom)
    const sorted = [...items].sort((a, b) => {
      const yA = a.transform ? a.transform[5] : 0;
      const yB = b.transform ? b.transform[5] : 0;
      if (Math.abs(yA - yB) < 2) {
        // Same line — sort by X
        return (a.transform ? a.transform[4] : 0) - (b.transform ? b.transform[4] : 0);
      }
      return yB - yA; // Higher Y = earlier in document
    });

    const lineGroups = [];
    let currentLineY = null;
    let currentLine  = [];

    for (const item of sorted) {
      const y = item.transform ? item.transform[5] : 0;
      const str = item.str || '';

      if (currentLineY === null || Math.abs(y - currentLineY) > 2) {
        if (currentLine.length > 0) {
          lineGroups.push(currentLine.join(''));
        }
        currentLine  = [str];
        currentLineY = y;
      } else {
        // Same line: add space between items if needed
        const prev = currentLine[currentLine.length - 1] || '';
        if (prev && !prev.endsWith(' ') && !str.startsWith(' ')) {
          currentLine.push(' ');
        }
        currentLine.push(str);
      }

      if (item.hasEOL) {
        lineGroups.push(currentLine.join(''));
        currentLine  = [];
        currentLineY = null;
      }
    }

    if (currentLine.length > 0) {
      lineGroups.push(currentLine.join(''));
    }

    return lineGroups
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .join('\n');
  }

  // ── TXT Reader ─────────────────────────────────────────────────────────

  function readTxt(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = (e) => resolve(e.target.result);
      reader.onerror = ()  => reject(new Error('Failed to read TXT file'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  // ── DOCX Reader ────────────────────────────────────────────────────────

  /**
   * Extract text from a DOCX file by reading word/document.xml.
   * DOCX = ZIP archive. We find the Central Directory for the file entry,
   * then read the raw (uncompressed) XML content.
   *
   * For most DOCX files created by Word/Google Docs, word/document.xml
   * is stored with DEFLATE compression. We detect this and use
   * DecompressionStream (built into Chrome) to decompress it.
   */
  async function readDocx(file) {
    const arrayBuffer = await readAsArrayBuffer(file);
    const bytes = new Uint8Array(arrayBuffer);

    try {
      const text = await extractDocxText(bytes);
      const cleaned = cleanExtractedText(text);
      if (cleaned.length < 20) {
        throw new Error('Too little text found');
      }
      return cleaned;
    } catch (err) {
      console.warn('[FileParser] DOCX extraction failed:', err.message);
      return 'Could not extract text from DOCX. Please paste your resume text directly into the textarea.';
    }
  }

  /**
   * Locate word/document.xml entry in the ZIP and extract its text.
   */
  async function extractDocxText(bytes) {
    const TARGET = 'word/document.xml';
    const entries = parseZipEntries(bytes);

    const docEntry = entries.find(e => e.name === TARGET);
    if (!docEntry) {
      throw new Error(`${TARGET} not found in DOCX ZIP`);
    }

    let xmlBytes = bytes.slice(docEntry.dataOffset, docEntry.dataOffset + docEntry.compressedSize);

    // Method 8 = DEFLATE compressed
    if (docEntry.compressionMethod === 8) {
      xmlBytes = await decompressDeflate(xmlBytes);
    }

    // Convert to string
    const decoder = new TextDecoder('utf-8');
    const xml = decoder.decode(xmlBytes);

    return parseWordXml(xml);
  }

  /**
   * Parse the ZIP Local File Header entries to find all files.
   * ZIP Local File Header structure (each file):
   *   Signature : 4 bytes (0x04034b50)
   *   Version   : 2 bytes
   *   Flags     : 2 bytes
   *   Compression: 2 bytes
   *   ... (timestamps, CRC, sizes)
   *   Filename length: 2 bytes
   *   Extra length   : 2 bytes
   *   Filename       : variable
   *   Extra          : variable
   *   Data           : compressedSize bytes
   */
  function parseZipEntries(bytes) {
    const view    = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const entries = [];
    let offset    = 0;

    while (offset < bytes.length - 4) {
      const sig = view.getUint32(offset, true);

      // Local file header signature
      if (sig !== 0x04034b50) {
        offset++;
        continue;
      }

      if (offset + 30 > bytes.length) break;

      const compressionMethod = view.getUint16(offset + 8,  true);
      const compressedSize    = view.getUint32(offset + 18, true);
      const filenameLength    = view.getUint16(offset + 26, true);
      const extraLength       = view.getUint16(offset + 28, true);

      const nameBytes   = bytes.slice(offset + 30, offset + 30 + filenameLength);
      const name        = new TextDecoder('utf-8').decode(nameBytes);
      const dataOffset  = offset + 30 + filenameLength + extraLength;

      entries.push({ name, compressionMethod, compressedSize, dataOffset });

      // Advance past this entry
      offset = dataOffset + compressedSize;
    }

    return entries;
  }

  /**
   * Decompress DEFLATE-compressed bytes using the DecompressionStream API
   * (built into Chrome — no external library needed).
   */
  async function decompressDeflate(compressedBytes) {
    const stream  = new DecompressionStream('deflate-raw');
    const writer  = stream.writable.getWriter();
    const reader  = stream.readable.getReader();

    writer.write(compressedBytes);
    writer.close();

    const chunks = [];
    let totalLen = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalLen += value.length;
    }

    const result = new Uint8Array(totalLen);
    let pos = 0;
    for (const chunk of chunks) {
      result.set(chunk, pos);
      pos += chunk.length;
    }
    return result;
  }

  /**
   * Extract plain text from Word XML (<w:t> elements).
   */
  function parseWordXml(xml) {
    const texts = [];

    // Match paragraph breaks (<w:p> tags) and text runs (<w:t> tags)
    const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
    let paraMatcher;

    while ((paraMatcher = paraRegex.exec(xml)) !== null) {
      const paraXml   = paraMatcher[0];
      const textRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
      const paraTexts = [];
      let   textMatch;

      while ((textMatch = textRegex.exec(paraXml)) !== null) {
        if (textMatch[1]) paraTexts.push(textMatch[1]);
      }

      const line = paraTexts.join('').trim();
      if (line) texts.push(line);
    }

    // Fallback: if paragraph parsing found nothing, grab all <w:t> directly
    if (texts.length === 0) {
      const simpleRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
      let m;
      while ((m = simpleRegex.exec(xml)) !== null) {
        if (m[1].trim()) texts.push(m[1]);
      }
    }

    return texts.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  // ── Shared Helpers ─────────────────────────────────────────────────────

  function readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = (e) => resolve(e.target.result);
      reader.onerror = ()  => reject(new Error('Failed to read file as ArrayBuffer'));
      reader.readAsArrayBuffer(file);
    });
  }

  /**
   * Clean up extracted text: normalise whitespace, remove junk characters.
   */
  function cleanExtractedText(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/^\s+|\s+$/gm, '')
      .trim();
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Read any supported file type and return its plain text content.
   * @param {File} file
   * @returns {Promise<string>}
   */
  async function readFileAsText(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    switch (ext) {
      case 'txt':
        return readTxt(file);
      case 'pdf':
        return readPdf(file);
      case 'docx':
        return readDocx(file);
      default:
        // Unknown type — attempt text read
        return readTxt(file);
    }
  }

  return { readFileAsText };

})();
