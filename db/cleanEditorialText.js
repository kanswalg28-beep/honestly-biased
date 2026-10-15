/**
 * Centralized Editorial Text Sanitizer for Honestly Biased
 * Resolves possessive apostrophes, comma spacing without breaking numbers,
 * balances unclosed quotes, and fixes recurring LLM spelling/grammar glitches.
 */

function cleanEditorialText(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;

  // 1. Remove space before exclamation marks and question marks in titles/text (" !" -> "!", " ?" -> "?")
  cleaned = cleaned.replace(/\s+([!?])/g, '$1');

  // 2. Remove any accidental leading verdict label prefix using regex rather than index slicing
  cleaned = cleaned.replace(/^(?:Verdict|AI Narrative Bias Audit|Bias Audit):\s*/i, '');

  // 3. Fix legacy index-slicing clipping where "The story..." was sliced to "he story..."
  if (/^he\s+(?:story|narrative|framing|headline|piece|report|claim|audit|article)\b/i.test(cleaned)) {
    cleaned = 'T' + cleaned;
  }

  // 3b. Fix comma-hyphens and bilateral pairings (BEFORE generic comma-space insertion)
  cleaned = cleaned
    .replace(/\bUK\s*,\s*Iranian\b/gi, 'UK-Iranian')
    .replace(/\bIndo\s*,\s*Pacific\b/gi, 'Indo-Pacific')
    .replace(/\bJaishankar\s*,\s*Paparo\b/gi, 'Jaishankar–Paparo');

  // 4. Insert space after any comma not followed by space or digit
  // Matches "word,word" -> "word, word", while strictly preserving numbers "22,006" or "4,000"
  cleaned = cleaned.replace(/,([^\s\d])/g, ', $1');

  // 5. Fix split words and recurring LLM spelling/grammar glitches (non-destructive)
  cleaned = cleaned
    .replace(/\bRoad\s+block\b/gi, 'Roadblock')
    .replace(/\bPaper\s+work\b/gi, 'Paperwork')
    .replace(/\bFlash\s+point\b/gi, 'Flashpoint')
    .replace(/\bHalf\s+Term\b/gi, 'Half-Term')
    .replace(/\bMid\s+Air\b/gi, 'Mid-Air')
    .replace(/\bwith\s+in\b/gi, 'within')
    .replace(/\balong\s+side\b/gi, 'alongside')
    .replace(/\bunder\s+scores\b/gi, 'underscores')
    .replace(/\bunder\s+lying\b/gi, 'underlying')
    .replace(/\bfor\s+grounding\b/gi, 'foregrounding')
    .replace(/\btrademoff\b/gi, 'trade-off')
    .replace(/\bGermany\s+Secret\s+Keeper\b/gi, "Germany's Secret Keeper")
    .replace(/\bJeffrey\s+Archer\s+death\b/gi, "Jeffrey Archer's death")
    .replace(/\bBrazil\s+presidential\b/gi, "Brazil's presidential")
    .replace(/\bFrancis\s+Halzen\s+Nobel\b/gi, "Francis Halzen's Nobel")
    .replace(/\bcountry\s+security\s+establishment\b/gi, "country's security establishment")
    .replace(/\bCandidate\s+raise\s+questions\b/gi, "Candidate raises questions")
    .replace(/\bHis\s+legacy\s+include\b/gi, "His legacy includes")
    .replace(/\bPoll\s+prediction\s+take\s+a\s+hit\b/gi, "Poll predictions take a hit")
    .replace(/\bThe headline emphasize\s+/g, 'The headline emphasizes ')
    .replace(/\bthe headline emphasize\s+/g, 'the headline emphasizes ')
    .replace(/\bThe headline frame\s+/g, 'The headline frames ')
    .replace(/\bthe headline frame\s+/g, 'the headline frames ');

  // 6. Collapse multiple whitespace characters into a single space
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').trim();

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
