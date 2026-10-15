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

console.log('✅ ALL cleanEditorialText() UNIT CHECKS PASSED PERFECTLY!\n');
