import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = fileURLToPath(new URL('../../data/quotepilot.sqlite', import.meta.url));

export function createQuoteStore(dbPath = DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS quote_counters (
      year TEXT PRIMARY KEY,
      last_sequence INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draft_sequence_id VARCHAR(20) UNIQUE NOT NULL,
      odoo_sequence_id VARCHAR(30),
      business_unit VARCHAR(100) NOT NULL DEFAULT 'OC Custom Coating',
      customer_name VARCHAR(255) NOT NULL,
      customer_email VARCHAR(255),
      pdf_sha256 CHAR(64),
      source_file TEXT,
      form_payload TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS quote_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      part_number VARCHAR(100),
      description TEXT,
      revision VARCHAR(20),
      work_type VARCHAR(50),
      sq_in_per_unit REAL,
      price_per_si REAL,
      price_unit REAL,
      quantity REAL,
      total_price REAL
    );

    CREATE TABLE IF NOT EXISTS quote_revisions (
      revision_id TEXT PRIMARY KEY,
      quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      revision_label TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      payload_json TEXT NOT NULL
    );
  `);

  // Migrate older quotes table if needed
  try {
    const tableInfo = db.prepare('PRAGMA table_info(quotes)').all();
    const colNames = new Set(tableInfo.map((c) => c.name));

    if (!colNames.has('draft_sequence_id') && colNames.has('quote_number')) {
      // Legacy table structure migration
      db.exec(`
        ALTER TABLE quotes ADD COLUMN draft_sequence_id VARCHAR(20);
        UPDATE quotes SET draft_sequence_id = quote_number WHERE draft_sequence_id IS NULL;
      `);
    }
    if (!colNames.has('business_unit')) {
      db.exec(`ALTER TABLE quotes ADD COLUMN business_unit VARCHAR(100) DEFAULT 'OC Custom Coating';`);
    }
    if (!colNames.has('customer_name') && colNames.has('customer_json')) {
      db.exec(`ALTER TABLE quotes ADD COLUMN customer_name VARCHAR(255) DEFAULT 'Standard Customer';`);
    }
    if (!colNames.has('customer_email')) {
      db.exec(`ALTER TABLE quotes ADD COLUMN customer_email VARCHAR(255);`);
    }
    if (!colNames.has('pdf_sha256')) {
      if (colNames.has('pdf_hash')) {
        db.exec(`
          ALTER TABLE quotes ADD COLUMN pdf_sha256 CHAR(64);
          UPDATE quotes SET pdf_sha256 = pdf_hash WHERE pdf_sha256 IS NULL;
        `);
      } else {
        db.exec(`ALTER TABLE quotes ADD COLUMN pdf_sha256 CHAR(64);`);
      }
    }
    if (!colNames.has('form_payload') && colNames.has('payload_json')) {
      db.exec(`
        ALTER TABLE quotes ADD COLUMN form_payload TEXT;
        UPDATE quotes SET form_payload = payload_json WHERE form_payload IS NULL;
      `);
    }
    if (!colNames.has('odoo_sequence_id')) {
      db.exec(`ALTER TABLE quotes ADD COLUMN odoo_sequence_id VARCHAR(30);`);
    }
    if (!colNames.has('updated_at')) {
      db.exec(`ALTER TABLE quotes ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
    }
  } catch (migErr) {
    console.warn('Migration check note:', migErr.message);
  }

  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_quotes_pdf_sha256 ON quotes(pdf_sha256);
      CREATE INDEX IF NOT EXISTS idx_quotes_draft_seq ON quotes(draft_sequence_id);
      CREATE INDEX IF NOT EXISTS idx_quotes_odoo_seq ON quotes(odoo_sequence_id);
    `);
  } catch (idxErr) {
    console.warn('Index creation note:', idxErr.message);
  }

  function getCurrentYearStr() {
    return new Date().getFullYear().toString().slice(-2);
  }

  function getMaxSequenceNumber(year = getCurrentYearStr()) {
    let counterSeq = 0;
    try {
      const counterRow = db.prepare('SELECT last_sequence FROM quote_counters WHERE year = ?').get(year);
      if (counterRow) counterSeq = Number(counterRow.last_sequence) || 0;
    } catch {
      // ignore
    }

    let maxTableSeq = 0;
    try {
      const rows = db.prepare('SELECT draft_sequence_id FROM quotes WHERE draft_sequence_id LIKE ?').all(`QP${year}-%`);
      for (const r of rows) {
        const parts = String(r.draft_sequence_id).split('-');
        const num = parseInt(parts[1] || '0', 10);
        if (!isNaN(num) && num > maxTableSeq) {
          maxTableSeq = num;
        }
      }
    } catch {
      // ignore
    }

    return Math.max(counterSeq, maxTableSeq);
  }

  function getCurrentDraftSequenceId(year = getCurrentYearStr()) {
    const maxSeq = getMaxSequenceNumber(year);
    const nextSeq = maxSeq + 1;
    return `QP${year}-${String(nextSeq).padStart(4, '0')}`;
  }

  function getNextDraftSequenceId(year = getCurrentYearStr()) {
    const maxSeq = getMaxSequenceNumber(year);
    const nextSeq = maxSeq + 1;
    return `QP${year}-${String(nextSeq).padStart(4, '0')}`;
  }

  function advanceSequenceCounter(year = getCurrentYearStr()) {
    const maxSeq = getMaxSequenceNumber(year);
    const nextSeq = maxSeq + 1;
    const row = db.prepare('SELECT last_sequence FROM quote_counters WHERE year = ?').get(year);
    if (row) {
      db.prepare('UPDATE quote_counters SET last_sequence = ? WHERE year = ?').run(nextSeq, year);
    } else {
      db.prepare('INSERT INTO quote_counters (year, last_sequence) VALUES (?, ?)').run(year, nextSeq);
    }
    return `QP${year}-${String(nextSeq).padStart(4, '0')}`;
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
        SELECT q.id, q.draft_sequence_id, q.odoo_sequence_id, q.business_unit,
               q.customer_name, q.customer_email, q.pdf_sha256, q.source_file,
               q.form_payload, q.status, q.created_at, q.updated_at,
               (SELECT COUNT(*) FROM quote_revisions WHERE quote_id = q.id) as revision_count
        FROM quotes q
        WHERE q.pdf_sha256 = ?
        ORDER BY q.created_at DESC
        LIMIT 1
      `)
      .get(pdfHash);

    if (!row) return null;

    const lineItems = db
      .prepare('SELECT * FROM quote_line_items WHERE quote_id = ? ORDER BY id ASC')
      .all(row.id);

    return {
      id: row.id,
      draftSequenceId: row.draft_sequence_id || `QP${getCurrentYearStr()}-0001`,
      quoteNumber: row.draft_sequence_id || `QP${getCurrentYearStr()}-0001`,
      odooSequenceId: row.odoo_sequence_id,
      businessUnit: row.business_unit || 'OC Custom Coating',
      customerName: row.customer_name || 'Standard Customer',
      customerEmail: row.customer_email,
      pdfHash: row.pdf_sha256,
      sourceFile: row.source_file,
      status: row.status || 'DRAFT',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revisionCount: Number(row.revision_count || 1),
      formPayload: normalizePayload(row.form_payload),
      lineItems,
    };
  }

  function recordRevision({ quoteId, payload, revisionLabel }) {
    const revisionId = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO quote_revisions (revision_id, quote_id, revision_label, created_at, payload_json) VALUES (?, ?, ?, ?, ?)',
    ).run(revisionId, quoteId, revisionLabel, now, JSON.stringify(payload ?? {}));

    return {
      revisionId,
      quoteId,
      revisionLabel,
      createdAt: now,
    };
  }

  function recordQuote({
    draftSequenceId,
    odooSequenceId = null,
    businessUnit = 'OC Custom Coating',
    customer = {},
    parts = [],
    pdfHash = null,
    sourceFile = null,
    formPayload = null,
    status = 'DRAFT',
    forceNewQuote = false,
  }) {
    const customerName = customer?.company || customer?.name || customer?.contact || 'Standard Customer';
    const customerEmail = customer?.email || null;
    const fullPayload = formPayload || { customer, parts, sourceFile };
    const normalizedHash = pdfHash || createHash('sha256').update(JSON.stringify(fullPayload)).digest('hex');

    // Duplicate check if not forced
    if (!forceNewQuote && pdfHash) {
      const previous = findDuplicateQuoteByHash(normalizedHash);
      if (previous) {
        const nextRevNum = (
          db
            .prepare('SELECT COALESCE(MAX(CAST(substr(revision_label, 2) AS INTEGER)), 0) as last_rev FROM quote_revisions WHERE quote_id = ?')
            .get(previous.id)?.last_rev || 1
        ) + 1;
        const revisionLabel = `v${nextRevNum}`;
        const revision = recordRevision({
          quoteId: previous.id,
          payload: fullPayload,
          revisionLabel,
        });

        // Update quote timestamp and payload
        db.prepare(`
          UPDATE quotes
          SET form_payload = ?, updated_at = CURRENT_TIMESTAMP,
              customer_name = ?, customer_email = ?, business_unit = ?
          WHERE id = ?
        `).run(JSON.stringify(fullPayload), customerName, customerEmail, businessUnit, previous.id);

        return {
          duplicate: true,
          id: previous.id,
          draftSequenceId: previous.draftSequenceId,
          quoteNumber: previous.draftSequenceId,
          odooSequenceId: previous.odooSequenceId,
          status: previous.status,
          revision,
          warning: `This PDF document has already been processed under Quote #${previous.draftSequenceId} (Customer: ${previous.customerName}).`,
        };
      }
    }

    const yearStr = getCurrentYearStr();
    let assignedDraftId = draftSequenceId;
    if (!assignedDraftId) {
      assignedDraftId = advanceSequenceCounter(yearStr);
    } else {
      // Ensure counter tracks this sequence
      const seqPart = parseInt(assignedDraftId.split('-')[1] || '0', 10);
      if (!isNaN(seqPart) && seqPart > 0) {
        const row = db.prepare('SELECT last_sequence FROM quote_counters WHERE year = ?').get(yearStr);
        if (!row || Number(row.last_sequence) < seqPart) {
          if (row) {
            db.prepare('UPDATE quote_counters SET last_sequence = ? WHERE year = ?').run(seqPart, yearStr);
          } else {
            db.prepare('INSERT INTO quote_counters (year, last_sequence) VALUES (?, ?)').run(yearStr, seqPart);
          }
        }
      }
    }

    const now = new Date().toISOString();
    const existingQuote = db.prepare('SELECT id FROM quotes WHERE draft_sequence_id = ?').get(assignedDraftId);
    let quoteId;

    if (existingQuote) {
      quoteId = Number(existingQuote.id);
      db.prepare(`
        UPDATE quotes
        SET odoo_sequence_id = COALESCE(?, odoo_sequence_id),
            business_unit = ?,
            customer_name = ?,
            customer_email = ?,
            pdf_sha256 = ?,
            source_file = COALESCE(?, source_file),
            form_payload = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        odooSequenceId || null,
        businessUnit,
        customerName,
        customerEmail,
        normalizedHash,
        sourceFile || null,
        JSON.stringify(fullPayload),
        status,
        quoteId,
      );
      // Clean previous line items for upsert
      db.prepare('DELETE FROM quote_line_items WHERE quote_id = ?').run(quoteId);
    } else {
      const insertQuote = db.prepare(`
        INSERT INTO quotes (
          draft_sequence_id, odoo_sequence_id, business_unit, customer_name,
          customer_email, pdf_sha256, source_file, form_payload, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insertQuote.run(
        assignedDraftId,
        odooSequenceId,
        businessUnit,
        customerName,
        customerEmail,
        normalizedHash,
        sourceFile || null,
        JSON.stringify(fullPayload),
        status,
        now,
        now,
      );
      quoteId = Number(result.lastInsertRowid);
    }

    // Insert line items
    if (Array.isArray(parts) && parts.length > 0) {
      const insertLine = db.prepare(`
        INSERT INTO quote_line_items (
          quote_id, part_number, description, revision, work_type,
          sq_in_per_unit, price_per_si, price_unit, quantity, total_price
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const part of parts) {
        const sqIn = Number(part.totalSurfaceAreaSqIn || part.sq_in_per_unit || 0);
        const qty = Number(part.quantity || part.product_uom_qty || 1);
        const pricePerSi = Number(part.pricePerSi || part.price_per_si || (part.isMaskingNeeded ? 0.46 : 0.40));
        const unitPrice = Number(part.priceUnit || part.price_unit || (sqIn > 0 ? (sqIn * pricePerSi).toFixed(2) : 5.0));
        const totalPrice = Number(part.totalPrice || part.total_price || (unitPrice * qty).toFixed(2));

        insertLine.run(
          quoteId,
          part.partNumber || part.part_number || null,
          part.partName || part.description || part.partSummary || null,
          part.revision || null,
          part.coatingBom?.topcoat || part.work_type || 'Coating',
          sqIn,
          pricePerSi,
          unitPrice,
          qty,
          totalPrice,
        );
      }
    }

    const revision = recordRevision({
      quoteId,
      payload: fullPayload,
      revisionLabel: 'v1',
    });

    return {
      duplicate: false,
      id: quoteId,
      draftSequenceId: assignedDraftId,
      quoteNumber: assignedDraftId,
      odooSequenceId,
      businessUnit,
      status,
      revision,
      warning: null,
    };
  }

  function updateQuoteStatus(quoteIdOrDraftSeq, { status, odooSequenceId }) {
    if (typeof quoteIdOrDraftSeq === 'number') {
      if (odooSequenceId) {
        db.prepare(`
          UPDATE quotes
          SET status = ?, odoo_sequence_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(status, odooSequenceId, quoteIdOrDraftSeq);
      } else {
        db.prepare(`
          UPDATE quotes
          SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(status, quoteIdOrDraftSeq);
      }
    } else {
      if (odooSequenceId) {
        db.prepare(`
          UPDATE quotes
          SET status = ?, odoo_sequence_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE draft_sequence_id = ?
        `).run(status, odooSequenceId, quoteIdOrDraftSeq);
      } else {
        db.prepare(`
          UPDATE quotes
          SET status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE draft_sequence_id = ?
        `).run(status, quoteIdOrDraftSeq);
      }
    }
  }

  function getHistory() {
    return db
      .prepare(`
        SELECT q.id, q.draft_sequence_id, q.odoo_sequence_id, q.business_unit,
               q.customer_name, q.customer_email, q.pdf_sha256, q.source_file,
               q.status, q.created_at, q.updated_at,
               (SELECT COUNT(*) FROM quote_revisions WHERE quote_id = q.id) as revision_count,
               (SELECT COUNT(*) FROM quote_line_items WHERE quote_id = q.id) as line_item_count
        FROM quotes q
        ORDER BY q.created_at DESC
      `)
      .all()
      .map((row) => ({
        id: row.id,
        draftSequenceId: row.draft_sequence_id,
        quoteNumber: row.draft_sequence_id,
        odooSequenceId: row.odoo_sequence_id,
        businessUnit: row.business_unit,
        customerName: row.customer_name,
        customerEmail: row.customer_email,
        pdfHash: row.pdf_sha256,
        sourceFile: row.source_file,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        revisionCount: Number(row.revision_count || 1),
        lineItemCount: Number(row.line_item_count || 0),
      }));
  }

  function getQuoteById(id) {
    const row = db
      .prepare(`
        SELECT q.id, q.draft_sequence_id, q.odoo_sequence_id, q.business_unit,
               q.customer_name, q.customer_email, q.pdf_sha256, q.source_file,
               q.form_payload, q.status, q.created_at, q.updated_at,
               (SELECT COUNT(*) FROM quote_revisions WHERE quote_id = q.id) as revision_count
        FROM quotes q
        WHERE q.id = ? OR q.draft_sequence_id = ?
      `)
      .get(id, id);

    if (!row) return null;

    const lineItems = db
      .prepare('SELECT * FROM quote_line_items WHERE quote_id = ? ORDER BY id ASC')
      .all(row.id);

    const revisions = db
      .prepare('SELECT revision_id, revision_label, created_at, payload_json FROM quote_revisions WHERE quote_id = ? ORDER BY created_at ASC')
      .all(row.id)
      .map((r) => ({
        revisionId: r.revision_id,
        revisionLabel: r.revision_label,
        createdAt: r.created_at,
        payload: normalizePayload(r.payload_json),
      }));

    return {
      id: row.id,
      draftSequenceId: row.draft_sequence_id,
      quoteNumber: row.draft_sequence_id,
      odooSequenceId: row.odoo_sequence_id,
      businessUnit: row.business_unit,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      pdfHash: row.pdf_sha256,
      sourceFile: row.source_file,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revisionCount: Number(row.revision_count || 1),
      formPayload: normalizePayload(row.form_payload),
      lineItems,
      revisions,
    };
  }

  function searchQuotes({ query = '', businessUnit = '', status = '', startDate = '', endDate = '' } = {}) {
    const terms = String(query || '').trim();
    let sql = `
      SELECT DISTINCT q.id, q.draft_sequence_id, q.odoo_sequence_id, q.business_unit,
             q.customer_name, q.customer_email, q.pdf_sha256, q.source_file,
             q.status, q.created_at, q.updated_at,
             (SELECT COUNT(*) FROM quote_revisions WHERE quote_id = q.id) as revision_count,
             (SELECT COUNT(*) FROM quote_line_items WHERE quote_id = q.id) as line_item_count
      FROM quotes q
      LEFT JOIN quote_line_items li ON li.quote_id = q.id
      WHERE 1=1
    `;
    const params = [];

    if (terms) {
      const matcher = `%${terms}%`;
      sql += `
        AND (
          q.draft_sequence_id LIKE ?
          OR (q.odoo_sequence_id IS NOT NULL AND q.odoo_sequence_id LIKE ?)
          OR q.customer_name LIKE ?
          OR (q.customer_email IS NOT NULL AND q.customer_email LIKE ?)
          OR (q.source_file IS NOT NULL AND q.source_file LIKE ?)
          OR (q.pdf_sha256 IS NOT NULL AND q.pdf_sha256 LIKE ?)
          OR (li.part_number IS NOT NULL AND li.part_number LIKE ?)
          OR (li.description IS NOT NULL AND li.description LIKE ?)
        )
      `;
      params.push(matcher, matcher, matcher, matcher, matcher, matcher, matcher, matcher);
    }

    if (businessUnit && businessUnit !== 'all') {
      sql += ` AND q.business_unit LIKE ?`;
      params.push(`%${businessUnit}%`);
    }

    if (status && status !== 'all') {
      sql += ` AND q.status = ?`;
      params.push(status.toUpperCase());
    }

    if (startDate) {
      sql += ` AND q.created_at >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND q.created_at <= ?`;
      params.push(endDate);
    }

    sql += ` ORDER BY q.created_at DESC`;

    return db
      .prepare(sql)
      .all(...params)
      .map((row) => ({
        id: row.id,
        draftSequenceId: row.draft_sequence_id,
        quoteNumber: row.draft_sequence_id,
        odooSequenceId: row.odoo_sequence_id,
        businessUnit: row.business_unit,
        customerName: row.customer_name,
        customerEmail: row.customer_email,
        pdfHash: row.pdf_sha256,
        sourceFile: row.source_file,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        revisionCount: Number(row.revision_count || 1),
        lineItemCount: Number(row.line_item_count || 0),
      }));
  }

  function deleteQuote(id) {
    db.prepare('DELETE FROM quote_line_items WHERE quote_id = ?').run(id);
    db.prepare('DELETE FROM quote_revisions WHERE quote_id = ?').run(id);
    const result = db.prepare('DELETE FROM quotes WHERE id = ? OR draft_sequence_id = ?').run(id, id);
    return result.changes > 0;
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

  function buildCsv({ customer, parts, quoteNumber }) {
    const rows = Array.isArray(parts) ? parts : [];
    const header = ['Part Number', 'Description', 'Rev', 'Work Type', 'Sq. In. / Unit', 'Price / SI', 'Price / Unit', 'Qty', 'Total'];
    const csvRows = [header.join(',')];
    for (const part of rows) {
      const sqIn = Number(part.totalSurfaceAreaSqIn || part.sq_in_per_unit || 0);
      const qty = Number(part.quantity || 1);
      const pricePerSi = Number(part.pricePerSi || 0.40);
      const unitPrice = Number(part.priceUnit || (sqIn > 0 ? (sqIn * pricePerSi).toFixed(2) : 5.0));
      const total = Number(part.totalPrice || (unitPrice * qty).toFixed(2));

      const line = [
        part.partNumber || '',
        part.partName || part.description || '',
        part.revision || '',
        part.coatingBom?.topcoat || part.work_type || 'Coating',
        sqIn > 0 ? sqIn : '',
        pricePerSi > 0 ? pricePerSi : '',
        unitPrice,
        qty,
        total,
      ];
      csvRows.push(line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','));
    }
    return `Quote Number,${quoteNumber || 'QP26-0001'}\nCustomer,${customer?.company || customer?.contact || 'Standard Customer'}\n\n${csvRows.join('\n')}`;
  }

  return {
    db,
    getCurrentDraftSequenceId,
    getNextDraftSequenceId,
    advanceSequenceCounter,
    findDuplicateQuote: findDuplicateQuoteByHash,
    recordQuote,
    updateQuoteStatus,
    getHistory,
    getQuoteById,
    searchQuotes,
    deleteQuote,
    getRevisions,
    buildCsv,
  };
}

export const defaultQuoteStore = createQuoteStore();
export const hashPayload = (value) => {
  return createHash('sha256').update(JSON.stringify(value ?? {})).digest('hex');
};
