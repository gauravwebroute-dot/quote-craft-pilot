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

export async function crossCheckOdoo({ customer = {}, parts = [] }) {
  if (process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_USERNAME && process.env.ODOO_API_KEY) {
    return crossCheckLiveOdoo({ customer, parts });
  }

  const matchedCustomer = findCustomer(DUMMY_CUSTOMERS, customer);
  const results = parts.map((part) => ({
    partNumber: part.partNumber ?? null,
    revision: part.revision ?? null,
    sourceFile: part.sourceDrawingFile ?? null,
    previousQuote: matchedCustomer
      ? DUMMY_QUOTES.find((quote) => quote.customerId === matchedCustomer.id && quote.partNumber === part.partNumber)
      : null,
  }));

  return {
    mode: "dummy",
    customer: { matched: Boolean(matchedCustomer), record: matchedCustomer ?? null },
    parts: results,
    message: "Using dummy Odoo records. Configure ODOO_URL, ODOO_DB, ODOO_USERNAME, and ODOO_API_KEY for live checks.",
  };
}

function findCustomer(customers, customer) {
  const email = customer.email?.trim().toLowerCase();
  const company = customer.company?.trim().toLowerCase();
  return customers.find((candidate) => (email && candidate.email.toLowerCase() === email) || (company && candidate.company.toLowerCase() === company));
}

async function crossCheckLiveOdoo({ customer, parts }) {
  const uid = await odooCall("common", "authenticate", [process.env.ODOO_DB, process.env.ODOO_USERNAME, process.env.ODOO_API_KEY, {}]);
  if (!uid) throw new Error("Odoo authentication failed.");

  const partnerDomain = [];
  if (customer.email) partnerDomain.push(["email", "ilike", customer.email]);
  if (customer.company) partnerDomain.push(["name", "ilike", customer.company]);
  const partners = await odooCall("object", "execute_kw", [process.env.ODOO_DB, uid, process.env.ODOO_API_KEY, "res.partner", "search_read", [partnerDomain.length ? ["|", ...partnerDomain] : []], { fields: ["name", "email", "phone"], limit: 10 }]);

  return {
    mode: "live",
    customer: { matched: partners.length > 0, record: partners[0] ?? null, candidates: partners },
    parts: parts.map((part) => ({ partNumber: part.partNumber ?? null, revision: part.revision ?? null, sourceFile: part.sourceDrawingFile ?? null, previousQuote: null })),
    message: "Live customer lookup completed. Configure your Odoo quotation model fields to enable previous-price lookup.",
  };
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