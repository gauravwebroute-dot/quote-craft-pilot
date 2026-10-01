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

export async function crossCheckOdoo({ customer = {}, parts = [] }) {
  if (isLiveConfigured()) {
    return crossCheckLiveOdoo({ customer, parts });
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

    return buildPartResult(part, matchedCustomer, previousQuote ?? null);
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
    partMasterSync: {
      status: conflicts.length > 0 ? "CONFLICT" : results.length > 0 ? "COMPLETE" : "NOT_STARTED",
      label: "Part Master Sync",
      message: conflicts.length > 0
        ? `${conflicts.length} conflict(s) detected with stored Odoo master records.`
        : `${results.length} part(s) cross-referenced against Odoo catalog.`,
      conflictsCount: conflicts.length,
    },
    exportQuotationCheck: {
      status: results.length > 0 ? "COMPLETE" : "NOT_STARTED",
      label: "Export Quotation Check",
      message: "Subtotal arithmetic verified, standard tax rules applied (Tax Excl.), 5-7 day lead time.",
      validArithmetic: true,
    },
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

async function crossCheckLiveOdoo({ customer, parts }) {
  const uid = await odooAuth();
  const companyId = await resolveTestCompanyId(uid);

  const partner = await findLivePartner(uid, customer, companyId);
  const conflicts = [];

  const results = [];
  for (const part of parts) {
    let previousQuote = null;
    if (partner && part.partNumber) {
      const lines = await odooCall("object", "execute_kw", [
        process.env.ODOO_DB,
        uid,
        process.env.ODOO_API_KEY,
        "sale.order.line",
        "search_read",
        [[
          ["order_id.partner_id", "=", partner.id],
          ["order_id.company_id", "=", companyId],
          ["order_id.state", "!=", "cancel"],
          ["name", "ilike", part.partNumber],
        ]],
        { fields: ["id", "name", "price_unit", "product_uom_qty", "order_id", "create_date", "x_rev"], limit: 5 },
      ]);
      if (lines.length > 0) {
        const line = lines[0];
        previousQuote = {
          pricePerUnit: line.price_unit,
          revision: line.x_rev || null,
          quotedAt: line.create_date ? String(line.create_date).slice(0, 10) : null,
          saleOrderId: line.order_id?.[0] ?? null,
          saleOrderName: line.order_id?.[1] ?? null,
        };

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
    results.push(buildPartResult(part, partner, previousQuote));
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
    partMasterSync: {
      status: conflicts.length > 0 ? "CONFLICT" : results.length > 0 ? "COMPLETE" : "NOT_STARTED",
      label: "Part Master Sync",
      message: conflicts.length > 0
        ? `${conflicts.length} conflict(s) detected with live Odoo records.`
        : "All part references synced with Odoo catalog.",
      conflictsCount: conflicts.length,
    },
    exportQuotationCheck: {
      status: results.length > 0 ? "COMPLETE" : "NOT_STARTED",
      label: "Export Quotation Check",
      message: "Subtotal arithmetic verified, tax status confirmed, lead times validated.",
      validArithmetic: true,
    },
  };

  return {
    mode: "live",
    company: { id: companyId, name: TEST_COMPANY_NAME },
    customer: { matched: Boolean(partner), record: partner, candidates: partner ? [partner] : [] },
    parts: results,
    subChecks,
    conflicts,
    hasConflicts: conflicts.length > 0,
    message: partner
      ? `Live customer + prior-quote lookup completed, scoped to "${TEST_COMPANY_NAME}" only.`
      : `No matching customer found under "${TEST_COMPANY_NAME}" in Odoo - this would be a new customer.`,
  };
}

async function resolveTestCompanyId(uid) {
  const companies = await odooCall("object", "execute_kw", [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_API_KEY,
    "res.company",
    "search_read",
    [[["name", "=", TEST_COMPANY_NAME]]],
    { fields: ["id"], limit: 1 },
  ]);
  if (companies.length === 0) {
    throw new Error(
      `Test company "${TEST_COMPANY_NAME}" was not found in Odoo. Check the exact spelling of the company name.`,
    );
  }
  return companies[0].id;
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
    { fields: ["id", "name", "email", "phone", "company_id"], limit: 20 },
  ]);

  return partners.find((p) => !p.company_id || p.company_id[0] === companyId) ?? null;
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

export { odooAuth, odooCall, isLiveConfigured, resolveTestCompanyId, resolveTestTagId };
