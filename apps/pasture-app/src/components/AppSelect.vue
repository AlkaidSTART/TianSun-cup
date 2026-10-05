<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

export interface AppSelectOption {
  label: string
  value: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: Array<AppSelectOption | string>
  placeholder?: string
  disabled?: boolean
}>(), {
  placeholder: '请选择',
  disabled: false,
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'change', value: string): void
}>()

const normalizedOptions = computed<AppSelectOption[]>(() => props.options.map((option) => (
  typeof option === 'string' ? { label: option, value: option } : option
)))
const selectedIndex = computed(() => normalizedOptions.value.findIndex((option) => option.value === props.modelValue))
const displayLabel = computed(() => normalizedOptions.value[selectedIndex.value]?.label || props.placeholder)

const instanceId = getCurrentInstance()?.uid
const triggerId = `app-select-trigger-${instanceId}`
const menuId = `app-select-menu-${instanceId}`
const shellRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const activeIndex = ref(0)

function handleChange(event: { detail: { value: number | string } }) {
  const option = normalizedOptions.value[Number(event.detail.value)]
  if (!option) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
}

function updatePosition() {
  if (typeof window === 'undefined') return
  const rect = shellRef.value?.getBoundingClientRect()
  const menu = menuRef.value
  if (!rect || !menu) return
  const margin = 8
  const gap = 6
  const desiredHeight = Math.min(300, normalizedOptions.value.length * 46 + 14)
  const below = Math.max(0, window.innerHeight - rect.bottom - margin - gap)
  const above = Math.max(0, rect.top - margin - gap)
  const placeAbove = below < Math.min(desiredHeight, 180) && above > below
  const height = Math.max(60, Math.min(desiredHeight, placeAbove ? above : below))
  const width = Math.min(window.innerWidth - margin * 2, Math.max(rect.width, 220))
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))
  const top = placeAbove ? Math.max(margin, rect.top - gap - height) : Math.min(window.innerHeight - margin - height, rect.bottom + gap)
  // uni-app H5 can skip nested menu style patches inside page slots.
  Object.assign(menu.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, maxHeight: `${height}px` })
}

function scrollToActive() {
  void nextTick(() => {
    const option = menuRef.value?.querySelectorAll<HTMLElement>('.app-select-option')[activeIndex.value]
    option?.scrollIntoView({ block: 'nearest' })
  })
}

function handleOutside(event: PointerEvent | FocusEvent) {
  const target = event.target as Node
  if (shellRef.value?.contains(target) || menuRef.value?.contains(target)) return
  closeMenu()
}

function handleViewportChange(event: Event) {
  if (menuRef.value?.contains(event.target as Node)) return
  updatePosition()
}

function attachListeners() {
  if (typeof document === 'undefined') return
  document.addEventListener('pointerdown', handleOutside, true)
  document.addEventListener('focusin', handleOutside, true)
  document.addEventListener('scroll', handleViewportChange, true)
  window.addEventListener('resize', updatePosition)
}

function detachListeners() {
  if (typeof document === 'undefined') return
  document.removeEventListener('pointerdown', handleOutside, true)
  document.removeEventListener('focusin', handleOutside, true)
  document.removeEventListener('scroll', handleViewportChange, true)
  window.removeEventListener('resize', updatePosition)
}

function closeMenu() {
  menuOpen.value = false
  detachListeners()
}

function openMenu() {
  if (props.disabled || normalizedOptions.value.length === 0) return
  activeIndex.value = Math.max(0, selectedIndex.value)
  updatePosition()
  menuOpen.value = true
  attachListeners()
  scrollToActive()
}

function toggleMenu() {
  if (menuOpen.value) closeMenu()
  else openMenu()
}

function choose(value: string) {
  emit('update:modelValue', value)
  emit('change', value)
  closeMenu()
  shellRef.value?.querySelector<HTMLElement>('.app-select-trigger')?.focus()
}

function handleKeydown(event: KeyboardEvent) {
  if (!menuOpen.value) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu()
    }
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    closeMenu()
    shellRef.value?.querySelector<HTMLElement>('.app-select-trigger')?.focus()
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const direction = event.key === 'ArrowDown' ? 1 : -1
    activeIndex.value = (activeIndex.value + direction + normalizedOptions.value.length) % normalizedOptions.value.length
    scrollToActive()
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    const option = normalizedOptions.value[activeIndex.value]
    if (option) choose(option.value)
  } else if (event.key === 'Tab') {
    closeMenu()
  }
}

watch(() => props.disabled, (disabled) => { if (disabled) closeMenu() })
onBeforeUnmount(detachListeners)
</script>

<template>
  <!-- #ifdef H5 -->
  <div ref="shellRef" class="app-select">
    <component
      :is="'button'"
      class="app-select-trigger"
      :id="triggerId"
      type="button"
      :disabled="props.disabled"
      aria-haspopup="listbox"
      :aria-expanded="menuOpen"
      :aria-controls="menuOpen ? menuId : undefined"
      @click.stop="toggleMenu"
      @keydown="handleKeydown"
    >
      <span class="app-select-label" :data-placeholder="selectedIndex < 0">{{ displayLabel }}</span>
      <span class="app-select-chevron" aria-hidden="true"></span>
    </component>
    <div :id="menuId" ref="menuRef" class="app-select-menu" role="listbox" :aria-labelledby="triggerId" :aria-hidden="!menuOpen" @keydown="handleKeydown">
      <component
        :is="'button'"
        v-for="(option, index) in normalizedOptions"
        :key="option.value"
        class="app-select-option"
        :data-active="index === activeIndex"
        type="button"
        role="option"
        :aria-selected="option.value === props.modelValue"
        @mouseenter="activeIndex = index"
        @focus="activeIndex = index"
        @click.stop="choose(option.value)"
      >
        <span class="app-select-option-label">{{ option.label }}</span>
        <AppIcon v-if="option.value === props.modelValue" name="check" :size="16" />
      </component>
    </div>
  </div>
  <!-- #endif -->
  <!-- #ifndef H5 -->
  <picker
    :range="normalizedOptions"
    range-key="label"
    :value="selectedIndex"
    :disabled="props.disabled"
    @change="handleChange"
  >
    <view class="app-select-trigger" :data-disabled="props.disabled">
      <text class="app-select-label" :data-placeholder="selectedIndex < 0">{{ displayLabel }}</text>
      <view class="app-select-chevron" aria-hidden="true" />
    </view>
  </picker>
  <!-- #endif -->
</template>

<style scoped>
.app-select { width: 100%; min-width: 0; }
.app-select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid #d8e2d9;
  border-radius: 11px;
  background: #fff;
  color: #263b30;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  text-align: left;
  box-shadow: 0 1px 2px rgba(29, 59, 48, .03);
  transition: border-color .16s ease, background-color .16s ease, box-shadow .16s ease;
}
.app-select-trigger:hover:not(:disabled) { border-color: #a9c5b0; background: #fcfefc; }
.app-select-trigger:focus-visible, .app-select-trigger[aria-expanded="true"] {
  outline: none;
  border-color: #6b9a78;
  box-shadow: 0 0 0 3px rgba(82, 139, 96, .14);
}
.app-select-trigger:disabled, .app-select-trigger[data-disabled="true"] { opacity: .55; }
.app-select-label { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-select-label[data-placeholder="true"] { color: #8a988d; }
.app-select-chevron {
  display: block;
  width: 8px;
  height: 8px;
  margin: -4px 2px 0 12px;
  flex: none;
  border-right: 1.7px solid #6f8575;
  border-bottom: 1.7px solid #6f8575;
  transform: rotate(45deg);
  transition: transform .16s ease, margin .16s ease;
}
.app-select-trigger[aria-expanded="true"] .app-select-chevron { margin-top: 4px; transform: rotate(225deg); }
.app-select-menu {
  position: fixed;
  z-index: 80;
  display: none;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #bdcfc0 transparent;
  padding: 6px;
  border: 1px solid #dfe9df;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(30, 55, 39, .16), 0 3px 10px rgba(30, 55, 39, .08);
}
/* The trigger attribute drives visibility even when nested class patches are skipped. */
.app-select-trigger[aria-expanded="true"] + .app-select-menu { display: flex; }
.app-select-option {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 42px;
  padding: 9px 11px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #35483b;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  text-align: left;
  cursor: pointer;
  flex: none;
}
.app-select-option:hover, .app-select-option[data-active="true"] { background: #f1f6f1; }
.app-select-option[aria-selected="true"] { background: #e9f3e9; color: #2d6641; font-weight: 700; }
.app-select-option[aria-selected="true"][data-active="true"] { background: #deeddf; }
.app-select-option-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-select-option :deep(uni-text) { flex: none; }
@media (prefers-reduced-motion: reduce) {
  .app-select-trigger, .app-select-chevron { transition: none; }
}
</style>
