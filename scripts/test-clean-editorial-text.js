const { cleanEditorialText } = require('../db/cleanEditorialText');
const assert = require('assert');

console.log('🧪 Running unit checks on cleanEditorialText()...');

// 1. Missing comma spacing vs numbers
const test1 = cleanEditorialText("Keir Starmer decision,Mel Stride Out, Andrew Griffith In,Tories Respond");
console.log('Test 1 output:', test1);
assert.strictEqual(
  test1,
  "Keir Starmer decision, Mel Stride Out, Andrew Griffith In, Tories Respond",
  "Comma spacing should be added between words"
);

// 2. Numbers with commas should NOT have spaces inserted
const test2 = cleanEditorialText("₹22,006 Crore and 4,000 Missing in disaster");
console.log('Test 2 output:', test2);
assert.strictEqual(
  test2,
  "₹22,006 Crore and 4,000 Missing in disaster",
  "Commas within numbers must not have spaces inserted"
);

// 3. Mixed numbers and clauses
const test3 = cleanEditorialText("939 Dead, Nearly 4,000 Missing,Rescue Efforts Continue");
console.log('Test 3 output:', test3);
assert.strictEqual(
  test3,
  "939 Dead, Nearly 4,000 Missing, Rescue Efforts Continue",
  "4,000 stays intact while Missing, Rescue gets space"
);

// 4. Unclosed quotes
const test4 = cleanEditorialText("Congress Says 'Please Check the Fine Print");
console.log('Test 4 output:', test4);
assert.strictEqual(
  test4,
  "Congress Says 'Please Check the Fine Print'",
  "Unclosed single quote must be balanced"
);

// 5. Preserving apostrophes in contractions / possessives
const test5 = cleanEditorialText("Keir Starmer's decision on Modi's diplomatic role in Nepal's Toughest Rescue Mission");
console.log('Test 5 output:', test5);
assert.strictEqual(
  test5,
  "Keir Starmer's decision on Modi's diplomatic role in Nepal's Toughest Rescue Mission",
  "Possessive apostrophes must remain completely intact"
);

// 6. LLM spelling glitches
const test6 = cleanEditorialText("The headline emphasize the under lying trademoff and for grounding corporate spin");
console.log('Test 6 output:', test6);
assert.strictEqual(
  test6,
  "The headline emphasizes the underlying trade-off and foregrounding corporate spin",
  "LLM glitches must be corrected"
);
// 7. Space before exclamation and question marks
const test7 = cleanEditorialText("Massive Disclosure On National Security ! Is it real ?");
console.log('Test 7 output:', test7);
assert.strictEqual(
  test7,
  "Massive Disclosure On National Security! Is it real?",
  "Space before ! and ? must be removed"
);

// 8. Verdict prefix removal without destructive index slicing
const test8 = cleanEditorialText("Verdict: Institutional spin masks underlying liability");
console.log('Test 8 output:', test8);
assert.strictEqual(
  test8,
  "Institutional spin masks underlying liability",
  "Leading Verdict prefix must be stripped via regex"
);

// 9. Fix legacy clipped leading 'T' ("he story..." -> "The story...")
const test9 = cleanEditorialText("he story frames procedural delays as routine oversight");
console.log('Test 9 output:', test9);
assert.strictEqual(
  test9,
  "The story frames procedural delays as routine oversight",
  "Accidentally clipped leading character must be repaired"
);

// 10. Hyphens, apostrophes, and trailing s characters must NEVER be stripped
const test10 = cleanEditorialText("high-stakes assessment of workers' rights and companies' filings");
console.log('Test 10 output:', test10);
assert.strictEqual(
  test10,
  "high-stakes assessment of workers' rights and companies' filings",
  "Hyphens, apostrophes and trailing s must remain completely intact"
);

// 11. Split words: "Road block" -> "Roadblock", "along side" -> "alongside", etc.
const test11 = cleanEditorialText("The Road block and Paper work caused a Flash point during Half Term with in the along side under scores");
console.log('Test 11 output:', test11);
assert.strictEqual(
  test11,
  "The Roadblock and Paperwork caused a Flashpoint during Half-Term within the alongside underscores",
  "Split words must be properly merged or hyphenated"
);

// 12. Comma-hyphens: "UK,Iranian" -> "UK-Iranian", "Indo, Pacific" -> "Indo-Pacific", "Jaishankar, Paparo" -> "Jaishankar–Paparo"
const test12 = cleanEditorialText("The UK,Iranian standoff in Indo, Pacific after Jaishankar, Paparo talks !");
console.log('Test 12 output:', test12);
assert.strictEqual(
  test12,
  "The UK-Iranian standoff in Indo-Pacific after Jaishankar–Paparo talks!",
  "Comma-hyphens must be converted to proper hyphens/en-dashes"
);

// 13. Restoring stripped possessives and verb agreement
const test13 = cleanEditorialText("Germany Secret Keeper and Jeffrey Archer death as Poll prediction take a hit");
console.log('Test 13 output:', test13);
assert.strictEqual(
  test13,
  "Germany's Secret Keeper and Jeffrey Archer's death as Poll predictions take a hit",
  "Stripped possessives and verb agreements must be restored"
);

console.log('✅ ALL cleanEditorialText() UNIT CHECKS PASSED PERFECTLY!\n');
