import { Router } from 'express';
import { defaultQuoteStore, hashPayload } from '../lib/quoteStore.js';

const router = Router();

// GET current active draft sequence ID (e.g. "QP26-0001")
router.get('/quotes/current-sequence', (_req, res) => {
  try {
    const draftSequenceId = defaultQuoteStore.getCurrentDraftSequenceId();
    return res.json({ draftSequenceId });
  } catch (error) {
    console.error('[GET /api/quotes/current-sequence] failed:', error);
    return res.status(500).json({ error: 'SEQUENCE_FETCH_FAILED', message: 'Could not fetch current draft sequence.' });
  }
});

// POST advance sequence counter (e.g. when user clicks "New Quote" after a terminal action)
router.post('/quotes/next-sequence', (_req, res) => {
  try {
    const draftSequenceId = defaultQuoteStore.advanceSequenceCounter();
    return res.json({ draftSequenceId });
  } catch (error) {
    console.error('[POST /api/quotes/next-sequence] failed:', error);
    return res.status(500).json({ error: 'SEQUENCE_INCREMENT_FAILED', message: 'Could not advance sequence counter.' });
  }
});

// Duplicate PDF / Drawing Check (REQ-003, REQ-004)
router.post('/quotes/duplicate-check', (req, res) => {
  try {
    const { pdfHash, sourceFile, customer, parts } = req.body ?? {};
    const hash = pdfHash || hashPayload({ customer, parts, sourceFile });
    const duplicate = defaultQuoteStore.findDuplicateQuote(hash);

    if (!duplicate) {
      return res.json({ duplicate: false, quote: null, warning: null });
    }

    return res.json({
      duplicate: true,
      quote: duplicate,
      quoteNumber: duplicate.draftSequenceId,
      customerName: duplicate.customerName,
      warning: `This PDF document has already been processed under Quote #${duplicate.draftSequenceId} (Customer: ${duplicate.customerName}).`,
    });
  } catch (error) {
    console.error('[POST /api/quotes/duplicate-check] failed:', error);
    return res.status(500).json({ error: 'DUPLICATE_CHECK_FAILED', message: 'Duplicate check failed.' });
  }
});

// Save or Update Quote (REQ-001, REQ-002)
router.post('/quotes/save', (req, res) => {
  try {
    const {
      draftSequenceId,
      quoteNumber,
      odooSequenceId,
      businessUnit = 'OC Custom Coating',
      customer,
      parts,
      pdfHash,
      sourceFile,
      payload,
      formPayload,
      status = 'DRAFT',
      forceNewQuote = false,
    } = req.body ?? {};

    const result = defaultQuoteStore.recordQuote({
      draftSequenceId: draftSequenceId || quoteNumber,
      odooSequenceId,
      businessUnit,
      customer,
      parts,
      pdfHash,
      sourceFile,
      formPayload: formPayload || payload,
      status,
      forceNewQuote,
    });

    return res.json({
      success: true,
      ...result,
      quoteNumber: result.draftSequenceId,
      quoteId: result.id,
    });
  } catch (error) {
    console.error('[POST /api/quotes/save] failed:', error);
    return res.status(500).json({ error: 'QUOTE_SAVE_FAILED', message: 'Could not save the quote history.' });
  }
});

// Terminal Action Handler: Mode A (Odoo Sync) or Mode B (Excel Export) (REQ-002)
router.post('/quotes/terminal-action', (req, res) => {
  try {
    const { quoteId, draftSequenceId, action, odooSequenceId } = req.body ?? {};
    const identifier = quoteId || draftSequenceId;
    if (!identifier) {
      return res.status(400).json({ error: 'MISSING_IDENTIFIER', message: 'quoteId or draftSequenceId required.' });
    }

    let status = 'DRAFT';
    if (action === 'ODOO_SYNC') {
      status = 'SYNCED';
    } else if (action === 'EXCEL_EXPORT') {
      status = 'EXCEL_EXPORTED';
    } else if (action === 'CROSS_CHECK') {
      status = 'CROSS_CHECKED';
    }

    defaultQuoteStore.updateQuoteStatus(identifier, {
      status,
      odooSequenceId: odooSequenceId || null,
    });

    return res.json({
      success: true,
      status,
      odooSequenceId: odooSequenceId || null,
      message: `Quote status updated to ${status}.`,
    });
  } catch (error) {
    console.error('[POST /api/quotes/terminal-action] failed:', error);
    return res.status(500).json({ error: 'TERMINAL_ACTION_FAILED', message: 'Could not record terminal action.' });
  }
});

// Quote History (REQ-009)
router.get('/quotes/history', (_req, res) => {
  try {
    return res.json({ quotes: defaultQuoteStore.getHistory() });
  } catch (error) {
    console.error('[GET /api/quotes/history] failed:', error);
    return res.status(500).json({ error: 'QUOTE_HISTORY_FAILED', message: 'Could not load quote history.' });
  }
});

// Dual-Source Search Engine (REQ-009)
router.get('/quotes/search', (req, res) => {
  try {
    const query = String(req.query?.q ?? '').trim();
    const businessUnit = String(req.query?.businessUnit ?? '').trim();
    const status = String(req.query?.status ?? '').trim();
    const startDate = String(req.query?.startDate ?? '').trim();
    const endDate = String(req.query?.endDate ?? '').trim();

    const quotes = defaultQuoteStore.searchQuotes({
      query,
      businessUnit,
      status,
      startDate,
      endDate,
    });

    return res.json({ quotes });
  } catch (error) {
    console.error('[GET /api/quotes/search] failed:', error);
    return res.status(500).json({ error: 'QUOTE_SEARCH_FAILED', message: 'Could not search the quote history.' });
  }
});

// Get Single Quote by ID or Draft Sequence ID (For State Rehydration)
router.get('/quotes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const quote = defaultQuoteStore.getQuoteById(id);
    if (!quote) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Quote not found.' });
    }
    return res.json({ quote });
  } catch (error) {
    console.error('[GET /api/quotes/:id] failed:', error);
    return res.status(500).json({ error: 'QUOTE_FETCH_FAILED', message: 'Could not load quote details.' });
  }
});

// Delete Quote
router.delete('/quotes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const deleted = defaultQuoteStore.deleteQuote(id);
    return res.json({ success: deleted });
  } catch (error) {
    console.error('[DELETE /api/quotes/:id] failed:', error);
    return res.status(500).json({ error: 'QUOTE_DELETE_FAILED', message: 'Could not delete quote.' });
  }
});

// Get Quote Revisions
router.get('/quotes/:quoteId/revisions', (req, res) => {
  try {
    const { quoteId } = req.params;
    return res.json({ quoteId, revisions: defaultQuoteStore.getRevisions(quoteId) });
  } catch (error) {
    console.error('[GET /api/quotes/:quoteId/revisions] failed:', error);
    return res.status(500).json({ error: 'QUOTE_REVISION_FAILED', message: 'Could not load quote revisions.' });
  }
});

// CSV/Excel Export (REQ-002, Mode B)
router.post('/quotes/export', (req, res) => {
  try {
    const { quoteNumber, customer, parts } = req.body ?? {};
    const csv = defaultQuoteStore.buildCsv({ quoteNumber, customer, parts });
    const safeName = String(quoteNumber || 'quote').replace(/[^a-zA-Z0-9_-]+/g, '_');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_odoo_import.csv"`);
    return res.send(csv);
  } catch (error) {
    console.error('[POST /api/quotes/export] failed:', error);
    return res.status(500).json({ error: 'QUOTE_EXPORT_FAILED', message: 'Could not generate the Excel export.' });
  }
});

export default router;
