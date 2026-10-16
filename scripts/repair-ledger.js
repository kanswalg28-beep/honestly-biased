// scripts/repair-ledger.js — Batch repair existing dispatches in Supabase
// Audits possessive apostrophes, subject-verb agreements, compound hyphens, and categories.
//
// Usage:
//   Dry run:  node scripts/repair-ledger.js --dry-run
//   Live run: node scripts/repair-ledger.js

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const LLM_API_KEY = OPENAI_API_KEY || GEMINI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required Supabase env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)');
  process.exit(1);
}

if (!LLM_API_KEY) {
  console.error('Missing LLM API key: Please set OPENAI_API_KEY or GEMINI_API_KEY in your environment or .env file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const COLUMNS = 'id, slug, category, aiheadline, aisummary, biasaudit';
const BATCH_SIZE = 10;
const DRY_RUN = process.argv.includes('--dry-run');

const SYSTEM_PROMPT = `You are the Senior Copy Editor for Honestly Biased. You will receive a JSON array of article audit records. Fix grammatical and classification pipeline errors while strictly preserving the original tone, length, and meaning: 
1. Restore missing possessive apostrophes ('s or s') (e.g., "Kabir arrest" -> "Kabir's arrest", "boxer first" -> "boxer's first", "Passengers Half-Term" -> "Passengers' Half-Term"). 
2. Fix subject-verb agreement in headlines, summaries, and verdicts (e.g., "The headline use" -> "The headline uses", "The story highlight" -> "The story highlights", "Candidate Raise" -> "Candidate Raises"). 
3. Fix singular/plural mismatches after numbers or plural contexts (e.g., "42 minute" -> "42 minutes", "Glastonbury Ticket" -> "Glastonbury Tickets", "polling expectation" -> "polling expectations"). 
4. Restore hyphens in compound modifiers that were split by spaces (e.g., "pre emptive" -> "pre-emptive", "non partisan" -> "non-partisan", "feel good" -> "feel-good", "best selling" -> "best-selling", "sell out" -> "sell-out"). 
5. Verify "category" is the most accurate match from ONLY: ["POLITICS", "TECH", "FINANCE", "CRIME & LAW", "WORLD & CIVIC", "HEALTH", "SPORTS", "ENTERTAINMENT"]. 
- Music festivals/concerts/celebrities -> "ENTERTAINMENT" 
- Rail closures/public infrastructure/civic disruption -> "WORLD & CIVIC" 
- Arrests/warrants/court petitions (non-electoral) -> "CRIME & LAW" 
Return ONLY a valid JSON object with a "records" key containing the corrected array with identical "id" values.`;

async function repairBatchOpenAI(batchInput) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(batchInput) },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const parsed = JSON.parse(data.choices[0].message.content);
  return parsed.records || [];
}

async function repairBatchGemini(batchInput) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${SYSTEM_PROMPT}\n\nInput Records:\n${JSON.stringify(batchInput)}` }]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return [];
  const parsed = JSON.parse(text);
  return parsed.records || (Array.isArray(parsed) ? parsed : []);
}

async function repairBatch(rows) {
  const batchInput = rows.map(r => ({
    id: r.id,
    category: r.category || 'POLITICS',
    headline: r.aiheadline || '',
    summary: r.aisummary || '',
    verdict: r.biasaudit || ''
  }));

  if (OPENAI_API_KEY) {
    return await repairBatchOpenAI(batchInput);
  } else {
    return await repairBatchGemini(batchInput);
  }
}

async function updateSiteContentHighlights() {
  console.log('\n--- Checking site_content for cached highlights ---');
  try {
    const { data: row, error } = await supabase
      .from('site_content')
      .select('value')
      .eq('key', 'highlights')
      .maybeSingle();

    if (error || !row || !Array.isArray(row.value)) {
      console.log('No static highlights array found in site_content.');
      return;
    }

    console.log(`Found ${row.value.length} static highlights in site_content.`);
  } catch (err) {
    console.warn('Could not inspect site_content:', err.message);
  }
}

async function run() {
  console.log(`\n=============================================================`);
  console.log(`📡 Honestly Biased Ledger Repair (${DRY_RUN ? 'DRY RUN' : 'LIVE WRITE'})`);
  console.log(`LLM Provider: ${OPENAI_API_KEY ? 'OpenAI (gpt-4o-mini)' : 'Google Gemini'}`);
  console.log(`Batch Size: ${BATCH_SIZE}`);
  console.log(`=============================================================\n`);

  let offset = 0;
  let totalUpdated = 0;
  let totalProcessed = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from('articles')
      .select(COLUMNS)
      .eq('archived', false)
      .order('publishdate', { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;
    if (!rows || rows.length === 0) break;

    totalProcessed += rows.length;
    console.log(`Processing batch ${Math.floor(offset / BATCH_SIZE) + 1} (records ${offset + 1} to ${offset + rows.length})...`);

    const repairedRows = await repairBatch(rows);

    for (const fixed of repairedRows) {
      const original = rows.find((r) => String(r.id) === String(fixed.id));
      if (!original) continue;

      const origHeadline = (original.aiheadline || '').trim();
      const fixedHeadline = (fixed.headline || '').trim();
      const origSummary = (original.aisummary || '').trim();
      const fixedSummary = (fixed.summary || '').trim();
      const origVerdict = (original.biasaudit || '').trim();
      const fixedVerdict = (fixed.verdict || '').trim();
      const origCategory = (original.category || '').trim().toUpperCase();
      const fixedCategory = (fixed.category || '').trim().toUpperCase();

      const changed =
        origHeadline !== fixedHeadline ||
        origSummary !== fixedSummary ||
        origVerdict !== fixedVerdict ||
        origCategory !== fixedCategory;

      if (changed) {
        console.log(`\n[UPDATE] Slug: ${original.slug || original.id}`);
        if (origCategory !== fixedCategory) {
          console.log(`  Category: ${origCategory} -> ${fixedCategory}`);
        }
        if (origHeadline !== fixedHeadline) {
          console.log(`  Headline: "${origHeadline}"\n         -> "${fixedHeadline}"`);
        }
        if (origSummary !== fixedSummary) {
          console.log(`  Summary:  "${origSummary.slice(0, 80)}..."\n         -> "${fixedSummary.slice(0, 80)}..."`);
        }
        if (origVerdict !== fixedVerdict) {
          console.log(`  Verdict:  "${origVerdict.slice(0, 80)}..."\n         -> "${fixedVerdict.slice(0, 80)}..."`);
        }

        if (!DRY_RUN) {
          const { error: updateErr } = await supabase
            .from('articles')
            .update({
              category: fixed.category,
              aiheadline: fixed.headline,
              title: fixed.headline,
              aisummary: fixed.summary,
              biasaudit: fixed.verdict,
            })
            .eq('id', fixed.id);

          if (updateErr) {
            console.error(`  Failed updating ${fixed.id}:`, updateErr.message);
          } else {
            totalUpdated++;
          }
        } else {
          totalUpdated++;
        }
      }
    }

    offset += BATCH_SIZE;
  }

  await updateSiteContentHighlights();

  console.log(`\n=============================================================`);
  console.log(`Completed repair scan.`);
  console.log(`Total records processed: ${totalProcessed}`);
  console.log(`Total records ${DRY_RUN ? 'flagged for update' : 'successfully updated'}: ${totalUpdated}`);
  console.log(`=============================================================\n`);
}

run().catch((err) => {
  console.error('Fatal error in repair-ledger:', err);
  process.exit(1);
});
