// Explicit allowlist: never expose an entire .env object to frontend bundles.
export function resolveMapToken(...sources) {
  for (const source of sources) {
    const canonical = source?.TIANDITU_TOKEN?.trim();
    const legacy = source?.VITE_TIANDITU_TOKEN?.trim();
    if (canonical) return canonical;
    if (legacy) return legacy;
  }
  return '';
}
