<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  mode: 'date' | 'time'
  placeholder?: string
}>(), {
  placeholder: '请选择',
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const displayValue = computed(() => props.modelValue || props.placeholder)

function handleChange(event: { detail: { value: string } }) {
  emit('update:modelValue', event.detail.value)
}
</script>

<template>
  <picker :mode="props.mode" :value="props.modelValue" @change="handleChange">
    <view class="app-picker-control" :class="{ placeholder: !props.modelValue }">
      {{ displayValue }}
    </view>
  </picker>
</template>
