import { defineComponent, h } from 'vue'
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'

function createIcon(name: string, type: string) {
  return defineComponent({
    name,
    inheritAttrs: false,
    props: {
      size: {
        type: [Number, String],
        default: 16,
      },
    },
    setup(props, { attrs }) {
      return () => h(UniIcons, {
        ...attrs,
        type,
        size: props.size,
      })
    },
  })
}

export const ArrowLeftRight = createIcon('ArrowLeftRight', 'loop')
export const Baby = createIcon('Baby', 'personadd')
export const Bell = createIcon('Bell', 'notification')
export const Check = createIcon('Check', 'checkmarkempty')
export const ChevronRight = createIcon('ChevronRight', 'right')
export const CircleAlert = createIcon('CircleAlert', 'info')
export const ClipboardCheck = createIcon('ClipboardCheck', 'checkbox')
export const Home = createIcon('Home', 'home')
export const LoaderCircle = createIcon('LoaderCircle', 'spinner-cycle')
export const LocateFixed = createIcon('LocateFixed', 'location')
export const MessageSquarePlus = createIcon('MessageSquarePlus', 'chatboxes')
export const Minus = createIcon('Minus', 'minus')
export const Moon = createIcon('Moon', 'circle-filled')
export const PawPrint = createIcon('PawPrint', 'staff')
export const Plus = createIcon('Plus', 'plusempty')
export const RefreshCw = createIcon('RefreshCw', 'refreshempty')
export const ShoppingBasket = createIcon('ShoppingBasket', 'cart')
export const Sprout = createIcon('Sprout', 'star')
export const StickyNote = createIcon('StickyNote', 'compose')
export const Syringe = createIcon('Syringe', 'medal')
export const TriangleAlert = createIcon('TriangleAlert', 'info-filled')
export const UserRound = createIcon('UserRound', 'person')
export const Waves = createIcon('Waves', 'map')
export const WifiOff = createIcon('WifiOff', 'info')
export const Wrench = createIcon('Wrench', 'gear')
export const X = createIcon('X', 'closeempty')
