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
function handleBrowserChange(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <!-- #ifdef H5 -->
  <component
    :is="'input'"
    class="app-picker-control"
    :class="{ placeholder: !props.modelValue }"
    :type="props.mode"
    :value="props.modelValue"
    @change="handleBrowserChange"
  />
  <!-- #endif -->
  <!-- #ifndef H5 -->
  <picker :mode="props.mode" :value="props.modelValue" @change="handleChange">
    <view class="app-picker-control" :class="{ placeholder: !props.modelValue }">
      {{ displayValue }}
    </view>
  </picker>
  <!-- #endif -->
</template>

<style scoped>
input.app-picker-control { display: block; width: 100%; font-family: inherit; }
</style>
