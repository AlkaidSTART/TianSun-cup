// No DOM or renderer state: also exercised by Node unit tests.
export function sceneQuality(mobile = false) {
  return mobile ? { fps: 30, pixelRatio: 1.5, concurrency: 4 } : { fps: 60, pixelRatio: 2, concurrency: 8 };
}

export function createTapTracker(threshold = 8) {
  const pointers = new Map();
  let gesture = false;
  return {
    down(event) {
      if (!pointers.size) gesture = false;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, moved: false });
      if (pointers.size > 1) gesture = true;
    },
    move(event) {
      const point = pointers.get(event.pointerId);
      if (point && Math.hypot(event.clientX - point.x, event.clientY - point.y) > threshold) point.moved = true;
    },
    up(event) {
      const point = pointers.get(event.pointerId);
      const tap = !!point && !gesture && !point.moved && Math.hypot(event.clientX - point.x, event.clientY - point.y) <= threshold;
      pointers.delete(event.pointerId);
      return tap;
    },
    cancel(event) { gesture = true; pointers.delete(event.pointerId); },
    reset() { pointers.clear(); gesture = false; }
  };
}

export function hasWebGL2() {
  const canvas = document.createElement('canvas');
  let context;
  try {
    context = canvas.getContext('webgl2');
    return !!context;
  } catch { return false; }
  finally { context?.getExtension('WEBGL_lose_context')?.loseContext(); }
}

// THREE objects are never sent over the uni-app logic/view bridge.
export function animalSnapshot(animal, areaName, location) {
  return {
    kind: 'animal', id: animal.id, type: animal.profile.type, breed: animal.profile.breed,
    ownerName: animal.ownerName, areaId: animal.areaId, areaName,
    status: animal.status, healthStatus: animal.telemetry.healthStatus,
    metrics: JSON.parse(JSON.stringify(animal.telemetry.metrics)),
    longitude: location.longitude, latitude: location.latitude,
    recordedAt: animal.telemetry.recordedAt, lastOnlineTime: animal.lastOnlineTime,
    offlineDuration: animal.offlineDuration, dataSource: 'demo'
  };
}

export function disposeTree(object) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  object.traverse(child => {
    if (child.geometry) geometries.add(child.geometry);
    const list = Array.isArray(child.material) ? child.material : [child.material];
    list.filter(Boolean).forEach(material => {
      materials.add(material);
      Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); });
    });
  });
  textures.forEach(value => { value.dispose(); value.source?.data?.close?.(); });
  materials.forEach(value => value.dispose());
  geometries.forEach(value => value.dispose());
}
