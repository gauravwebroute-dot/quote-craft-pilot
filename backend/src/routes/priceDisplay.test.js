import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import priceRouter from './price.js';

async function withServer(fn) {
  const app = express();
  app.use(express.json());
  app.use('/api', priceRouter);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    return await fn(base);
  } finally {
    server.close();
  }
}
const post = (base, body) =>
  fetch(`${base}/price`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

const part = { partNumber: 'P1', partName: 'Bracket', quantity: 10, totalSurfaceAreaSqIn: 1801.4, partMark: true, coatingBom: { process: 'Powder' } };

test('time shows whole minutes and material one decimal, while the maths keeps full precision', async () => {
  await withServer(async (base) => {
    const { results } = await post(base, { parts: [part], adjustments: {}, rateOverrides: {} });
    const c = results[0].breakdown.coating;
    assert.match(c.timeText, /^\d+ min\/unit$/);
    assert.match(c.materialText, /^\d+\.\d oz$/);
    assert.ok(Math.abs(c.timeMinutes - 1801.4 * 0.03) < 0.01, 'timeMinutes keeps the exact value');
  });
});

test('chem film text no longer carries the rate or the minimum (they live in Global Rate Settings)', async () => {
  await withServer(async (base) => {
    const off = await post(base, { parts: [part], adjustments: { chemFilm: false } });
    assert.equal(off.results[0].adjustments.chemFilm.text, 'NO');
    const on = await post(base, { parts: [part], adjustments: { chemFilm: true } });
    assert.match(on.results[0].adjustments.chemFilm.text, /^YES – \$\d+\.\d\d$/);
    assert.doesNotMatch(on.results[0].adjustments.chemFilm.text, /minimum/);
    assert.doesNotMatch(on.results[0].summary.chemFilm, /minimum/);
  });
});

test('defaults endpoint exposes the chem film minimum and the part marking rates', async () => {
  await withServer(async (base) => {
    const d = await fetch(`${base}/price/defaults`).then((r) => r.json());
    assert.ok(d.chemFilmMinimumLotFee > 0);
    assert.ok(d.partMarking.minimumCharge >= 0 && d.partMarking.ratePerUnit >= 0);
  });
});

test('part marking minimum and per-unit rate can be changed for one quote only', async () => {
  await withServer(async (base) => {
    const base1 = await post(base, { parts: [part], adjustments: {}, rateOverrides: {} });
    const defaults = await fetch(`${base}/price/defaults`).then((r) => r.json());
    const expectedDefault = Math.max(defaults.partMarking.minimumCharge, 10 * defaults.partMarking.ratePerUnit);
    assert.equal(base1.partMarking.charge, expectedDefault);
    const changed = await post(base, { parts: [part], adjustments: {}, rateOverrides: { partMarking: { minimumCharge: 500, ratePerUnit: 2 } } });
    assert.equal(changed.partMarking.charge, 500);
    const perUnit = await post(base, { parts: [{ ...part, quantity: 400 }], adjustments: {}, rateOverrides: { partMarking: { minimumCharge: 5, ratePerUnit: 2 } } });
    assert.equal(perUnit.partMarking.charge, 800);
    const again = await post(base, { parts: [part], adjustments: {}, rateOverrides: {} });
    assert.equal(again.partMarking.charge, expectedDefault, 'a later quote without overrides is unaffected');
  });
});
