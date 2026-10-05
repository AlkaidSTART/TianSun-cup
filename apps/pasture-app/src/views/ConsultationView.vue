<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import MarkdownMessage from '../components/MarkdownMessage.vue'
import { navigateToView } from '../utils/navigation'
import { consultationApi, type ConsultationDetail, type ConsultationSummary } from '../services/consultationApi'
import { streamConsultation, type ConsultationStreamEvent } from '../services/consultationStream'

const history = ref<ConsultationSummary[]>([])
const historyLoading = ref(false)
const historyError = ref('')
const historyOpen = ref(false)
const active = ref<ConsultationDetail | null>(null)
const chatInput = ref('')
const streaming = ref(false)
const streamingText = ref('')
const toast = ref('')
const chatBody = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined
let revealTimer: ReturnType<typeof setInterval> | undefined
let pendingCharacters: string[] = []
let completedDetail: ConsultationDetail | null = null
let resolveReveal: (() => void) | null = null

const needsRetry = computed(() => !streaming.value && active.value?.status === 'open' && active.value.messages.at(-1)?.role === 'user')
const canSend = computed(() => !streaming.value && !needsRetry.value && active.value?.status !== 'closed')
const isEmpty = computed(() => !streaming.value && !active.value?.messages.length)

function showMessage(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 2400)
}

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack({ delta: 1 })
    return
  }
  navigateToView('profile')
}

function scrollToLatest() {
  nextTick(() => {
    const element = chatBody.value
    if (element) element.scrollTop = element.scrollHeight
  })
}

function resetInputHeight() {
  const element = inputEl.value
  if (element && element.style) element.style.height = '32px'
}

function autoResize(event: Event) {
  const element = event.target as HTMLTextAreaElement | null
  if (!element || !element.style) return
  element.style.height = '32px'
  element.style.height = `${Math.min(element.scrollHeight || 32, 104)}px`
}

function roleLabel(role: string) {
  if (role === 'doctor') return '医生回复'
  if (role === 'assistant') return 'AI 问诊助手'
  return ''
}

async function loadHistory() {
  historyLoading.value = true
  historyError.value = ''
  try {
    history.value = await consultationApi.list({ days: 30 })
  } catch (error) {
    historyError.value = error instanceof Error ? error.message : '问诊记录加载失败'
  } finally {
    historyLoading.value = false
  }
}

function newConversation() {
  if (streaming.value) return
  active.value = null
  chatInput.value = ''
  streamingText.value = ''
  historyOpen.value = false
  resetInputHeight()
  scrollToLatest()
}

async function openConsultation(id: string) {
  if (streaming.value) return
  historyOpen.value = false
  try {
    active.value = await consultationApi.detail(id)
    streamingText.value = ''
    scrollToLatest()
  } catch (error) {
    showMessage(error instanceof Error ? error.message : '问诊详情加载失败')
  }
}

function finishReveal() {
  if (revealTimer) clearInterval(revealTimer)
  revealTimer = undefined
  if (completedDetail) {
    active.value = completedDetail
    completedDetail = null
    streamingText.value = ''
  }
  resolveReveal?.()
  resolveReveal = null
  scrollToLatest()
}

function startReveal() {
  if (revealTimer) return
  revealTimer = setInterval(() => {
    const count = Math.max(1, Math.min(5, Math.ceil(pendingCharacters.length / 120)))
    streamingText.value += pendingCharacters.splice(0, count).join('')
    scrollToLatest()
    if (!pendingCharacters.length) finishReveal()
  }, 18)
}

function waitForReveal(): Promise<void> {
  if (!revealTimer && !pendingCharacters.length && !completedDetail) return Promise.resolve()
  return new Promise((resolve) => { resolveReveal = resolve })
}

function handleStreamEvent(event: ConsultationStreamEvent) {
  if (event.type === 'conversation') {
    active.value = event.detail
    scrollToLatest()
  } else if (event.type === 'delta') {
    pendingCharacters.push(...Array.from(event.text))
    startReveal()
  } else if (event.type === 'done') {
    completedDetail = event.detail
    if (pendingCharacters.length || revealTimer) startReveal()
    else finishReveal()
  }
}

async function runStream(path: string, data?: Record<string, unknown>) {
  streaming.value = true
  streamingText.value = ''
  try {
    await streamConsultation(path, data, handleStreamEvent)
    await waitForReveal()
    await loadHistory()
  } catch (error) {
    if (active.value) {
      try { active.value = await consultationApi.detail(active.value.id) } catch { /* keep saved messages */ }
    }
    await loadHistory()
    showMessage(error instanceof Error ? error.message : 'AI 回复失败，请重试')
  } finally {
    if (revealTimer) clearInterval(revealTimer)
    revealTimer = undefined
    pendingCharacters = []
    completedDetail = null
    resolveReveal?.()
    resolveReveal = null
    streaming.value = false
    streamingText.value = ''
    scrollToLatest()
  }
}

async function sendMessage() {
  if (!canSend.value) return
  const text = chatInput.value.trim()
  if (!text) {
    showMessage('请输入想咨询的内容')
    return
  }
  if (text.length > 1000) {
    showMessage('消息不能超过 1000 个字符')
    return
  }
  const previous = active.value
  chatInput.value = ''
  resetInputHeight()
  const path = previous
    ? `/consultations/${encodeURIComponent(previous.id)}/messages/stream`
    : '/consultations/stream'
  await runStream(path, { text })
  if (!active.value) {
    chatInput.value = text // Preserve unsent text on connection failure.
    nextTick(() => autoResizeFromValue())
  }
}

function autoResizeFromValue() {
  const element = inputEl.value
  if (!element || !element.style) return
  element.style.height = '32px'
  element.style.height = `${Math.min(element.scrollHeight || 32, 104)}px`
}

async function retryReply() {
  if (!active.value || !needsRetry.value) return
  await runStream(`/consultations/${encodeURIComponent(active.value.id)}/retry/stream`)
}

function formatHistoryTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

onMounted(loadHistory)
onUnmounted(() => {
  if (toastTimer) clearTimeout(toastTimer)
  if (revealTimer) clearInterval(revealTimer)
  resolveReveal?.()
})
</script>

<template>
  <div class="vet-assistant">
    <main class="vet-main">
      <header class="vet-heading">
        <button class="vet-icon-btn" type="button" aria-label="返回" @click="goBack">
          <AppIcon name="back" :size="22" />
        </button>
        <div class="vet-heading-copy">
          <h1 class="vet-title">AI 问诊助手</h1>
          <p class="vet-subtitle">牧场智控 · 在线问诊</p>
        </div>
        <button class="vet-new" type="button" :disabled="streaming" @click="newConversation">＋ 新对话</button>
      </header>

      <div class="vet-notice">
        <span class="vet-notice-mark">✳</span>
        <div class="vet-notice-body">
          <strong class="vet-notice-title">描述症状，获取问诊建议</strong>
          <p class="vet-notice-text">可补充畜种、症状及持续时间，便于整理情况。</p>
          <button class="vet-notice-link" type="button" @click="historyOpen = true">查看历史会话 →</button>
        </div>
      </div>

      <div ref="chatBody" class="vet-conversation" aria-live="polite">
        <div v-if="isEmpty" class="vet-empty">
          <div class="vet-empty-symbol">＋</div>
          <strong class="vet-empty-title">开始一次新的问诊</strong>
          <p class="vet-empty-text">说说牲畜遇到的情况，<br />我会协助你整理关键信息。</p>
        </div>
        <template v-else>
          <div class="vet-date">今天 · 问诊对话</div>
          <div
            v-for="message in active?.messages || []"
            :key="message.id"
            class="vet-message"
            :class="message.role === 'user' ? 'user' : 'ai'"
          >
            <div v-if="message.role !== 'user'" class="vet-avatar">AI</div>
            <div class="vet-msg-content">
              <div v-if="message.role !== 'user'" class="vet-who">{{ roleLabel(message.role) }}</div>
              <div class="vet-bubble" :class="{ 'vet-bubble-md': message.role !== 'user' }">
                <MarkdownMessage v-if="message.role !== 'user'" :source="message.text" />
                <template v-else>{{ message.text }}</template>
              </div>
            </div>
          </div>
          <div v-if="streaming" class="vet-message ai">
            <div class="vet-avatar">AI</div>
            <div class="vet-msg-content">
              <div class="vet-who">AI 问诊助手</div>
              <div class="vet-bubble vet-bubble-md">
                <MarkdownMessage v-if="streamingText" :source="streamingText" cursor />
                <template v-else>正在思考…</template>
              </div>
            </div>
          </div>
        </template>
      </div>
    </main>

    <div class="vet-composer-wrap">
      <div v-if="needsRetry" class="vet-retry">
        <span>上条问题已保存，AI 回复中断。</span>
        <button class="vet-retry-inline-btn" type="button" @click="retryReply">重试 AI 回复</button>
      </div>
      <div class="vet-composer">
        <textarea
          ref="inputEl"
          class="vet-composer-input"
          v-model="chatInput"
          rows="1"
          maxlength="1000"
          confirm-type="send"
          :disabled="!canSend"
          :placeholder="needsRetry ? '请先重试上条问题' : '输入牲畜症状或想咨询的问题…'"
          aria-label="输入问诊内容"
          @input="autoResize"
          @confirm="sendMessage"
          @keydown.enter.exact.prevent="sendMessage"
        ></textarea>
        <button class="vet-send" type="button" :disabled="!canSend || !chatInput.trim()" aria-label="发送消息" @click="sendMessage">
          <AppIcon name="paperplane-filled" :size="19" />
        </button>
      </div>
      <p class="vet-disclaimer">AI 建议仅供参考，不能替代兽医诊断；紧急情况请联系当地兽医。</p>
    </div>

    <div v-if="historyOpen" class="vet-sheet-mask" @click.self="historyOpen = false">
      <section class="vet-sheet" role="dialog" aria-modal="true" aria-label="历史会话">
        <header class="vet-sheet-head">
          <div>
            <strong class="vet-sheet-title">历史会话</strong>
            <small class="vet-sheet-subtitle">最近 30 天 · {{ history.length }} 条</small>
          </div>
          <button class="vet-icon-btn" type="button" aria-label="关闭" @click="historyOpen = false">
            <AppIcon name="close" :size="18" />
          </button>
        </header>
        <div class="vet-sheet-body">
          <div v-if="historyLoading" class="vet-list-state">正在加载记录…</div>
          <div v-else-if="historyError" class="vet-list-state error">
            <span>{{ historyError }}</span>
            <button class="vet-retry-btn" type="button" @click="loadHistory">重试</button>
          </div>
          <div v-else-if="history.length === 0" class="vet-list-state">暂无历史会话</div>
          <template v-else>
            <button
              v-for="item in history"
              :key="item.id"
              class="vet-history-row"
              :class="{ active: active?.id === item.id }"
              type="button"
              :disabled="streaming"
              @click="openConsultation(item.id)"
            >
              <i class="vet-history-dot" :class="{ answered: item.status === 'answered' }"></i>
              <span class="vet-history-main">
                <strong class="vet-history-title">{{ item.title }}</strong>
                <small class="vet-history-summary">{{ item.summary || item.statusLabel }}</small>
              </span>
              <span class="vet-history-time">{{ formatHistoryTime(item.createdAt) }}</span>
            </button>
          </template>
        </div>
      </section>
    </div>

    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </div>
</template>

<style scoped>
.vet-assistant {
  --vet-bg: #f5f6f8;
  --vet-surface: #ffffff;
  --vet-fg: var(--fg, #1d1d1f);
  --vet-muted: var(--muted, #6e6e73);
  --vet-border: #e9ebef;
  --vet-accent: var(--accent, #0071e3);
  --vet-accent-soft: #eaf4ff;
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  overflow: hidden;
  background: var(--vet-bg);
  color: var(--vet-fg);
  font-family: var(--font-body);
}

.vet-main {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  padding: 14px 14px 0;
}

/* 页头 */
.vet-heading {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  min-height: 56px;
  margin: 0 1px 4px;
}
.vet-heading-copy {
  flex: 1;
  min-width: 0;
}
.vet-title {
  margin: 0;
  font-size: 20px;
  line-height: 1.25;
  letter-spacing: -0.025em;
}
.vet-subtitle {
  margin: 3px 0 0;
  overflow: hidden;
  color: var(--vet-muted);
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.vet-icon-btn {
  display: grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #4b5969;
}
.vet-icon-btn:active {
  background: var(--vet-accent-soft);
}
.vet-new {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid #dce9f7;
  border-radius: 10px;
  background: #fff;
  color: var(--vet-accent);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
  text-align: center;
}
.vet-new:active {
  background: var(--vet-accent-soft);
}
.vet-new:disabled {
  opacity: 0.55;
}

/* 提示卡 */
.vet-notice {
  display: flex;
  flex: none;
  align-items: flex-start;
  gap: 10px;
  padding: 16px;
  border: 1px solid #d7eafd;
  border-radius: 14px;
  background: var(--vet-accent-soft);
}
.vet-notice-mark {
  display: grid;
  flex: none;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 9px;
  background: var(--vet-accent);
  color: #fff;
  font-size: 15px;
  font-weight: 750;
}
.vet-notice-body {
  flex: 1;
  min-width: 0;
}
.vet-notice-title {
  display: block;
  margin: 1px 0 3px;
  font-size: 13px;
}
.vet-notice-text {
  margin: 0;
  color: #667583;
  font-size: 12px;
  line-height: 1.55;
}
.vet-notice-link {
  display: block;
  margin-top: 7px;
  padding: 10px 0;
  border: 0;
  background: transparent;
  text-align: left;
  color: var(--vet-accent);
  font-size: 13px;
  font-weight: 650;
  line-height: 1.2;
}

/* 对话流 */
.vet-conversation {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 4px 12px;
  scrollbar-width: thin;
}
.vet-date {
  margin: 4px 0 21px;
  color: #9ba1ab;
  font-size: 11px;
  text-align: center;
}
.vet-message {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-bottom: 20px;
}
.vet-message.user {
  justify-content: flex-end;
}
.vet-avatar {
  display: grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background: #e9f3fe;
  color: var(--vet-accent);
  font-size: 12px;
  font-weight: 800;
}
.vet-msg-content {
  max-width: min(82%, 370px);
}
.vet-message.user .vet-msg-content {
  display: flex;
  justify-content: flex-end;
}
.vet-who {
  margin: 1px 0 6px;
  color: var(--vet-muted);
  font-size: 11px;
}
.vet-bubble {
  padding: 12px 14px;
  border: 1px solid var(--vet-border);
  border-radius: 4px 15px 15px 15px;
  background: #fff;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.vet-message.user .vet-bubble {
  border-color: var(--vet-accent);
  border-radius: 15px 4px 15px 15px;
  background: var(--vet-accent);
  color: #fff;
}
/* Markdown answers own their own line breaks, so drop pre-wrap there. */
.vet-bubble-md {
  white-space: normal;
}

/* 空状态 */
.vet-empty {
  display: flex;
  height: 100%;
  min-height: 220px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 22px;
  color: var(--vet-muted);
  text-align: center;
}
.vet-empty-symbol {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  margin-bottom: 17px;
  border-radius: 19px;
  background: #e9f4ff;
  color: var(--vet-accent);
  font-size: 27px;
  font-weight: 750;
}
.vet-empty-title {
  margin-bottom: 6px;
  color: var(--vet-fg);
  font-size: 18px;
}
.vet-empty-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}

/* 输入区 */
.vet-composer-wrap {
  flex: none;
  padding: 11px 14px calc(8px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--vet-border);
  background: #fff;
}
.vet-retry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  color: var(--danger, #dc2626);
  font-size: 12px;
}
.vet-retry-inline-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--vet-border);
  border-radius: 10px;
  background: #fff;
  color: var(--vet-accent);
  font-size: 12px;
  font-weight: 650;
}
.vet-composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 8px 8px 14px;
  border: 1px solid #dce1e7;
  border-radius: 16px;
  background: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.vet-composer:focus-within {
  border-color: #83bdfa;
  box-shadow: 0 0 0 3px var(--vet-accent-soft);
}
.vet-composer-input {
  flex: 1;
  min-height: 32px;
  max-height: 104px;
  padding: 7px 0 4px;
  border: 0;
  outline: 0;
  background: none;
  color: var(--vet-fg);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.55;
  resize: none;
  scrollbar-width: thin;
}
.vet-composer-input::placeholder {
  color: #9fa5ad;
}
.vet-send {
  display: grid;
  flex: none;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 11px;
  background: var(--vet-accent);
  color: #fff;
}
.vet-send:disabled {
  background: #dbe0e6;
}
.vet-disclaimer {
  margin: 7px 2px 0;
  color: #9a9fa8;
  font-size: 10px;
  line-height: 1.45;
}

/* 历史会话抽屉 */
.vet-sheet-mask {
  position: fixed;
  z-index: 30;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(24, 32, 44, 0.42);
}
.vet-sheet {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 640px;
  max-height: 76vh;
  padding: 6px 0 calc(10px + env(safe-area-inset-bottom));
  border-radius: 20px 20px 0 0;
  background: #fff;
  box-shadow: 0 -18px 50px rgba(24, 32, 44, 0.16);
}
.vet-sheet-head {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 12px 10px 18px;
  border-bottom: 1px solid var(--vet-border);
}
.vet-sheet-title {
  display: block;
  font-size: 16px;
}
.vet-sheet-subtitle {
  display: block;
  margin-top: 3px;
  color: var(--vet-muted);
  font-size: 11px;
}
.vet-sheet-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 8px;
}
.vet-history-row {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  width: 100%;
  padding: 13px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  text-align: left;
}
.vet-history-row:active {
  background: var(--vet-accent-soft);
}
.vet-history-row.active {
  background: #f4f7fb;
}
.vet-history-row:disabled {
  opacity: 0.6;
}
.vet-history-dot {
  flex: none;
  width: 9px;
  height: 9px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--vet-accent);
}
.vet-history-dot.answered {
  background: var(--muted, #86868b);
}
.vet-history-main {
  flex: 1;
  min-width: 0;
}
.vet-history-title {
  display: block;
  font-size: 13px;
}
.vet-history-summary {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: var(--vet-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vet-history-time {
  flex: none;
  margin-top: 1px;
  color: var(--meta, #86868b);
  font-size: 10px;
}
.vet-list-state {
  display: flex;
  min-height: 110px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px 20px;
  color: var(--vet-muted);
  font-size: 12px;
  text-align: center;
}
.vet-list-state.error {
  color: var(--danger, #dc2626);
}
.vet-retry-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid var(--vet-border);
  border-radius: 10px;
  background: #fff;
  color: var(--vet-accent);
  font-size: 12px;
  font-weight: 650;
}
</style>