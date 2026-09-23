// 越界标记：光点正上方的静态「！」符号，不闪烁、不描边、不改光点材质。
// 只有处在越界时段内的牲畜才会出现标记，越界结束后自动消失。
// 支持两种类型：常规越界（橙色「！」）和进入禁牧区（红色「！」+ 背景圆）。
import * as THREE from 'three';
import { isOverflowVisibleAtHour } from './livestock-day2-overflow.js';
import { BASE_SPRITE_SIZE } from './livestock-sprites.js';

// 与光点同处一个 Group，因此这里的数值和光点尺寸是同一套世界单位（≈米）。
export const OVERFLOW_MARKER_HEIGHT = 250;
export const OVERFLOW_MARKER_SIZE = 225;
// 标记尺寸 / 光点默认尺寸 ≈ 1.5：明显大于光点，放大后一眼就能看到，又不至于压住相邻光点。
const MARKER_SIZE_RATIO = OVERFLOW_MARKER_SIZE / BASE_SPRITE_SIZE;

function drawWarningBar(context, fillColor) {
  context.save();
  context.shadowColor = 'rgba(58, 34, 0, 0.55)';
  context.shadowBlur = 9;
  context.fillStyle = fillColor;

  const barLeft = 49;
  const barTop = 15;
  const barWidth = 30;
  const barHeight = 64;
  const barRadius = 14;
  context.beginPath();
  context.moveTo(barLeft + barRadius, barTop);
  context.lineTo(barLeft + barWidth - barRadius, barTop);
  context.quadraticCurveTo(barLeft + barWidth, barTop, barLeft + barWidth, barTop + barRadius);
  context.lineTo(barLeft + barWidth, barTop + barHeight - barRadius);
  context.quadraticCurveTo(barLeft + barWidth, barTop + barHeight, barLeft + barWidth - barRadius, barTop + barHeight);
  context.lineTo(barLeft + barRadius, barTop + barHeight);
  context.quadraticCurveTo(barLeft, barTop + barHeight, barLeft, barTop + barHeight - barRadius);
  context.lineTo(barLeft, barTop + barRadius);
  context.quadraticCurveTo(barLeft, barTop, barLeft + barRadius, barTop);
  context.closePath();
  context.fill();

  context.beginPath();
  context.arc(64, 99, 14, 0, Math.PI * 2);
  context.closePath();
  context.fill();
  context.restore();
}

function createWarningTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 128, 128);
  drawWarningBar(context, '#FF8F00');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = 'livestock-overflow-warning';
  return texture;
}

function createProhibitedWarningTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 128, 128);

  // 红色半透明背景圆：让禁牧区标记在视觉上与常规越界明显区分。
  context.save();
  context.beginPath();
  context.arc(64, 64, 58, 0, Math.PI * 2);
  context.closePath();
  context.fillStyle = 'rgba(224, 68, 67, 0.28)';
  context.fill();
  context.strokeStyle = 'rgba(224, 68, 67, 0.7)';
  context.lineWidth = 3;
  context.stroke();
  context.restore();

  drawWarningBar(context, '#E04443');

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = 'livestock-overflow-prohibited-warning';
  return texture;
}

export function createOverflowMarkerLayer({
  parent,
  schedule = [],
  height = OVERFLOW_MARKER_HEIGHT,
  size = OVERFLOW_MARKER_SIZE
}) {
  const regularTexture = createWarningTexture();
  const prohibitedTexture = createProhibitedWarningTexture();
  const regularMaterial = new THREE.SpriteMaterial({
    map: regularTexture,
    transparent: true,
    opacity: 1,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: true,
    toneMapped: false
  });
  regularMaterial.name = 'livestock-overflow-marker';
  const prohibitedMaterial = new THREE.SpriteMaterial({
    map: prohibitedTexture,
    transparent: true,
    opacity: 1,
    depthTest: true,
    depthWrite: false,
    sizeAttenuation: true,
    toneMapped: false
  });
  prohibitedMaterial.name = 'livestock-overflow-prohibited-marker';

  const group = new THREE.Group();
  group.name = 'overflow-marker-group';
  group.userData = { kind: 'overflow-marker-group' };
  parent.add(group);

  const markers = schedule.map((entry) => {
    const material = entry.overflowType === 'prohibited' ? prohibitedMaterial : regularMaterial;
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(size);
    sprite.renderOrder = 6;
    sprite.visible = false;
    sprite.userData = { kind: 'overflow-marker', overflowEntry: entry, animal: entry.animal };
    group.add(sprite);
    return sprite;
  });

  // 每帧按模拟时刻同步位置与显隐：位置始终跟着光点，越界结束就消失。
  function update(absoluteHour) {
    schedule.forEach((entry, index) => {
      const sprite = markers[index];
      const animalSprite = entry.animal.sprite;
      if (!animalSprite) {
        sprite.visible = false;
        return;
      }
      const markerScale = animalSprite.scale.x * MARKER_SIZE_RATIO;
      sprite.scale.setScalar(markerScale);
      sprite.position.copy(animalSprite.position);
      sprite.position.y += markerScale * (height / size);
      sprite.visible = Boolean(animalSprite.visible) && isOverflowVisibleAtHour(entry, absoluteHour);
    });
  }

  function visibleIds() {
    return schedule
      .filter((entry, index) => markers[index].visible)
      .map((entry) => entry.animalId);
  }

  function dispose() {
    markers.forEach((sprite) => group.remove(sprite));
    parent.remove(group);
    regularMaterial.dispose();
    prohibitedMaterial.dispose();
    regularTexture.dispose();
    prohibitedTexture.dispose();
  }

  return { markers, material: regularMaterial, group, update, visibleIds, dispose };
}
