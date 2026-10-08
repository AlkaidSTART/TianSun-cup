import * as THREE from 'three';
import { getDEMLoader } from 'three-tile';

// The detailed sampling API creates, downloads and decodes a DEM mesh for every
// coordinate. Routes have hundreds of points but only a handful of level-12
// tiles. Reuse those CPU-only meshes per scene, without altering global caches
// or three-tile's shared worker/LoadingManager state.
export function createGroundSampler(map, { timeoutMs = 12000, loadGeometry } = {}) {
  const cache = new Map();
  const material = new THREE.MeshBasicMaterial();
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, 0, -1);
  let disposed = false;
  const aborted = () => new DOMException('Scene disposed', 'AbortError');

  function tileAt(source, coord, bounds) {
    const key = `${source.dataType}:${coord.z}:${coord.x}:${coord.y}`;
    if (cache.has(key)) return cache.get(key).promise;
    const entry = { mesh: null, cancel: null, promise: null };
    entry.promise = new Promise((resolve, reject) => {
      let finished = false;
      const fail = error => {
        if (finished) return;
        finished = true; clearTimeout(timer); cache.delete(key); reject(error);
      };
      const timer = setTimeout(() => fail(new Error('高程瓦片加载超时')), timeoutMs);
      entry.cancel = () => fail(aborted());
      const params = { source, ...coord, x: map.projection.getTileXWithCenterLon(coord.x, coord.z), projBounds: bounds };
      Promise.resolve().then(() => loadGeometry ? loadGeometry(params) : getDEMLoader(source.dataType).load(params)).then(geometry => {
        if (disposed || finished) { geometry.dispose(); return; }
        finished = true; clearTimeout(timer);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2, 0);
        mesh.scale.set(bounds[2] - bounds[0], bounds[3] - bounds[1], 1);
        mesh.updateMatrixWorld(true);
        entry.mesh = mesh; resolve(mesh);
      }, fail);
    });
    cache.set(key, entry);
    return entry.promise;
  }
  return {
    async sample(longitude, latitude, level = 12) {
      if (disposed) throw aborted();
      const source = map.demSource;
      if (!source || level < source.minLevel) return null;
      const world = map.geo2world(new THREE.Vector3(longitude, latitude, 0));
      const coord = map.getTileCoordFromWorld(world, level);
      if (!coord) return null;
      const bounds = map.projection.getProjBoundsFromXYZ(coord.x, coord.y, coord.z);
      const mesh = await tileAt(source, coord, bounds);
      if (disposed) throw aborted();
      const local = map.worldToLocal(world.clone());
      const width = map.projection.mapWidth;
      local.x = ((local.x + width / 2) % width + width) % width - width / 2;
      ray.set(new THREE.Vector3(local.x, local.y, 10000), down);
      const hit = ray.intersectObject(mesh, false)[0];
      return hit ? map.localToWorld(hit.point.clone()) : null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of [...cache.values()]) { entry.cancel(); entry.mesh?.geometry.dispose(); }
      cache.clear(); material.dispose();
    },
  };
}
