import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

// Dummy mode (no Odoo configured): the route answers without touching any network.
for (const k of ['ODOO_URL', 'ODOO_DB', 'ODOO_USERNAME', 'ODOO_API_KEY']) delete process.env[k];
const { default: odooRouter } = await import('./odoo.js');

async function withServer(fn) {
  const app = express();
  app.use('/api', odooRouter);
  const server = app.listen(0);
  try {
    return await fn(`http://127.0.0.1:${server.address().port}/api`);
  } finally {
    server.close();
  }
}

const blob = (n) => new Blob([Buffer.alloc(n, 1)]);

test('files added to one part only go to the product, never to the quotation', async () => {
  await withServer(async (base) => {
    const form = new FormData();
    form.append('saleOrderId', '7');
    form.append('files', blob(10), 'quote.pdf');
    form.append('files', blob(20), 'extra.step');
    form.append('productOnlyFiles', JSON.stringify(['extra.step|20']));
    form.append(
      'productAssignments',
      JSON.stringify([
        { fileName: 'quote.pdf', size: 10, partNumber: 'WR-1001', partName: 'Bracket' },
        { fileName: 'extra.step', size: 20, partNumber: 'WR-1001', partName: 'Bracket' },
      ]),
    );
    form.append('filedOn', '2026-11-28');
    const body = await fetch(`${base}/odoo/attachments`, { method: 'POST', body: form }).then((r) => r.json());
    assert.deepEqual(body.attached, ['quote.pdf']);
    assert.deepEqual(body.product.attached.map((a) => a.name).sort(), ['extra.step', 'quote.pdf']);
  });
});

test('a file over 25 MB is refused with a clear message', async () => {
  await withServer(async (base) => {
    const form = new FormData();
    form.append('saleOrderId', '7');
    form.append('files', blob(25 * 1024 * 1024 + 10), 'huge.step');
    const res = await fetch(`${base}/odoo/attachments`, { method: 'POST', body: form });
    assert.equal(res.status, 413);
    assert.match((await res.json()).message, /larger than 25 MB/);
  });
});
