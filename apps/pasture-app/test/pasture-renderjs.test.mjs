import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/renderjs/pasture-renderer.js', import.meta.url), 'utf8')
  .replace('export default {', 'module.exports = {');
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

function harness({ delayedScript = false } = {}) {
  const calls = [], listeners = new Map(), removals = [], intersections = [], scripts = [];
  const target = () => ({
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
  });
  const api = Object.fromEntries(['dispose', 'setActive', 'setPaused', 'zoom', 'resetView', 'clearSelection', 'focusAnimal'].map(name => [name, value => calls.push([name, value])]));
  const preview = Object.fromEntries(['dispose', 'setActive', 'show', 'hide'].map(name => [name, value => calls.push([`preview:${name}`, value])]));
  const runtime = {
    createPastureScene(options) { calls.push(['create', options.token]); return api; },
    createModelPreview() { calls.push(['createPreview']); return preview; },
  };
  const host = { isConnected: true, querySelector: () => ({}) };
  const window = { ...target(), PastureRuntime: delayedScript ? undefined : runtime };
  const document = { ...target(), hidden: false, baseURI: 'file:///app/www/__uniappview.html', documentElement: {},
    body: { style: { overflow: 'auto' } }, getElementById: () => host,
    head: { appendChild(script) { scripts.push(script); } }, createElement: () => ({ remove() {} }),
  };
  const makeObserver = list => class {
    constructor(callback) { this.callback = callback; this.disconnected = false; list.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  };
  const module = { exports: {} };
  runInNewContext(source, { module, document, window, URL, Promise, WeakMap, setTimeout, clearTimeout,
    MutationObserver: makeObserver(removals), IntersectionObserver: makeObserver(intersections),
  });
  const adapter = module.exports;
  // Native renderjs is mounted on a helper comment, not on the component host.
  const instance = { $el: {}, $ownerInstance: { callMethod: (name, event) => calls.push(['emit', name, event]) } };
  let config = { hostId: 'scene-test', token: 'test-key', assetRoot: './static/pasture-3d/', revision: 0, active: true, selection: null, command: { id: 0, type: '' } };
  const configure = update => {
    config = { ...config, ...update };
    adapter.methods.onState.call(instance, config, null, instance.$ownerInstance);
  };
  configure({}); adapter.mounted.call(instance);
  return { calls, runtime, window, document, host, removals, intersections, scripts, configure, listeners };
}

test('renderjs commands cross once; model popup pauses background and restores scroll', async () => {
  const h = harness(); await settle();
  assert.equal(h.calls.filter(call => call[0] === 'create').length, 1);
  h.configure({ command: { id: 1, type: 'zoom', value: 1.25 } });
  h.configure({});
  assert.equal(h.calls.filter(call => call[0] === 'zoom').length, 1);
  h.configure({ selection: { kind: 'animal', id: 'cow', type: '牛' } });
  assert.equal(h.document.body.style.overflow, 'hidden');
  assert.ok(h.calls.some(call => call[0] === 'preview:show' && call[1] === '牛'));
  assert.deepEqual(h.calls.filter(call => call[0] === 'setActive').at(-1), ['setActive', false]);
  h.configure({ selection: null, command: { id: 2, type: 'clear' } });
  assert.equal(h.document.body.style.overflow, 'auto');
  assert.deepEqual(h.calls.filter(call => call[0] === 'setActive').at(-1), ['setActive', true]);
  h.host.isConnected = false; h.removals[0].callback();
});

test('page visibility and viewport visibility pause; removal disposes exactly once', async () => {
  const h = harness(); await settle();
  h.intersections[0].callback([{ isIntersecting: false }]);
  assert.deepEqual(h.calls.filter(call => call[0] === 'setActive').at(-1), ['setActive', false]);
  h.intersections[0].callback([{ isIntersecting: true }]);
  h.configure({ active: false });
  assert.deepEqual(h.calls.filter(call => call[0] === 'setActive').at(-1), ['setActive', false]);
  h.host.isConnected = false; h.removals[0].callback(); h.removals[0].callback();
  assert.equal(h.calls.filter(call => call[0] === 'dispose').length, 1);
  assert.equal(h.listeners.size, 0);
  assert.ok(h.removals[0].disconnected && h.intersections[0].disconnected);
});

test('late script loading cannot resurrect a scene after the page is removed', async () => {
  const h = harness({ delayedScript: true });
  assert.equal(h.scripts.length, 1);
  h.host.isConnected = false; h.removals[0].callback();
  h.window.PastureRuntime = h.runtime; h.scripts[0].onload(); await settle();
  assert.equal(h.calls.filter(call => call[0] === 'create').length, 0);
});

test('sheep selection is an explicit empty state and does not load the cow model', async () => {
  const h = harness(); await settle();
  h.configure({ selection: { kind: 'animal', id: 'sheep', type: '羊' } });
  assert.equal(h.calls.filter(call => call[0] === 'createPreview').length, 0);
  assert.ok(h.calls.some(call => call[0] === 'emit' && call[2]?.state === 'empty' && call[2]?.message === '暂无羊模型'));
  h.host.isConnected = false; h.removals[0].callback();
});
