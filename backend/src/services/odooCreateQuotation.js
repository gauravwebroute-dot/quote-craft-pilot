import {
  findReusablePartner,
  crossCheckOdoo,
  odooAuth,
  odooCall,
  isLiveConfigured,
  resolveTestCompanyId,
  resolveTestTagId,
  TEST_COMPANY_NAME,
  TEST_TAG_NAME,
  FIELD_SQ_IN,
  FIELD_PRICE_SI,
} from "./odooCrossCheck.js";

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
 * @param {object} [params.formPayload] - complete form state JSON for bidirectional rehydration (REQ-006)
 * @param {string} [params.businessUnit] - Target company / Business Unit
 * @param {Array<object>} [params.orderLines] - the quotation lines exactly as the CSV export builds them
 *   (part lines, lot fee lines, part marking line). When absent the legacy per-part lines are built.
 * @param {boolean} params.confirm - MUST be exactly `true`. This is the
 *   caller's explicit "yes, write this" signal.
 */
export async function createOdooQuotation({
  customer = {},
  parts = [],
  formPayload = null,
  businessUnit = "",
  orderLines = null,
  confirm,
}) {
  if (confirm !== true) {
    throw new SafetyError("Refusing to write to Odoo: `confirm` must be exactly `true`.");
  }
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new SafetyError("No parts provided to create a quotation for.");
  }

  const targetBu = businessUnit || formPayload?.businessUnit || TEST_COMPANY_NAME;

  // Always re-run the duplicate check ourselves, right now, server-side with the target company.
  const freshCheck = await crossCheckOdoo({ customer, parts, businessUnit: targetBu });

  // Every confirmed sync creates a NEW quotation, even when the part was quoted before: price history
  // is built from those repeated quotations. (Earlier versions skipped "existing" parts, returned
  // nothing, and the UI then invented a fake order number.)
  const skipped = [];
  const toCreate = freshCheck.parts.map((partResult) => ({
    ...partResult,
    original: parts.find((p) => (p.partNumber ?? null) === partResult.partNumber),
  }));

  if (!isLiveConfigured()) {
    return createDummyQuotation({
      customer,
      toCreate,
      skipped,
      formPayload,
      businessUnit: targetBu,
      orderLines,
    });
  }

  return createLiveQuotation({
    customer,
    freshCheck,
    toCreate,
    skipped,
    formPayload,
    businessUnit: targetBu,
    orderLines,
  });
}

function createDummyQuotation({ customer, toCreate, skipped, formPayload, businessUnit, orderLines }) {
  const fakeOrderNum = Math.floor(Math.random() * 900) + 42;
  const saleOrderName = `S000${fakeOrderNum}`.slice(0, 6);
  const fakeOrderId = 1000 + fakeOrderNum;
  const companyName = businessUnit || TEST_COMPANY_NAME;
  const result = {
    mode: "dummy",
    created: {
      saleOrderId: fakeOrderId,
      saleOrderName,
      company: companyName,
      tag: TEST_TAG_NAME,
      partnerCreated: false,
      lineCount: Array.isArray(orderLines) && orderLines.length ? orderLines.length : toCreate.length,
      partNumbers: toCreate.map((p) => p.partNumber),
      formPayload: formPayload || { customer, parts: toCreate.map((p) => p.original) },
      descriptions: Array.isArray(orderLines) && orderLines.length
        ? orderLines.map((l) => l.description)
        : toCreate.map((p) => {
        const areaSqIn = p.original?.totalSurfaceAreaSqIn;
        return `${p.original?.partName ?? p.partNumber ?? "Part"} -- ${
          typeof areaSqIn === "number" ? areaSqIn : "area unknown"
        } si ${TEST_TAG_NAME}`;
      }),
    },
    skipped,
    message: `Dummy mode - simulated Odoo quotation created as ${saleOrderName} under ${companyName}. Configure ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_API_KEY to test live.`,
  };
  auditLog("DUMMY_CREATE", customer, result.created, skipped);
  return result;
}

async function createLiveQuotation({
  customer,
  freshCheck,
  toCreate,
  skipped,
  formPayload,
  businessUnit,
  orderLines,
}) {
  const uid = await odooAuth();
  const companyId = freshCheck.company?.id || (await resolveTestCompanyId(uid, businessUnit));
  const companyName = freshCheck.company?.name || businessUnit || TEST_COMPANY_NAME;
  const tagId = await resolveTestTagId(uid);

  // Reuse the existing customer record (never create a second "ABC Company").
  let partnerId =
    freshCheck.customer?.record?.id ?? (await findReusablePartner(uid, customer, companyId));
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
      [
        {
          name: customer.company || customer.email,
          email: customer.email || false,
          company_id: companyId,
        },
      ],
    ]);
    partnerCreated = true;
  }

  const draftRef = formPayload?.draftSequenceId || "QP26-0001";
  const payloadBlob = JSON.stringify(
    formPayload || { customer, parts: toCreate.map((p) => p.original) },
  );

  // Rich notes summarizing every extracted detail (minor to major) for full visibility in Odoo
  const noteSummary = [
    `=== QuotePilot Complete RFQ Data [${draftRef}] ===`,
    `Customer: ${customer.company || customer.email || "Standard Customer"} | BU: ${companyName}`,
    `Extracted Line Items (${toCreate.length}):`,
    ...toCreate.map((p, idx) => {
      const orig = p.original || {};
      const area = Number(orig.totalSurfaceAreaSqIn || 0);
      const mask = Number(orig.maskingAreaSqIn || 0);
      const topcoat = orig.coatingBom?.topcoat || orig.workType || "Coating";
      const rev = orig.revision || "A00";
      return `#${idx + 1}: ${orig.partNumber || "Part"} [Rev: ${rev}] - ${orig.partName || "Part"} | Surface Area: ${area} sq.in | Masking: ${mask} sq.in | Work: ${topcoat} | Specs: ${orig.milSpecNotes || orig.specifications || "Standard"}`;
    }),
  ].join("\n");

  // Order lines. When the app sends `orderLines` (the same lines as the CSV export) those are used: part
  // lines by name, fee lines (lot fees, part marking) on their Odoo product. Otherwise the legacy per-part
  // lines are built (used by "add one part to Odoo").
  const warnings = [];
  const productCache = new Map();
  const lineSpecs = [];

  if (Array.isArray(orderLines) && orderLines.length > 0) {
    for (const l of orderLines) {
      const qty = Number(l.quantity) > 0 ? Number(l.quantity) : 1;
      const price = Number(l.unitPrice) || 0;
      const spec = {
        base: { name: String(l.description || l.product || "Line"), product_uom_qty: qty, price_unit: price },
        custom:
          l.kind === "part"
            ? {
                x_rev: l.rev || false,
                x_work_type: l.workType || false,
                [FIELD_SQ_IN]: Number(l.sqIn) || 0,
                [FIELD_PRICE_SI]: Number(l.priceSi) || 0,
              }
            : {},
      };
      if (l.kind === "fee" && l.product) {
        if (!productCache.has(l.product)) {
          productCache.set(l.product, await ensureServiceProduct(uid, l.product, warnings));
        }
        const productId = productCache.get(l.product);
        if (productId) spec.base.product_id = productId;
      }
      lineSpecs.push(spec);
    }
  } else {
    for (const p of toCreate) {
      const computed = p.computedPrice?.priced !== false ? p.computedPrice : null;
      const areaSqIn = Number(p.original?.totalSurfaceAreaSqIn || 0);
      const maskSqIn = Number(p.original?.maskingAreaSqIn || 0);
      const workType = p.original?.coatingBom?.topcoat || p.original?.workType || "Coating";
      const rev = p.original?.revision || "";
      // No made-up price: when nothing is available the line goes in at $0 and is marked "Price pending".
      const unitPrice = reusedUnitPrice(p.original) ?? computed?.pricePerUnit ?? 0;
      const pricePending = !(unitPrice > 0);
      const description = `${p.partNumber ? `${p.partNumber} - ` : ""}${p.original?.partName ?? p.partNumber ?? "Part"}${rev ? ` [Rev: ${rev}]` : ""} -- ${
        areaSqIn > 0 ? areaSqIn : "area unknown"
      } si${maskSqIn > 0 ? ` (mask: ${maskSqIn} si)` : ""} | ${workType}${pricePending ? " | Price pending" : ""} ${TEST_TAG_NAME}`;
      lineSpecs.push({
        base: {
          name: description,
          product_uom_qty: p.original?.quantity ?? 1,
          price_unit: unitPrice,
        },
        custom: {
          x_rev: p.original?.revision || false,
          x_work_type: workType,
          [FIELD_SQ_IN]: areaSqIn,
          [FIELD_PRICE_SI]: Number(p.original?.pricePerSi || 0),
        },
      });
    }
  }

  const orderLinesWithCustomFields = lineSpecs.map((l) => [0, 0, { ...l.base, ...l.custom }]);
  const orderLinesStandardOnly = lineSpecs.map((l) => [0, 0, { ...l.base }]);

  const baseValues = {
    partner_id: partnerId,
    company_id: companyId,
    client_order_ref: draftRef,
    note: noteSummary,
    tag_ids: [[6, 0, [tagId]]],
  };

  // Try the richest payload first and step down if this Odoo database lacks a custom field:
  //   1. line custom fields + x_quotepilot_json on the order
  //   2. line custom fields only (x_quotepilot_json not created in Odoo)
  //   3. standard fields only (no custom fields at all)
  const attempts = [
    {
      label: "line custom fields + x_quotepilot_json",
      values: {
        ...baseValues,
        x_quotepilot_json: payloadBlob,
        order_line: orderLinesWithCustomFields,
      },
    },
    {
      label: "line custom fields only",
      values: { ...baseValues, order_line: orderLinesWithCustomFields },
    },
    {
      label: "standard fields only",
      values: { ...baseValues, order_line: orderLinesStandardOnly },
    },
  ];

  let saleOrderId;
  let lastErr;
  for (const attempt of attempts) {
    try {
      saleOrderId = await odooCall("object", "execute_kw", [
        process.env.ODOO_DB,
        uid,
        process.env.ODOO_API_KEY,
        "sale.order",
        "create",
        [attempt.values],
      ]);
      if (attempt !== attempts[0]) {
        console.warn(`[odoo-write] created using fallback payload: ${attempt.label}`);
      }
      break;
    } catch (err) {
      lastErr = err;
      console.warn(`[odoo-write] create failed (${attempt.label}):`, err.message);
    }
  }
  if (!saleOrderId) throw lastErr;

  const [createdOrder] = await odooCall("object", "execute_kw", [
    process.env.ODOO_DB,
    uid,
    process.env.ODOO_API_KEY,
    "sale.order",
    "read",
    [[saleOrderId]],
    { fields: ["name", "client_order_ref"] },
  ]);

  const created = {
    saleOrderId,
    saleOrderName: createdOrder?.name ?? `S${String(saleOrderId).padStart(5, "0")}`,
    clientOrderRef: createdOrder?.client_order_ref ?? draftRef,
    company: companyName,
    tag: TEST_TAG_NAME,
    partnerId,
    partnerCreated,
    lineCount: lineSpecs.length,
    partNumbers: toCreate.map((p) => p.partNumber),
    warnings,
  };

  auditLog("LIVE_CREATE", customer, created, skipped);

  return {
    mode: "live",
    created,
    skipped,
    message: `Quotation created in Odoo under "${companyName}", tagged "${TEST_TAG_NAME}".`,
  };
}

function auditLog(kind, customer, created, skipped) {
  console.log(
    `[odoo-write][${kind}] ${new Date().toISOString()} customer=${customer.email || customer.company || "unknown"} ` +
      `saleOrder=${created?.saleOrderName ?? created?.saleOrderId} parts=${JSON.stringify(created?.partNumbers)} ` +
      `skipped=${JSON.stringify(skipped.map((s) => s.partNumber))}`,
  );
}

export class SafetyError extends Error {}

const odooArgs = (uid, model, method, args, kwargs) => [
  process.env.ODOO_DB,
  uid,
  process.env.ODOO_API_KEY,
  model,
  method,
  args,
  ...(kwargs ? [kwargs] : []),
];

/**
 * Finds the Odoo service product with this exact name, or creates it (a NEW record, shared across
 * companies, price $0, sellable). Returns the product.product id, or null (with a warning) if neither works.
 */
async function ensureServiceProduct(uid, name, warnings) {
  try {
    const [found] = await odooCall("object", "execute_kw", odooArgs(uid, "product.product", "search", [[["name", "=", name]]], { limit: 1 }));
    if (found) return found;
    const templateId = await odooCall(
      "object",
      "execute_kw",
      odooArgs(uid, "product.template", "create", [
        { name, type: "service", list_price: 0, sale_ok: true, purchase_ok: false, company_id: false },
      ]),
    );
    const [variantId] = await odooCall(
      "object",
      "execute_kw",
      odooArgs(uid, "product.product", "search", [[["product_tmpl_id", "=", templateId]]], { limit: 1 }),
    );
    if (variantId) {
      console.log(`[odoo-write][PRODUCT_CREATED] ${name} (product.product ${variantId})`);
      return variantId;
    }
    warnings.push(`Product "${name}" was created in Odoo but could not be found; the line was added by name only.`);
  } catch (err) {
    warnings.push(`Could not find or create the Odoo product "${name}" (${err.message}); the line was added by name only.`);
  }
  return null;
}

/**
 * Attaches files to a sales order (create only, never overwrites). A file whose name and size already
 * match an attachment on the order is skipped, so repeating a sync does not duplicate files.
 * @param {{ saleOrderId: number, files: Array<{ originalname: string, mimetype?: string, buffer: Buffer }> }} params
 */
export async function attachFilesToSaleOrder({ saleOrderId, files = [] }) {
  const id = Number(saleOrderId);
  if (!Number.isInteger(id) || id <= 0) throw new SafetyError("A valid saleOrderId is required to attach files.");
  if (!files.length) return { mode: isLiveConfigured() ? "live" : "dummy", attached: [], skipped: [], failed: [] };

  if (!isLiveConfigured()) {
    return { mode: "dummy", attached: files.map((f) => f.originalname), skipped: [], failed: [] };
  }

  const uid = await odooAuth();
  const existing = await odooCall(
    "object",
    "execute_kw",
    odooArgs(uid, "ir.attachment", "search_read", [[["res_model", "=", "sale.order"], ["res_id", "=", id]]], {
      fields: ["name", "file_size"],
    }),
  );
  const have = new Set((existing ?? []).map((a) => `${a.name}|${a.file_size}`));

  const attached = [];
  const skipped = [];
  const failed = [];
  for (const f of files) {
    const name = f.originalname;
    if (have.has(`${name}|${f.buffer.length}`)) {
      skipped.push(name);
      continue;
    }
    try {
      await odooCall(
        "object",
        "execute_kw",
        odooArgs(uid, "ir.attachment", "create", [
          {
            name,
            datas: f.buffer.toString("base64"),
            res_model: "sale.order",
            res_id: id,
            type: "binary",
            mimetype: f.mimetype || "application/octet-stream",
          },
        ]),
      );
      attached.push(name);
      have.add(`${name}|${f.buffer.length}`);
    } catch (err) {
      failed.push({ name, error: err.message });
    }
  }
  console.log(`[odoo-write][ATTACH] saleOrder=${id} attached=${JSON.stringify(attached)} skipped=${JSON.stringify(skipped)} failed=${JSON.stringify(failed.map((x) => x.name))}`);
  return { mode: "live", attached, skipped, failed };
}

// The operator can choose to reuse the last confirmed price for a customer + part; it then wins over
// the QuotePilot estimate everywhere (pricing engine, CSV and Odoo sync).
function reusedUnitPrice(part) {
  const v = Number(part?.priceOverrideUnit);
  return part?.priceSource && part.priceSource !== "QP_ESTIMATE" && v > 0 ? Math.round(v * 100) / 100 : null;
}
