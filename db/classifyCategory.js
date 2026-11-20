/**
 * Category Classifier & Taxonomy Normalizer for Honestly Biased
 * Supported Taxonomy:
 * ['Politics', 'Tech', 'Finance', 'Crime & Law', 'World & Civic', 'Health', 'Sports', 'Entertainment']
 */

const VALID_CATEGORIES = [
  'Politics',
  'Tech',
  'Finance',
  'Crime & Law',
  'World & Civic',
  'Health',
  'Sports',
  'Entertainment'
];

const CRIME_LAW_KEYWORDS = [
  'murder', 'probe', 'encounter', 'stabbing', 'stabbed', 'shooting', 'shot dead',
  'police', 'arrested', 'arrest', 'custody', 'fir', 'court', 'judge', 'supreme court',
  'high court', 'cbi', 'ed raid', 'chargesheet', 'sentenced', 'extortion', 'kidnapping',
  'robbery', 'bail', 'crime', 'criminal', 'lynching', 'jailed', 'lynched', 'gangster',
  'hit-and-run', 'convicted', 'homicide', 'terrorist', 'detained', 'interrogation',
  'warrant', 'lawsuit', 'petition', 'verdict', 'prosecution', 'indictment', 'plea'
];

const SPORTS_KEYWORDS = [
  'asian games', 'boxing', 'cricket', 'ipl', 'bcci', 'test match', 'odi', 't20',
  'olympics', 'boxer', 'football', 'fifa', 'premier league', 'badminton', 'tennis',
  'wimbledon', 'athlete', 'athletics', 'championship', 'world cup', 'wicket',
  'batsman', 'bowler', 'century', 'medal', 'gold medal', 'silver medal', 'bronze medal',
  'tournament', 'derby', 'striker', 'goalkeeper', 'formula 1', 'f1', 'grand prix',
  'kabaddi', 'chess', 'grandmaster', 'nba', 'uefa', 'champions league'
];

const ENTERTAINMENT_KEYWORDS = [
  'glastonbury', 'concert', 'festival', 'oasis', 'taylor swift', 'beyonce', 'ticketmaster',
  'tickets', 'album', 'hollywood', 'bollywood', 'box office', 'movie', 'film', 'cinema',
  'actor', 'actress', 'grammy', 'oscar', 'emmy', 'song', 'trailer', 'streaming', 'netflix',
  'disney+', 'spotify', 'theatre', 'broadway', 'celebrity', 'red carpet', 'comic-con',
  'pop star', 'tour dates', 'rock band', 'musician', 'singer', 'soundtrack', 'filmmaker'
];

const TECH_KEYWORDS = [
  'apple', 'google', 'microsoft', 'openai', 'chatgpt', 'nvidia', 'semiconductor', 'ai model',
  'artificial intelligence', 'smartphone', 'iphone', 'android', 'software', 'hardware',
  'cybersecurity', 'hacker', 'malware', 'quantum computing', 'cloud computing', 'gpu',
  'microchip', 'deep learning', 'algorithm', 'app store', 'silicon valley', 'metaverse',
  'robotics', 'llm', 'anthropic', 'claude', 'gemini', 'open source software'
];

const FINANCE_KEYWORDS = [
  'stock', 'stocks', 'wall street', 'sensex', 'nifty', 'nasdaq', 'dow jones', 'inflation',
  'interest rate', 'federal reserve', 'central bank', 'rbi', 'earnings', 'quarterly profit',
  'dividend', 'shareholders', 'gdp', 'treasury', 'yield', 'cryptocurrency', 'bitcoin',
  'ethereum', 'ipo', 'merger', 'acquisition', 'hedge fund', 'banking', 'imf', 'world bank',
  'forex', 'venture capital', 'fintech', 'revenue', 'fiscal deficit', 'bond yields'
];

const WORLD_CIVIC_KEYWORDS = [
  'traffic', 'caversham', 'road chaos', 'jam', 'tunnel', 'railway', 'train crash',
  'train collision', 'derail', 'rail delay', 'metro', 'bus crash', 'flight delay',
  'highway', 'expressway', 'bridge collapse', 'municipal', 'civic', 'flood',
  'waterlogging', 'monsoon', 'cyclone', 'earthquake', 'landslide', 'pollution',
  'smog', 'air quality', 'aqi', 'water cut', 'water supply', 'pothole', 'drainage',
  'power cut', 'blackout', 'wildfire', 'evacuation', 'disaster', 'transit', 'subway',
  'trains', 'commuters', 'infrastructure', 'public transport', 'strike'
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

const POLITICS_KEYWORDS = [
  'election', 'parliament', 'congress', 'bjp', 'senate', 'legislation', 'prime minister',
  'president', 'modi', 'biden', 'trump', 'starmer', 'sunak', 'cabinet', 'minister',
  'vote', 'voter', 'ballot', 'democrat', 'republican', 'tory', 'labour', 'diplomacy',
  'sanctions', 'treaty', 'ambassador', 'geopolitics', 'manifesto', 'opposition', 'bill passed'
];

function scoreKeywords(text, keywords) {
  let score = 0;
  for (const kw of keywords) {
    const rx = new RegExp(`\\b${kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
    const matches = text.match(rx);
    if (matches) score += matches.length;
  }
  return score;
}

/**
 * Normalizes or re-classifies an article's category based on strict editorial constraints.
 */
function classifyCategory(rawCategory, headline = '', summary = '', content = '') {
  const combined = `${headline} ${summary} ${content}`.toLowerCase();
  const currentCat = (rawCategory || '').trim();

  // 1. Strict Negative Constraint: NEVER classify police, murders, FIRs, court as Entertainment
  const crimeScore = scoreKeywords(combined, CRIME_LAW_KEYWORDS);
  if (crimeScore > 0 && currentCat.toLowerCase() === 'entertainment') {
    return 'Crime & Law';
  }

  // 2. Strict Negative Constraint: Reclassify sports out of Entertainment/General/Politics
  const sportsScore = scoreKeywords(combined, SPORTS_KEYWORDS);
  if (sportsScore > 0 && (['entertainment', 'general', 'politics'].includes(currentCat.toLowerCase()) || !currentCat)) {
    const polScore = scoreKeywords(combined, POLITICS_KEYWORDS);
    if (sportsScore > polScore) {
      return 'Sports';
    }
  }

  // 3. Strict Negative Constraint: NEVER classify traffic, rail delays, civic issues as Entertainment
  const civicScore = scoreKeywords(combined, WORLD_CIVIC_KEYWORDS);
  if (civicScore > 0 && currentCat.toLowerCase() === 'entertainment') {
    return 'World & Civic';
  }

  // 4. Strict Negative Constraint: Do not dump fatal accidents, violent stabbings, war casualties,
  // or natural disasters into Health merely because words like "dies", "lives", or "dead" appear.
  if (currentCat.toLowerCase() === 'health') {
    const hasAccidentOrDisaster = ACCIDENT_CASUALTY_KEYWORDS.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(combined));
    if (crimeScore > 0) return 'Crime & Law';
    if (hasAccidentOrDisaster || civicScore > 0) return 'World & Civic';
  }

  // 5. Audit & reclassify mislabeled "Politics" stories that are clearly Entertainment, Tech, Finance, or Civic
  const entScore = scoreKeywords(combined, ENTERTAINMENT_KEYWORDS);
  const techScore = scoreKeywords(combined, TECH_KEYWORDS);
  const finScore = scoreKeywords(combined, FINANCE_KEYWORDS);
  const healthScore = scoreKeywords(combined, HEALTH_LEGIT_KEYWORDS);
  const polScore = scoreKeywords(combined, POLITICS_KEYWORDS);

  // If currently labeled Politics (or General / unclassified), check if another domain is significantly stronger
  const isGenericOrPolitics = !currentCat || ['general', 'politics', 'news', 'editorial'].includes(currentCat.toLowerCase());

  if (isGenericOrPolitics) {
    if (entScore >= 2 && entScore > polScore) return 'Entertainment';
    if (civicScore >= 2 && civicScore > polScore) return 'World & Civic';
    if (techScore >= 2 && techScore > polScore) return 'Tech';
    if (finScore >= 2 && finScore > polScore) return 'Finance';
    if (crimeScore >= 2 && crimeScore > polScore) return 'Crime & Law';
    if (healthScore >= 2 && healthScore > polScore) return 'Health';
    if (sportsScore >= 2 && sportsScore > polScore) return 'Sports';
  }

  // Match existing category to valid taxonomy if it was already valid
  for (const valid of VALID_CATEGORIES) {
    if (valid.toLowerCase() === currentCat.toLowerCase()) {
      return valid;
    }
  }

  // Category normalization mappings
  const map = {
    'general': polScore > 0 ? 'Politics' : 'World & Civic',
    'technology': 'Tech',
    'business': 'Finance',
    'crime': 'Crime & Law',
    'law': 'Crime & Law',
    'civic': 'World & Civic',
    'world': 'World & Civic',
    'sport': 'Sports',
    'sports': 'Sports',
    'entertainment': 'Entertainment',
    'health': 'Health',
    'politics': 'Politics'
  };

  if (map[currentCat.toLowerCase()]) {
    return map[currentCat.toLowerCase()];
  }

  // Fallback: pick the highest scoring domain, or World & Civic
  const scores = [
    { cat: 'Politics', score: polScore },
    { cat: 'Tech', score: techScore },
    { cat: 'Finance', score: finScore },
    { cat: 'Crime & Law', score: crimeScore },
    { cat: 'World & Civic', score: civicScore },
    { cat: 'Entertainment', score: entScore },
    { cat: 'Sports', score: sportsScore },
    { cat: 'Health', score: healthScore }
  ];
  scores.sort((a, b) => b.score - a.score);

  if (scores[0].score > 0) {
    return scores[0].cat;
  }

  return 'World & Civic'; // Safer default than blindly dumping into Politics
}

module.exports = {
  VALID_CATEGORIES,
  classifyCategory,
  CRIME_LAW_KEYWORDS,
  SPORTS_KEYWORDS,
  ENTERTAINMENT_KEYWORDS,
  TECH_KEYWORDS,
  FINANCE_KEYWORDS,
  WORLD_CIVIC_KEYWORDS,
  HEALTH_LEGIT_KEYWORDS,
  POLITICS_KEYWORDS
};
