import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = fileURLToPath(new URL('../../data/quotepilot.sqlite', import.meta.url));

export function createQuoteStore(dbPath = DEFAULT_DB_PATH) {
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS quote_counters (
      scope TEXT PRIMARY KEY,
      sequence INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quotes (
      quote_id TEXT PRIMARY KEY,
      quote_number TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      customer_json TEXT,
      parts_json TEXT,
      pdf_hash TEXT,
      source_file TEXT,
      payload_json TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS quote_revisions (
      revision_id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL,
      revision_label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      FOREIGN KEY (quote_id) REFERENCES quotes (quote_id)
    );

    CREATE TABLE IF NOT EXISTS quote_hashes (
      pdf_hash TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL,
      quote_number TEXT NOT NULL,
      created_at TEXT NOT NULL,
      source_file TEXT,
      FOREIGN KEY (quote_id) REFERENCES quotes (quote_id)
    );
  `);

  function nextQuoteSequence() {
    const row = db.prepare('SELECT sequence FROM quote_counters WHERE scope = ?').get('quote');
    const nextSequence = row ? Number(row.sequence) + 1 : 1;
    if (row) {
      db.prepare('UPDATE quote_counters SET sequence = ? WHERE scope = ?').run(nextSequence, 'quote');
    } else {
      db.prepare('INSERT INTO quote_counters (scope, sequence) VALUES (?, ?)').run('quote', nextSequence);
    }
    return nextSequence;
  }

  function issueQuoteNumber() {
    const year = new Date().getFullYear().toString().slice(-2);
    const sequence = nextQuoteSequence();
    return `QP${year}-${String(sequence).padStart(4, '0')}`;
  }

  function normalizePayload(payload) {
    if (!payload) return null;
    try {
      return typeof payload === 'string' ? JSON.parse(payload) : payload;
    } catch {
      return payload;
    }
  }

  function findDuplicateQuoteByHash(pdfHash) {
    if (!pdfHash) return null;
    const row = db
      .prepare(`
        SELECT q.quote_id, q.quote_number, q.created_at, q.customer_json, q.parts_json, q.source_file, q.payload_json
        FROM quote_hashes h
        JOIN quotes q ON q.quote_id = h.quote_id
        WHERE h.pdf_hash = ?
        ORDER BY q.created_at DESC
        LIMIT 1
      `)
      .get(pdfHash);

    if (!row) return null;
    return {
      quoteId: row.quote_id,
      quoteNumber: row.quote_number,
      createdAt: row.created_at,
      customer: normalizePayload(row.customer_json),
      parts: normalizePayload(row.parts_json),
      sourceFile: row.source_file,
      payload: normalizePayload(row.payload_json),
    };
  }

  function recordRevision({ quoteId, payload, revisionLabel }) {
    const revisionId = randomUUID();
    db.prepare(
      'INSERT INTO quote_revisions (revision_id, quote_id, revision_label, created_at, payload_json) VALUES (?, ?, ?, ?, ?)',
    ).run(revisionId, quoteId, revisionLabel, new Date().toISOString(), JSON.stringify(payload ?? {}));

    return {
      revisionId,
      quoteId,
      revisionLabel,
      createdAt: new Date().toISOString(),
    };
  }

  function recordQuote({ quoteNumber, customer, parts, pdfHash, sourceFile, payload }) {
    const normalizedHash = pdfHash || createHash('sha256').update(JSON.stringify({ customer, parts, sourceFile })).digest('hex');
    const previous = findDuplicateQuoteByHash(normalizedHash);

    if (previous) {
      const nextVersion = (
        db
          .prepare('SELECT COALESCE(MAX(CAST(substr(revision_label, 2) AS INTEGER)), 0) as last_version FROM quote_revisions WHERE quote_id = ?')
          .get(previous.quoteId)?.last_version || 0
      ) + 1;
      const revisionLabel = `v${nextVersion}`;
      const revision = recordRevision({ quoteId: previous.quoteId, payload: payload ?? { customer, parts }, revisionLabel });
      return {
        duplicate: true,
        quoteId: previous.quoteId,
        quoteNumber: previous.quoteNumber,
        revision,
        warning: `Warning: This PDF document has already been processed under Quote #${previous.quoteNumber}. You are creating a new revision (${revisionLabel}) for this same document.`,
      };
    }

    const safeQuoteNumber = quoteNumber || issueQuoteNumber();
    const quoteId = randomUUID();
    const createdAt = new Date().toISOString();
    db.prepare(
      'INSERT INTO quotes (quote_id, quote_number, created_at, customer_json, parts_json, pdf_hash, source_file, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(
      quoteId,
      safeQuoteNumber,
      createdAt,
      JSON.stringify(customer ?? {}),
      JSON.stringify(parts ?? []),
      normalizedHash,
      sourceFile || null,
      JSON.stringify(payload ?? { customer: customer ?? {}, parts: parts ?? [] }),
    );

    db.prepare(
      'INSERT INTO quote_hashes (pdf_hash, quote_id, quote_number, created_at, source_file) VALUES (?, ?, ?, ?, ?)',
    ).run(normalizedHash, quoteId, safeQuoteNumber, createdAt, sourceFile || null);

    const revision = recordRevision({ quoteId, payload: payload ?? { customer: customer ?? {}, parts: parts ?? [] }, revisionLabel: 'v1' });
    return {
      duplicate: false,
      quoteId,
      quoteNumber: safeQuoteNumber,
      revision,
      warning: null,
    };
  }

  function getHistory() {
    return db
      .prepare(`
        SELECT q.quote_id, q.quote_number, q.created_at, q.customer_json, q.parts_json, q.pdf_hash, q.source_file,
               (SELECT COUNT(*) FROM quote_revisions WHERE quote_id = q.quote_id) as revision_count
        FROM quotes q
        ORDER BY q.created_at DESC
      `)
      .all()
      .map((row) => ({
        quoteId: row.quote_id,
        quoteNumber: row.quote_number,
        createdAt: row.created_at,
        customer: normalizePayload(row.customer_json),
        parts: normalizePayload(row.parts_json),
        pdfHash: row.pdf_hash,
        sourceFile: row.source_file,
        revisionCount: Number(row.revision_count || 0),
      }));
  }

  function searchQuotes(query = '') {
    const terms = String(query).trim();
    if (!terms) return getHistory();
    const matcher = `%${terms}%`;
    return db
      .prepare(`
        SELECT q.quote_id, q.quote_number, q.created_at, q.customer_json, q.parts_json, q.pdf_hash, q.source_file,
               (SELECT COUNT(*) FROM quote_revisions WHERE quote_id = q.quote_id) as revision_count
        FROM quotes q
        WHERE q.quote_number LIKE ?
           OR q.customer_json LIKE ?
           OR q.parts_json LIKE ?
           OR q.source_file LIKE ?
        ORDER BY q.created_at DESC
      `)
      .all(matcher, matcher, matcher, matcher)
      .map((row) => ({
        quoteId: row.quote_id,
        quoteNumber: row.quote_number,
        createdAt: row.created_at,
        customer: normalizePayload(row.customer_json),
        parts: normalizePayload(row.parts_json),
        pdfHash: row.pdf_hash,
        sourceFile: row.source_file,
        revisionCount: Number(row.revision_count || 0),
      }));
  }

  function getRevisions(quoteId) {
    return db
      .prepare(
        'SELECT revision_id, quote_id, revision_label, created_at, payload_json FROM quote_revisions WHERE quote_id = ? ORDER BY created_at ASC',
      )
      .all(quoteId)
      .map((row) => ({
        revisionId: row.revision_id,
        quoteId: row.quote_id,
        revisionLabel: row.revision_label,
        createdAt: row.created_at,
        payload: normalizePayload(row.payload_json),
      }));
  }

  function getLatestQuoteNumber() {
    const row = db.prepare('SELECT quote_number FROM quotes ORDER BY created_at DESC LIMIT 1').get();
    return row?.quote_number || null;
  }

  function buildCsv({ customer, parts, quoteNumber }) {
    const rows = Array.isArray(parts) ? parts : [];
    const header = ['Part Number', 'Name / Description', 'Rev', 'Sq. In. / Unit', 'Work Type', 'Price / SI', 'Price / Unit', 'Qty', 'Total'];
    const csvRows = [header.join(',')];
    for (const part of rows) {
      const line = [
        part.partNumber || '',
        part.partName || '',
        part.revision || '',
        part.totalSurfaceAreaSqIn ?? '',
        part.coatingBom?.topcoat || 'Coating',
        '',
        '',
        part.quantity ?? 1,
        '',
      ];
      csvRows.push(line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','));
    }
    return `Quote Number,${quoteNumber || 'QP-0000'}\nCustomer,${customer?.company || customer?.contact || ''}\n\n${csvRows.join('\n')}`;
  }

  return {
    db,
    issueQuoteNumber,
    nextQuoteSequence,
    findDuplicateQuote: findDuplicateQuoteByHash,
    recordQuote,
    getHistory,
    searchQuotes,
    getRevisions,
    getLatestQuoteNumber,
    buildCsv,
  };
}

export const defaultQuoteStore = createQuoteStore();
export const hashPayload = (value) => {
  return createHash('sha256').update(JSON.stringify(value ?? {})).digest('hex');
};
