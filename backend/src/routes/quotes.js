import { Router } from 'express';
import { defaultQuoteStore, hashPayload } from '../lib/quoteStore.js';

const router = Router();

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
      warning: `Warning: This PDF document has already been processed under Quote #${duplicate.quoteNumber}. Do you want to update the existing quote as a new revision or create a separate new quote?`,
    });
  } catch (error) {
    console.error('[POST /api/quotes/duplicate-check] failed:', error);
    return res.status(500).json({ error: 'DUPLICATE_CHECK_FAILED', message: 'Duplicate check failed.' });
  }
});

router.post('/quotes/save', (req, res) => {
  try {
    const { quoteNumber, customer, parts, pdfHash, sourceFile, payload } = req.body ?? {};
    const result = defaultQuoteStore.recordQuote({
      quoteNumber,
      customer,
      parts,
      pdfHash,
      sourceFile,
      payload,
    });

    return res.json({
      success: true,
      ...result,
      quoteNumber: result.quoteNumber,
      quoteId: result.quoteId,
    });
  } catch (error) {
    console.error('[POST /api/quotes/save] failed:', error);
    return res.status(500).json({ error: 'QUOTE_SAVE_FAILED', message: 'Could not save the quote history.' });
  }
});

router.get('/quotes/history', (_req, res) => {
  try {
    return res.json({ quotes: defaultQuoteStore.getHistory() });
  } catch (error) {
    console.error('[GET /api/quotes/history] failed:', error);
    return res.status(500).json({ error: 'QUOTE_HISTORY_FAILED', message: 'Could not load quote history.' });
  }
});

router.get('/quotes/search', (req, res) => {
  try {
    const query = String(req.query?.q ?? '').trim();
    return res.json({ quotes: defaultQuoteStore.searchQuotes(query) });
  } catch (error) {
    console.error('[GET /api/quotes/search] failed:', error);
    return res.status(500).json({ error: 'QUOTE_SEARCH_FAILED', message: 'Could not search the quote history.' });
  }
});

router.get('/quotes/:quoteId/revisions', (req, res) => {
  try {
    const { quoteId } = req.params;
    return res.json({ quoteId, revisions: defaultQuoteStore.getRevisions(quoteId) });
  } catch (error) {
    console.error('[GET /api/quotes/:quoteId/revisions] failed:', error);
    return res.status(500).json({ error: 'QUOTE_REVISION_FAILED', message: 'Could not load quote revisions.' });
  }
});

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
