const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { cleanEditorialText } = require('../db/cleanEditorialText');
const { classifyCategory } = require('../db/classifyCategory');

describe('Editorial Text Cleaning & Ingestion Normalizer', () => {
  it('adds missing comma spacing between words while preserving numbers', () => {
    assert.equal(
      cleanEditorialText("Keir Starmer decision,Mel Stride Out, Andrew Griffith In,Tories Respond"),
      "Keir Starmer decision, Mel Stride Out, Andrew Griffith In, Tories Respond"
    );
    assert.equal(
      cleanEditorialText("₹22,006 Crore and 4,000 Missing in disaster"),
      "₹22,006 Crore and 4,000 Missing in disaster"
    );
    assert.equal(
      cleanEditorialText("939 Dead, Nearly 4,000 Missing,Rescue Efforts Continue"),
      "939 Dead, Nearly 4,000 Missing, Rescue Efforts Continue"
    );
  });

  it('balances unclosed quotes', () => {
    assert.equal(
      cleanEditorialText("Congress Says 'Please Check the Fine Print"),
      "Congress Says 'Please Check the Fine Print'"
    );
  });

  it('preserves contractions and possessives', () => {
    assert.equal(
      cleanEditorialText("Keir Starmer's decision on Modi's diplomatic role in Nepal's Toughest Rescue Mission"),
      "Keir Starmer's decision on Modi's diplomatic role in Nepal's Toughest Rescue Mission"
    );
    assert.equal(
      cleanEditorialText("high-stakes assessment of workers' rights and companies' filings"),
      "high-stakes assessment of workers' rights and companies' filings"
    );
  });

  it('restores corrupted words, compound hyphens and subject-verb agreements', () => {
    assert.equal(
      cleanEditorialText("The headline emphasize the under lying trademoff and for grounding corporate spin"),
      "The headline emphasizes the underlying trade-off and foregrounding corporate spin"
    );
    assert.equal(
      cleanEditorialText("Massive Disclosure On National Security ! Is it real ?"),
      "Massive Disclosure On National Security! Is it real?"
    );
    assert.equal(
      cleanEditorialText("Verdict: Institutional spin masks underlying liability"),
      "Institutional spin masks underlying liability"
    );
    assert.equal(
      cleanEditorialText("he story frames procedural delays as routine oversight"),
      "The story frames procedural delays as routine oversight"
    );
    assert.equal(
      cleanEditorialText("The Road block and Paper work caused a Flash point during Half Term with in the along side under scores"),
      "The Roadblock and Paperwork caused a Flashpoint during Half-Term within the alongside underscores"
    );
    assert.equal(
      cleanEditorialText("The UK,Iranian standoff in Indo, Pacific after Jaishankar, Paparo talks !"),
      "The UK-Iranian standoff in Indo-Pacific after Jaishankar–Paparo talks!"
    );
    assert.equal(
      cleanEditorialText("In Germany Secret Keeper and Brazil presidential race"),
      "In Germany's Secret Keeper and Brazil's presidential race"
    );
  });
});

describe('Category Classifier Drift Prevention', () => {
  it('correctly reclassifies Entertainment mislabeled as Politics', () => {
    const cat = classifyCategory(
      'Politics',
      'Glastonbury 2026 tickets sell out in 35 minutes',
      'Oasis and Taylor Swift rumored for headline concert slot'
    );
    assert.equal(cat, 'Entertainment');
  });

  it('correctly reclassifies Transit/Civic mislabeled as Politics', () => {
    const cat = classifyCategory(
      'Politics',
      'Major railway signal failure at Caversham tunnel causes severe transit delay',
      'Commuters face four-hour delays across the western rail network'
    );
    assert.equal(cat, 'World & Civic');
  });

  it('correctly reclassifies Technology mislabeled as Politics', () => {
    const cat = classifyCategory(
      'Politics',
      'OpenAI unveils GPT-5 artificial intelligence model',
      'The new neural network microchip architecture delivers breakthrough reasoning in software'
    );
    assert.equal(cat, 'Tech');
  });

  it('correctly reclassifies Finance mislabeled as Politics', () => {
    const cat = classifyCategory(
      'Politics',
      'Wall Street stocks rally as Sensex and Nasdaq hit record highs',
      'Federal Reserve signals potential interest rate cuts after quarterly corporate earnings report'
    );
    assert.equal(cat, 'Finance');
  });

  it('correctly reclassifies Court / FIR / Arrest out of Entertainment', () => {
    const cat = classifyCategory(
      'Entertainment',
      'Supreme Court issues arrest warrant in high-profile extortion probe',
      'Police custody extended after CBI chargesheet filed'
    );
    assert.equal(cat, 'Crime & Law');
  });

  it('correctly classifies Sports', () => {
    const cat = classifyCategory(
      'Politics',
      'Arsenal claims victory in Premier League championship showdown',
      'A stunning stoppage-time goal secured top standing in the tournament.'
    );
    assert.equal(cat, 'Sports');
  });
});
