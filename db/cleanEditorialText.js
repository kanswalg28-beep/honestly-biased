/**
 * Centralized Editorial Text Sanitizer for Honestly Biased
 * Resolves possessive apostrophes, comma spacing without breaking numbers,
 * balances unclosed quotes, and fixes recurring LLM spelling/grammar glitches.
 */

function cleanEditorialText(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;

  // 1. Remove space before exclamation marks, question marks, colons, or periods (" !" -> "!", " ?" -> "?")
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

  // 5. Restore compound modifiers and hyphens commonly split by LLMs
  cleaned = cleaned
    .replace(/\bpre\s+election\b/gi, 'pre-election')
    .replace(/\bhigh\s+profile\b/gi, 'high-profile')
    .replace(/\bhigh\s+level\b/gi, 'high-level')
    .replace(/\bscience\s+focused\b/gi, 'science-focused')
    .replace(/\bfact\s+driven\b/gi, 'fact-driven')
    .replace(/\bHalf\s+Term\b/g, 'Half-Term')
    .replace(/\bhalf\s+term\b/g, 'half-term')
    .replace(/\bMid\s+Air\b/g, 'Mid-Air')
    .replace(/\bmid\s+air\b/g, 'mid-air')
    .replace(/\bpre\s+emptive\b/gi, 'pre-emptive')
    .replace(/\bnon\s+partisan\b/gi, 'non-partisan')
    .replace(/\bbest\s+selling\b/gi, 'best-selling')
    .replace(/\bfeel\s+good\b/gi, 'feel-good')
    .replace(/\btrade\s+off\b/gi, 'trade-off')
    .replace(/\btrademoff\b/gi, 'trade-off')
    .replace(/\bhit\s+and\s+run\b/gi, 'hit-and-run')
    .replace(/\bRoad\s+block\b/g, 'Roadblock')
    .replace(/\broad\s+block\b/gi, 'roadblock')
    .replace(/\bPaper\s+work\b/g, 'Paperwork')
    .replace(/\bpaper\s+work\b/gi, 'paperwork')
    .replace(/\bFlash\s+point\b/g, 'Flashpoint')
    .replace(/\bflash\s+point\b/gi, 'flashpoint')
    .replace(/\bwith\s+in\b/gi, 'within')
    .replace(/\balong\s+side\b/gi, 'alongside')
    .replace(/\bunder\s+scores\b/gi, 'underscores')
    .replace(/\bunder\s+lying\b/gi, 'underlying')
    .replace(/\bfor\s+grounding\b/gi, 'foregrounding');

  // 6. Restore missing possessive apostrophes and fix subject-verb agreements
  cleaned = cleaned
    .replace(/\bGermany\s+Secret\s+Keeper\b/gi, "Germany's Secret Keeper")
    .replace(/\bJeffrey\s+Archer\s+death\b/gi, "Jeffrey Archer's death")
    .replace(/\bArcher\s+death\b/gi, "Archer's death")
    .replace(/\bBrazil\s+presidential\b/gi, "Brazil's presidential")
    .replace(/\bFrancis\s+Halzen\s+Nobel\b/gi, "Francis Halzen's Nobel")
    .replace(/\bcountry\s+security\s+establishment\b/gi, "country's security establishment")
    .replace(/\bCandidate\s+raise\s+questions\b/gi, "Candidate raises questions")
    .replace(/\bHis\s+legacy\s+include\b/gi, "His legacy includes")
    .replace(/\bPoll\s+prediction\s+take\s+a\s+hit\b/gi, "Poll predictions take a hit")
    .replace(/\bThe headline emphasize\b/g, 'The headline emphasizes')
    .replace(/\bthe headline emphasize\b/g, 'the headline emphasizes')
    .replace(/\bThe headline frame\b/g, 'The headline frames')
    .replace(/\bthe headline frame\b/g, 'the headline frames')
    .replace(/\bThe headline use\b/g, 'The headline uses')
    .replace(/\bthe headline use\b/g, 'the headline uses')
    .replace(/\bThe headline reflect\b/g, 'The headline reflects')
    .replace(/\bthe headline reflect\b/g, 'the headline reflects')
    .replace(/\bThe story highlight\b/g, 'The story highlights')
    .replace(/\bthe story highlight\b/g, 'the story highlights');

  // 7. Collapse multiple spaces into a single space
  cleaned = cleaned.replace(/[ \t]{2,}/g, ' ').trim();

  // 8. Balance unpaired quotes at the end of headlines/sentences
  // Straight double quotes
  const doubleQuoteCount = (cleaned.match(/"/g) || []).length;
  if (doubleQuoteCount % 2 === 1) {
    cleaned += '"';
  }

  // Curly double quotes
  const openCurlyDouble = (cleaned.match(/“/g) || []).length;
  const closeCurlyDouble = (cleaned.match(/”/g) || []).length;
  if (openCurlyDouble > closeCurlyDouble) {
    cleaned += '”';
  }

  // Curly single quotes (ignoring curly apostrophes in contractions & possessives)
  const openCurlySingle = (cleaned.match(/‘/g) || []).length;
  const closeCurlySingle = (cleaned.match(/’/g) || []).length;
  if (openCurlySingle > closeCurlySingle) {
    cleaned += '’';
  }

  // Standalone straight single quotes:
  // Must ignore:
  // - Contractions: word'word (it's, don't, Archer's)
  // - Plural possessives: words' (workers', companies', passengers')
  const nonContractionSingles = (cleaned
    .replace(/\b['’]\b/g, '') // strip word'word
    .replace(/\w+['’](\s|$)/g, '$1') // strip words' followed by space or end of string
    .match(/['’]/g) || []).length;
  if (nonContractionSingles % 2 === 1) {
    cleaned += "'";
  }

  return cleaned;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cleanEditorialText };
}
