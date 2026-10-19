export function buildMobileRuntime(options?: { watch?: boolean; onRebuild?: () => void }): Promise<{ close(): Promise<void> } | null>;
