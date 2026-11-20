const { cleanEditorialText } = require('../db/cleanEditorialText');
const { classifyCategory } = require('../db/classifyCategory');
const assert = require('assert');

console.log('🧪 Running unit checks on cleanEditorialText() and classifyCategory()...');

// 1. Missing comma spacing vs numbers
const test1 = cleanEditorialText("Keir Starmer decision,Mel Stride Out, Andrew Griffith In,Tories Respond");
assert.strictEqual(
  test1,
  "Keir Starmer decision, Mel Stride Out, Andrew Griffith In, Tories Respond",
  "Comma spacing should be added between words"
);

// 2. Numbers with commas should NOT have spaces inserted
const test2 = cleanEditorialText("₹22,006 Crore and 4,000 Missing in disaster");
assert.strictEqual(
  test2,
  "₹22,006 Crore and 4,000 Missing in disaster",
  "Commas within numbers must not have spaces inserted"
);

// 3. Mixed numbers and clauses
const test3 = cleanEditorialText("939 Dead, Nearly 4,000 Missing,Rescue Efforts Continue");
assert.strictEqual(
  test3,
  "939 Dead, Nearly 4,000 Missing, Rescue Efforts Continue",
  "4,000 stays intact while Missing, Rescue gets space"
);

// 4. Unclosed quotes
const test4 = cleanEditorialText("Congress Says 'Please Check the Fine Print");
assert.strictEqual(
  test4,
  "Congress Says 'Please Check the Fine Print'",
  "Unclosed single quote must be balanced"
);

// 5. Preserving apostrophes in contractions / possessives
const test5 = cleanEditorialText("Keir Starmer's decision on Modi's diplomatic role in Nepal's Toughest Rescue Mission");
assert.strictEqual(
  test5,
  "Keir Starmer's decision on Modi's diplomatic role in Nepal's Toughest Rescue Mission",
  "Possessive apostrophes must remain completely intact"
);

// 6. LLM spelling glitches & compound restoration
const test6 = cleanEditorialText("The headline emphasize the under lying trademoff and for grounding corporate spin");
assert.strictEqual(
  test6,
  "The headline emphasizes the underlying trade-off and foregrounding corporate spin",
  "LLM glitches must be corrected"
);

// 7. Space before exclamation and question marks
const test7 = cleanEditorialText("Massive Disclosure On National Security ! Is it real ?");
assert.strictEqual(
  test7,
  "Massive Disclosure On National Security! Is it real?",
  "Space before ! and ? must be removed"
);

// 8. Verdict prefix removal without destructive index slicing
const test8 = cleanEditorialText("Verdict: Institutional spin masks underlying liability");
assert.strictEqual(
  test8,
  "Institutional spin masks underlying liability",
  "Leading Verdict prefix must be stripped via regex"
);

// 9. Fix legacy clipped leading 'T' ("he story..." -> "The story...")
const test9 = cleanEditorialText("he story frames procedural delays as routine oversight");
assert.strictEqual(
  test9,
  "The story frames procedural delays as routine oversight",
  "Accidentally clipped leading character must be repaired"
);

// 10. Hyphens, apostrophes, and trailing s characters must NEVER be stripped
const test10 = cleanEditorialText("high-stakes assessment of workers' rights and companies' filings");
assert.strictEqual(
  test10,
  "high-stakes assessment of workers' rights and companies' filings",
  "Hyphens, apostrophes and trailing s must remain completely intact"
);

// 11. Split words: "Road block" -> "Roadblock", "along side" -> "alongside", etc.
const test11 = cleanEditorialText("The Road block and Paper work caused a Flash point during Half Term with in the along side under scores");
assert.strictEqual(
  test11,
  "The Roadblock and Paperwork caused a Flashpoint during Half-Term within the alongside underscores",
  "Split words must be properly merged or hyphenated"
);

// 12. Comma-hyphens: "UK,Iranian" -> "UK-Iranian", "Indo, Pacific" -> "Indo-Pacific", "Jaishankar, Paparo" -> "Jaishankar–Paparo"
const test12 = cleanEditorialText("The UK,Iranian standoff in Indo, Pacific after Jaishankar, Paparo talks !");
assert.strictEqual(
  test12,
  "The UK-Iranian standoff in Indo-Pacific after Jaishankar–Paparo talks!",
  "Comma-hyphens must be converted to proper hyphens/en-dashes"
);

// 13. Restoring stripped possessives and verb agreement
const test13 = cleanEditorialText("Germany Secret Keeper and Jeffrey Archer death as Poll prediction take a hit");
assert.strictEqual(
  test13,
  "Germany's Secret Keeper and Jeffrey Archer's death as Poll predictions take a hit",
  "Stripped possessives and verb agreements must be restored"
);

// 14. Specific verification strings from user prompt:
// "Francis Halzen's Nobel-winning work"
const test14 = cleanEditorialText("Francis Halzen's Nobel-winning work");
assert.strictEqual(
  test14,
  "Francis Halzen's Nobel-winning work",
  "Francis Halzen's Nobel-winning work must remain uncorrupted"
);

// "Archer's death"
const test15 = cleanEditorialText("Archer's death");
assert.strictEqual(
  test15,
  "Archer's death",
  "Archer's death must remain uncorrupted"
);

// "pre-election polling"
const test16 = cleanEditorialText("pre election polling reflects voter hesitation");
assert.strictEqual(
  test16,
  "pre-election polling reflects voter hesitation",
  "Compound pre-election and verb reflects must be properly preserved"
);

console.log('✅ ALL cleanEditorialText() UNIT CHECKS PASSED PERFECTLY!');

// Category classifier drift checks
console.log('🧪 Running unit checks on classifyCategory()...');

// Glastonbury entertainment event should be Entertainment, NOT Politics
const cat1 = classifyCategory('Politics', 'Glastonbury 2026 tickets sell out in 35 minutes', 'Oasis and Taylor Swift rumored for headline concert slot');
assert.strictEqual(cat1, 'Entertainment', 'Glastonbury festival tickets must classify as Entertainment, not Politics');

// Transit / train disruption should be World & Civic, NOT Politics
const cat2 = classifyCategory('Politics', 'Major railway signal failure at Caversham tunnel causes severe transit delay', 'Commuters face four-hour delays across the western rail network');
assert.strictEqual(cat2, 'World & Civic', 'Railway and transit delays must classify as World & Civic, not Politics');

// Pure tech announcements should be Tech, NOT Politics
const cat3 = classifyCategory('Politics', 'OpenAI unveils GPT-5 artificial intelligence model', 'The new neural network microchip architecture delivers breakthrough reasoning in software');
assert.strictEqual(cat3, 'Tech', 'OpenAI/AI announcement must classify as Tech, not Politics');

// Wall Street stock earnings should be Finance, NOT Politics
const cat4 = classifyCategory('Politics', 'Wall Street stocks rally as Sensex and Nasdaq hit record highs', 'Federal Reserve signals potential interest rate cuts after quarterly corporate earnings report');
assert.strictEqual(cat4, 'Finance', 'Stock market and earnings report must classify as Finance, not Politics');

// Court / FIR / arrest should be Crime & Law, NOT Entertainment
const cat5 = classifyCategory('Entertainment', 'Supreme Court issues arrest warrant in high-profile extortion probe', 'Police custody extended after CBI chargesheet filed');
assert.strictEqual(cat5, 'Crime & Law', 'Court and arrest warrants must classify as Crime & Law, never Entertainment');

console.log('✅ ALL classifyCategory() UNIT CHECKS PASSED PERFECTLY!\n');
