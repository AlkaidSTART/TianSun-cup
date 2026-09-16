<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import AlertsView from './views/AlertsView.vue'
import ConsultationView from './views/ConsultationView.vue'
import DashboardView from './views/DashboardView.vue'
import LivestockView from './views/LivestockView.vue'
import PastureView from './views/PastureView.vue'
import ProfileView from './views/ProfileView.vue'
import { startRotationScheduleCleanup } from './data/rotationSchedule'

type ViewName = 'dashboard' | 'alerts' | 'livestock' | 'pasture' | 'profile' | 'consultation'
const validViews: ViewName[] = ['dashboard', 'alerts', 'livestock', 'pasture', 'profile', 'consultation']
const currentView = ref<ViewName>('dashboard')
let stopRotationScheduleCleanup: (() => void) | undefined

function readView(): ViewName {
  const hash = window.location.hash.replace(/^#/, '') as ViewName
  return validViews.includes(hash) ? hash : 'dashboard'
}

function syncView() {
  currentView.value = readView()
  window.scrollTo({ top: 0, behavior: 'auto' })
}

function navigate(view: string) {
  const next = validViews.includes(view as ViewName) ? view : 'dashboard'
  if (window.location.hash !== `#${next}`) window.location.hash = next
  else syncView()
}

onMounted(() => {
  stopRotationScheduleCleanup = startRotationScheduleCleanup()
  syncView()
  window.addEventListener('hashchange', syncView)
})
onBeforeUnmount(() => {
  stopRotationScheduleCleanup?.()
  window.removeEventListener('hashchange', syncView)
})
</script>

<template>
  <DashboardView v-if="currentView === 'dashboard'" @navigate="navigate" />
  <AlertsView v-else-if="currentView === 'alerts'" />
  <LivestockView v-else-if="currentView === 'livestock'" />
  <PastureView v-else-if="currentView === 'pasture'" />
  <ProfileView v-else-if="currentView === 'profile'" />
  <ConsultationView v-else />
</template>
