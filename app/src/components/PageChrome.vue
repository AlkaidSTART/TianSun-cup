<script setup lang="ts">
import { Home, PawPrint, TriangleAlert, UserRound, Waves, RefreshCw } from 'lucide-vue-next'

withDefaults(defineProps<{ active: string; avatar?: string; refresh?: boolean }>(), { avatar: '李', refresh: true })
const emit = defineEmits<{ (event: 'navigate', view: string): void; (event: 'refresh'): void }>()
</script>

<template>
  <div class="app">
    <header class="topbar">
      <button class="brand" aria-label="返回总览" @click="emit('navigate', 'dashboard')"><span class="brand-mark">牧</span><span class="brand-title">牧场智控<span class="brand-sub">· 阿坝示范区</span></span></button>
      <div class="top-actions"><button v-if="refresh" class="icon-btn" aria-label="刷新数据" @click="emit('refresh')"><RefreshCw :size="17" /></button><span class="avatar">{{ avatar }}</span></div>
    </header>
    <slot />
    <nav class="bottom-nav" aria-label="主导航">
      <button class="nav-item" :class="{ active: active === 'dashboard' }" @click="emit('navigate', 'dashboard')"><Home class="nav-ico" :size="19" />总览</button>
      <button class="nav-item" :class="{ active: active === 'alerts' }" @click="emit('navigate', 'alerts')"><TriangleAlert class="nav-ico" :size="19" />告警</button>
      <button class="nav-item" :class="{ active: active === 'livestock' }" @click="emit('navigate', 'livestock')"><PawPrint class="nav-ico" :size="19" />牲畜</button>
      <button class="nav-item" :class="{ active: active === 'pasture' }" @click="emit('navigate', 'pasture')"><Waves class="nav-ico" :size="19" />草场</button>
      <button class="nav-item" :class="{ active: active === 'profile' }" @click="emit('navigate', 'profile')"><UserRound class="nav-ico" :size="19" />我的</button>
    </nav>
  </div>
</template>
