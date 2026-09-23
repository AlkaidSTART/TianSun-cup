<script setup lang="ts">
import { ref } from 'vue'
import PageChrome from '../components/PageChrome.vue'

const symptoms = ['体温偏高', '食欲下降', '反刍减少', '咳嗽流涕', '跛行', '精神不振']
const selectedSymptoms = ref<string[]>([])
const caseText = ref('')
const chatInput = ref('')
const chatOpen = ref(false)
const messages = ref([{ role: 'doctor', text: '你好，我是张医生。请先告诉我牲畜耳标号、体温和症状持续时间。' }])
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
function showMessage(message: string) { toast.value = message; if (toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.value = '' }, 1700) }
function navigate(view: string) { window.location.hash = view }
function toggleSymptom(symptom: string) { selectedSymptoms.value = selectedSymptoms.value.includes(symptom) ? selectedSymptoms.value.filter((item) => item !== symptom) : [...selectedSymptoms.value, symptom] }
function submitConsultation() { if (!selectedSymptoms.value.length && !caseText.value.trim()) { showMessage('请至少选择一项症状或填写描述'); return }; chatOpen.value = true; showMessage('问诊已提交，张医生正在接入'); window.setTimeout(() => document.querySelector('.chat-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80) }
function sendMessage() { const value = chatInput.value.trim(); if (!value) { showMessage('请输入补充信息'); return }; messages.value.push({ role: 'user', text: value }); chatInput.value = ''; window.setTimeout(() => messages.value.push({ role: 'doctor', text: '收到，我会结合耳标数据和体温曲线继续判断，请保持设备在线。' }), 500) }
</script>

<template>
  <PageChrome active="profile" :refresh="false" @navigate="navigate">
    <main class="content">
      <div class="page-head"><div><div class="eyebrow">ONLINE VETERINARY</div><h1>在线问诊</h1><p>连接驻场兽医，快速判断牲畜健康状况</p></div><span class="date-chip mono">平均 3 分钟响应</span></div>
      <section class="panel"><div class="doctor-card"><div class="doctor-avatar">医</div><div class="doctor-main"><strong>张医生 · 高原畜牧专科</strong><small>擅长牛羊呼吸道、消化道与体温异常判断</small></div><span class="online">在线接诊</span></div></section>
      <div class="consult-grid"><section class="panel"><div class="panel-head"><div><div class="panel-title">描述牲畜情况</div><div class="panel-meta">信息越完整，建议越准确</div></div><span class="panel-meta">1 / 2</span></div><div class="form-pad"><label class="field-label">选择主要症状</label><div class="symptoms"><button v-for="symptom in symptoms" :key="symptom" class="symptom" :class="{ active: selectedSymptoms.includes(symptom) }" type="button" @click="toggleSymptom(symptom)">{{ symptom }}</button></div><label class="field-label" for="caseText">补充描述</label><textarea id="caseText" v-model="caseText" class="consult-text" placeholder="例如：SC-2026-00286，今天 14:20 体温 40.7℃，饮水正常，活动量下降…"></textarea><div class="form-foot"><span class="hint">可同时填写耳标号或所在分区</span><button class="btn btn-primary" type="button" @click="submitConsultation">提交问诊</button></div></div></section><section class="panel"><div class="panel-head"><div><div class="panel-title">问诊记录</div><div class="panel-meta">最近 30 天</div></div><span class="panel-meta">2 条</span></div><div class="history-list"><div class="history-row"><i class="history-dot"></i><div class="history-main"><strong>SC-2026-00107 · 反刍减少</strong><small>建议观察采食量，已恢复正常</small></div><span class="history-time">昨天</span></div><div class="history-row"><i class="history-dot" style="background:var(--meta)"></i><div class="history-main"><strong>P-A-02 · 草场轮换咨询</strong><small>张医生已回复 · 查看详情</small></div><span class="history-time">09/03</span></div></div></section></div>
      <section v-if="chatOpen" class="panel chat-panel open"><div class="panel-head"><div><div class="panel-title">与张医生沟通</div><div class="panel-meta">会话编号 VC-20260907-014</div></div><span class="status ok">实时</span></div><div class="chat-body"><div v-for="(message, index) in messages" :key="index" class="bubble" :class="message.role">{{ message.text }}</div></div><div class="chat-compose"><input v-model="chatInput" placeholder="输入补充信息…" @keydown.enter="sendMessage"><button class="btn btn-primary" type="button" @click="sendMessage">发送</button></div></section>
    </main>
    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </PageChrome>
</template>
