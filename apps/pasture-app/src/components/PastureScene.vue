<script lang="ts">
import { defineComponent } from 'vue'
import type { SceneSelection, SceneEvent, PreviewState } from '../types/pasture-scene'

let nextSceneId = 0
let assetRoot = './static/pasture-3d/'
// #ifdef H5
assetRoot = `${import.meta.env.BASE_URL}static/pasture-3d/`
// #endif

export default defineComponent({
  props: { active: { type: Boolean, default: true } },
  data() {
    return {
      hostId: `pasture-scene-${Date.now()}-${++nextSceneId}`, revision: 0, commandId: 0,
      command: { id: 0, type: '', value: null as string | number | boolean | null },
      sceneState: 'loading', progress: '正在准备 3D 场景…', errorTitle: '', errorMessage: '',
      serviceMessage: '', serviceWarning: false, terrainAvailable: true,
      time: '10:00', day: 1, phase: '放牧', total: 60, manualPaused: false,
      selection: null as SceneSelection | null,
      previewState: 'loading' as PreviewState, previewMessage: '',
    }
  },
  computed: {
    bridgeState() {
      return { hostId: this.hostId, token: __PASTURE_MAP_TOKEN__, assetRoot, revision: this.revision, active: this.active,
        command: this.command, selection: this.selection ? { kind: this.selection.kind, id: this.selection.id,
          type: this.selection.kind === 'animal' ? this.selection.type : '' } : null }
    },
    statusLabel(): string {
      if (this.selection?.kind !== 'animal') return ''
      return ({ normal: '正常', attention: '需关注', abnormal: '异常', offline: '离线' } as Record<string, string>)[this.selection.status] || this.selection.status
    },
  },
  methods: {
    send(type: string, value: string | number | boolean | null = null) {
      this.command = { id: ++this.commandId, type, value }
    },
    handleSceneEvent(event: SceneEvent) {
      switch (event.type) {
        case 'loading': this.progress = event.message; break
        case 'ready': this.sceneState = 'ready'; this.terrainAvailable = event.terrainAvailable; break
        case 'error': this.sceneState = 'error'; this.errorTitle = event.title; this.errorMessage = event.message; break
        case 'service': this.serviceMessage = event.message; this.serviceWarning = event.state === 'warning' || event.state === 'error'; break
        case 'state': this.time = event.time; this.day = event.day; this.phase = event.phase; this.total = event.total; this.manualPaused = event.manualPaused; break
        case 'selection':
          this.selection = event.selection
          this.previewState = 'loading'; this.previewMessage = '正在加载牲畜模型…'
          break
        case 'preview': this.previewState = event.state; this.previewMessage = event.message; break
      }
    },
    closeSelection() { this.selection = null; this.send('clear') },
    focusSelection() {
      if (this.selection?.kind !== 'animal') return
      const id = this.selection.id; this.selection = null; this.send('focus', id)
    },
    retry() {
      this.selection = null; this.sceneState = 'loading'; this.progress = '正在重新加载…'
      this.serviceWarning = false; this.serviceMessage = ''; this.revision += 1
    },
    retryPreview() { this.previewState = 'loading'; this.previewMessage = '正在重新加载模型…'; this.send('retry-preview') },
  },
})
</script>

<script module="pastureRenderer" lang="renderjs">
import renderer from '../renderjs/pasture-renderer.js'
export default renderer
</script>

<template>
  <view :id="hostId" class="pasture-scene" :scene-state="bridgeState" :change:scene-state="pastureRenderer.onState">
    <view class="pasture-viewport">
      <view class="pasture-canvas" aria-label="可旋转和缩放的牧场三维演示场景" />
      <view class="pasture-badge">演示数据 · {{ total }} 头</view>
      <view v-if="sceneState === 'ready'" class="pasture-clock">第 {{ day }} 天 {{ time }} · {{ phase }}</view>
      <view v-if="sceneState !== 'ready'" class="pasture-loading" role="status">
        <template v-if="sceneState === 'loading'">
          <view class="pasture-spinner" /><text class="pasture-loading-title">正在加载 3D 牧场</text><text>{{ progress }}</text>
        </template>
        <template v-else>
          <text class="pasture-loading-title">{{ errorTitle }}</text><text>{{ errorMessage }}</text>
          <button class="pasture-action" @click="retry">重新加载</button>
        </template>
      </view>
      <template v-if="sceneState === 'ready'">
        <view class="pasture-controls">
          <button class="pasture-control" aria-label="放大场景" @click="send('zoom', 1.25)">＋</button>
          <button class="pasture-control" aria-label="缩小场景" @click="send('zoom', 0.8)">−</button>
          <button class="pasture-control" aria-label="复位场景视角" @click="send('reset')">⌖</button>
          <button class="pasture-control pasture-play" :aria-label="manualPaused ? '继续演示' : '暂停演示'" @click="send('pause', !manualPaused)">{{ manualPaused ? '继续' : '暂停' }}</button>
        </view>
        <view class="pasture-legend">
          <text><text class="pasture-dot normal">●</text>正常</text><text><text class="pasture-dot attention">●</text>关注</text>
          <text><text class="pasture-dot abnormal">●</text>异常</text><text><text class="pasture-dot offline">●</text>离线</text>
        </view>
      </template>
    </view>
    <view class="pasture-caption"><text>卫星地形 · 模拟运动，与首页后台统计独立</text><text>单指旋转 · 双指缩放 / 平移</text></view>
    <view v-if="serviceWarning && sceneState === 'ready'" class="pasture-warning"><text>{{ serviceMessage }}</text><button @click="retry">重试</button></view>
    <view v-show="selection" class="pasture-dialog" @click.self="closeSelection">
      <view class="pasture-dialog-card" role="dialog" aria-modal="true" aria-label="牧场演示详情">
        <view class="pasture-dialog-head">
          <view><text class="pasture-dialog-kicker">演示数据 · 非实时档案</text><text class="pasture-dialog-title">{{ selection?.kind === 'animal' ? `牲畜 ${selection.id}` : selection?.name }}</text></view>
          <button class="pasture-close" aria-label="关闭演示详情" @click="closeSelection">×</button>
        </view>
        <view v-show="selection?.kind === 'animal'" class="pasture-model">
          <view class="pasture-model-canvas" />
          <view v-if="previewState !== 'ready'" class="pasture-model-state" role="status">
            <view v-if="previewState === 'loading'" class="pasture-spinner" /><text>{{ previewMessage }}</text>
            <button v-if="previewState === 'error'" class="pasture-action" @click="retryPreview">重试模型</button>
          </view>
          <text v-else class="pasture-model-hint">可拖动旋转 · 双指缩放</text>
        </view>
        <view v-if="selection?.kind === 'animal'" class="pasture-details">
          <view><text>类型 / 品种</text><text>{{ selection.type }} · {{ selection.breed }}</text></view>
          <view><text>所属牧户</text><text>{{ selection.ownerName }}</text></view>
          <view><text>所在草场</text><text>{{ selection.areaName }}</text></view>
          <view><text>模拟状态</text><text>{{ statusLabel }}</text></view>
          <view><text>体温</text><text>{{ selection.metrics.bodyTemperature.value.toFixed(1) }} ℃</text></view>
          <view><text>心率</text><text>{{ selection.metrics.heartRate.value }} 次/分</text></view>
          <view><text>反刍次数</text><text>{{ selection.metrics.rumination.value }} 次/天</text></view>
          <view class="pasture-detail-wide"><text>模拟位置</text><text>{{ selection.longitude.toFixed(5) }}° E · {{ selection.latitude.toFixed(5) }}° N</text></view>
        </view>
        <view v-else-if="selection?.kind === 'area'" class="pasture-details">
          <view><text>质量等级</text><text>{{ selection.quality }}</text></view><view><text>模拟载畜量</text><text>{{ selection.currentLoad }} 头</text></view>
          <view><text>理论载畜量</text><text>{{ selection.capacity }} 头</text></view><view><text>压力指数</text><text>{{ selection.pressure === null ? '∞' : selection.pressure.toFixed(2) }}</text></view>
          <view class="pasture-detail-wide"><text>模拟预警</text><text>{{ selection.overloaded ? '超载预警' : '承载正常' }}</text></view>
        </view>
        <view class="pasture-dialog-actions"><button v-if="selection?.kind === 'animal'" class="pasture-action" @click="focusSelection">定位到场景</button><button class="pasture-action secondary" @click="closeSelection">关闭</button></view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.pasture-scene { position: relative; color: #254337; }
.pasture-viewport { position: relative; height: 430px; overflow: hidden; border-radius: 14px; background: #112a30; }
.pasture-canvas, .pasture-model-canvas { position: absolute; inset: 0; }
.pasture-badge, .pasture-clock { position: absolute; top: 12px; background: rgba(12,32,32,.78); color: #fff; border: 1px solid rgba(255,255,255,.18); border-radius: 8px; font-size: 11px; padding: 6px 8px; pointer-events: none; }
.pasture-badge { left: 12px; }.pasture-clock { right: 12px; }
.pasture-loading { position: absolute; inset: 0; background: #edf3ee; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 32px; text-align: center; font-size: 12px; line-height: 1.7; color: #62746a; }
.pasture-loading-title { font-size: 16px; color: #264b38; font-weight: 600; }
.pasture-spinner { width: 22px; height: 22px; border: 2px solid #d4e4d7; border-top-color: #4b7758; border-radius: 50%; animation: pasture-spin .8s linear infinite; }
@keyframes pasture-spin { to { transform: rotate(360deg); } }
.pasture-controls { position: absolute; right: 12px; bottom: 48px; display: flex; flex-direction: column; gap: 7px; }
.pasture-control { padding: 0; margin: 0; width: 40px; height: 40px; line-height: 40px; border-radius: 10px; border: 1px solid #d9e2dc; background: rgba(255,255,255,.96); color: #2c503e; font-size: 23px; box-shadow: 0 2px 6px #0002; }
.pasture-play { font-size: 11px; }.pasture-control::after, .pasture-action::after, .pasture-close::after { border: none; }
.pasture-legend { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 10px; color: #fff; background: rgba(12,32,32,.8); border-radius: 8px; padding: 7px 10px; font-size: 11px; pointer-events: none; }
.pasture-dot { margin-right: 4px; }.normal { color: #00e676; }.attention { color: #ffd600; }.abnormal { color: #ff5368; }.offline { color: #e3f2fd; }
.pasture-caption { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; color: #718078; font-size: 10px; line-height: 1.5; }
.pasture-warning { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; color: #93601f; font-size: 11px; }.pasture-warning button { flex-shrink: 0; margin: 0; padding: 0 10px; font-size: 11px; }
.pasture-dialog { position: fixed; inset: 0; z-index: 2000; background: rgba(14,29,22,.58); display: flex; align-items: center; justify-content: center; padding: max(20px, env(safe-area-inset-top)) 18px max(20px, env(safe-area-inset-bottom)); }
.pasture-dialog-card { width: 100%; max-width: 460px; max-height: 88vh; overflow-y: auto; overscroll-behavior: contain; background: #fff; border-radius: 20px; padding: 18px; box-shadow: 0 18px 60px #0003; box-sizing: border-box; }
.pasture-dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.pasture-dialog-head > view { display: flex; flex-direction: column; gap: 5px; }
.pasture-dialog-kicker { font-size: 10px; color: #89927b; }.pasture-dialog-title { font-size: 17px; font-weight: 700; }
.pasture-close { width: 36px; height: 36px; padding: 0; margin: 0; line-height: 34px; font-size: 25px; border-radius: 50%; color: #385443; background: #f0f4ef; flex-shrink: 0; }
.pasture-model { position: relative; height: 215px; border-radius: 14px; background: radial-gradient(ellipse at center,#fff,#e9eee6); margin-top: 16px; overflow: hidden; }
.pasture-model-state { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; font-size: 13px; color: #718078; }
.pasture-model-hint { position: absolute; bottom: 8px; left: 0; right: 0; text-align: center; color: #748372; font-size: 10px; pointer-events: none; }
.pasture-details { display: grid; grid-template-columns: 1fr 1fr; gap: 15px 12px; padding: 18px 0; }.pasture-details > view { display: flex; flex-direction: column; gap: 5px; font-size: 12px; }.pasture-details > view > text:first-child { font-size: 10px; color: #889287; }.pasture-detail-wide { grid-column: 1 / -1; }
.pasture-dialog-actions { display: flex; gap: 10px; }.pasture-action { background: #41674e; color: #fff; border-radius: 10px; font-size: 12px; padding: 0 18px; margin: 0; line-height: 40px; }.pasture-action.secondary { color: #41674e; background: #edf2eb; }
@media (max-width: 900px) { .pasture-viewport { height: 390px; } }
@media (max-width: 620px) { .pasture-viewport { height: 330px; }.pasture-clock { top: 44px; left: 12px; right: auto; font-size: 10px; }.pasture-dialog-card { padding: 16px; }.pasture-model { height: 195px; } }
@media (prefers-reduced-motion: reduce) { .pasture-spinner { animation: none; } }
</style>
