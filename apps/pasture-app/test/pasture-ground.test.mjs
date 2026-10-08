import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { createGroundSampler } from '../../pasture-3d/src/runtime/ground-sampler.js';
const require = createRequire(new URL('../../pasture-3d/package.json', import.meta.url));
const { PlaneGeometry } = require('three');
const map = {
  demSource: { dataType: 'test', minLevel: 0 },
  projection: { getTileXWithCenterLon: x => x, getProjBoundsFromXYZ: () => [0, 0, 1, 1], mapWidth: 100 },
  geo2world: v => v, getTileCoordFromWorld: () => ({ x: 0, y: 0, z: 12 }),
  worldToLocal: v => v, localToWorld: v => v,
};
test('hundreds of ground coordinates share one DEM decode per tile', async () => {
  let loads = 0;
  const sampler = createGroundSampler(map, { loadGeometry: async () => { loads++; return new PlaneGeometry(1, 1).translate(0, 0, 7); } });
  const points = await Promise.all(Array.from({ length: 200 }, (_, i) => sampler.sample(0.1 + i / 1000, 0.6)));
  assert.equal(loads, 1);
  assert.ok(points.every(p => Math.abs(p.z - 7) < 1e-8));
  assert.ok(Math.abs(points[0].x - 0.1) < 1e-8);
  sampler.dispose();
  await assert.rejects(sampler.sample(0.2, 0.3), { name: 'AbortError' });
});
test('disposing during a DEM request settles waiters and releases late geometry', async () => {
  let finish, released = 0;
  const sampler = createGroundSampler(map, { loadGeometry: () => new Promise(resolve => { finish = resolve; }) });
  const sample = sampler.sample(0.2, 0.3);
  await Promise.resolve();
  sampler.dispose();
  await assert.rejects(sample, { name: 'AbortError' });
  const geometry = new PlaneGeometry(1, 1); geometry.addEventListener('dispose', () => released++);
  finish(geometry); await Promise.resolve(); await Promise.resolve();
  assert.equal(released, 1);
});
test('unreachable DEM requests time out and can be retried', async () => {
  const sampler = createGroundSampler(map, { timeoutMs: 5, loadGeometry: () => new Promise(() => {}) });
  await assert.rejects(sampler.sample(0.2, 0.3), /超时/);
  sampler.dispose();
});
