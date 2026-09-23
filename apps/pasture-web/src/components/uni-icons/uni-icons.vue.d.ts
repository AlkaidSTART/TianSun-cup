import type { DefineComponent } from 'vue'

declare const UniIcons: DefineComponent<{
  type?: string
  color?: string
  size?: number | string
  customPrefix?: string
  fontFamily?: string
}>

export default UniIcons
