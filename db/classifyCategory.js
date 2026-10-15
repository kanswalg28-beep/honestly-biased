/**
 * Category Classifier & Taxonomy Normalizer for Honestly Biased
 * Supported Taxonomy:
 * ['Politics', 'Tech', 'Finance', 'Crime & Law', 'World & Civic', 'Health', 'Entertainment']
 */

const VALID_CATEGORIES = [
  'Politics',
  'Tech',
  'Finance',
  'Crime & Law',
  'World & Civic',
  'Health',
  'Entertainment'
];

const CRIME_LAW_KEYWORDS = [
  'murder', 'probe', 'encounter', 'stabbing', 'stabbed', 'shooting', 'shot dead',
  'police', 'arrested', 'arrest', 'custody', 'fir', 'court', 'judge', 'supreme court',
  'high court', 'cbi', 'ed raid', 'chargesheet', 'sentenced', 'extortion', 'kidnapping',
  'robbery', 'bail', 'crime', 'criminal', 'lynching', 'jailed', 'lynched', 'gangster',
  'hit-and-run', 'convicted', 'homicide', 'terrorist', 'detained', 'interrogation'
];

const WORLD_CIVIC_KEYWORDS = [
  'traffic', 'caversham', 'road chaos', 'jam', 'tunnel', 'railway', 'train crash',
  'train collision', 'derail', 'rail delay', 'metro', 'bus crash', 'flight delay',
  'highway', 'expressway', 'bridge collapse', 'municipal', 'civic', 'flood',
  'waterlogging', 'monsoon', 'cyclone', 'earthquake', 'landslide', 'pollution',
  'smog', 'air quality', 'aqi', 'water cut', 'water supply', 'pothole', 'drainage',
  'power cut', 'blackout', 'wildfire', 'evacuation', 'disaster'
];

const HEALTH_LEGIT_KEYWORDS = [
  'medicine', 'medical', 'hospital', 'doctor', 'physician', 'disease', 'virus',
  'infection', 'vaccine', 'vaccination', 'covid', 'dengue', 'malaria', 'cancer',
  'mental health', 'therapy', 'pharma', 'pharmaceutical', 'fda', 'icmr', 'who',
  'surgery', 'patient', 'clinical trial', 'nutrition', 'dietary', 'outbreak',
  'epidemic', 'pandemic', 'healthcare'
];

const ACCIDENT_CASUALTY_KEYWORDS = [
  'crash', 'crashed', 'accident', 'collision', 'tunnel', 'stabbing', 'stabbed',
  'derail', 'derailment', 'landslide', 'avalanche', 'flood', 'disaster', 'explosion',
  'blast', 'hit-and-run', 'war casualties', 'casualty', 'casualties'
];

/**
 * Normalizes or re-classifies an article's category based on strict editorial constraints.
 */
function classifyCategory(rawCategory, headline = '', summary = '', content = '') {
  const combined = `${headline} ${summary} ${content}`.toLowerCase();
  const currentCat = (rawCategory || '').trim();

  // 1. Strict Negative Constraint: NEVER classify police, murders, FIRs, court as Entertainment
  const hasCrimeLaw = CRIME_LAW_KEYWORDS.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(combined));
  if (hasCrimeLaw && currentCat.toLowerCase() === 'entertainment') {
    return 'Crime & Law';
  }

  // 2. Strict Negative Constraint: NEVER classify traffic, rail delays, civic issues as Entertainment
  const hasWorldCivic = WORLD_CIVIC_KEYWORDS.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(combined));
  if (hasWorldCivic && currentCat.toLowerCase() === 'entertainment') {
    return 'World & Civic';
  }

  // 3. Strict Negative Constraint: Do not dump fatal accidents, violent stabbings, war casualties,
  // or natural disasters into Health merely because words like "dies", "lives", or "dead" appear.
  if (currentCat.toLowerCase() === 'health') {
    const hasAccidentOrDisaster = ACCIDENT_CASUALTY_KEYWORDS.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(combined));
    if (hasCrimeLaw) {
      return 'Crime & Law';
    }
    if (hasAccidentOrDisaster || hasWorldCivic) {
      return 'World & Civic';
    }
  }

  // If unclassified or generally labeled, check for Crime & Law or World & Civic
  if (!currentCat || currentCat.toLowerCase() === 'general') {
    if (hasCrimeLaw) return 'Crime & Law';
    if (hasWorldCivic) return 'World & Civic';
  }

  // Match existing category to valid taxonomy
  for (const valid of VALID_CATEGORIES) {
    if (valid.toLowerCase() === currentCat.toLowerCase()) {
      return valid;
    }
  }

  // Category normalization mappings
  const map = {
    'general': 'Politics',
    'technology': 'Tech',
    'business': 'Finance',
    'crime': 'Crime & Law',
    'law': 'Crime & Law',
    'civic': 'World & Civic',
    'world': 'World & Civic'
  };

  if (map[currentCat.toLowerCase()]) {
    return map[currentCat.toLowerCase()];
  }

  return 'Politics'; // default fallback
}

module.exports = {
  VALID_CATEGORIES,
  classifyCategory,
  CRIME_LAW_KEYWORDS,
  WORLD_CIVIC_KEYWORDS,
  HEALTH_LEGIT_KEYWORDS
};
