import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const BU_DEFAULT = 'OC Custom Coating';

function must({ data, error }, label) {
  if (error) throw new Error(`[quoteStore:${label}] ${error.message}`);
  return data;
}

export function createQuoteStore({ url = process.env.SUPABASE_URL, key = process.env.SUPABASE_KEY } = {}) {
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const yearStr = () => new Date().getFullYear().toString().slice(-2);
  const fmtSeq = (year, n) => `QP${year}-${String(n).padStart(4, '0')}`;

  const mapRow = (r) => ({
    id: r.id,
    draftSequenceId: r.draft_sequence_id,
    quoteNumber: r.draft_sequence_id,
    odooSequenceId: r.odoo_sequence_id,
    businessUnit: r.business_unit,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    pdfHash: r.pdf_sha256,
    sourceFile: r.source_file,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  });

  async function peekLastSequence(year) {
    const row = must(
      await sb.from('quote_counters').select('last_sequence').eq('year', year).maybeSingle(),
      'peekCounter',
    );
    return Number(row?.last_sequence || 0);
  }

  // Peek only: does not consume a number
  async function getCurrentDraftSequenceId(year = yearStr()) {
    return fmtSeq(year, (await peekLastSequence(year)) + 1);
  }
  const getNextDraftSequenceId = getCurrentDraftSequenceId;

  // Atomically consumes and returns the next number
  async function advanceSequenceCounter(year = yearStr()) {
    const n = must(await sb.rpc('next_quote_sequence', { p_year: year }), 'advanceCounter');
    return fmtSeq(year, Number(n));
  }

  async function countRevisions(quoteId) {
    const { count, error } = await sb
      .from('quote_revisions')
      .select('*', { count: 'exact', head: true })
      .eq('quote_id', quoteId);
    if (error) throw new Error(`[quoteStore:countRevisions] ${error.message}`);
    return count || 0;
  }

  // Duplicate = same PDF hash AND same business unit (company). Same PDF under a
  // different company is NOT a duplicate.
  async function findDuplicateQuote(pdfHash, businessUnit = null) {
    if (!pdfHash) return null;
    let q = sb.from('quotes').select('*').eq('pdf_sha256', pdfHash);
    if (businessUnit) q = q.eq('business_unit', businessUnit);
    const row = must(
      await q.order('created_at', { ascending: false }).limit(1).maybeSingle(),
      'findDuplicate',
    );
    if (!row) return null;
    const lineItems = must(
      await sb.from('quote_line_items').select('*').eq('quote_id', row.id).order('id'),
      'findDuplicate:lines',
    );
    return {
      ...mapRow(row),
      revisionCount: (await countRevisions(row.id)) || 1,
      formPayload: row.form_payload,
      lineItems,
    };
  }

  async function recordRevision({ quoteId, payload, revisionLabel }) {
    const row = must(
      await sb
        .from('quote_revisions')
        .insert({ quote_id: quoteId, revision_label: revisionLabel, payload_json: payload ?? {} })
        .select('revision_id, created_at')
        .single(),
      'recordRevision',
    );
    return { revisionId: row.revision_id, quoteId, revisionLabel, createdAt: row.created_at };
  }

  function buildLineRows(quoteId, parts) {
    return parts.map((part) => {
      const sqIn = Number(part.totalSurfaceAreaSqIn || part.sq_in_per_unit || 0);
      const qty = Number(part.quantity || part.product_uom_qty || 1);
      const pricePerSi = Number(part.pricePerSi || part.price_per_si || (part.isMaskingNeeded ? 0.46 : 0.4));
      const unitPrice = Number(part.priceUnit || part.price_unit || (sqIn > 0 ? (sqIn * pricePerSi).toFixed(2) : 5.0));
      const totalPrice = Number(part.totalPrice || part.total_price || (unitPrice * qty).toFixed(2));
      return {
        quote_id: quoteId,
        part_number: part.partNumber || part.part_number || null,
        description: part.partName || part.description || part.partSummary || null,
        revision: part.revision || null,
        work_type: part.coatingBom?.topcoat || part.work_type || 'Coating',
        sq_in_per_unit: sqIn,
        price_per_si: pricePerSi,
        price_unit: unitPrice,
        quantity: qty,
        total_price: totalPrice,
      };
    });
  }

  async function recordQuote({
    draftSequenceId,
    odooSequenceId = null,
    businessUnit = BU_DEFAULT,
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

    // Duplicate PDF -> new revision on the existing quote
    if (!forceNewQuote && pdfHash) {
      const previous = await findDuplicateQuote(normalizedHash, businessUnit);
      if (previous) {
        const revisionLabel = `v${(await countRevisions(previous.id)) + 1}`;
        const revision = await recordRevision({ quoteId: previous.id, payload: fullPayload, revisionLabel });
        must(
          await sb
            .from('quotes')
            .update({
              form_payload: fullPayload,
              customer_name: customerName,
              customer_email: customerEmail,
              business_unit: businessUnit,
              updated_at: new Date().toISOString(),
            })
            .eq('id', previous.id),
          'recordQuote:dupUpdate',
        );
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

    const year = yearStr();
    let assignedId = draftSequenceId;
    if (!assignedId) {
      assignedId = await advanceSequenceCounter(year);
    } else {
      const seqPart = parseInt(assignedId.split('-')[1] || '0', 10);
      if (!Number.isNaN(seqPart) && seqPart > 0) {
        must(await sb.rpc('bump_quote_sequence', { p_year: year, p_seq: seqPart }), 'bumpCounter');
      }
    }

    const nowIso = new Date().toISOString();
    const existing = must(
      await sb.from('quotes').select('id').eq('draft_sequence_id', assignedId).maybeSingle(),
      'recordQuote:lookup',
    );

    let quoteId;
    if (existing) {
      quoteId = Number(existing.id);
      const patch = {
        business_unit: businessUnit,
        customer_name: customerName,
        customer_email: customerEmail,
        pdf_sha256: normalizedHash,
        form_payload: fullPayload,
        status,
        updated_at: nowIso,
      };
      if (odooSequenceId) patch.odoo_sequence_id = odooSequenceId;
      if (sourceFile) patch.source_file = sourceFile;
      must(await sb.from('quotes').update(patch).eq('id', quoteId), 'recordQuote:update');
      must(await sb.from('quote_line_items').delete().eq('quote_id', quoteId), 'recordQuote:clearLines');
    } else {
      const row = must(
        await sb
          .from('quotes')
          .insert({
            draft_sequence_id: assignedId,
            odoo_sequence_id: odooSequenceId,
            business_unit: businessUnit,
            customer_name: customerName,
            customer_email: customerEmail,
            pdf_sha256: normalizedHash,
            source_file: sourceFile || null,
            form_payload: fullPayload,
            status,
            created_at: nowIso,
            updated_at: nowIso,
          })
          .select('id')
          .single(),
        'recordQuote:insert',
      );
      quoteId = Number(row.id);
    }

    if (Array.isArray(parts) && parts.length > 0) {
      must(await sb.from('quote_line_items').insert(buildLineRows(quoteId, parts)), 'recordQuote:lines');
    }

    const revision = await recordRevision({
      quoteId,
      payload: fullPayload,
      revisionLabel: `v${(await countRevisions(quoteId)) + 1}`,
    });

    return {
      duplicate: false,
      id: quoteId,
      draftSequenceId: assignedId,
      quoteNumber: assignedId,
      odooSequenceId,
      businessUnit,
      status,
      revision,
      warning: null,
    };
  }

  const isNumericId = (v) => typeof v === 'number' || /^\d+$/.test(String(v));

  async function updateQuoteStatus(quoteIdOrDraftSeq, { status, odooSequenceId }) {
    const patch = { status, updated_at: new Date().toISOString() };
    if (odooSequenceId) patch.odoo_sequence_id = odooSequenceId;
    const q = sb.from('quotes').update(patch);
    must(
      await (isNumericId(quoteIdOrDraftSeq)
        ? q.eq('id', Number(quoteIdOrDraftSeq))
        : q.eq('draft_sequence_id', quoteIdOrDraftSeq)),
      'updateQuoteStatus',
    );
  }

  async function withCounts(rows) {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const [revs, lines] = await Promise.all([
      sb.from('quote_revisions').select('quote_id').in('quote_id', ids),
      sb.from('quote_line_items').select('quote_id').in('quote_id', ids),
    ]);
    const tally = (res, label) => {
      const m = new Map();
      for (const r of must(res, label)) m.set(r.quote_id, (m.get(r.quote_id) || 0) + 1);
      return m;
    };
    const rm = tally(revs, 'counts:rev');
    const lm = tally(lines, 'counts:lines');
    return rows.map((r) => ({
      ...mapRow(r),
      revisionCount: rm.get(r.id) || 1,
      lineItemCount: lm.get(r.id) || 0,
    }));
  }

  async function getHistory() {
    const rows = must(
      await sb.from('quotes').select('*').order('created_at', { ascending: false }),
      'getHistory',
    );
    return withCounts(rows);
  }

  async function getRevisions(quoteId) {
    const rows = must(
      await sb.from('quote_revisions').select('*').eq('quote_id', quoteId).order('created_at'),
      'getRevisions',
    );
    return rows.map((r) => ({
      revisionId: r.revision_id,
      quoteId: r.quote_id,
      revisionLabel: r.revision_label,
      createdAt: r.created_at,
      payload: r.payload_json,
    }));
  }

  async function getQuoteById(id) {
    const base = sb.from('quotes').select('*');
    const row = must(
      await (isNumericId(id) ? base.eq('id', Number(id)) : base.eq('draft_sequence_id', id)).maybeSingle(),
      'getQuoteById',
    );
    if (!row) return null;
    const lineItems = must(
      await sb.from('quote_line_items').select('*').eq('quote_id', row.id).order('id'),
      'getQuoteById:lines',
    );
    const revisions = await getRevisions(row.id);
    return {
      ...mapRow(row),
      revisionCount: revisions.length || 1,
      formPayload: row.form_payload,
      lineItems,
      revisions: revisions.map(({ quoteId, ...rest }) => rest),
    };
  }

  async function searchQuotes({ query = '', businessUnit = '', status = '', startDate = '', endDate = '' } = {}) {
    // Strip characters that would break PostgREST or() syntax and LIKE wildcards
    const term = String(query || '').trim().replace(/[,()%*\\]/g, ' ').trim();
    let q = sb.from('quotes').select('*');

    if (term) {
      const m = `%${term}%`;
      const lineHits = must(
        await sb
          .from('quote_line_items')
          .select('quote_id')
          .or(`part_number.ilike.${m},description.ilike.${m}`),
        'search:lines',
      );
      const ids = [...new Set(lineHits.map((r) => r.quote_id))];
      const clauses = [
        `draft_sequence_id.ilike.${m}`,
        `odoo_sequence_id.ilike.${m}`,
        `customer_name.ilike.${m}`,
        `customer_email.ilike.${m}`,
        `source_file.ilike.${m}`,
        `pdf_sha256.ilike.${m}`,
      ];
      if (ids.length) clauses.push(`id.in.(${ids.join(',')})`);
      q = q.or(clauses.join(','));
    }
    if (businessUnit && businessUnit !== 'all') q = q.ilike('business_unit', `%${businessUnit}%`);
    if (status && status !== 'all') q = q.eq('status', status.toUpperCase());
    if (startDate) q = q.gte('created_at', startDate);
    if (endDate) q = q.lte('created_at', endDate);

    const rows = must(await q.order('created_at', { ascending: false }), 'searchQuotes');
    return withCounts(rows);
  }

  // Deletes exactly one quote. Pass businessUnit to guarantee it can never touch
  // another company's record.
  async function deleteQuote(id, businessUnit = null) {
    let q = sb.from('quotes').delete();
    q = isNumericId(id) ? q.eq('id', Number(id)) : q.eq('draft_sequence_id', id);
    if (businessUnit) q = q.eq('business_unit', businessUnit);
    const rows = must(await q.select('id'), 'deleteQuote');
    return rows.length > 0; // line items + revisions removed by ON DELETE CASCADE
  }

  // Pure function, unchanged from the SQLite version
  function buildCsv({ customer, parts, quoteNumber }) {
    const rows = Array.isArray(parts) ? parts : [];
    const header = ['Part Number', 'Description', 'Rev', 'Work Type', 'Sq. In. / Unit', 'Price / SI', 'Price / Unit', 'Qty', 'Total'];
    const csvRows = [header.join(',')];
    for (const part of rows) {
      const sqIn = Number(part.totalSurfaceAreaSqIn || part.sq_in_per_unit || 0);
      const qty = Number(part.quantity || 1);
      const pricePerSi = Number(part.pricePerSi || 0.4);
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
      csvRows.push(line.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(','));
    }
    return `Quote Number,${quoteNumber || 'QP26-0001'}\nCustomer,${customer?.company || customer?.contact || 'Standard Customer'}\n\n${csvRows.join('\n')}`;
  }

  return {
    getCurrentDraftSequenceId,
    getNextDraftSequenceId,
    advanceSequenceCounter,
    findDuplicateQuote,
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

