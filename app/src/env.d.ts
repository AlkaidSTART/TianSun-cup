/// <reference types="vite/client" />
/// <reference types="@dcloudio/types" />

declare module '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue' {
  import type { DefineComponent } from 'vue'

  const UniIcons: DefineComponent<{
    type?: string
    color?: string
    size?: number | string
    customPrefix?: string
    fontFamily?: string
  }>

  export default UniIcons
}

declare module 'lucide-vue-next' {
  import type { DefineComponent } from 'vue'

  const Icon: DefineComponent<{
    size?: number | string
    color?: string
  }>

  export const ArrowLeftRight: typeof Icon
  export const Baby: typeof Icon
  export const Bell: typeof Icon
  export const Check: typeof Icon
  export const ChevronRight: typeof Icon
  export const CircleAlert: typeof Icon
  export const ClipboardCheck: typeof Icon
  export const Home: typeof Icon
  export const LoaderCircle: typeof Icon
  export const LocateFixed: typeof Icon
  export const MessageSquarePlus: typeof Icon
  export const Minus: typeof Icon
  export const Moon: typeof Icon
  export const PawPrint: typeof Icon
  export const Plus: typeof Icon
  export const RefreshCw: typeof Icon
  export const ShoppingBasket: typeof Icon
  export const Sprout: typeof Icon
  export const StickyNote: typeof Icon
  export const Syringe: typeof Icon
  export const TriangleAlert: typeof Icon
  export const UserRound: typeof Icon
  export const Waves: typeof Icon
  export const WifiOff: typeof Icon
  export const Wrench: typeof Icon
  export const X: typeof Icon
}
