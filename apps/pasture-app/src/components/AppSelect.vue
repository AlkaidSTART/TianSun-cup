<script setup lang="ts">
import { computed } from 'vue'

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
const displayLabel = computed(() => {
  const selected = normalizedOptions.value[selectedIndex.value]
  return selected?.label || props.placeholder
})

function handleChange(event: { detail: { value: number | string } }) {
  const option = normalizedOptions.value[Number(event.detail.value)]
  if (!option) return
  emit('update:modelValue', option.value)
  emit('change', option.value)
}
</script>

<template>
  <picker
    :range="normalizedOptions"
    range-key="label"
    :value="selectedIndex"
    :disabled="props.disabled"
    @change="handleChange"
  >
    <view class="app-picker-control" :class="{ placeholder: selectedIndex < 0 }">
      {{ displayLabel }}
    </view>
  </picker>
</template>
