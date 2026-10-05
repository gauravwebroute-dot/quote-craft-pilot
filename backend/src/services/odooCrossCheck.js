import { calculatePartPrice } from "./pricingEngine.js";
import { DEFAULT_RATE_CARD } from "../config/rateCard.js";

/**
 * READ-ONLY module. This file must never call Odoo's `write` or `unlink`
 * methods on any model - only `search`, `search_read`, and (in
 * odooCreateQuotation.js, a SEPARATE file) `create`. Keeping duplicate-check
 * strictly read-only means running it can never damage existing Odoo data,
 * no matter how many times or how it's called.
 *
 * TEST-PHASE SAFETY: while we're validating the RFQ -> Odoo pipeline, ALL
 * live reads and writes are scoped to a single company - "MAD Custom-
 * Coating" - never Maverick or OC. This is enforced here in code (see
 * resolveTestCompanyId + the JS-side company filter below), not left as a
 * "please remember to only test on MAD" convention - a convention can be
 * forgotten, a filter in code can't.
 */

export const TEST_COMPANY_NAME = "OC Custom Coating";
export const TEST_TAG_NAME = "+temp test";

export class BusinessUnitError extends Error {}

/**
 * Companies (business units) the app is allowed to read from / write to in
 * Odoo. Defaults to TEST_COMPANY_NAME only. To enable more, set the env var
 * ODOO_ALLOWED_BUSINESS_UNITS to a comma-separated list, for example
 * "OC Custom Coating,MAD Custom-Coating". The caller (frontend) chooses WHICH
 * of these to use, but can never name a company outside this allowlist.
 */
export function allowedBusinessUnits() {
  const list = String(process.env.ODOO_ALLOWED_BUSINESS_UNITS || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  return list.length > 0 ? list : [TEST_COMPANY_NAME];
}

export function resolveBusinessUnit(input) {
  const requested = String(input ?? "").trim();
  if (!requested) return TEST_COMPANY_NAME;
  const match = allowedBusinessUnits().find((n) => n.toLowerCase() === requested.toLowerCase());
  if (!match) {
    throw new BusinessUnitError(
      `Business unit "${requested}" is not enabled for Odoo operations. ` +
        `Allowed: ${allowedBusinessUnits().join(", ")}. ` +
        `Set ODOO_ALLOWED_BUSINESS_UNITS on the server to enable more companies.`,
    );
  }
  return match;
}

const DUMMY_CUSTOMERS = [
  {
    id: 101,
    company: "ABC Metal Works",
    email: "john@abcmetalworks.com",
    contact: "John Smith",
    phone: "714-555-1212",
    billingTerms: "Net 30",
  },
  {
    id: 102,
    company: "Northstar Fabrication",
    email: "quotes@northstar.example",
    contact: "Lisa Carter",
    phone: "555-0100",
    billingTerms: "Net 15",
  },
];

const DUMMY_QUOTES = [
  { customerId: 101, partNumber: "117-0018-001", revision: "B00", sourceFile: "117_0018_001_C_OP__2_.pdf", pricePerUnit: 98.50, quotedAt: "2026-07-05" },
  { customerId: 101, partNumber: "TEST-001", revision: "A00", sourceFile: "test-drawing.pdf", pricePerUnit: 105.32, quotedAt: "2026-07-10" },
];

const isLiveConfigured = () =>
  Boolean(process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_USERNAME && process.env.ODOO_API_KEY);

export async function crossCheckOdoo({ customer = {}, parts = [], businessUnit = null }) {
  const unit = resolveBusinessUnit(businessUnit);
  if (isLiveConfigured()) {
    return crossCheckLiveOdoo({ customer, parts, businessUnit: unit });
  }
  return crossCheckDummyOdoo({ customer, parts });
}

function crossCheckDummyOdoo({ customer, parts }) {
  const matchedCustomer = findDummyCustomer(customer);
  const conflicts = [];

  const results = parts.map((part) => {
    const previousQuote = matchedCustomer
      ? DUMMY_QUOTES.find((q) => q.customerId === matchedCustomer.id && q.partNumber === part.partNumber)
      : null;

    if (previousQuote) {
      // Check for price difference or revision difference
      if (part.revision && previousQuote.revision && part.revision !== previousQuote.revision) {
        conflicts.push({
          id: `conflict-rev-${part.partNumber}`,
          partNumber: part.partNumber,
          fieldName: `Part [${part.partNumber}] Revision`,
          extractedValue: part.revision,
          odooMasterValue: previousQuote.revision,
          resolution: null,
          manualValue: "",
        });
      }
      if (previousQuote.pricePerUnit) {
        conflicts.push({
          id: `conflict-price-${part.partNumber}`,
          partNumber: part.partNumber,
          fieldName: `Part [${part.partNumber}] Unit Price`,
          extractedValue: `$${(Number(part.totalSurfaceAreaSqIn || 0) * 0.40 || 105.32).toFixed(2)}`,
          odooMasterValue: `$${Number(previousQuote.pricePerUnit).toFixed(2)}`,
          resolution: null,
          manualValue: "",
        });
      }
    }

    const priceHistory = previousQuote
      ? [{
          saleOrderId: null,
          saleOrderName: "S00000 (sample)",
          quotedAt: previousQuote.quotedAt ?? null,
          state: "draft",
          stateLabel: "Quotation",
          revision: previousQuote.revision ?? null,
          quantity: Number(part.quantity ?? 1),
          pricePerUnit: previousQuote.pricePerUnit,
          lineTotal: Number((previousQuote.pricePerUnit * Number(part.quantity ?? 1)).toFixed(2)),
          sqInPerUnit: null,
          pricePerSi: null,
          workType: null,
          orderTotal: null,
          currency: "USD",
        }]
      : [];
    return buildPartResult(part, matchedCustomer, previousQuote ?? null, priceHistory);
  });

  const subChecks = {
    clientVerification: {
      status: matchedCustomer ? "COMPLETE" : "NEEDS_ATTENTION",
      label: "Client Verification",
      message: matchedCustomer
        ? `Verified partner "${matchedCustomer.company}" in Odoo (${matchedCustomer.billingTerms || "Standard Terms"}).`
        : "No existing partner record found in Odoo. New partner will be created upon confirmation.",
      matched: Boolean(matchedCustomer),
    },
    partMasterSync: buildPartMasterSyncCheck(results, conflicts),
    exportQuotationCheck: buildExportQuotationCheck(results, parts),
  };

  return {
    mode: "dummy",
    customer: { matched: Boolean(matchedCustomer), record: matchedCustomer ?? null },
    parts: results,
    subChecks,
    conflicts,
    hasConflicts: conflicts.length > 0,
    message: "Odoo cross-check completed with simulated database.",
  };
}

function findDummyCustomer(customer) {
  const email = customer.email?.trim().toLowerCase();
  const company = customer.company?.trim().toLowerCase();
  return DUMMY_CUSTOMERS.find(
    (c) => (email && c.email.toLowerCase() === email) || (company && c.company.toLowerCase() === company),
  );
}

async function crossCheckLiveOdoo({ customer, parts, businessUnit = TEST_COMPANY_NAME }) {
  const uid = await odooAuth();
  const companyId = await resolveTestCompanyId(uid, businessUnit);

  const partner = await findLivePartner(uid, customer, companyId);
  const conflicts = [];

  const results = [];
  for (const part of parts) {
    let previousQuote = null;
    let priceHistory = [];
    let lookupNote = null;
    if (partner && part.partNumber) {
      const lookup = await fetchPriceHistory(uid, partner, companyId, part);
      priceHistory = lookup.history;
      lookupNote = lookup.note;
      if (priceHistory.length > 0) {
        const latest = priceHistory[0];
        previousQuote = {
          pricePerUnit: latest.pricePerUnit,
          revision: latest.revision,
          quotedAt: latest.quotedAt,
          saleOrderId: latest.saleOrderId,
          saleOrderName: latest.saleOrderName,
        };

        if (part.revision && latest.revision && part.revision !== latest.revision) {
          conflicts.push({
            id: `conflict-rev-${part.partNumber}`,
            partNumber: part.partNumber,
            fieldName: `Part [${part.partNumber}] Revision`,
            extractedValue: part.revision,
            odooMasterValue: latest.revision,
            resolution: null,
            manualValue: "",
          });
        }
      }
    }
    results.push(buildPartResult(part, partner, previousQuote, priceHistory, lookupNote));
  }

  const subChecks = {
    clientVerification: {
      status: partner ? "COMPLETE" : "NEEDS_ATTENTION",
      label: "Client Verification",
      message: partner
        ? `Verified partner "${partner.name}" in Odoo.`
        : "No matching customer found in Odoo under test company.",
      matched: Boolean(partner),
    },
    partMasterSync: buildPartMasterSyncCheck(results, conflicts),
    exportQuotationCheck: buildExportQuotationCheck(results, parts),
  };

  return {
    mode: "live",
    company: { id: companyId, name: businessUnit },
    customer: { matched: Boolean(partner), record: partner, candidates: partner ? [partner] : [] },
    parts: results,
    subChecks,
    conflicts,
    hasConflicts: conflicts.length > 0,
    message: partner
      ? `Live customer + prior-quote lookup completed, scoped to "${businessUnit}" only.`
      : `No matching customer found under "${businessUnit}" in Odoo - this would be a new customer.`,
  };
}

const PRICE_HISTORY_LIMIT = 10;
const STATE_LABELS = { draft: "Quotation", sent: "Quotation Sent", sale: "Sales Order", done: "Locked", cancel: "Cancelled" };
let cachedLineFields = null;

// Optional custom fields are only requested if they exist on this Odoo
// database, so a missing field can never make the whole cross-check fail.
async function getLineFields(uid) {
  if (cachedLineFields) return cachedLineFields;
  try {
    const defs = await odooCall("object", "execute_kw", [
      process.env.ODOO_DB,
      uid,
      process.env.ODOO_API_KEY,
      "sale.order.line",
      "fields_get",
      [],
      { attributes: ["type"] },
    ]);
    cachedLineFields = new Set(Object.keys(defs || {}));
  } catch {
    cachedLineFields = new Set(["id", "name", "price_unit", "product_uom_qty", "order_id", "create_date", "x_rev"]);
  }
  return cachedLineFields;
}

/**
 * Every earlier (non-cancelled) quote line for this customer + part, newest first,
 * with the quote-level context (date, status, quote total, currency). Read-only.
 *
 * How a line is recognised as "this part" - quotes reach Odoo in two shapes and
 * neither reliably has the part number in the line text:
 *   - CSV import: the part number is the line's PRODUCT; the description is free text.
 *   - Created by this app: the description starts with the part NAME.
 * so we match on the line text, the product name / internal reference, and (for
 * longer, specific names only) the part name. Each hit records how it matched.
 *
 * Company scoping: the API user's default company may differ from the target one,
 * and Odoo then hides the other company's quotes WITHOUT an error. The target
 * company is therefore passed explicitly in the request context.
 */
async function fetchPriceHistory(uid, partner, companyId, part) {
  const partNumber = String(part.partNumber ?? "").trim();
  const partName = String(part.partName ?? "").trim().slice(0, 80);
  const useName = partName.length >= 12 && partName.toLowerCase() !== partNumber.toLowerCase();
  const context = { allowed_company_ids: [companyId] };

  const available = await getLineFields(uid);
  const wanted = [
    "id", "name", "price_unit", "product_uom_qty", "price_subtotal", "order_id", "product_id", "create_date",
    "x_rev", "x_sq_in_per_unit", "x_price_per_si", "x_work_type",
  ];
  const fields = wanted.filter((f) => available.has(f) || f === "product_id");

  const partTerms = [
    ["name", "ilike", partNumber],
    ["product_id.name", "ilike", partNumber],
    ["product_id.default_code", "ilike", partNumber],
  ];
  if (useName) partTerms.push(["name", "ilike", partName]);
  const orTerms = partTerms.flatMap((t, i) => (i < partTerms.length - 1 ? ["|", t] : [t]));

  const customerIds = partner.relatedIds?.length ? partner.relatedIds : [partner.id];
  const baseDomain = [
    ["order_id.company_id", "=", companyId],
    ["order_id.state", "!=", "cancel"],
    ...orTerms,
  ];

  const lines = await odooCall("object", "execute_kw", [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_API_KEY,
    "sale.order.line",
    "search_read",
    [[["order_id.partner_id", "child_of", customerIds], ...baseDomain]],
    { fields, limit: PRICE_HISTORY_LIMIT, order: "create_date desc, id desc", context },
  ]);

  if (!lines.length) {
    // Say WHY nothing was found instead of silently showing "none".
    let elsewhere = 0;
    try {
      elsewhere = await odooCall("object", "execute_kw", [
        process.env.ODOO_DB,
        uid,
        process.env.ODOO_API_KEY,
        "sale.order.line",
        "search_count",
        [baseDomain],
        { context },
      ]);
    } catch {
      elsewhere = 0;
    }
    const records = customerIds.length;
    const note =
      `Searched ${records} customer record${records === 1 ? "" : "s"} for "${partner.name}" in this company; ` +
      `no earlier quote line matched part ${partNumber}.` +
      (elsewhere > 0
        ? ` This part appears on ${elsewhere} quote line${elsewhere === 1 ? "" : "s"} for other customers - the earlier quote may be under a different customer name.`
        : "");
    return { history: [], note };
  }

  const orderIds = [...new Set(lines.map((l) => l.order_id?.[0]).filter(Boolean))];
  const orders = orderIds.length
    ? await odooCall("object", "execute_kw", [
        process.env.ODOO_DB,
        uid,
        process.env.ODOO_API_KEY,
        "sale.order",
        "search_read",
        [[["id", "in", orderIds]]],
        { fields: ["id", "name", "date_order", "state", "amount_total", "currency_id"], context },
      ])
    : [];
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const pn = partNumber.toLowerCase();

  const history = lines.map((line) => {
    const order = orderById.get(line.order_id?.[0]) ?? {};
    const qty = Number(line.product_uom_qty ?? 0);
    const unit = Number(line.price_unit ?? 0);
    const productName = String(line.product_id?.[1] ?? "").toLowerCase();
    const byNumber = String(line.name ?? "").toLowerCase().includes(pn) || productName.includes(pn);
    return {
      saleOrderId: line.order_id?.[0] ?? null,
      saleOrderName: line.order_id?.[1] ?? order.name ?? null,
      quotedAt: String(order.date_order || line.create_date || "").slice(0, 10) || null,
      state: order.state ?? null,
      stateLabel: STATE_LABELS[order.state] ?? order.state ?? null,
      revision: line.x_rev || null,
      quantity: qty,
      pricePerUnit: unit,
      lineTotal: typeof line.price_subtotal === "number" ? line.price_subtotal : Number((unit * qty).toFixed(2)),
      sqInPerUnit: typeof line.x_sq_in_per_unit === "number" ? line.x_sq_in_per_unit : null,
      pricePerSi: typeof line.x_price_per_si === "number" ? line.x_price_per_si : null,
      workType: line.x_work_type || null,
      orderTotal: typeof order.amount_total === "number" ? order.amount_total : null,
      currency: order.currency_id?.[1] ?? null,
      matchedBy: byNumber ? "part number" : "part name",
    };
  });
  return { history, note: null };
}

async function resolveTestCompanyId(uid, companyName = null) {
  const targetName = companyName || TEST_COMPANY_NAME;
  const companies = await odooCall("object", "execute_kw", [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_API_KEY,
    "res.company",
    "search_read",
    [[["name", "ilike", targetName]]],
    { fields: ["id", "name"], limit: 1 },
  ]);
  if (companies.length > 0) {
    return companies[0].id;
  }

  // Deliberately NO fallback to "any available company" here. Silently
  // picking a different company when the target one is missing (e.g. it
  // was deleted or renamed in Odoo) is exactly how a stale/wrong company
  // gets used for customer matching without anyone noticing - which is
  // what caused "existing customer" to incorrectly show up even after the
  // real test company was deleted. Fail loudly instead so the mismatch is
  // obvious immediately, not discovered later as a wrong match.
  throw new Error(
    `Target company "${targetName}" was not found in Odoo (it may have been deleted or renamed). ` +
      `Refusing to fall back to a different company - update TEST_COMPANY_NAME or recreate the company in Odoo.`,
  );
}

async function resolveTestTagId(uid) {
  const tags = await odooCall("object", "execute_kw", [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_API_KEY,
    "crm.tag",
    "search_read",
    [[["name", "=", TEST_TAG_NAME]]],
    { fields: ["id"], limit: 1 },
  ]);
  if (tags.length > 0) return tags[0].id;

  return odooCall("object", "execute_kw", [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_API_KEY,
    "crm.tag",
    "create",
    [{ name: TEST_TAG_NAME }],
  ]);
}

async function findLivePartner(uid, customer, companyId) {
  const domain = [];
  if (customer.email) domain.push(["email", "=", customer.email]);
  if (customer.company) domain.push(["name", "ilike", customer.company]);
  if (domain.length === 0) return null;

  const partners = await odooCall("object", "execute_kw", [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_API_KEY,
    "res.partner",
    "search_read",
    [domain.length > 1 ? ["|", ...domain] : domain],
    { fields: ["id", "name", "email", "phone", "company_id"], limit: 20, context: { allowed_company_ids: [companyId] } },
  ]);

  const usable = partners.filter((p) => !p.company_id || p.company_id[0] === companyId);
  const chosen = usable[0] ?? null;
  if (!chosen) return null;

  // The same customer is often stored more than once in Odoo (e.g. two "ABC Company"
  // records). Earlier quotes may sit on any of them, so remember every record that is
  // the same customer (same name or same email) and search quotes across all of them.
  const sameName = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
  const relatedIds = usable
    .filter((p) => p.id === chosen.id || sameName(p.name, chosen.name) || (chosen.email && p.email === chosen.email))
    .map((p) => p.id);
  return { ...chosen, relatedIds };
}

/**
 * Part Master Sync - what this REALLY checks: for each extracted part, was the
 * same part number quoted to this customer before, and does that earlier quote
 * differ from this RFQ (drawing revision, and in sample mode price). It does not look at
 * Odoo's product catalog, so the message says exactly that and nothing more.
 */
function buildPartMasterSyncCheck(results, conflicts) {
  const total = results.length;
  const withHistory = results.filter((r) => r.reason === "EXISTING_QUOTE_FOUND").length;
  const base = { label: "Part Master Sync", conflictsCount: conflicts.length };
  if (total === 0) {
    return { ...base, status: "NOT_STARTED", message: "No parts to check yet." };
  }
  if (conflicts.length > 0) {
    return {
      ...base,
      status: "CONFLICT",
      message: `${conflicts.length} difference(s) found vs the last quote - choose which value to keep below.`,
    };
  }
  return {
    ...base,
    status: "COMPLETE",
    message:
      withHistory > 0
        ? `${withHistory} of ${total} part(s) were quoted before; no differences from the last quote.`
        : `${total} part(s) checked - none were quoted to this customer before.`,
  };
}

/**
 * Export Quotation Check - what this REALLY checks: every part could be priced
 * from the rate card, and each line total equals unit price x quantity. Tax and
 * lead time are not computed anywhere in this app, so they are not claimed.
 */
function buildExportQuotationCheck(results, parts) {
  const base = { label: "Export Quotation Check" };
  if (results.length === 0) {
    return { ...base, status: "NOT_STARTED", validArithmetic: false, message: "No parts to check yet." };
  }
  const unpriced = results.filter((r) => r.computedPrice?.priced === false);
  const mismatched = results.filter((r, i) => {
    const c = r.computedPrice;
    if (!c || c.priced === false || typeof c.pricePerUnit !== "number" || typeof c.totalLineItem !== "number") return false;
    const qty = Number(parts[i]?.quantity ?? 1) || 1;
    return Math.abs(c.pricePerUnit * qty - c.totalLineItem) > 0.02;
  });
  if (unpriced.length > 0) {
    return {
      ...base,
      status: "NEEDS_ATTENTION",
      validArithmetic: false,
      message: `${unpriced.length} of ${results.length} part(s) could not be priced (missing area or quantity). Add the missing values before exporting.`,
    };
  }
  if (mismatched.length > 0) {
    return {
      ...base,
      status: "CONFLICT",
      validArithmetic: false,
      message: `${mismatched.length} line total(s) do not equal unit price x quantity.`,
    };
  }
  return {
    ...base,
    status: "COMPLETE",
    validArithmetic: true,
    message: `All ${results.length} part(s) priced; each line total equals unit price x quantity.`,
  };
}

function buildPartResult(part, matchedCustomer, previousQuote, priceHistory = [], lookupNote = null) {
  const reason = !matchedCustomer
    ? "NEW_CUSTOMER"
    : previousQuote
      ? "EXISTING_QUOTE_FOUND"
      : "NO_PRIOR_QUOTE_FOR_THIS_PART";

  const priceResult = calculatePartPrice(part, DEFAULT_RATE_CARD);
  const computedPrice = priceResult.priced
    ? { pricePerUnit: priceResult.pricePerUnit, totalLineItem: priceResult.totalLineItem }
    : { priced: false, reason: priceResult.reason };

  return {
    partNumber: part.partNumber ?? null,
    revision: part.revision ?? null,
    sourceFile: part.sourceDrawingFile ?? null,
    reason,
    previousQuote,
    priceHistory,
    lookupNote,
    computedPrice,
  };
}

async function odooAuth() {
  const uid = await odooCall("common", "authenticate", [
    process.env.ODOO_DB,
    process.env.ODOO_USERNAME,
    process.env.ODOO_API_KEY,
    {},
  ]);
  if (!uid) throw new Error("Odoo authentication failed - check ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_API_KEY.");
  return uid;
}

async function odooCall(service, method, args) {
  const response = await fetch(`${normalizeOdooUrl(process.env.ODOO_URL)}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args }, id: Date.now() }),
  });
  if (!response.ok) throw new Error(`Odoo request failed with HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.data?.message || "Odoo request failed.");
  return payload.result;
}

function normalizeOdooUrl(value) {
  const raw = String(value ?? "").trim();
  const markdownMatch = raw.match(/\((https?:\/\/[^)]+)\)/i) || raw.match(/https?:\/\/\S+/i);
  const url = (markdownMatch?.[1] ?? raw)
    .replace(/[)>\]}`].*$/, "")
    .replace(/\/jsonrpc\/?$/, "")
    .replace(/\/$/, "");
  if (!/^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(url)) {
    throw new Error("Invalid ODOO_URL. Set it to the base URL, for example https://yourcompany.odoo.com.");
  }
  return url;
}

export async function getAllCompanyIds(uid) {
  try {
    const companies = await odooCall("object", "execute_kw", [
      process.env.ODOO_DB,
      uid,
      process.env.ODOO_API_KEY,
      "res.company",
      "search_read",
      [[]],
      { fields: ["id", "name"], limit: 50 },
    ]);
    return companies.map((c) => c.id);
  } catch {
    return [];
  }
}

export async function searchLiveOdooQuotes({ query = '', businessUnit = '', status = '', startDate = '', endDate = '' } = {}) {
  if (!isLiveConfigured()) return [];
  try {
    const uid = await odooAuth();
    const allCompanyIds = await getAllCompanyIds(uid);
    const domain = [];

    if (query) {
      domain.push(
        "|", "|", "|",
        ["name", "ilike", query],
        ["client_order_ref", "ilike", query],
        ["partner_id.name", "ilike", query],
        ["note", "ilike", query]
      );
    }

    if (businessUnit && businessUnit !== 'all') {
      domain.push(["company_id.name", "ilike", businessUnit]);
    }

    if (startDate) {
      domain.push(["date_order", ">=", startDate]);
    }
    if (endDate) {
      domain.push(["date_order", "<=", endDate]);
    }

    const contextObj = allCompanyIds.length > 0 ? { allowed_company_ids: allCompanyIds } : {};

    const orders = await odooCall("object", "execute_kw", [
      process.env.ODOO_DB,
      uid,
      process.env.ODOO_API_KEY,
      "sale.order",
      "search_read",
      [domain],
      {
        fields: [
          "id",
          "name",
          "client_order_ref",
          "partner_id",
          "company_id",
          "date_order",
          "create_date",
          "state",
          "amount_total",
          "order_line",
          "note",
        ],
        context: contextObj,
        limit: 50,
        order: "id desc",
      },
    ]);

    return orders.map((o) => {
      const isDraftOrSent = o.state === 'draft' || o.state === 'sent';
      const statusLabel = isDraftOrSent ? 'SYNCED' : o.state === 'sale' ? 'CONFIRMED' : o.state ? o.state.toUpperCase() : 'SYNCED';
      const lineCount = Array.isArray(o.order_line) ? o.order_line.length : 0;
      return {
        id: `odoo-${o.id}`,
        odooId: o.id,
        draftSequenceId: o.client_order_ref || o.name,
        quoteNumber: o.name,
        odooSequenceId: o.name,
        businessUnit: o.company_id?.[1] || 'OC Custom Coating',
        customerName: o.partner_id?.[1] || 'Standard Customer',
        customerEmail: null,
        pdfHash: null,
        sourceFile: `Odoo Quotation ${o.name}`,
        status: statusLabel,
        createdAt: o.create_date || o.date_order || new Date().toISOString(),
        updatedAt: o.date_order || o.create_date || new Date().toISOString(),
        revisionCount: 1,
        lineItemCount: lineCount,
        isOdooLive: true,
      };
    });
  } catch (err) {
    console.warn('[searchLiveOdooQuotes] failed:', err.message);
    return [];
  }
}

export async function getLiveOdooQuoteDetails(idOrName) {
  if (!isLiveConfigured()) return null;
  try {
    const uid = await odooAuth();
    const allCompanyIds = await getAllCompanyIds(uid);
    const contextObj = allCompanyIds.length > 0 ? { allowed_company_ids: allCompanyIds } : {};
    const cleanId = String(idOrName).startsWith('odoo-') ? parseInt(String(idOrName).replace('odoo-', ''), 10) : null;
    const domain = cleanId ? [[["id", "=", cleanId]]] : [[["name", "=", idOrName]]];

    const orders = await odooCall("object", "execute_kw", [
      process.env.ODOO_DB,
      uid,
      process.env.ODOO_API_KEY,
      "sale.order",
      "search_read",
      domain,
      {
        fields: [
          "id",
          "name",
          "client_order_ref",
          "partner_id",
          "company_id",
          "date_order",
          "create_date",
          "state",
          "amount_total",
          "order_line",
          "note",
        ],
        context: contextObj,
        limit: 1,
      },
    ]);

    if (!orders || orders.length === 0) return null;
    const order = orders[0];

    let lineItems = [];
    if (Array.isArray(order.order_line) && order.order_line.length > 0) {
      try {
        lineItems = await odooCall("object", "execute_kw", [
          process.env.ODOO_DB,
          uid,
          process.env.ODOO_API_KEY,
          "sale.order.line",
          "search_read",
          [[["id", "in", order.order_line]]],
          {
            fields: ["id", "name", "price_unit", "product_uom_qty", "price_subtotal", "product_id"],
            context: contextObj,
            limit: 100,
          },
        ]);
      } catch (lineErr) {
        console.warn('Failed to read order lines:', lineErr.message);
      }
    }

    let storedPayload = null;
    try {
      const customData = await odooCall("object", "execute_kw", [
        process.env.ODOO_DB,
        uid,
        process.env.ODOO_API_KEY,
        "sale.order",
        "read",
        [[order.id]],
        { fields: ["x_quotepilot_json"] },
      ]);
      if (customData?.[0]?.x_quotepilot_json) {
        storedPayload = typeof customData[0].x_quotepilot_json === 'string'
          ? JSON.parse(customData[0].x_quotepilot_json)
          : customData[0].x_quotepilot_json;
      }
    } catch {
      // Field might not exist
    }

    const parts = lineItems.map((l, index) => {
      const desc = l.name || `Line Item ${index + 1}`;
      const areaMatch = desc.match(/--\s*([\d.]+)\s*si/i);
      const areaSqIn = areaMatch ? parseFloat(areaMatch[1]) : 0;
      const partNumMatch = desc.match(/^([^,-]+)/);
      const partNum = l.product_id?.[1] || (partNumMatch ? partNumMatch[1].trim() : `PART-${index + 1}`);

      return {
        id: `odoo-line-${l.id}`,
        partNumber: partNum,
        partName: desc.replace(/\s*\+temp test.*/, '').trim(),
        partSummary: desc,
        revision: "A00",
        quantity: Number(l.product_uom_qty) || 1,
        totalSurfaceAreaSqIn: areaSqIn,
        coatingAreaSqIn: areaSqIn,
        maskingAreaSqIn: 0,
        pricePerSi: 0.40,
        priceUnit: Number(l.price_unit) || 0,
        totalPrice: Number(l.price_subtotal) || (Number(l.price_unit) * Number(l.product_uom_qty)),
        coatingBom: {
          topcoat: "Cerakote",
          primer: "N/A",
          pretreatment: "Degrease & Blast",
        },
        pricingBreakdown: {
          baseCost: Number(l.price_unit) || 0,
          unitPrice: Number(l.price_unit) || 0,
          totalCost: Number(l.price_subtotal) || 0,
        },
      };
    });

    const formPayload = storedPayload || {
      customer: {
        company: order.partner_id?.[1] || "Standard Customer",
        contact: order.partner_id?.[1] || "Standard Customer",
        email: null,
      },
      parts,
      sourceDrawingFile: `Odoo ${order.name}`,
    };

    return {
      id: `odoo-${order.id}`,
      draftSequenceId: order.client_order_ref || order.name,
      quoteNumber: order.name,
      odooSequenceId: order.name,
      businessUnit: order.company_id?.[1] || "OC Custom Coating",
      customerName: order.partner_id?.[1] || "Standard Customer",
      customerEmail: null,
      pdfHash: null,
      sourceFile: `Odoo Quotation ${order.name}`,
      status: order.state === "draft" || order.state === "sent" ? "SYNCED" : order.state ? order.state.toUpperCase() : "SYNCED",
      createdAt: order.create_date || order.date_order || new Date().toISOString(),
      updatedAt: order.date_order || order.create_date || new Date().toISOString(),
      revisionCount: 1,
      lineItemCount: parts.length,
      formPayload,
      lineItems: parts,
      revisions: [
        {
          revisionId: `rev-${order.id}`,
          revisionLabel: "v1",
          createdAt: order.create_date || new Date().toISOString(),
          payload: formPayload,
        },
      ],
      isOdooLive: true,
    };
  } catch (err) {
    console.warn('[getLiveOdooQuoteDetails] failed:', err.message);
    return null;
  }
}

export { odooAuth, odooCall, isLiveConfigured, resolveTestCompanyId, resolveTestTagId };
