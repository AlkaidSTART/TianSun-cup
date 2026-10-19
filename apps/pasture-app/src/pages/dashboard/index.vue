<script setup lang="ts">
import { ref } from 'vue'
import { onShow, onHide, onUnload } from '@dcloudio/uni-app'
import DashboardView from '../../views/DashboardView.vue'
import { navigateToView } from '../../utils/navigation'

const active = ref(true)
onShow(() => { active.value = true })
onHide(() => { active.value = false })
onUnload(() => { active.value = false })
</script>

<template>
  <DashboardView :active="active" @navigate="navigateToView" />
</template>
