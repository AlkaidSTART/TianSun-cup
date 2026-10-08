import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sceneQuality, createTapTracker, animalSnapshot, disposeTree } from '../../pasture-3d/src/runtime/support.js';
import { resolveMapToken } from '../../../scripts/map-env.mjs';
import { createLivestockData } from '../../pasture-3d/src/livestock-sprites.js';
import { HERDER_ACTIVITY_RANGES } from '../../pasture-3d/src/config.js';
import { createDayOneOfflineSchedule, validateDayOneOfflineSchedule } from '../../pasture-3d/src/livestock-offline.js';
import { createDayTwoOverflowSchedule, validateDayTwoOverflowSchedule } from '../../pasture-3d/src/livestock-day2-overflow.js';
import { createDayThreeOverflowSchedule, validateDayThreeOverflowSchedule } from '../../pasture-3d/src/livestock-day3-overflow.js';

const pointer = (pointerId, clientX = 0, clientY = 0) => ({ pointerId, clientX, clientY });
test('mobile quality is bounded independently of desktop', () => {
  assert.deepEqual(sceneQuality(true), { fps: 30, pixelRatio: 1.5, concurrency: 4 });
  assert.equal(sceneQuality(false).fps, 60);
});
test('tap selection does not fire for dragging, returning drags or multitouch', () => {
  const taps = createTapTracker();
  taps.down(pointer(1)); assert.equal(taps.up(pointer(1, 3, 2)), true);
  taps.down(pointer(1)); taps.move(pointer(1, 20)); assert.equal(taps.up(pointer(1)), false);
  taps.down(pointer(1)); taps.down(pointer(2));
  assert.equal(taps.up(pointer(2)), false); assert.equal(taps.up(pointer(1)), false);
  taps.down(pointer(1)); taps.cancel(pointer(1)); assert.equal(taps.up(pointer(1)), false);
  taps.down(pointer(1)); taps.reset(); assert.equal(taps.up(pointer(1)), false);
});
test('map key resolution supports legacy config but never returns backend secrets', () => {
  assert.equal(resolveMapToken({ TIANDITU_TOKEN: ' canonical ', VITE_TIANDITU_TOKEN: 'old' }), 'canonical');
  assert.equal(resolveMapToken({ VITE_TIANDITU_TOKEN: 'old' }), 'old');
  assert.equal(resolveMapToken({ TIANDITU_TOKEN: 'env' }, { TIANDITU_TOKEN: 'file' }), 'env');
  assert.equal(resolveMapToken({ TIANDITU_TOKEN: ' ' }, { VITE_TIANDITU_TOKEN: 'root' }), 'root');
  assert.equal(resolveMapToken({ MAXKB_API_KEY: 'never-client-side' }), '');
});
test('selection snapshots contain demo values, not circular Three objects', () => {
  const animal = createLivestockData()[0];
  animal.sprite = { animal };
  const snapshot = animalSnapshot(animal, '测试草场', { longitude: 102, latitude: 33 });
  assert.equal(snapshot.dataSource, 'demo');
  assert.equal(snapshot.id, animal.id);
  assert.equal(snapshot.longitude, 102);
  assert.equal('sprite' in snapshot, false);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  snapshot.metrics.bodyTemperature.value = 0;
  assert.notEqual(animal.telemetry.metrics.bodyTemperature.value, 0);
});
test('shared GPU resources are disposed exactly once, including textures', () => {
  const counts = { geometry: 0, material: 0, texture: 0 };
  const texture = { isTexture: true, dispose: () => counts.texture++ };
  const material = { map: texture, normalMap: texture, dispose: () => counts.material++ };
  const geometry = { dispose: () => counts.geometry++ };
  disposeTree({ traverse(fn) { fn({ geometry, material }); fn({ geometry, material: [material] }); } });
  assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1 });
});
test('all three original demo schedules still validate with 60 deterministic animals', () => {
  const livestock = createLivestockData();
  assert.equal(livestock.length, 60);
  assert.equal(livestock.filter(animal => animal.profile.type === '羊').length, 15);
  assert.deepEqual(livestock.map(animal => animal.id), createLivestockData().map(animal => animal.id));
  assert.equal(validateDayOneOfflineSchedule(createDayOneOfflineSchedule(livestock)).summary.passed, true);
  assert.equal(validateDayTwoOverflowSchedule(createDayTwoOverflowSchedule({ livestock, ranges: HERDER_ACTIVITY_RANGES })).summary.passed, true);
  assert.equal(validateDayThreeOverflowSchedule(createDayThreeOverflowSchedule({ livestock, ranges: HERDER_ACTIVITY_RANGES })).summary.passed, true);
});
