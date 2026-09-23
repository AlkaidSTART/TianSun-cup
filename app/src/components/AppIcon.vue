<script setup lang="ts">
import UniIcons from '@dcloudio/uni-ui/lib/uni-icons/uni-icons.vue'

const props = withDefaults(defineProps<{
  name: string
  size?: number
  color?: string
}>(), {
  size: 16,
  color: 'currentColor',
})

const iconNames: Record<string, string> = {
  alert: 'info-filled',
  baby: 'personadd',
  bell: 'notification',
  check: 'checkmarkempty',
  chevronRight: 'right',
  circleAlert: 'info',
  close: 'closeempty',
  dashboard: 'home',
  device: 'gear',
  home: 'home',
  livestock: 'staff',
  loading: 'spinner-cycle',
  locate: 'location',
  maintenance: 'star',
  message: 'chatboxes',
  minus: 'minus',
  moon: 'circle-filled',
  pasture: 'map',
  plus: 'plusempty',
  profile: 'person',
  refresh: 'refreshempty',
  rotation: 'loop',
  shoppingBasket: 'cart',
  syringe: 'medal',
  todo: 'compose',
  wifiOff: 'info',
  wrench: 'gear',
}

const iconName = props.name in iconNames ? iconNames[props.name] : props.name
</script>

<template>
  <UniIcons :type="iconName" :size="props.size" :color="props.color" />
</template>
