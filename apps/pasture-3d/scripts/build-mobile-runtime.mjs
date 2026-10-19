import { build } from 'vite';
import { copyFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, '../pasture-app/src/static/pasture-3d');
// Publish atomically: uni-app's static copier can observe writes while a watcher rebuilds.
const staging = resolve(root, '.cache/mobile-runtime', String(process.pid));
let pending;

export function buildMobileRuntime({ watch = false, onRebuild = () => {} } = {}) {
  if (pending) return pending;
  pending = run(watch, onRebuild).catch(error => { pending = null; throw error; });
  return pending;
}
async function run(watch, onRebuild) {
  await mkdir(output, { recursive: true });
  await mkdir(staging, { recursive: true });
  const result = await build({
    configFile: false, root, publicDir: false, logLevel: 'warn',
    plugins: [{ name: 'pasture-mobile-assets', async writeBundle() {
      await copyFile(resolve(root, 'public/models/yak.glb'), resolve(staging, 'yak.glb'));
      await rename(resolve(staging, 'yak.glb'), resolve(output, 'yak.glb'));
      await rename(resolve(staging, 'runtime.js'), resolve(output, 'runtime.js'));
      onRebuild();
    }, buildStart() { this.addWatchFile(resolve(root, 'public/models/yak.glb')); } }],
    build: {
      outDir: staging, emptyOutDir: false, target: 'es2018', minify: true,
      lib: { entry: resolve(root, 'src/runtime/index.js'), name: 'PastureRuntime', formats: ['iife'], fileName: () => 'runtime.js' },
      rollupOptions: { output: { inlineDynamicImports: true } },
      watch: watch ? {} : null,
    },
  });
  if (watch) {
    await new Promise((resolveReady, reject) => {
      const listener = event => {
        if (event.code === 'END') { result.off('event', listener); resolveReady(); }
        if (event.code === 'ERROR') { result.off('event', listener); result.close(); reject(event.error); }
      };
      result.on('event', listener);
    });
    return result;
  }
  return null;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildMobileRuntime({ watch: process.argv.includes('--watch') });
}
