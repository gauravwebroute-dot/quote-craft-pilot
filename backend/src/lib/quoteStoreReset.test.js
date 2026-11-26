import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuoteStore } from './quoteStoreSqlite.js';

const OC = 'OC Custom Coating';
const MAD = 'MAD Custom-Coating';
const MAV = 'Maverick';

function seed(store) {
  // draftSequenceId omitted on purpose: the shared counter hands out 0001, 0002, ...
  const make = (businessUnit, name) =>
    store.recordQuote({ businessUnit, customer: { company: name }, parts: [{ partNumber: `P-${name}` }] });
  return [make(OC, 'a'), make(MAD, 'b'), make(MAV, 'c'), make(OC, 'd')];
}

const num = (id) => Number(String(id).split('-')[1]);

test('reset of one company keeps the other companies and continues after the highest number', () => {
  const store = createQuoteStore(':memory:');
  const quotes = seed(store);
  assert.deepEqual(quotes.map((q) => num(q.draftSequenceId)), [1, 2, 3, 4]);

  const res = store.resetCompanyQuotes(OC);
  assert.equal(res.deletedQuotes, 2);
  assert.equal(res.businessUnit, OC);

  const left = store.getHistory();
  assert.deepEqual(left.map((q) => q.businessUnit).sort(), [MAD, MAV].sort());
  // highest number still used is 0003 -> the next quote is 0004
  assert.equal(num(res.nextDraftSequenceId), 4);

  // children of the other companies are untouched
  for (const q of left) assert.equal(q.lineItemCount, 1);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS c FROM quote_line_items').get().c, 2);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS c FROM quote_revisions').get().c, 2);
});

test('numbering returns to 0001 only when no company has a quote left', () => {
  const store = createQuoteStore(':memory:');
  seed(store);
  store.resetCompanyQuotes(OC);
  store.resetCompanyQuotes(MAD);
  assert.equal(num(store.resetCompanyQuotes(MAV).nextDraftSequenceId), 1);
  assert.equal(store.getHistory().length, 0);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS c FROM quote_counters').get().c, 0);
});

test('reset of a company with no quotes changes nothing, and a missing company is rejected', () => {
  const store = createQuoteStore(':memory:');
  seed(store);
  const res = store.resetCompanyQuotes('Some Other Company');
  assert.equal(res.deletedQuotes, 0);
  assert.equal(store.getHistory().length, 4);
  assert.equal(num(res.nextDraftSequenceId), 5);
  assert.throws(() => store.resetCompanyQuotes(''), /businessUnit is required/);
  assert.throws(() => store.resetCompanyQuotes(undefined), /businessUnit is required/);
});

test('delete is scoped to one company', () => {
  const store = createQuoteStore(':memory:');
  const [oc] = seed(store);
  // wrong company: nothing is deleted
  assert.equal(store.deleteQuote(oc.draftSequenceId, MAD), false);
  assert.equal(store.getHistory().length, 4);
  // right company: exactly one quote is deleted
  assert.equal(store.deleteQuote(oc.draftSequenceId, OC), true);
  assert.equal(store.getHistory().length, 3);
});
