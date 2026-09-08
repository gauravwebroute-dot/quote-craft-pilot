import { calculatePartPrice } from "./pricingEngine.js";
import { DEFAULT_RATE_CARD } from "../config/rateCard.js";

/**
 * READ-ONLY module. This file must never call Odoo's `write` or `unlink`
 * methods on any model - only `search`, `search_read`, and (in
 * odooCreateQuotation.js, a SEPARATE file) `create`. Keeping duplicate-check
 * strictly read-only means running it can never damage existing Odoo data,
 * no matter how many times or how it's called.
 */

const DUMMY_CUSTOMERS = [
  {
    id: 101,
    company: "ABC Metal Works",
    email: "john@abcmetalworks.com",
    contact: "John Smith",
    phone: "714-555-1212",
  },
  {
    id: 102,
    company: "Northstar Fabrication",
    email: "quotes@northstar.example",
    contact: "Lisa Carter",
    phone: "555-0100",
  },
];

const DUMMY_QUOTES = [
  { customerId: 101, partNumber: "117-0018-001", revision: "C00", sourceFile: "117_0018_001_C_OP__2_.pdf", pricePerUnit: 105.32, quotedAt: "2026-07-05" },
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
  const results = parts.map((part) => {
    const previousQuote = matchedCustomer
      ? DUMMY_QUOTES.find((q) => q.customerId === matchedCustomer.id && q.partNumber === part.partNumber)
      : null;
    return buildPartResult(part, matchedCustomer, previousQuote ?? null);
  });

  return {
    mode: "dummy",
    customer: { matched: Boolean(matchedCustomer), record: matchedCustomer ?? null },
    parts: results,
    message: "Using dummy Odoo records. Configure ODOO_URL, ODOO_DB, ODOO_USERNAME, and ODOO_API_KEY for live checks.",
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

  const partner = await findLivePartner(uid, customer);

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
          ["order_id.state", "!=", "cancel"],
          ["name", "ilike", part.partNumber],
        ]],
        { fields: ["id", "name", "price_unit", "product_uom_qty", "order_id", "create_date"], limit: 5 },
      ]);
      if (lines.length > 0) {
        const line = lines[0];
        previousQuote = {
          pricePerUnit: line.price_unit,
          quotedAt: line.create_date ? String(line.create_date).slice(0, 10) : null,
          saleOrderId: line.order_id?.[0] ?? null,
          saleOrderName: line.order_id?.[1] ?? null,
        };
      }
    }
    results.push(buildPartResult(part, partner, previousQuote));
  }

  return {
    mode: "live",
    customer: { matched: Boolean(partner), record: partner, candidates: partner ? [partner] : [] },
    parts: results,
    message: partner
      ? "Live customer + prior-quote lookup completed."
      : "No matching customer found in Odoo - this would be a new customer.",
  };
}

async function findLivePartner(uid, customer) {
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
    { fields: ["id", "name", "email", "phone"], limit: 5 },
  ]);
  return partners[0] ?? null;
}

/**
 * Builds one part's cross-check result: the duplicate/new-quote reason,
 * the OLD price if one was found, and a freshly COMPUTED price using our
 * own pricing engine (so an estimator can compare old vs. new side by side
 * without having to open a second screen). Computing a price here never
 * writes anything anywhere - calculatePartPrice is pure math.
 */
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
  const response = await fetch(`${process.env.ODOO_URL.replace(/\/$/, "")}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args }, id: Date.now() }),
  });
  if (!response.ok) throw new Error(`Odoo request failed with HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.data?.message || "Odoo request failed.");
  return payload.result;
}

export { odooAuth, odooCall, isLiveConfigured };
