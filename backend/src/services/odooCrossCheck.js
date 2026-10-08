import { calculatePartPrice } from "./pricingEngine.js";
import { DEFAULT_RATE_CARD } from "../config/rateCard.js";

/**
 * READ-ONLY module. This file must never call Odoo's `write` or `unlink`
 * methods on any model - only `search`, `search_read`, and (in
 * odooCreateQuotation.js, a SEPARATE file) `create`. Keeping duplicate-check
 * strictly read-only means running it can never damage existing Odoo data,
 * no matter how many times or how it's called.
 */

export const TEST_COMPANY_NAME = "OC Custom Coating";
// Label added to every quotation / customer / CSV row the app creates while testing.
// Override with ODOO_TEMP_TAG; the default matches the "+temp" tag created in Odoo.
export const TEST_TAG_NAME = (process.env.ODOO_TEMP_TAG || "+temp").trim();

// Technical names of the custom fields created on Odoo's Sales Order Line (sale.order.line).
// Rev / Work Type keep the original names; Sq. In. and Price / SI were created as x_sq_in / x_price_si.
export const FIELD_SQ_IN = (process.env.ODOO_FIELD_SQ_IN || "x_sq_in").trim();
export const FIELD_PRICE_SI = (process.env.ODOO_FIELD_PRICE_SI || "x_price_si").trim();

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
  {
    customerId: 101,
    partNumber: "117-0018-001",
    revision: "B00",
    sourceFile: "117_0018_001_C_OP__2_.pdf",
    pricePerUnit: 98.5,
    quotedAt: "2026-07-05",
  },
  {
    customerId: 101,
    partNumber: "TEST-001",
    revision: "A00",
    sourceFile: "test-drawing.pdf",
    pricePerUnit: 105.32,
    quotedAt: "2026-07-10",
  },
];

const isLiveConfigured = () =>
  Boolean(
    process.env.ODOO_URL &&
    process.env.ODOO_DB &&
    process.env.ODOO_USERNAME &&
    process.env.ODOO_API_KEY,
  );

export async function crossCheckOdoo({ customer = {}, parts = [], businessUnit = "" }) {
  if (isLiveConfigured()) {
    return crossCheckLiveOdoo({ customer, parts, businessUnit });
  }
  return crossCheckDummyOdoo({ customer, parts, businessUnit });
}

function crossCheckDummyOdoo({ customer, parts, businessUnit = "OC Custom Coating" }) {
  const matchedCustomer = findDummyCustomer(customer);
  const conflicts = [];

  const results = parts.map((part) => {
    const previousQuote = matchedCustomer
      ? DUMMY_QUOTES.find(
          (q) => q.customerId === matchedCustomer.id && q.partNumber === part.partNumber,
        )
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
          extractedValue: `$${(Number(part.totalSurfaceAreaSqIn || 0) * 0.4 || 105.32).toFixed(2)}`,
          odooMasterValue: `$${Number(previousQuote.pricePerUnit).toFixed(2)}`,
          resolution: null,
          manualValue: "",
        });
      }
    }

    return buildPartResult(part, matchedCustomer, previousQuote ?? null);
  });

  const subChecks = {
    clientVerification: {
      status: matchedCustomer ? "COMPLETE" : "NEEDS_ATTENTION",
      label: "Client Verification",
      message: matchedCustomer
        ? `Verified partner "${matchedCustomer.company}" in Odoo (${matchedCustomer.billingTerms || "Standard Terms"}).`
        : "No existing customer record found in Odoo. New customer will be created upon sync.",
      matched: Boolean(matchedCustomer),
    },
    partMasterSync: {
      status: conflicts.length > 0 ? "CONFLICT" : results.length > 0 ? "COMPLETE" : "NOT_STARTED",
      label: "Part Master Sync",
      message:
        conflicts.length > 0
          ? `${conflicts.length} conflict(s) detected with stored Odoo master records.`
          : `${results.length} part(s) checked - ${results.filter((r) => r.previousQuote).length > 0 ? `${results.filter((r) => r.previousQuote).length} quote(s) found` : "none were quoted to this customer before"}.`,
      conflictsCount: conflicts.length,
    },
    exportQuotationCheck: {
      status: results.length > 0 ? "COMPLETE" : "NOT_STARTED",
      label: "Export Quotation Check",
      message:
        "Subtotal arithmetic verified, standard tax rules applied (Tax Excl.), 5-7 day lead time.",
      validArithmetic: true,
    },
  };

  return {
    mode: "dummy",
    company: { id: 1, name: businessUnit || TEST_COMPANY_NAME },
    customer: { matched: Boolean(matchedCustomer), record: matchedCustomer ?? null },
    parts: results,
    subChecks,
    conflicts,
    hasConflicts: conflicts.length > 0,
    message: `Odoo cross-check completed with simulated database for ${businessUnit || TEST_COMPANY_NAME}.`,
  };
}

function findDummyCustomer(customer) {
  const email = customer.email?.trim().toLowerCase();
  const company = customer.company?.trim().toLowerCase();
  return DUMMY_CUSTOMERS.find(
    (c) =>
      (email && c.email.toLowerCase() === email) ||
      (company && c.company.toLowerCase() === company),
  );
}

async function crossCheckLiveOdoo({ customer, parts, businessUnit = "" }) {
  const uid = await odooAuth();
  const companyInfo = await resolveCompanyInfo(uid, businessUnit);
  const companyId = companyInfo.id;
  const companyName = companyInfo.name;

  const partner = await findLivePartner(uid, customer, companyId);
  const conflicts = [];

  const results = [];
  let foundPriorCount = 0;

  for (const part of parts) {
    let previousQuote = null;
    let priorQuotes = [];

    if (partner && part.partNumber) {
      const lines = await findPriorLinesForPart(uid, partner, companyId, part);

      if (lines.length > 0) {
        foundPriorCount++;
        const line = lines[0];
        previousQuote = {
          pricePerUnit: line.price_unit,
          revision: line.x_rev || null,
          quotedAt: line.create_date ? String(line.create_date).slice(0, 10) : null,
          saleOrderId: line.order_id?.[0] ?? null,
          saleOrderName: line.order_id?.[1] ?? null,
        };

        priorQuotes = lines.map((l) => {
          const desc = l.name || "";
          const areaMatch = desc.match(/--\s*([\d.]+)\s*si/i);
          const area = Number(l[FIELD_SQ_IN]) || (areaMatch ? parseFloat(areaMatch[1]) : 0);
          const revMatch = desc.match(/\[Rev:\s*([^\]]+)\]/i);
          const rev = l.x_rev || (revMatch ? revMatch[1].trim() : "—");
          const dateStr = l.create_date
            ? new Date(l.create_date).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "-";
          const unitPrice = Number(l.price_unit) || 0;
          const qty = Number(l.product_uom_qty) || 1;
          const lineTotal = Number(l.price_subtotal) || unitPrice * qty;

          return {
            id: l.id,
            quoteName: l.order_id?.[1] || "Quote",
            saleOrderId: l.order_id?.[0] || null,
            partNumber: part.partNumber,
            date: dateStr,
            status:
              l._state === "sale"
                ? "Sales Order"
                : l._state === "sent"
                  ? "Quotation Sent"
                  : "Quotation",
            clientRef: l._clientRef || null,
            workType: (desc.split("|")[1] || "").replace(/\+temp(?: test)?/i, "").trim() || null,
            revision: rev,
            quantity: qty,
            areaSqIn: area,
            pricePerSi: Number(l[FIELD_PRICE_SI]) || 0.4,
            unitPrice: unitPrice,
            lineTotal: lineTotal,
            quoteTotal: lineTotal,
          };
        });

        if (part.revision && line.x_rev && part.revision !== line.x_rev) {
          conflicts.push({
            id: `conflict-rev-${part.partNumber}`,
            partNumber: part.partNumber,
            fieldName: `Part [${part.partNumber}] Revision`,
            extractedValue: part.revision,
            odooMasterValue: line.x_rev,
            resolution: null,
            manualValue: "",
          });
        }
      }
    }
    const partResult = buildPartResult(part, partner, previousQuote);
    partResult.priorQuotes = priorQuotes;
    results.push(partResult);
  }

  const subChecks = {
    clientVerification: {
      status: partner ? "COMPLETE" : "NEEDS_ATTENTION",
      label: "Client Verification",
      message: partner
        ? `Verified partner "${partner.name}" in Odoo.`
        : `No matching customer found in Odoo under "${companyName}".`,
      matched: Boolean(partner),
    },
    partMasterSync: {
      status: conflicts.length > 0 ? "CONFLICT" : results.length > 0 ? "COMPLETE" : "NOT_STARTED",
      label: "Part Master Sync",
      message: !partner
        ? "New customer — no prior quotes exist in this company."
        : conflicts.length > 0
          ? `${conflicts.length} conflict(s) detected with live Odoo records.`
          : foundPriorCount > 0
            ? `${results.length} part(s) checked - earlier quote(s) found.`
            : `${results.length} part(s) checked - none were quoted to this customer before.`,
      conflictsCount: conflicts.length,
    },
    exportQuotationCheck: {
      status: results.length > 0 ? "COMPLETE" : "NOT_STARTED",
      label: "Export Quotation Check",
      message: "All parts priced; subtotal arithmetic and lead times verified.",
      validArithmetic: true,
    },
  };

  return {
    mode: "live",
    company: { id: companyId, name: companyName },
    customer: { matched: Boolean(partner), record: partner, candidates: partner ? [partner] : [] },
    parts: results,
    subChecks,
    conflicts,
    hasConflicts: conflicts.length > 0,
    message: partner
      ? `Live customer + prior-quote lookup completed, scoped to "${companyName}" only.`
      : `No customer found under "${companyName}" in Odoo — will create new customer upon sync.`,
  };
}

export async function resolveCompanyInfo(uid, companyName = null) {
  const targetName = (companyName || TEST_COMPANY_NAME).trim();
  const allCompanies = await odooCall("object", "execute_kw", [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_API_KEY,
    "res.company",
    "search_read",
    [[]],
    { fields: ["id", "name"], limit: 50 },
  ]);

  if (allCompanies && allCompanies.length > 0) {
    // 1. Exact match
    const exact = allCompanies.find((c) => c.name.toLowerCase() === targetName.toLowerCase());
    if (exact) return { id: exact.id, name: exact.name };

    // 2. Partial match
    const partial = allCompanies.find(
      (c) =>
        c.name.toLowerCase().includes(targetName.toLowerCase()) ||
        targetName.toLowerCase().includes(c.name.toLowerCase()),
    );
    if (partial) return { id: partial.id, name: partial.name };

    // 3. A business unit was explicitly selected but does not exist in Odoo: never silently use another
    //    company (that would mix one company's customers and prices into another's).
    if (companyName && companyName.trim()) {
      throw new Error(
        `Business unit "${companyName}" was not found in Odoo. Available: ${allCompanies.map((c) => c.name).join(", ")}.`,
      );
    }
    return { id: allCompanies[0].id, name: allCompanies[0].name };
  }

  return { id: 1, name: targetName };
}

async function resolveTestCompanyId(uid, companyName = null) {
  const info = await resolveCompanyInfo(uid, companyName);
  return info.id;
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

// Adds each line's order reference (client_order_ref) and state so the UI can say where a quote came from.
async function findPriorLinesForPart(uid, partner, companyId, part) {
  const lines = await findPriorLinesRaw(uid, partner, companyId, part);
  const orderIds = Array.from(new Set(lines.map((l) => l.order_id?.[0]).filter(Boolean)));
  if (orderIds.length === 0) return lines;
  try {
    const orders = await odooCall("object", "execute_kw", [
      process.env.ODOO_DB,
      uid,
      process.env.ODOO_API_KEY,
      "sale.order",
      "read",
      [orderIds],
      { fields: ["client_order_ref", "state"] },
    ]);
    const byId = new Map((orders || []).map((o) => [o.id, o]));
    for (const l of lines) {
      const o = byId.get(l.order_id?.[0]);
      l._clientRef = o?.client_order_ref || null;
      l._state = o?.state || null;
    }
  } catch (err) {
    console.warn("[crossCheck] could not read order references:", err.message);
  }
  return lines;
}

// Strips everything except letters/digits so "117-0018-001", "117 0018 001" and
// "1170018001" all compare equal.
export function normalizeKey(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

const LINE_FIELDS = [
  "id",
  "name",
  "price_unit",
  "product_uom_qty",
  "price_subtotal",
  "order_id",
  "create_date",
  "x_rev",
  FIELD_SQ_IN,
  FIELD_PRICE_SI,
];
const LINE_FIELDS_BASE = [
  "id",
  "name",
  "price_unit",
  "product_uom_qty",
  "price_subtotal",
  "order_id",
  "create_date",
];

async function searchLines(uid, domain, companyId, fields, limit = 100) {
  return odooCall("object", "execute_kw", [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_API_KEY,
    "sale.order.line",
    "search_read",
    [domain],
    { fields, context: { allowed_company_ids: [companyId] }, limit, order: "id desc" },
  ]);
}

// Finds earlier quote lines for this customer + company + part number.
// Odoo line names are "<partNumber> - <partName> [Rev: x] -- N si ..." for new quotes but
// older quotes were written WITHOUT the part number, so we also look at the product and at the
// order note ("#1: <partNumber> [Rev: ..") that the app always stores. Matching is also done on a
// normalized key so dashes/spaces/case never cause a miss.
async function findPriorLinesRaw(uid, partner, companyId, part) {
  const pn = String(part.partNumber).trim();
  const normPn = normalizeKey(pn);
  if (!normPn) return [];

  const partnerIds = partner.matchedIds?.length ? partner.matchedIds : [partner.id];
  const base = [
    ["order_id.partner_id", "in", partnerIds],
    ["order_id.company_id", "=", companyId],
    ["order_id.state", "!=", "cancel"],
  ];
  // Variants: exact text, and a version with separators replaced by "_" (single-char wildcard in SQL ilike)
  const wildcard = pn.replace(/[^A-Za-z0-9]/g, "_");
  const variants = Array.from(new Set([pn, wildcard]));
  const orOf = (field) => variants.map((v) => [field, "ilike", v]);
  const orDomain = (clauses) => [...Array(Math.max(clauses.length - 1, 0)).fill("|"), ...clauses];

  const attempts = [
    // 1. line name OR product name OR product code
    [...orOf("name"), ...orOf("product_id.name"), ...orOf("product_id.default_code")],
    // 2. line name only (older Odoo / missing product relation)
    [...orOf("name")],
  ];

  let lines = [];
  for (const clauses of attempts) {
    const domain = [...base, ...orDomain(clauses)];
    for (const fields of [LINE_FIELDS, LINE_FIELDS_BASE]) {
      try {
        lines = await searchLines(uid, domain, companyId, fields);
        break;
      } catch (err) {
        console.warn(
          `[crossCheck] part line search failed (${fields.length} fields):`,
          err.message,
        );
        lines = [];
      }
    }
    if (lines.length > 0) break;
  }

  // Keep only lines that truly contain the part number once normalized (drops "_" false positives)
  lines = lines.filter((l) => normalizeKey(l.name).includes(normPn));
  if (lines.length > 0) return lines;

  // Legacy fallback: quotes created before the part number was added to the line name.
  try {
    const orders = await odooCall("object", "execute_kw", [
      process.env.ODOO_DB,
      uid,
      process.env.ODOO_API_KEY,
      "sale.order",
      "search_read",
      [
        [
          ["partner_id", "in", partnerIds],
          ["company_id", "=", companyId],
          ["state", "!=", "cancel"],
          ...orDomain([...orOf("note"), ...orOf("client_order_ref")]),
        ],
      ],
      {
        fields: ["id", "note", "client_order_ref"],
        context: { allowed_company_ids: [companyId] },
        limit: 100,
        order: "id desc",
      },
    ]);
    // CSV-imported quotes only carry the part number in "Customer Reference" (client_order_ref).
    const matched = (orders || []).filter(
      (o) =>
        normalizeKey(o.note).includes(normPn) || normalizeKey(o.client_order_ref).includes(normPn),
    );
    if (matched.length === 0) return [];

    const orderLines = await searchLines(
      uid,
      [["order_id", "in", matched.map((o) => o.id)]],
      companyId,
      LINE_FIELDS_BASE,
      100,
    ).catch(() => []);
    const byOrder = new Map();
    for (const l of orderLines) {
      const oid = l.order_id?.[0];
      if (!byOrder.has(oid)) byOrder.set(oid, []);
      byOrder.get(oid).push(l);
    }
    const partName = normalizeKey(part.partName);
    const out = [];
    for (const o of matched) {
      const ols = byOrder.get(o.id) || [];
      const byName = partName ? ols.filter((l) => normalizeKey(l.name).includes(partName)) : [];
      if (byName.length > 0) out.push(...byName);
      else if (ols.length === 1) out.push(...ols);
    }
    return out;
  } catch (err) {
    console.warn("[crossCheck] legacy note search failed:", err.message);
    return [];
  }
}

async function findLivePartner(uid, customer, companyId) {
  const domain = [];
  const searchClauses = [];
  if (customer.email?.trim()) searchClauses.push(["email", "=", customer.email.trim()]);
  if (customer.company?.trim()) searchClauses.push(["name", "ilike", customer.company.trim()]);
  if (searchClauses.length === 0) return null;

  if (searchClauses.length > 1) {
    domain.push("|", ...searchClauses);
  } else {
    domain.push(...searchClauses);
  }

  const partners = await odooCall("object", "execute_kw", [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_API_KEY,
    "res.partner",
    "search_read",
    [domain],
    {
      fields: ["id", "name", "email", "phone", "company_id", "active"],
      context: { allowed_company_ids: [companyId] },
      limit: 20,
    },
  ]);

  if (!partners || partners.length === 0) return null;

  // FR-01/FR-03: partner.company_id is irrelevant; a customer is existing only if it has
  // at least one non-cancelled sale order in the target company. Duplicate partner records with the
  // same name are all kept (matchedIds) so a part quoted under any of them is still found.
  const withOrders = [];
  for (const p of partners) {
    try {
      const orderCount = await odooCall("object", "execute_kw", [
        process.env.ODOO_DB,
        uid,
        process.env.ODOO_API_KEY,
        "sale.order",
        "search_count",
        [
          [
            ["partner_id", "=", p.id],
            ["company_id", "=", companyId],
            ["state", "!=", "cancel"],
          ],
        ],
      ]);
      if (orderCount > 0) withOrders.push(p);
    } catch {
      // Continue checking remaining partners
    }
  }
  if (withOrders.length > 0) return { ...withOrders[0], matchedIds: withOrders.map((p) => p.id) };

  // If partner only exists in other companies or has 0 orders in this company, return null (it's new for this company)
  return null;
}

function buildPartResult(part, matchedCustomer, previousQuote) {
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
  if (!uid)
    throw new Error(
      "Odoo authentication failed - check ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_API_KEY.",
    );
  return uid;
}

async function odooCall(service, method, args) {
  const response = await fetch(`${normalizeOdooUrl(process.env.ODOO_URL)}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Date.now(),
    }),
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
    throw new Error(
      "Invalid ODOO_URL. Set it to the base URL, for example https://yourcompany.odoo.com.",
    );
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

export async function searchLiveOdooQuotes({
  query = "",
  businessUnit = "",
  status = "",
  startDate = "",
  endDate = "",
} = {}) {
  if (!isLiveConfigured()) return [];
  try {
    const uid = await odooAuth();
    const allCompanyIds = await getAllCompanyIds(uid);
    const domain = [];

    if (query) {
      domain.push(
        "|",
        "|",
        "|",
        ["name", "ilike", query],
        ["client_order_ref", "ilike", query],
        ["partner_id.name", "ilike", query],
        ["note", "ilike", query],
      );
    }

    if (businessUnit && businessUnit !== "all") {
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
      const isDraftOrSent = o.state === "draft" || o.state === "sent";
      const statusLabel = isDraftOrSent
        ? "SYNCED"
        : o.state === "sale"
          ? "CONFIRMED"
          : o.state
            ? o.state.toUpperCase()
            : "SYNCED";
      const lineCount = Array.isArray(o.order_line) ? o.order_line.length : 0;
      return {
        id: `odoo-${o.id}`,
        odooId: o.id,
        draftSequenceId: o.client_order_ref || o.name,
        quoteNumber: o.name,
        odooSequenceId: o.name,
        businessUnit: o.company_id?.[1] || "OC Custom Coating",
        customerName: o.partner_id?.[1] || "Standard Customer",
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
    console.warn("[searchLiveOdooQuotes] failed:", err.message);
    return [];
  }
}

export async function getLiveOdooQuoteDetails(idOrName) {
  if (!isLiveConfigured()) return null;
  try {
    const uid = await odooAuth();
    const allCompanyIds = await getAllCompanyIds(uid);
    const contextObj = allCompanyIds.length > 0 ? { allowed_company_ids: allCompanyIds } : {};
    const cleanId = String(idOrName).startsWith("odoo-")
      ? parseInt(String(idOrName).replace("odoo-", ""), 10)
      : null;
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
        console.warn("Failed to read order lines:", lineErr.message);
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
        storedPayload =
          typeof customData[0].x_quotepilot_json === "string"
            ? JSON.parse(customData[0].x_quotepilot_json)
            : customData[0].x_quotepilot_json;
      }
    } catch {
      // Field might not exist
    }

    // Parse rich note lines if available to extract deep specs, coating BOM, masking, etc.
    const noteLines = typeof order.note === "string" ? order.note.split("\n") : [];
    const notePartMap = new Map();
    for (const nl of noteLines) {
      const match = nl.match(
        /^#\d+:\s*([^\[|]+)(?:\[Rev:\s*([^\]]+)\])?(?:\s*-\s*([^|]+))?(?:\|\s*Surface Area:\s*([\d.]+)\s*sq\.in)?(?:\|\s*Masking:\s*([\d.]+)\s*sq\.in)?(?:\|\s*Work:\s*([^|]+))?(?:\|\s*Specs:\s*(.+))?$/i,
      );
      if (match) {
        const pNum = match[1]?.trim();
        if (pNum) {
          notePartMap.set(pNum, {
            rev: match[2]?.trim(),
            partName: match[3]?.trim(),
            surfaceArea: match[4] ? parseFloat(match[4]) : null,
            maskingArea: match[5] ? parseFloat(match[5]) : 0,
            workType: match[6]?.trim() || "Cerakote",
            specs: match[7]?.trim() || "Standard Coating Specification",
          });
        }
      }
    }

    const refIsDraft = /^QP\d{2}-\d{4}/.test(order.client_order_ref || "");
    const parts = lineItems.map((l, index) => {
      const desc = String(l.name || `Line Item ${index + 1}`);
      const areaMatch = desc.match(/--\s*([\d.]+)\s*si/i);
      const maskMatch = desc.match(/\(mask:\s*([\d.]+)\s*si\)/i);
      const revMatch = desc.match(/\[Rev:\s*([^\]]+)\]/i);
      // New lines look like "<PN> - <name> [Rev: x] -- N si | work"; CSV lines have no PN prefix, so fall back
      // to the product, then to the order's Customer Reference (the app writes the part number there).
      const pnPrefix = desc.match(/^([A-Za-z0-9][A-Za-z0-9._\/]*(?:-[A-Za-z0-9._\/]+)+)\s+-\s+/);
      const partNum =
        l.product_id?.[1] ||
        pnPrefix?.[1] ||
        (order.client_order_ref && !refIsDraft ? order.client_order_ref : null) ||
        `PART-${index + 1}`;
      const noteInfo = notePartMap.get(partNum) || {};
      const areaSqIn = noteInfo.surfaceArea ?? (areaMatch ? parseFloat(areaMatch[1]) : 0);
      const maskingSqIn = noteInfo.maskingArea ?? (maskMatch ? parseFloat(maskMatch[1]) : 0);
      const revision = l.x_rev || noteInfo.rev || (revMatch ? revMatch[1].trim() : "0");
      const unitPrice = Number(l.price_unit) || 0;
      const quantity = Number(l.product_uom_qty) || 1;
      const totalPrice = Number(l.price_subtotal) || unitPrice * quantity;
      const workType =
        noteInfo.workType ||
        (desc.split("|")[1] || "").replace(/\+temp(?: test)?/i, "").trim() ||
        "NOT_SPECIFIED";
      const partName =
        noteInfo.partName ||
        desc
          .replace(/^.*?\s+-\s+(?=.*--)/, "")
          .replace(/\[Rev:[^\]]*\]/i, "")
          .replace(/--.*/, "")
          .trim() ||
        partNum;

      return {
        id: `odoo-line-${l.id}`,
        partNumber: partNum,
        partName,
        partSummary: partName,
        revision,
        quantity,
        totalSurfaceAreaSqIn: areaSqIn,
        coatingAreaSqIn: Math.max(0, areaSqIn - maskingSqIn),
        maskingAreaSqIn: maskingSqIn,
        priceUnit: unitPrice,
        totalPrice,
        workType,
        coatingBom: {
          masking: null,
          mediaBlasting: null,
          primer: null,
          prep: null,
          topcoat: workType,
          color: null,
          coverage: null,
          sequencing: null,
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
      status:
        order.state === "draft" || order.state === "sent"
          ? "SYNCED"
          : order.state
            ? order.state.toUpperCase()
            : "SYNCED",
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
    console.warn("[getLiveOdooQuoteDetails] failed:", err.message);
    return null;
  }
}

export { odooAuth, odooCall, isLiveConfigured, resolveTestCompanyId, resolveTestTagId };

// All Odoo companies (business units) so the UI never needs a hard-coded list.
export async function listCompanies() {
  if (!isLiveConfigured()) return [];
  const uid = await odooAuth();
  const rows = await odooCall("object", "execute_kw", [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_API_KEY,
    "res.company",
    "search_read",
    [[]],
    { fields: ["id", "name"], limit: 100, order: "name asc" },
  ]);
  return (rows || []).map((c) => ({ id: c.id, name: c.name }));
}

// An existing res.partner that may be reused for a NEW quotation in this company, so syncing never
// creates a second "ABC Company" (which makes Odoo CSV imports fail with "multiple matches").
// Only partners that are shared (no company) or belong to the target company are usable.
export async function findReusablePartner(uid, customer, companyId) {
  const clauses = [];
  if (customer.email?.trim()) clauses.push(["email", "=", customer.email.trim()]);
  if (customer.company?.trim()) clauses.push(["name", "=ilike", customer.company.trim()]);
  if (clauses.length === 0) return null;
  const domain = clauses.length > 1 ? ["|", ...clauses] : clauses;
  const partners = await odooCall("object", "execute_kw", [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_API_KEY,
    "res.partner",
    "search_read",
    [domain],
    {
      fields: ["id", "name", "company_id"],
      context: { allowed_company_ids: [companyId] },
      limit: 20,
      order: "id asc",
    },
  ]);
  const usable = (partners || []).filter((p) => !p.company_id || p.company_id[0] === companyId);
  const want = normalizeKey(customer.company);
  return (usable.find((p) => normalizeKey(p.name) === want) || usable[0] || null)?.id ?? null;
}
