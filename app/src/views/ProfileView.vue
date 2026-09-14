<script setup lang="ts">
import { ref } from 'vue'
import { Bell, CircleHelp, Moon, RefreshCw, MessageSquarePlus, ChevronRight } from 'lucide-vue-next'
import PageChrome from '../components/PageChrome.vue'

const nightMode = ref(false)
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function showMessage(message: string) { toast.value = message; if (toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.value = '' }, 1600) }
function navigate(view: string) { window.location.hash = view }
</script>

<template>
  <PageChrome active="profile" :refresh="false" @navigate="navigate">
    <main class="content">
      <div class="page-head"><div><div class="eyebrow">ACCOUNT & SETTINGS</div><h1>我的</h1><p>管理个人信息、通知与显示偏好</p></div></div>
      <section class="panel"><div class="profile-summary"><div class="avatar profile-avatar">李</div><div><strong>李建国</strong><div>乡镇畜牧技术员 · 阿坝示范区</div></div><span class="status ok">在线</span></div></section>
      <div class="grid-2 section"><section class="panel"><div class="panel-head"><div class="panel-title">工作偏好</div><span class="panel-meta">本设备</span></div><div class="list"><button class="list-row setting" @click="nightMode = !nightMode; showMessage('已切换夜间模式')"><span class="icon-disc"><Moon :size="15" /></span><span class="list-main"><strong>夜间模式</strong><small>冬季 17:00 后降低亮度</small></span><span class="chip">{{ nightMode ? '开启' : '关闭' }}</span></button><button class="list-row setting" @click="showMessage('告警通知已开启')"><span class="icon-disc"><Bell :size="15" /></span><span class="list-main"><strong>告警通知</strong><small>异常体温、超载与离线提醒</small></span><span class="status ok">已开启</span></button><button class="list-row setting" @click="showMessage('数据刷新频率已更新')"><span class="icon-disc"><RefreshCw :size="15" /></span><span class="list-main"><strong>数据刷新频率</strong><small>地图与列表自动同步</small></span><span class="chip">30 秒</span></button></div></section><section class="panel"><div class="panel-head"><div class="panel-title">示范区信息</div><span class="panel-meta">只读</span></div><div class="list profile-info"><div class="list-row"><span class="list-main"><strong>四川 · 阿坝县</strong><small>高原放牧示范区</small></span><span class="mono muted-value">P-A</span></div><div class="list-row"><span class="list-main"><strong>当前数据源</strong><small>模拟数据 · 接口预留</small></span><span class="status ok">稳定</span></div><div class="list-row"><span class="list-main"><strong>最近同步</strong><small>2026 / 09 / 07 14:32</small></span><span class="mono muted-value">12 秒前</span></div></div></section></div>
      <section class="panel section"><div class="panel-head"><div class="panel-title">帮助与反馈</div></div><div class="list"><button class="list-row setting" @click="navigate('consultation')"><span class="icon-disc"><MessageSquarePlus :size="15" /></span><span class="list-main"><strong>在线问诊</strong><small>联系驻场兽医，咨询牲畜健康问题</small></span><span class="status ok">医生在线</span></button><button class="list-row setting" @click="showMessage('帮助中心即将打开')"><span class="list-main"><strong>使用帮助</strong><small>查看地图、告警和轮换操作说明</small></span><ChevronRight :size="16" class="muted-icon" /></button><button class="list-row setting" @click="showMessage('反馈已记录，感谢你的建议')"><span class="list-main"><strong>问题反馈</strong><small>告诉我们现场使用中的问题</small></span><ChevronRight :size="16" class="muted-icon" /></button><button class="list-row setting" @click="showMessage('当前版本 1.0.0')"><span class="list-main"><strong>关于牧场智控</strong><small>版本与数据协议</small></span><span class="mono muted-value">v1.0.0</span></button></div></section>
    </main>
    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </PageChrome>
</template>
