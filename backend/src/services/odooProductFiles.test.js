import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachFilesToProducts,
  attachFilesToSaleOrder,
  stampFilename,
  stripDateStamp,
} from './odooCreateQuotation.js';

// A tiny fake Odoo (JSON-RPC over fetch). Records every create; never touches a network.
function installFakeOdoo({ existingProducts = {}, existingAttachments = [], rejectPdfOnProduct = false } = {}) {
  const state = { creates: [], nextId: 100, products: { ...existingProducts }, attachments: [...existingAttachments] };
  process.env.ODOO_URL = 'https://fake.odoo.test';
  process.env.ODOO_DB = 'db';
  process.env.ODOO_USERNAME = 'u';
  process.env.ODOO_API_KEY = 'k';
  delete process.env.ODOO_PRODUCT_CATEGORY;
  globalThis.fetch = async (_url, init) => {
    const { params } = JSON.parse(init.body);
    let result;
    if (params.service === 'common') {
      result = 7;
    } else {
      const [, , , model, method, args] = params.args;
      if (model === 'ir.attachment' && method === 'fields_get') result = {};
      else if (model === 'product.product' && method === 'search_read') {
        const code = args[0][0][2];
        result = state.products[code] ? [{ product_tmpl_id: [state.products[code], 'x'] }] : [];
      } else if (model === 'product.template' && method === 'create') {
        const id = state.nextId++;
        state.products[args[0].default_code] = id;
        state.creates.push({ model, vals: args[0], id });
        result = id;
      } else if (model === 'ir.attachment' && method === 'search_read') {
        const resId = args[0][1][2];
        const resModel = args[0][0][2];
        result = state.attachments.filter((a) => a.res_model === resModel && a.res_id === resId);
      } else if (model === 'ir.attachment' && method === 'create') {
        const v = args[0];
        if (rejectPdfOnProduct && v.res_model === 'product.template' && v.name.endsWith('.pdf')) {
          return {
            ok: true,
            json: async () => ({ error: { data: { message: 'It seems that we are not able to process this pdf inside a quotation.' } } }),
          };
        }
        const id = state.nextId++;
        state.creates.push({ model, vals: v, id });
        state.attachments.push({ name: v.name, file_size: Buffer.from(v.raw ?? v.datas, 'base64').length, res_model: v.res_model, res_id: v.res_id });
        result = id;
      } else throw new Error(`unexpected ${model}.${method}`);
    }
    return { ok: true, json: async () => ({ result }) };
  };
  return state;
}

const file = (name, size = 10, mimetype = 'application/octet-stream') => ({
  originalname: name,
  mimetype,
  buffer: Buffer.alloc(size, 1),
});
const assign = (f, partNumber, partName) => ({ fileName: f.originalname, size: f.buffer.length, partNumber, partName });

test('date stamp helpers add the date once and compare without it', () => {
  assert.equal(stampFilename('drawing.pdf', '2026-11-27'), 'drawing_2026-11-27.pdf');
  assert.equal(stampFilename('drawing_2026-11-01.pdf', '2026-11-27'), 'drawing_2026-11-27.pdf');
  assert.equal(stampFilename('README', '2026-11-27'), 'README_2026-11-27');
  assert.equal(stripDateStamp('WR-1001_2026-11-26.step'), 'WR-1001.step');
  assert.equal(stripDateStamp('WR-1001.step'), 'WR-1001.step');
});

test('quotation files are sent with raw (Odoo 20), not datas', async () => {
  const state = installFakeOdoo();
  const r = await attachFilesToSaleOrder({ saleOrderId: 5, files: [file('a.step', 20)] });
  assert.deepEqual(r.attached, ['a.step']);
  const v = state.creates.find((c) => c.model === 'ir.attachment').vals;
  assert.ok(v.raw && !('datas' in v));
  assert.equal(Buffer.from(v.raw, 'base64').length, 20);
});

test('a new part number creates the product and files it with dated names', async () => {
  const state = installFakeOdoo();
  const f1 = file('WR-1001.step', 30);
  const f2 = file('WR-1001.pdf', 40, 'application/pdf');
  const r = await attachFilesToProducts({
    files: [f1, f2],
    assignments: [assign(f1, 'WR-1001', 'Bracket'), assign(f2, 'WR-1001', 'Bracket')],
    quoteNumber: 'QP26-0007',
    filedOn: '2026-11-27',
  });
  const product = state.creates.find((c) => c.model === 'product.template');
  assert.equal(product.vals.default_code, 'WR-1001');
  assert.equal(product.vals.name, 'Bracket');
  assert.equal(product.vals.company_id, false);
  assert.deepEqual(r.attached.map((a) => a.storedAs).sort(), ['WR-1001_2026-11-27.pdf', 'WR-1001_2026-11-27.step']);
  assert.ok(r.attached.every((a) => a.productCreated));
  const att = state.creates.filter((c) => c.model === 'ir.attachment');
  assert.ok(att.every((c) => c.vals.res_model === 'product.template' && c.vals.res_id === product.id));
  assert.ok(att.every((c) => c.vals.description === 'Filed from quote QP26-0007'));
});

test('an existing part is reused; same name and size is skipped whatever the date, a changed file is added', async () => {
  const state = installFakeOdoo({
    existingProducts: { 'WR-1001': 55 },
    existingAttachments: [{ name: 'WR-1001_2026-10-01.step', file_size: 30, res_model: 'product.template', res_id: 55 }],
  });
  const same = file('WR-1001.step', 30);
  const changed = file('WR-1001.pdf', 41, 'application/pdf');
  const r = await attachFilesToProducts({
    files: [same, changed],
    assignments: [assign(same, 'WR-1001'), assign(changed, 'WR-1001')],
    filedOn: '2026-11-27',
  });
  assert.equal(state.creates.filter((c) => c.model === 'product.template').length, 0);
  assert.deepEqual(r.skipped.map((s) => s.name), ['WR-1001.step']);
  assert.deepEqual(r.attached.map((a) => a.storedAs), ['WR-1001_2026-11-27.pdf']);
  assert.equal(r.attached[0].productCreated, false);
});

test('a PDF that Odoo refuses on the product gives an English warning and does not stop the other files', async () => {
  installFakeOdoo({ rejectPdfOnProduct: true });
  const pdf = file('locked.pdf', 50, 'application/pdf');
  const step = file('part.step', 60);
  const r = await attachFilesToProducts({
    files: [pdf, step],
    assignments: [assign(pdf, 'AB-3001'), assign(step, 'AB-3001')],
    filedOn: '2026-11-27',
  });
  assert.deepEqual(r.attached.map((a) => a.name), ['part.step']);
  assert.equal(r.failed.length, 1);
  assert.match(r.failed[0].error, /password-protected or restricted/);
  assert.match(r.failed[0].error, /still attached to the quotation/);
});

test('files over 25 MB and files with no matching part are refused with a clear message', async () => {
  installFakeOdoo();
  const big = file('big.step', 25 * 1024 * 1024 + 1);
  const orphan = file('orphan.step', 5);
  const r = await attachFilesToProducts({
    files: [big, orphan],
    assignments: [assign(big, 'GH-1001'), { fileName: 'orphan.step', size: 5, partNumber: '' }],
  });
  assert.equal(r.attached.length, 0);
  assert.match(r.failed.find((x) => x.name === 'big.step').error, /larger than 25 MB/);
  assert.match(r.failed.find((x) => x.name === 'orphan.step').error, /could not be matched to a part number/);
});
