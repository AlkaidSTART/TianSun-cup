import { createModelPreview } from './runtime/model-preview.js';
let preview;
function getPreview() {
  if (preview) return preview;
  const container = document.querySelector('#model-preview');
  const placeholder = document.createElement('div');
  placeholder.className = 'model-placeholder';
  container.appendChild(placeholder);
  preview = createModelPreview({ container, modelUrls: { '牛': `${import.meta.env.BASE_URL}models/yak.glb` },
    onState({ state, message }) {
      placeholder.textContent = message;
      placeholder.style.display = state === 'ready' ? 'none' : 'flex';
    }
  });
  return preview;
}
export function showModelPreview(type) {
  document.querySelector('#model-preview').hidden = false;
  try { getPreview().show(type); } catch (error) {
    const container = document.querySelector('#model-preview');
    container.textContent = error.message;
  }
}
export function hideModelPreview() { preview?.hide(); }
export function disposeModelPreview() { preview?.dispose(); preview = null; }
