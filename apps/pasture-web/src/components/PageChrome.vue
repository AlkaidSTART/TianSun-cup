<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { navigateToView } from '../utils/navigation'

withDefaults(defineProps<{ active: string; avatar?: string; refresh?: boolean }>(), { avatar: '李', refresh: true })
const emit = defineEmits<{ (event: 'refresh'): void }>()

function navigate(view: string) {
  navigateToView(view)
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <button class="brand" aria-label="返回总览" @click="navigate('dashboard')"><span class="brand-mark">牧</span><span class="brand-title">牧场智控<span class="brand-sub">· 阿坝示范区</span></span></button>
      <div class="top-actions"><button v-if="refresh" class="icon-btn" aria-label="刷新数据" @click="emit('refresh')"><AppIcon name="refresh" :size="17" /></button><span class="avatar">{{ avatar }}</span></div>
    </header>
    <slot />
    <nav class="bottom-nav" aria-label="主导航">
      <button class="nav-item" :class="{ active: active === 'dashboard' }" @click="navigate('dashboard')"><AppIcon name="home" :size="19" />总览</button>
      <button class="nav-item" :class="{ active: active === 'alerts' }" @click="navigate('alerts')"><AppIcon name="alert" :size="19" />告警</button>
      <button class="nav-item" :class="{ active: active === 'livestock' }" @click="navigate('livestock')"><AppIcon name="livestock" :size="19" />牲畜</button>
      <button class="nav-item" :class="{ active: active === 'pasture' }" @click="navigate('pasture')"><AppIcon name="pasture" :size="19" />草场</button>
      <button class="nav-item" :class="{ active: active === 'profile' }" @click="navigate('profile')"><AppIcon name="profile" :size="19" />我的</button>
    </nav>
  </div>
</template>
