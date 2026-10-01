import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuoteStore } from './quoteStore.js';

test('PRD v3.0: quote store schema, line items, and dynamic sequence lifecycle', () => {
  const store = createQuoteStore(':memory:');

  // 1. Initial draft sequence
  const initialDraft = store.getCurrentDraftSequenceId();
  assert.match(initialDraft, /^QP\d{2}-0001$/);

  // 2. Record a quote with line items
  const quote1 = store.recordQuote({
    draftSequenceId: initialDraft,
    businessUnit: 'Maverick Powder Coating',
    customer: { company: 'ABC Metal Works', email: 'john@abcmetalworks.com' },
    parts: [
      {
        partNumber: '117-0018-001',
        partName: 'Main Bracket',
        revision: 'C00',
        workType: 'Cerakote',
        totalSurfaceAreaSqIn: 228.96,
        quantity: 6,
      },
    ],
    pdfHash: 'hash-abc-123',
    sourceFile: '117_0018_001_C.pdf',
    formPayload: { customField: 'test' },
    status: 'EXTRACTED',
  });

  assert.equal(quote1.draftSequenceId, initialDraft);
  assert.equal(quote1.duplicate, false);

  // 3. Duplicate detection on identical PDF hash
  const dupCheck = store.findDuplicateQuote('hash-abc-123');
  assert.ok(dupCheck);
  assert.equal(dupCheck.draftSequenceId, initialDraft);
  assert.equal(dupCheck.customerName, 'ABC Metal Works');
  assert.equal(dupCheck.lineItems.length, 1);
  assert.equal(dupCheck.lineItems[0].part_number, '117-0018-001');

  // 4. Mode A Terminal Action: Odoo Sync transition
  store.updateQuoteStatus(quote1.id, {
    status: 'SYNCED',
    odooSequenceId: 'S00042',
  });

  const syncedQuote = store.getQuoteById(quote1.id);
  assert.equal(syncedQuote.status, 'SYNCED');
  assert.equal(syncedQuote.odooSequenceId, 'S00042');

  // 5. Search capability across dual sources: sequence, part number, hash, BU
  const searchByOdoo = store.searchQuotes({ query: 'S00042' });
  assert.equal(searchByOdoo.length, 1);

  const searchByPart = store.searchQuotes({ query: '117-0018' });
  assert.equal(searchByPart.length, 1);

  const searchByBU = store.searchQuotes({ businessUnit: 'Maverick Powder Coating' });
  assert.equal(searchByBU.length, 1);

  // 6. Advance counter on new quote creation
  const nextSeq = store.advanceSequenceCounter();
  assert.match(nextSeq, /^QP\d{2}-0002$/);
});
