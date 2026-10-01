<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import PageChrome from '../components/PageChrome.vue'
import { navigateToView } from '../utils/navigation'
import { consultationApi, type ConsultationDetail, type ConsultationSummary } from '../services/consultationApi'

const symptoms = ['体温偏高', '食欲下降', '反刍减少', '咳嗽流涕', '跛行', '精神不振']
const selectedSymptoms = ref<string[]>([])
const caseText = ref('')
const livestockId = ref('')

const history = ref<ConsultationSummary[]>([])
const historyLoading = ref(false)
const historyError = ref('')

const submitting = ref(false)
const chatOpen = ref(false)
const active = ref<ConsultationDetail | null>(null)
const chatInput = ref('')
const sending = ref(false)
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined

const doctorName = computed(() => active.value?.doctorName || '驻场兽医')
const canSend = computed(() => active.value?.status !== 'closed' && !sending.value)

function showMessage(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 1700)
}

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    uni.navigateBack({ delta: 1 })
    return
  }
  navigateToView('profile')
}

function toggleSymptom(symptom: string) {
  selectedSymptoms.value = selectedSymptoms.value.includes(symptom)
    ? selectedSymptoms.value.filter((item) => item !== symptom)
    : [...selectedSymptoms.value, symptom]
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

async function submitConsultation() {
  if (submitting.value) return
  if (!selectedSymptoms.value.length && !caseText.value.trim()) {
    showMessage('请至少选择一项症状或填写描述')
    return
  }
  submitting.value = true
  try {
    const created = await consultationApi.create({
      symptoms: selectedSymptoms.value,
      description: caseText.value.trim(),
      livestockId: livestockId.value.trim() || null,
    })
    active.value = created
    chatOpen.value = true
    startPolling()
    await loadHistory()
    showMessage('问诊已提交，正在等待兽医接入')
  } catch (error) {
    showMessage(error instanceof Error ? error.message : '问诊提交失败')
  } finally {
    submitting.value = false
  }
}

async function openConsultation(id: string) {
  try {
    active.value = await consultationApi.detail(id)
    chatOpen.value = true
    if (active.value.status === 'open') startPolling()
    else stopPolling()
  } catch (error) {
    showMessage(error instanceof Error ? error.message : '问诊详情加载失败')
  }
}

// No automatic vet reply exists: the doctor answers from the admin console, so
// the thread only shows what the server actually stored.
async function sendMessage() {
  if (!active.value || sending.value) return
  const value = chatInput.value.trim()
  if (!value) {
    showMessage('请输入补充信息')
    return
  }
  sending.value = true
  try {
    await consultationApi.sendMessage(active.value.id, value)
    chatInput.value = ''
    active.value = await consultationApi.detail(active.value.id)
  } catch (error) {
    showMessage(error instanceof Error ? error.message : '消息发送失败')
  } finally {
    sending.value = false
  }
}

function formatHistoryTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

// There is no push channel: a vet replies from the admin console, so the open
// thread polls until it is answered or closed.
const POLL_INTERVAL_MS = 10_000
let pollTimer: ReturnType<typeof setInterval> | undefined

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = undefined
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(async () => {
    const open = active.value
    if (!open || open.status !== 'open') {
      stopPolling()
      return
    }
    try {
      const fresh = await consultationApi.detail(open.id)
      if (active.value?.id === fresh.id) active.value = fresh
      if (fresh.status !== 'open') {
        stopPolling()
        showMessage('兽医已回复')
      }
    } catch {
      // A transient poll failure must not interrupt the thread; the next tick
      // retries and the manual send path surfaces real errors.
    }
  }, POLL_INTERVAL_MS)
}

onMounted(loadHistory)
onUnmounted(stopPolling)
</script>

<template>
  <PageChrome active="profile" :refresh="false">
    <main class="content">
      <button class="consult-back" type="button" @click="goBack"><AppIcon name="back" :size="16" />返回</button>
      <div class="page-head">
        <div>
          <div class="eyebrow">ONLINE VETERINARY</div>
          <h1 class="page-title">在线问诊</h1>
          <p class="page-description">连接驻场兽医，快速判断牲畜健康状况</p>
        </div>
        <span class="date-chip mono">平均 3 分钟响应</span>
      </div>

      <section class="panel">
        <div class="doctor-card">
          <div class="doctor-avatar">医</div>
          <div class="doctor-main">
            <strong>{{ doctorName }} · 高原畜牧专科</strong>
            <small>擅长牛羊呼吸道、消化道与体温异常判断</small>
          </div>
          <span class="online">在线接诊</span>
        </div>
      </section>

      <div class="consult-grid">
        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">描述牲畜情况</div>
              <div class="panel-meta">信息越完整，建议越准确</div>
            </div>
            <span class="panel-meta">1 / 2</span>
          </div>
          <div class="form-pad">
            <label class="field-label">选择主要症状</label>
            <div class="symptoms">
              <button
                v-for="symptom in symptoms"
                :key="symptom"
                class="symptom"
                :class="{ active: selectedSymptoms.includes(symptom) }"
                type="button"
                @click="toggleSymptom(symptom)"
              >{{ symptom }}</button>
            </div>
            <label class="field-label" for="caseText">补充描述</label>
            <textarea id="caseText" v-model="caseText" class="consult-text" placeholder="例如：SC-2026-00286，今天 14:20 体温 40.7℃，饮水正常，活动量下降…"></textarea>
            <label class="field-label" for="caseLivestock">耳标号（可选）</label>
            <input id="caseLivestock" v-model="livestockId" class="consult-text" placeholder="例如：SC-2026-00286" />
            <div class="form-foot">
              <span class="hint">可同时填写耳标号或所在分区</span>
              <button class="btn btn-primary" type="button" :disabled="submitting" @click="submitConsultation">
                {{ submitting ? '提交中…' : '提交问诊' }}
              </button>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <div class="panel-title">问诊记录</div>
              <div class="panel-meta">最近 30 天</div>
            </div>
            <span class="panel-meta">{{ history.length }} 条</span>
          </div>
          <div v-if="historyLoading" class="list-state"><span>正在加载问诊记录...</span></div>
          <div v-else-if="historyError" class="list-state error">
            <span>{{ historyError }}</span>
            <button class="btn btn-secondary" type="button" @click="loadHistory">重新连接</button>
          </div>
          <div v-else-if="history.length === 0" class="list-state"><span>近 30 天暂无问诊记录</span></div>
          <div v-else class="history-list">
            <button
              v-for="item in history"
              :key="item.id"
              class="history-row"
              type="button"
              @click="openConsultation(item.id)"
            >
              <i class="history-dot" :style="item.status === 'answered' ? 'background:var(--meta)' : ''"></i>
              <div class="history-main">
                <strong>{{ item.title }}</strong>
                <small>{{ item.summary || item.statusLabel }}</small>
              </div>
              <span class="history-time">{{ formatHistoryTime(item.createdAt) }}</span>
            </button>
          </div>
        </section>
      </div>

      <section v-if="chatOpen && active" class="panel chat-panel open">
        <div class="panel-head">
          <div>
            <div class="panel-title">与{{ active.doctorName }}沟通</div>
            <div class="panel-meta">会话编号 {{ active.code }}</div>
          </div>
          <span class="status" :class="active.status === 'closed' ? 'warn' : 'ok'">{{ active.statusLabel }}</span>
        </div>
        <div class="chat-body">
          <div v-for="message in active.messages" :key="message.id" class="bubble" :class="message.role">{{ message.text }}</div>
        </div>
        <div class="chat-compose">
          <input v-model="chatInput" placeholder="输入补充信息…" :disabled="!canSend" @keydown.enter="sendMessage">
          <button class="btn btn-primary" type="button" :disabled="!canSend" @click="sendMessage">{{ sending ? '发送中…' : '发送' }}</button>
        </div>
      </section>
    </main>
    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </PageChrome>
</template>

<style scoped>
.consult-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 12px;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: var(--surface);
  color: var(--muted);
  font: 500 13px var(--font-body);
}

.list-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 110px;
  padding: 24px 20px;
  color: var(--muted);
  text-align: center;
  font-size: 12px;
}

.list-state.error {
  color: var(--danger);
}

.history-row {
  width: 100%;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}

.consult-text {
  width: 100%;
}

.chat-compose input:disabled,
.btn:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
