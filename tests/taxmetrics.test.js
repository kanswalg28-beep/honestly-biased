const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const TaxData = require('../taxmetrics/js/tax-data.js');
const TaxEngine = require('../taxmetrics/js/tax-engine.js');

const engine = new TaxEngine(TaxData);

describe('TaxMetrics Calculation Engine', () => {
  it('1. FICA combined rate calculation and 7.65% display precision on sub-wage-cap salaries', () => {
    const gross = 100000;
    const res = engine.calculate(gross, 'single', 'TX', 'none', { retirement: 0, health: 0 }, '2026');
    assert.equal(res.socialSecurityTax, 6200);
    assert.equal(res.medicareTax, 1450);
    assert.equal(res.totalFica, 7650);

    const ficaPct = (res.totalFica / gross) * 100;
    assert.ok(Math.abs(ficaPct - 7.65) < 1e-9);
    const digits = (Math.round(ficaPct * 100) % 10 !== 0) ? 2 : 1;
    assert.equal(ficaPct.toFixed(digits), '7.65');
  });

  it('2. Additional Medicare tax threshold for Single ($200k threshold, 0.9% on excess)', () => {
    // Under threshold: $200k
    const resAtCap = engine.calculate(200000, 'single', 'TX', 'none', { retirement: 0, health: 0 }, '2026');
    assert.equal(resAtCap.medicareTax, 200000 * 0.0145);

    // Over threshold: $250k (excess $50,000 taxed at +0.9%)
    const resOver = engine.calculate(250000, 'single', 'TX', 'none', { retirement: 0, health: 0 }, '2026');
    const expectedBaseMed = 250000 * 0.0145;
    const expectedAddMed = 50000 * 0.009; // 450
    assert.equal(resOver.medicareTax, expectedBaseMed + expectedAddMed);
  });

  it('3. Additional Medicare tax threshold for MFJ ($250k threshold, 0.9% on excess)', () => {
    // Under threshold: $250k
    const resAtCap = engine.calculate(250000, 'married', 'TX', 'none', { retirement: 0, health: 0 }, '2026');
    assert.equal(resAtCap.medicareTax, 250000 * 0.0145);

    // Over threshold: $300k (excess $50,000 taxed at +0.9%)
    const resOver = engine.calculate(300000, 'married', 'TX', 'none', { retirement: 0, health: 0 }, '2026');
    const expectedBaseMed = 300000 * 0.0145;
    const expectedAddMed = 50000 * 0.009; // 450
    assert.equal(resOver.medicareTax, expectedBaseMed + expectedAddMed);
  });

  it('4. Additional Medicare tax threshold for MFS ($125k threshold, 0.9% on excess)', () => {
    // At threshold: $125k
    const resAtCap = engine.calculate(125000, 'mfs', 'TX', 'none', { retirement: 0, health: 0 }, '2026');
    assert.equal(resAtCap.medicareTax, 125000 * 0.0145);

    // Over threshold: $175k (excess $50,000 taxed at +0.9%)
    const resOver = engine.calculate(175000, 'mfs', 'TX', 'none', { retirement: 0, health: 0 }, '2026');
    const expectedBaseMed = 175000 * 0.0145;
    const expectedAddMed = 50000 * 0.009; // 450
    assert.equal(resOver.medicareTax, expectedBaseMed + expectedAddMed);
  });

  it('5. Standard deduction for 2025 (Single $15,750, MFJ $31,500, HOH $23,625, MFS $15,750)', () => {
    const single = engine.calculate(50000, 'single', 'TX', 'none', { retirement: 0, health: 0 }, '2025');
    assert.equal(single.federalStandardDeduction, 15750);
    assert.equal(single.taxableFederalIncome, 50000 - 15750);

    const married = engine.calculate(50000, 'married', 'TX', 'none', { retirement: 0, health: 0 }, '2025');
    assert.equal(married.federalStandardDeduction, 31500);

    const hoh = engine.calculate(50000, 'hoh', 'TX', 'none', { retirement: 0, health: 0 }, '2025');
    assert.equal(hoh.federalStandardDeduction, 23625);

    const mfs = engine.calculate(50000, 'mfs', 'TX', 'none', { retirement: 0, health: 0 }, '2025');
    assert.equal(mfs.federalStandardDeduction, 15750);
  });

  it('6. Standard deduction for 2026 (Single $16,100, MFJ $32,200, HOH $24,150, MFS $16,100)', () => {
    const single = engine.calculate(50000, 'single', 'TX', 'none', { retirement: 0, health: 0 }, '2026');
    assert.equal(single.federalStandardDeduction, 16100);
    assert.equal(single.taxableFederalIncome, 50000 - 16100);

    const married = engine.calculate(50000, 'married', 'TX', 'none', { retirement: 0, health: 0 }, '2026');
    assert.equal(married.federalStandardDeduction, 32200);

    const hoh = engine.calculate(50000, 'hoh', 'TX', 'none', { retirement: 0, health: 0 }, '2026');
    assert.equal(hoh.federalStandardDeduction, 24150);

    const mfs = engine.calculate(50000, 'mfs', 'TX', 'none', { retirement: 0, health: 0 }, '2026');
    assert.equal(mfs.federalStandardDeduction, 16100);
  });

  it('7. Standard deduction for 2027 (Single $16,600, MFJ $33,200, HOH $24,925, MFS $16,600)', () => {
    const single = engine.calculate(50000, 'single', 'TX', 'none', { retirement: 0, health: 0 }, '2027');
    assert.equal(single.federalStandardDeduction, 16600);
    assert.equal(single.taxableFederalIncome, 50000 - 16600);

    const married = engine.calculate(50000, 'married', 'TX', 'none', { retirement: 0, health: 0 }, '2027');
    assert.equal(married.federalStandardDeduction, 33200);

    const hoh = engine.calculate(50000, 'hoh', 'TX', 'none', { retirement: 0, health: 0 }, '2027');
    assert.equal(hoh.federalStandardDeduction, 24925);

    const mfs = engine.calculate(50000, 'mfs', 'TX', 'none', { retirement: 0, health: 0 }, '2027');
    assert.equal(mfs.federalStandardDeduction, 16600);
  });

  it('8. Social Security wage base cutoff for 2026 ($184,500 cap)', () => {
    const res184k = engine.calculate(184500, 'single', 'TX', 'none', { retirement: 0, health: 0 }, '2026');
    const maxSS2026 = 184500 * 0.062;
    assert.equal(res184k.socialSecurityTax, maxSS2026);

    const res300k = engine.calculate(300000, 'single', 'TX', 'none', { retirement: 0, health: 0 }, '2026');
    assert.equal(res300k.socialSecurityTax, maxSS2026);
  });

  it('9. Social Security wage base cutoff for 2027 ($192,300 cap)', () => {
    const res192k = engine.calculate(192300, 'single', 'TX', 'none', { retirement: 0, health: 0 }, '2027');
    const maxSS2027 = 192300 * 0.062;
    assert.equal(res192k.socialSecurityTax, maxSS2027);

    const res300k = engine.calculate(300000, 'single', 'TX', 'none', { retirement: 0, health: 0 }, '2027');
    assert.equal(res300k.socialSecurityTax, maxSS2027);
  });

  it('10. Progressive federal bracket progression', () => {
    const res = engine.calculate(100000, 'single', 'TX', 'none', { retirement: 0, health: 0 }, '2026');
    // 2026 Single: Std ded 16,100 -> taxable: 83,900
    // Tier 1: 0 to 12,400 @ 10% = 1,240
    // Tier 2: 12,400 to 50,400 (38,000) @ 12% = 4,560
    // Tier 3: 50,400 to 83,900 (33,500) @ 22% = 7,370
    // Total Federal Tax = 1,240 + 4,560 + 7,370 = 13,170
    assert.equal(res.federalTax, 13170);
    assert.equal(res.marginalFederalRate, 0.22);
    assert.equal(res.bracketBreakdown[0].taxPaid, 1240);
    assert.equal(res.bracketBreakdown[1].taxPaid, 4560);
    assert.equal(res.bracketBreakdown[2].taxPaid, 7370);
  });

  it('11. Zero income tax state calculation (TX, FL, WA -> 0% state tax)', () => {
    ['TX', 'FL', 'WA', 'AK', 'NV', 'SD', 'TN', 'WY'].forEach(st => {
      const res = engine.calculate(150000, 'single', st, 'none', { retirement: 0, health: 0 }, '2026');
      assert.equal(res.stateTax, 0);
      assert.equal(res.marginalStateRate, 0);
    });
  });

  it('12. Flat tax state calculation (PA 3.07%, IL 4.95%)', () => {
    // PA: 3.07% flat with $0 standard deduction
    const resPA = engine.calculate(100000, 'single', 'PA', 'none', { retirement: 0, health: 0 }, '2026');
    assert.equal(resPA.stateTax, 100000 * 0.0307);
    assert.equal(resPA.marginalStateRate, 0.0307);

    // IL: 4.95% flat with $2,775 standard exemption
    const resIL = engine.calculate(100000, 'single', 'IL', 'none', { retirement: 0, health: 0 }, '2026');
    assert.equal(resIL.stateTax, (100000 - 2775) * 0.0495);
    assert.equal(resIL.marginalStateRate, 0.0495);
  });

  it('13. Local tax surcharge calculation (NYC progressive local tax)', () => {
    const resNYState = engine.calculate(100000, 'single', 'NY', 'none', { retirement: 0, health: 0 }, '2026');
    const resNYC = engine.calculate(100000, 'single', 'NY', 'NYC', { retirement: 0, health: 0 }, '2026');
    assert.equal(resNYState.localTax, 0);
    assert.ok(resNYC.localTax > 0);
    assert.ok(resNYC.totalTax > resNYState.totalTax);
  });
});
