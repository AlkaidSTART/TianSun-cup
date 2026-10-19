import 'vue'

// uni-app injects named renderjs modules during compilation, outside vue-tsc.
declare module 'vue' {
  interface ComponentCustomProperties {
    pastureRenderer: { onState(value: unknown, oldValue?: unknown, owner?: unknown): void }
  }
}
