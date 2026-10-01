import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuoteStore } from './quoteStore.js';

test('quote store records a quote and detects duplicate hash', () => {
  const store = createQuoteStore(':memory:');
  const first = store.recordQuote({
    quoteNumber: 'QP26-0001',
    customer: { company: 'Acme' },
    parts: [{ partNumber: 'P-100', revision: 'A' }],
    pdfHash: 'abc123',
    sourceFile: 'drawing.pdf',
    payload: { note: 'first' },
  });

  assert.equal(first.quoteNumber, 'QP26-0001');
  assert.equal(store.findDuplicateQuote('abc123')?.quoteId, first.quoteId);
  assert.equal(store.getHistory().length, 1);
});
