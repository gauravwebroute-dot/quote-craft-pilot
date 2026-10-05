// Run: cd backend && node scripts/verify-supabase-store.mjs
// Needs SUPABASE_URL and SUPABASE_KEY (env or backend/.env). Uses throwaway
// "ZZ Verify" business units, deletes everything it creates, and restores the
// sequence counter, so it is safe to run against the real project.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createQuoteStore } from '../src/lib/quoteStoreSupabase.js';

const store = createQuoteStore();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, { auth: { persistSession: false } });
const yy = new Date().getFullYear().toString().slice(-2);
const rnd = Math.floor(Math.random() * 9000) + 1000;
const hash = `verify-${Date.now()}`;
const A = 'ZZ Verify A';
const B = 'ZZ Verify B';
const customer = { company: 'ZZ Verify Customer', email: 'verify@example.com' };
const parts = [{ partNumber: 'ZZ-001', partName: 'Verify part', quantity: 2, totalSurfaceAreaSqIn: 10 }];

const { data: counterBefore } = await sb.from('quote_counters').select('*').eq('year', yy).maybeSingle();
const created = [];
let step = 0;
const ok = (msg) => console.log(`  PASS ${++step}. ${msg}`);

try {
  const a1 = await store.recordQuote({ draftSequenceId: `QP${yy}-${rnd}`, businessUnit: A, customer, parts, pdfHash: hash });
  created.push(a1.id);
  assert.equal(a1.duplicate, false);
  ok('new quote stored in company A');

  const a2 = await store.recordQuote({ draftSequenceId: `QP${yy}-${rnd + 1}`, businessUnit: A, customer, parts, pdfHash: hash });
  assert.equal(a2.duplicate, true);
  assert.equal(a2.id, a1.id);
  assert.equal(a2.revision.revisionLabel, 'v2');
  ok('same PDF + same company -> duplicate, revision v2 (no new quote)');

  assert.equal(await store.findDuplicateQuote(hash, B), null);
  ok('same PDF in company B -> NOT a duplicate');

  const b1 = await store.recordQuote({ draftSequenceId: `QP${yy}-${rnd + 2}`, businessUnit: B, customer, parts, pdfHash: hash });
  created.push(b1.id);
  assert.equal(b1.duplicate, false);
  ok('same PDF stored as its own quote in company B');

  assert.equal(await store.deleteQuote(a1.id, B), false);
  assert.ok(await store.getQuoteById(a1.id));
  ok('deleting A\'s quote while scoped to B deletes nothing');

  await store.updateQuoteStatus(b1.id, { status: 'SYNCED', odooSequenceId: `S9${rnd}` });
  const found = await store.searchQuotes({ query: `S9${rnd}` });
  assert.equal(found.length, 1);
  assert.equal(found[0].id, b1.id);
  ok('search finds a quote by its Odoo order number');

  assert.equal(await store.deleteQuote(a1.id, A), true);
  assert.ok(await store.getQuoteById(b1.id), 'company B quote must survive');
  ok('deleting company A\'s quote leaves company B\'s untouched');

  console.log('\nALL CHECKS PASSED');
} finally {
  for (const id of created) await sb.from('quotes').delete().eq('id', id);
  if (counterBefore) await sb.from('quote_counters').upsert(counterBefore);
  else await sb.from('quote_counters').delete().eq('year', yy);
}
