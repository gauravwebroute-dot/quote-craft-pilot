import { crossCheckOdoo, odooAuth, odooCall, isLiveConfigured, resolveTestCompanyId, resolveTestTagId, TEST_COMPANY_NAME, TEST_TAG_NAME } from "./odooCrossCheck.js";

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
 *
 * TEST-PHASE SCOPING: every live write is forced under the
 * TEST_COMPANY_NAME company (currently "OC Custom Coating") and tagged
 * with TEST_TAG_NAME (currently "+temp test") - both hardcoded here, not
 * left to whatever the caller passes in, so nothing this file creates can
 * accidentally land under other companies while this is still being
 * validated.
 * ============================================================================
 */

/**
 * @param {object} params
 * @param {{ email?: string, company?: string }} params.customer
 * @param {Array<object>} params.parts - extracted part objects (same shape
 *   used by /api/odoo/cross-check and the pricing engine)
 * @param {object} [params.formPayload] - complete form state JSON for bidirectional rehydration (REQ-006)
 * @param {boolean} params.confirm - MUST be exactly `true`. This is the
 *   caller's explicit "yes, write this" signal.
 */
export async function createOdooQuotation({ customer = {}, parts = [], formPayload = null, confirm }) {
  if (confirm !== true) {
    throw new SafetyError("Refusing to write to Odoo: `confirm` must be exactly `true`.");
  }
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new SafetyError("No parts provided to create a quotation for.");
  }

  // Always re-run the duplicate check ourselves, right now, server-side.
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
    return createDummyQuotation({ customer, toCreate, skipped, formPayload });
  }

  return createLiveQuotation({ customer, freshCheck, toCreate, skipped, formPayload });
}

function createDummyQuotation({ customer, toCreate, skipped, formPayload }) {
  const fakeOrderNum = Math.floor(Math.random() * 900) + 42;
  const saleOrderName = `S000${fakeOrderNum}`.slice(0, 6);
  const fakeOrderId = 1000 + fakeOrderNum;
  const result = {
    mode: "dummy",
    created: {
      saleOrderId: fakeOrderId,
      saleOrderName,
      company: TEST_COMPANY_NAME,
      tag: TEST_TAG_NAME,
      partnerCreated: false,
      lineCount: toCreate.length,
      partNumbers: toCreate.map((p) => p.partNumber),
      formPayload: formPayload || { customer, parts: toCreate.map((p) => p.original) },
      descriptions: toCreate.map((p) => {
        const areaSqIn = p.original?.totalSurfaceAreaSqIn;
        return `${p.original?.partName ?? p.partNumber ?? "Part"} -- ${
          typeof areaSqIn === "number" ? areaSqIn : "area unknown"
        } si ${TEST_TAG_NAME}`;
      }),
    },
    skipped,
    message: `Dummy mode - simulated Odoo quotation created as ${saleOrderName}. Configure ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_API_KEY to test live.`,
  };
  auditLog("DUMMY_CREATE", customer, result.created, skipped);
  return result;
}

async function createLiveQuotation({ customer, freshCheck, toCreate, skipped, formPayload }) {
  const uid = await odooAuth();
  const companyId = await resolveTestCompanyId(uid);
  const tagId = await resolveTestTagId(uid);

  let partnerId = freshCheck.customer?.record?.id ?? null;
  let partnerCreated = false;

  if (!partnerId) {
    if (!customer.email && !customer.company) {
      throw new SafetyError("Cannot create a new Odoo customer without an email or company name.");
    }
    partnerId = await odooCall("object", "execute_kw", [
      process.env.ODOO_DB,
      uid,
      process.env.ODOO_API_KEY,
      "res.partner",
      "create",
      [{ name: customer.company || customer.email, email: customer.email || false, company_id: companyId }],
    ]);
    partnerCreated = true;
  }

  // Build custom and standard order lines per PRD v3.0 Section 5.1
  const orderLinesWithCustomFields = toCreate.map((p) => {
    const computed = p.computedPrice?.priced !== false ? p.computedPrice : null;
    const areaSqIn = Number(p.original?.totalSurfaceAreaSqIn || 0);
    const description = `${p.original?.partName ?? p.partNumber ?? "Part"} -- ${
      areaSqIn > 0 ? areaSqIn : "area unknown"
    } si ${TEST_TAG_NAME}`;
    const pricePerSi = Number(p.original?.pricePerSi || 0.40);
    const unitPrice = computed?.pricePerUnit ?? (areaSqIn > 0 ? Number((areaSqIn * pricePerSi).toFixed(2)) : 5.0);

    return [
      0,
      0,
      {
        name: description,
        product_uom_qty: p.original?.quantity ?? 1,
        price_unit: unitPrice,
        x_rev: p.original?.revision || false,
        x_work_type: p.original?.coatingBom?.topcoat || p.original?.workType || "Coating",
        x_sq_in_per_unit: areaSqIn,
        x_price_per_si: pricePerSi,
      },
    ];
  });

  const orderLinesStandardOnly = toCreate.map((p) => {
    const computed = p.computedPrice?.priced !== false ? p.computedPrice : null;
    const areaSqIn = Number(p.original?.totalSurfaceAreaSqIn || 0);
    const description = `${p.original?.partName ?? p.partNumber ?? "Part"} -- ${
      areaSqIn > 0 ? areaSqIn : "area unknown"
    } si ${TEST_TAG_NAME}`;
    const pricePerSi = Number(p.original?.pricePerSi || 0.40);
    const unitPrice = computed?.pricePerUnit ?? (areaSqIn > 0 ? Number((areaSqIn * pricePerSi).toFixed(2)) : 5.0);

    return [
      0,
      0,
      {
        name: description,
        product_uom_qty: p.original?.quantity ?? 1,
        price_unit: unitPrice,
      },
    ];
  });

  const payloadBlob = JSON.stringify(formPayload || { customer, parts: toCreate.map((p) => p.original) });

  let saleOrderId;
  try {
    // Attempt creation with custom fields (REQ-005 & REQ-006)
    saleOrderId = await odooCall("object", "execute_kw", [
      process.env.ODOO_DB,
      uid,
      process.env.ODOO_API_KEY,
      "sale.order",
      "create",
      [
        {
          partner_id: partnerId,
          company_id: companyId,
          tag_ids: [[6, 0, [tagId]]],
          x_quotepilot_json: payloadBlob,
          order_line: orderLinesWithCustomFields,
        },
      ],
    ]);
  } catch (customErr) {
    console.warn("Custom field creation fallback to standard fields:", customErr.message);
    // Fallback without custom x_* fields if remote Odoo doesn't have custom module installed
    saleOrderId = await odooCall("object", "execute_kw", [
      process.env.ODOO_DB,
      uid,
      process.env.ODOO_API_KEY,
      "sale.order",
      "create",
      [
        {
          partner_id: partnerId,
          company_id: companyId,
          tag_ids: [[6, 0, [tagId]]],
          order_line: orderLinesStandardOnly,
        },
      ],
    ]);
  }

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
    saleOrderName: createdOrder?.name ?? `S${String(saleOrderId).padStart(5, "0")}`,
    company: TEST_COMPANY_NAME,
    tag: TEST_TAG_NAME,
    partnerId,
    partnerCreated,
    lineCount: toCreate.length,
    partNumbers: toCreate.map((p) => p.partNumber),
  };

  auditLog("LIVE_CREATE", customer, created, skipped);

  return { mode: "live", created, skipped, message: `Quotation created in Odoo under "${TEST_COMPANY_NAME}", tagged "${TEST_TAG_NAME}".` };
}

function auditLog(kind, customer, created, skipped) {
  console.log(
    `[odoo-write][${kind}] ${new Date().toISOString()} customer=${customer.email || customer.company || "unknown"} ` +
      `saleOrder=${created?.saleOrderName ?? created?.saleOrderId} parts=${JSON.stringify(created?.partNumbers)} ` +
      `skipped=${JSON.stringify(skipped.map((s) => s.partNumber))}`,
  );
}

export class SafetyError extends Error {}
