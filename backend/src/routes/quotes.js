import { Router } from 'express';
import { defaultQuoteStore, hashPayload } from '../lib/quoteStore.js';
import { searchLiveOdooQuotes, getLiveOdooQuoteDetails } from '../services/odooCrossCheck.js';

const router = Router();

// GET current active draft sequence ID (e.g. "QP26-0001")
router.get('/quotes/current-sequence', async (_req, res) => {
  try {
    const draftSequenceId = await defaultQuoteStore.getCurrentDraftSequenceId();
    return res.json({ draftSequenceId });
  } catch (error) {
    console.error('[GET /api/quotes/current-sequence] failed:', error);
    return res.status(500).json({ error: 'SEQUENCE_FETCH_FAILED', message: 'Could not fetch current draft sequence.' });
  }
});

// POST advance sequence counter (e.g. when user clicks "New Quote" after a terminal action)
router.post('/quotes/next-sequence', async (_req, res) => {
  try {
    const draftSequenceId = await defaultQuoteStore.advanceSequenceCounter();
    return res.json({ draftSequenceId });
  } catch (error) {
    console.error('[POST /api/quotes/next-sequence] failed:', error);
    return res.status(500).json({ error: 'SEQUENCE_INCREMENT_FAILED', message: 'Could not advance sequence counter.' });
  }
});

// Duplicate PDF / Drawing Check (REQ-003, REQ-004)
router.post('/quotes/duplicate-check', async (req, res) => {
  try {
    const { pdfHash, sourceFile, customer, parts, businessUnit } = req.body ?? {};
    const hash = pdfHash || hashPayload({ customer, parts, sourceFile });
    // Same PDF only counts as a duplicate within the same company / business unit.
    const duplicate = await defaultQuoteStore.findDuplicateQuote(hash, businessUnit || null);

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
router.post('/quotes/save', async (req, res) => {
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

    const result = await defaultQuoteStore.recordQuote({
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
router.post('/quotes/terminal-action', async (req, res) => {
  try {
    const {
      quoteId,
      draftSequenceId,
      action,
      odooSequenceId,
      customer,
      parts,
      formPayload,
      businessUnit = 'OC Custom Coating',
    } = req.body ?? {};
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

    const existing = await defaultQuoteStore.getQuoteById(identifier);
    if (!existing && (customer || parts || formPayload)) {
      await defaultQuoteStore.recordQuote({
        draftSequenceId,
        odooSequenceId: odooSequenceId || null,
        businessUnit,
        customer,
        parts,
        formPayload,
        status,
        forceNewQuote: true,
      });
    } else {
      await defaultQuoteStore.updateQuoteStatus(identifier, {
        status,
        odooSequenceId: odooSequenceId || null,
      });
    }

    // Advance sequence counter for the next new quote (REQ-002, Section 2.1)
    const nextDraftSequenceId = await defaultQuoteStore.advanceSequenceCounter();

    return res.json({
      success: true,
      status,
      odooSequenceId: odooSequenceId || null,
      nextDraftSequenceId,
      message: `Quote status updated to ${status}. Next draft sequence is ${nextDraftSequenceId}.`,
    });
  } catch (error) {
    console.error('[POST /api/quotes/terminal-action] failed:', error);
    return res.status(500).json({ error: 'TERMINAL_ACTION_FAILED', message: 'Could not record terminal action.' });
  }
});

// Quote History (REQ-009)
router.get('/quotes/history', async (_req, res) => {
  try {
    return res.json({ quotes: await defaultQuoteStore.getHistory() });
  } catch (error) {
    console.error('[GET /api/quotes/history] failed:', error);
    return res.status(500).json({ error: 'QUOTE_HISTORY_FAILED', message: 'Could not load quote history.' });
  }
});

// Dual-Source Search Engine (Local SQLite + Live Odoo ERP) (REQ-009)
router.get('/quotes/search', async (req, res) => {
  try {
    const query = String(req.query?.q ?? '').trim();
    const businessUnit = String(req.query?.businessUnit ?? '').trim();
    const status = String(req.query?.status ?? '').trim();
    const startDate = String(req.query?.startDate ?? '').trim();
    const endDate = String(req.query?.endDate ?? '').trim();

    // Source 1: Local store (Supabase or SQLite)
    const localQuotes = await defaultQuoteStore.searchQuotes({
      query,
      businessUnit,
      status,
      startDate,
      endDate,
    });

    // Source 2: Live Odoo ERP
    let odooQuotes = [];
    try {
      odooQuotes = await searchLiveOdooQuotes({
        query,
        businessUnit,
        status,
        startDate,
        endDate,
      });
    } catch (odooSearchErr) {
      console.warn('Odoo live search fallback:', odooSearchErr.message);
    }

    // Merge and deduplicate dual sources
    const mergedMap = new Map();

    // Add local records first
    for (const q of localQuotes) {
      mergedMap.set(q.odooSequenceId || q.draftSequenceId, q);
    }

    // Add Odoo records if not already present or augment with live data
    for (const o of odooQuotes) {
      const key = o.odooSequenceId || o.draftSequenceId;
      if (!mergedMap.has(key)) {
        mergedMap.set(key, o);
      } else {
        const existing = mergedMap.get(key);
        if (!existing.odooSequenceId) {
          existing.odooSequenceId = o.odooSequenceId;
        }
      }
    }

    const quotes = Array.from(mergedMap.values()).sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );

    return res.json({ quotes });
  } catch (error) {
    console.error('[GET /api/quotes/search] failed:', error);
    return res.status(500).json({ error: 'QUOTE_SEARCH_FAILED', message: 'Could not search the quote history.' });
  }
});

// Get Single Quote by ID, Draft Sequence ID, or Odoo Sequence ID (For State Rehydration)
router.get('/quotes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let quote = await defaultQuoteStore.getQuoteById(id);

    // If not found in SQLite or is an Odoo ID, search live Odoo
    if (!quote) {
      quote = await getLiveOdooQuoteDetails(id);
    }

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
router.delete('/quotes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const businessUnit = String(req.query?.businessUnit ?? '').trim() || null;
    const deleted = await defaultQuoteStore.deleteQuote(id, businessUnit);
    return res.json({ success: deleted });
  } catch (error) {
    console.error('[DELETE /api/quotes/:id] failed:', error);
    return res.status(500).json({ error: 'QUOTE_DELETE_FAILED', message: 'Could not delete quote.' });
  }
});

// Get Quote Revisions
router.get('/quotes/:quoteId/revisions', async (req, res) => {
  try {
    const { quoteId } = req.params;
    return res.json({ quoteId, revisions: await defaultQuoteStore.getRevisions(quoteId) });
  } catch (error) {
    console.error('[GET /api/quotes/:quoteId/revisions] failed:', error);
    return res.status(500).json({ error: 'QUOTE_REVISION_FAILED', message: 'Could not load quote revisions.' });
  }
});

// CSV/Excel Export (REQ-002, Mode B)
router.post('/quotes/export', async (req, res) => {
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
