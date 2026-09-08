import { crossCheckOdoo, odooAuth, odooCall, isLiveConfigured } from "./odooCrossCheck.js";

/**
 * ============================================================================
 * SAFETY CONTRACT FOR THIS FILE - read before touching anything below.
 * ============================================================================
 * This is the ONLY file in the entire backend allowed to write to Odoo.
 * It must NEVER call Odoo's `write` (update) or `unlink` (delete) methods,
 * on ANY model, under ANY circumstance. Only `create`. This means:
 *   - An existing customer record is never modified - it's only ever
 *     looked up and referenced by id.
 *   - An existing quotation is never modified or overwritten - if a part
 *     already has a prior quote, this function SKIPS it entirely rather
 *     than touching that old record.
 *   - The worst this code can do to a real Odoo instance is add NEW
 *     records. It can never lose or corrupt anything that was already
 *     there.
 * The duplicate re-check below is NOT optional and must not be removed
 * or bypassed, even if the caller already ran /api/odoo/cross-check and
 * claims a part is new - this function trusts its own fresh check, never
 * the caller's claim, as defense against a frontend bug or a stale UI
 * state pushing a duplicate through.
 * ============================================================================
 */

/**
 * @param {object} params
 * @param {{ email?: string, company?: string }} params.customer
 * @param {Array<object>} params.parts - extracted part objects (same shape
 *   used by /api/odoo/cross-check and the pricing engine)
 * @param {boolean} params.confirm - MUST be exactly `true`. This is the
 *   caller's explicit "yes, write this" signal (e.g. the user clicked
 *   Allow on a confirmation dialog). Anything else is rejected before any
 *   Odoo call is made.
 */
export async function createOdooQuotation({ customer = {}, parts = [], confirm }) {
  if (confirm !== true) {
    throw new SafetyError("Refusing to write to Odoo: `confirm` must be exactly `true`.");
  }
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new SafetyError("No parts provided to create a quotation for.");
  }

  // Always re-run the duplicate check ourselves, right now, server-side.
  // We never trust a client-supplied "this part is new" claim.
  const freshCheck = await crossCheckOdoo({ customer, parts });

  const toCreate = [];
  const skipped = [];
  for (const partResult of freshCheck.parts) {
    if (partResult.reason === "EXISTING_QUOTE_FOUND") {
      skipped.push({
        partNumber: partResult.partNumber,
        reason: "EXISTING_QUOTE_FOUND",
        previousQuote: partResult.previousQuote,
      });
    } else {
      const original = parts.find((p) => (p.partNumber ?? null) === partResult.partNumber);
      toCreate.push({ ...partResult, original });
    }
  }

  if (toCreate.length === 0) {
    return {
      mode: freshCheck.mode,
      created: null,
      skipped,
      message: "Nothing to create - every part already has an existing quote in Odoo.",
    };
  }

  if (!isLiveConfigured()) {
    return createDummyQuotation({ customer, toCreate, skipped });
  }

  return createLiveQuotation({ customer, freshCheck, toCreate, skipped });
}

function createDummyQuotation({ customer, toCreate, skipped }) {
  const fakeOrderId = Math.floor(Math.random() * 90000) + 10000;
  const result = {
    mode: "dummy",
    created: {
      saleOrderId: fakeOrderId,
      saleOrderName: `S${String(fakeOrderId).padStart(5, "0")}`,
      partnerCreated: false,
      lineCount: toCreate.length,
      partNumbers: toCreate.map((p) => p.partNumber),
    },
    skipped,
    message: "Dummy mode - no real Odoo write happened. Configure ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_API_KEY to test against a real instance.",
  };
  auditLog("DUMMY_CREATE", customer, result.created, skipped);
  return result;
}

async function createLiveQuotation({ customer, freshCheck, toCreate, skipped }) {
  const uid = await odooAuth();

  let partnerId = freshCheck.customer?.record?.id ?? null;
  let partnerCreated = false;

  if (!partnerId) {
    if (!customer.email && !customer.company) {
      throw new SafetyError("Cannot create a new Odoo customer without an email or company name.");
    }
    // The ONLY `create` call on res.partner in this codebase - and it only
    // ever creates a brand-new record, never touches an existing one.
    partnerId = await odooCall("object", "execute_kw", [
      process.env.ODOO_DB,
      uid,
      process.env.ODOO_API_KEY,
      "res.partner",
      "create",
      [{ name: customer.company || customer.email, email: customer.email || false }],
    ]);
    partnerCreated = true;
  }

  const orderLines = toCreate.map((p) => {
    const computed = p.computedPrice?.priced !== false ? p.computedPrice : null;
    return [
      0,
      0,
      {
        name: `${p.partNumber ?? "Part"} - ${p.original?.partName ?? ""}`.trim(),
        product_uom_qty: p.original?.quantity ?? 1,
        price_unit: computed?.pricePerUnit ?? 0,
      },
    ];
  });

  // The ONLY `create` call on sale.order in this codebase.
  const saleOrderId = await odooCall("object", "execute_kw", [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_API_KEY,
    "sale.order",
    "create",
    [{ partner_id: partnerId, order_line: orderLines }],
  ]);

  const [createdOrder] = await odooCall("object", "execute_kw", [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_API_KEY,
    "sale.order",
    "read",
    [[saleOrderId]],
    { fields: ["name"] },
  ]);

  const created = {
    saleOrderId,
    saleOrderName: createdOrder?.name ?? null,
    partnerId,
    partnerCreated,
    lineCount: toCreate.length,
    partNumbers: toCreate.map((p) => p.partNumber),
  };

  auditLog("LIVE_CREATE", customer, created, skipped);

  return { mode: "live", created, skipped, message: "Quotation created in Odoo." };
}

function auditLog(kind, customer, created, skipped) {
  console.log(
    `[odoo-write][${kind}] ${new Date().toISOString()} customer=${customer.email || customer.company || "unknown"} ` +
      `saleOrder=${created?.saleOrderName ?? created?.saleOrderId} parts=${JSON.stringify(created?.partNumbers)} ` +
      `skipped=${JSON.stringify(skipped.map((s) => s.partNumber))}`,
  );
}

export class SafetyError extends Error {}
