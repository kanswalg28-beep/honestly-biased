/**
 * Centralized Editorial Text Sanitizer for Honestly Biased
 * Resolves possessive apostrophes, comma spacing without breaking numbers,
 * balances unclosed quotes, and fixes recurring LLM spelling/grammar glitches.
 */

function cleanEditorialText(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;

  // 1. Insert space after any comma not followed by space or digit
  // Matches "word,word" -> "word, word", while preserving "22,006" or "4,000"
  cleaned = cleaned.replace(/,([^\s\d])/g, ', $1');

  // 2. Fix recurring LLM spelling and grammar glitches
  cleaned = cleaned
    .replace(/\bunder\s+lying\b/gi, 'underlying')
    .replace(/\bfor\s+grounding\b/gi, 'foregrounding')
    .replace(/\btrademoff\b/gi, 'trade-off')
    .replace(/\bThe headline emphasize\s+/g, 'The headline emphasizes ')
    .replace(/\bthe headline emphasize\s+/g, 'the headline emphasizes ')
    .replace(/\bThe headline frame\s+/g, 'The headline frames ')
    .replace(/\bthe headline frame\s+/g, 'the headline frames ');

  // 3. Collapse multiple whitespace characters into a single space
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  // 4. Balance unpaired quotes at the end of headlines/sentences
  // Balance straight double quotes
  const doubleQuoteCount = (cleaned.match(/"/g) || []).length;
  if (doubleQuoteCount % 2 === 1) {
    cleaned += '"';
  }

  // Balance curly double quotes
  const openCurlyDouble = (cleaned.match(/“/g) || []).length;
  const closeCurlyDouble = (cleaned.match(/”/g) || []).length;
  if (openCurlyDouble > closeCurlyDouble) {
    cleaned += '”';
  }

  // Balance curly single quotes
  const openCurlySingle = (cleaned.match(/‘/g) || []).length;
  const closeCurlySingle = (cleaned.match(/’/g) || []).length;
  if (openCurlySingle > closeCurlySingle) {
    cleaned += '’';
  }

  // Balance standalone straight single quotes (ignoring contractions like it's, Starmer's, Modi's)
  // Contractions are letters followed by ' followed by letters (\b'\b or \w'\w)
  const nonContractionSingles = (cleaned.replace(/\b['’]\b/g, '').match(/'/g) || []).length;
  if (nonContractionSingles % 2 === 1) {
    cleaned += "'";
  }

  return cleaned;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cleanEditorialText };
}
