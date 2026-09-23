<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ArrowLeftRight, Bell, ChevronRight, ClipboardCheck, MessageSquarePlus, Moon, RefreshCw, Sprout, StickyNote, Syringe, Wrench, X } from 'lucide-vue-next'
import PageChrome from '../components/PageChrome.vue'
import {
  addTodo,
  loadTodos,
  removeTodo,
  todoCurrentDate,
  todoDisplayTitle,
  todoError,
  todoItems,
  todoLoading,
  todoTypeMeta,
  updateTodo,
  type TodoDraft,
  type TodoItem,
  type TodoType,
} from '../data/todoList'

const emit = defineEmits<{ (event: 'add-todo', item: TodoItem): void }>()
const pastureOptions = ['东沟草场', '河谷草场', '北坡草场']
const workAreas = ['东沟草场', '河谷草场', '北坡草场', '全场']
const herdOptions = ['东沟牛群', '河谷牛群', '北坡牛群', '全场牲畜']
const todoTypeOrder: TodoType[] = ['rotation', 'inspection', 'vaccination', 'maintenance', 'device', 'custom']
const typeIcons = { rotation: ArrowLeftRight, inspection: ClipboardCheck, vaccination: Syringe, maintenance: Sprout, device: Wrench, custom: StickyNote }
const notePlaceholders: Record<TodoType, string> = {
  rotation: '例如：优先转移需关注牛群',
  inspection: '例如：重点检查北侧围栏',
  vaccination: '例如：冷链运输，分两批接种',
  maintenance: '例如：补播草籽并检查饮水点',
  device: '例如：更换电池并复核上报链路',
  custom: '补充说明（可选）',
}

const nightMode = ref(false)
const toast = ref('')
const todoDialogOpen = ref(false)
const todoStep = ref<'type' | 'form'>('type')
const todoSaving = ref(false)
const editSaving = ref(false)
const deleteConfirmOpen = ref(false)
const editingTodo = ref<TodoItem | null>(null)
const editForm = reactive({ date: '', time: '', title: '', detail: '' })
const todoForm = reactive({
  type: 'rotation' as TodoType,
  date: todoCurrentDate.value,
  time: '06:00',
  note: '',
  from: '北坡草场',
  to: '河谷草场',
  amount: 20,
  area: '东沟草场',
  herd: '东沟牛群',
  vaccine: '',
  deviceId: '',
  title: '',
})
let toastTimer: ReturnType<typeof setTimeout> | undefined

const notePlaceholder = computed(() => notePlaceholders[todoForm.type])
const editDialogOpen = computed(() => editingTodo.value !== null)

function showMessage(message: string) { toast.value = message; if (toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(() => { toast.value = '' }, 2400) }
function errorText(error: unknown) { return error instanceof Error ? error.message : '待办事项操作失败' }
onMounted(async () => {
  try { await loadTodos() } catch (error) { showMessage(errorText(error)) }
})
function resetTodoForm() {
  Object.assign(todoForm, {
    type: 'rotation' as TodoType,
    date: todoCurrentDate.value,
    time: '06:00',
    note: '',
    from: '北坡草场',
    to: '河谷草场',
    amount: 20,
    area: '东沟草场',
    herd: '东沟牛群',
    vaccine: '',
    deviceId: '',
    title: '',
  })
}
function openTodoDialog() {
  resetTodoForm()
  todoStep.value = 'type'
  todoDialogOpen.value = true
}
function closeTodoDialog() {
  todoDialogOpen.value = false
}

function openEditTodo(item: TodoItem) {
  editingTodo.value = item
  Object.assign(editForm, {
    date: item.date,
    time: item.time,
    title: item.title,
    detail: item.detail,
  })
}

function closeEditTodo() {
  if (editSaving.value) return
  editingTodo.value = null
}

async function submitEditTodo() {
  const item = editingTodo.value
  if (!item || editSaving.value) return
  const title = editForm.title.trim()
  if (!title) {
    showMessage('请填写事项名称')
    return
  }

  editSaving.value = true
  try {
    await updateTodo(item.id, {
      type: item.type,
      date: editForm.date,
      time: editForm.time,
      title,
      detail: editForm.detail.trim(),
    })
    editingTodo.value = null
    showMessage('待办事项已修改')
  } catch (error) {
    showMessage(errorText(error))
  } finally {
    editSaving.value = false
  }
}

function requestDeleteTodo() {
  if (!editingTodo.value || editSaving.value) return
  deleteConfirmOpen.value = true
}

function cancelDeleteTodo() {
  if (editSaving.value) return
  deleteConfirmOpen.value = false
}

async function deleteEditingTodo() {
  const item = editingTodo.value
  if (!item || editSaving.value) return

  editSaving.value = true
  try {
    await removeTodo(item.id)
    deleteConfirmOpen.value = false
    editingTodo.value = null
    showMessage('待办事项已删除')
  } catch (error) {
    showMessage(errorText(error))
  } finally {
    editSaving.value = false
  }
}
function chooseType(type: TodoType) {
  todoForm.type = type
  todoStep.value = 'form'
}
function backToTypeStep() {
  todoStep.value = 'type'
}
function withNote(fallback: string) {
  return todoForm.note.trim() || fallback
}
function buildDraft(): TodoDraft | null {
  const { date, time, type } = todoForm
  if (type === 'inspection') return { type, date, time, title: `${todoForm.area}巡检`, detail: withNote('巡查草层、围栏与水源状态') }
  if (type === 'vaccination') {
    const detail = [todoForm.vaccine.trim(), todoForm.note.trim()].filter(Boolean).join(' · ')
    return { type, date, time, title: `${todoForm.herd}疫苗接种`, detail: detail || '按防疫计划完成接种' }
  }
  if (type === 'maintenance') return { type, date, time, title: `${todoForm.area}维护`, detail: withNote('草场与围栏维护作业') }
  if (type === 'device') return { type, date, time, title: `${todoForm.deviceId.trim()} 检修`, detail: withNote('检查设备状态并恢复上报') }
  const title = todoForm.title.trim()
  if (!title) {
    showMessage('请填写事项名称')
    return null
  }
  return { type, date, time, title, detail: withNote('待跟进事项') }
}
async function submitTodo() {
  if (todoSaving.value) return

  let draft: TodoDraft | null = null
  if (todoForm.type === 'rotation') {
    if (todoForm.from === todoForm.to) {
      showMessage('起始草场和目标草场不能相同')
      return
    }
    draft = {
      type: 'rotation',
      date: todoForm.date,
      time: todoForm.time,
      title: `${todoForm.from.replace('草场', '')} → ${todoForm.to.replace('草场', '')}`,
      detail: todoForm.note.trim() || `预计转移 ${todoForm.amount} 头`,
    }
  } else {
    draft = buildDraft()
    if (!draft) return
  }

  todoSaving.value = true
  try {
    const addedTodo = await addTodo(draft)
    emit('add-todo', addedTodo)
    closeTodoDialog()
    showMessage(`${todoTypeMeta[draft.type].label}已保存`)
  } catch (error) {
    showMessage(errorText(error))
  } finally {
    editSaving.value = false
  }
}
function navigate(view: string) { window.location.hash = view }
</script>

<template>
  <PageChrome active="profile" :refresh="false" @navigate="navigate">
    <main class="content">
      <div class="page-head"><div><div class="eyebrow">ACCOUNT & SETTINGS</div><h1>我的</h1><p>管理个人信息、通知与显示偏好</p></div></div>
      <section class="panel"><div class="profile-summary"><div class="avatar profile-avatar">李</div><div><strong>李建国</strong><div>乡镇畜牧技术员 · 阿坝示范区</div></div><span class="status ok">在线</span></div></section>
      <div class="grid-2 section"><section class="panel"><div class="panel-head"><div class="panel-title">示范区信息</div><span class="panel-meta">只读</span></div><div class="list profile-info"><div class="list-row"><span class="list-main"><strong>四川 · 阿坝县</strong><small>高原放牧示范区</small></span><span class="mono muted-value">P-A</span></div><div class="list-row"><span class="list-main"><strong>当前数据源</strong><small>牲畜模拟 · 待办 SQLite</small></span><span class="status ok">稳定</span></div><div class="list-row"><span class="list-main"><strong>最近同步</strong><small>2026 / 09 / 07 14:32</small></span><span class="mono muted-value">12 秒前</span></div></div></section></div>
      <section class="panel section"><div class="panel-head"><div><div class="panel-title">待办事项</div><div class="panel-meta">共 {{ todoItems.length }} 项 · 已连接数据库</div></div><button class="link-btn" type="button" @click="openTodoDialog">添加</button></div><div v-if="todoLoading" class="list"><div class="list-row"><span class="list-main"><strong>正在加载待办事项</strong><small>正在从 SQLite 数据库读取数据</small></span></div></div><div v-else-if="todoError" class="list"><div class="list-row"><span class="list-main"><strong>待办事项加载失败</strong><small>{{ todoError }}</small></span></div></div><div v-else-if="todoItems.length === 0" class="list"><div class="list-row"><span class="list-main"><strong>暂无待办事项</strong><small>点击右上角添加，保存后会写入数据库</small></span></div></div><div v-else class="list"><button v-for="item in todoItems" :key="item.id" class="list-row" type="button" @click="openEditTodo(item)"><span class="icon-disc" :class="`type-${item.type}`"><component :is="typeIcons[item.type]" :size="15" /></span><span class="list-main"><strong>{{ todoDisplayTitle(item) }}</strong><small>{{ todoTypeMeta[item.type].label }} · {{ item.detail }}</small></span><span class="status" :class="item.tone">{{ item.status }}</span></button></div></section><section class="panel section"><div class="panel-head"><div class="panel-title">帮助与反馈</div></div><div class="list"><button class="list-row setting" @click="navigate('consultation')"><span class="icon-disc"><MessageSquarePlus :size="15" /></span><span class="list-main"><strong>在线问诊</strong><small>联系驻场兽医，咨询牲畜健康问题</small></span><span class="status ok">医生在线</span></button><button class="list-row setting" @click="showMessage('帮助中心即将打开')"><span class="list-main"><strong>使用帮助</strong><small>查看地图、告警和轮换操作说明</small></span><ChevronRight :size="16" class="muted-icon" /></button><button class="list-row setting" @click="showMessage('反馈已记录，感谢你的建议')"><span class="list-main"><strong>问题反馈</strong><small>告诉我们现场使用中的问题</small></span><ChevronRight :size="16" class="muted-icon" /></button><button class="list-row setting" @click="showMessage('当前版本 1.0.0')"><span class="list-main"><strong>关于牧场智控</strong><small>版本与数据协议</small></span><span class="mono muted-value">v1.0.0</span></button></div></section>
    </main>
    <div class="drawer todo-dialog" :class="{ open: todoDialogOpen }" @click.self="closeTodoDialog">
      <div v-if="todoStep === 'type'" class="drawer-card">
        <div class="drawer-head"><h2>添加待办</h2><button class="close" type="button" aria-label="关闭" @click="closeTodoDialog"><X :size="18" /></button></div>
        <p class="todo-dialog-hint">选择事件类型</p>
        <div class="todo-type-grid"><button v-for="type in todoTypeOrder" :key="type" class="todo-type" type="button" @click="chooseType(type)"><span class="icon-disc" :class="`type-${type}`"><component :is="typeIcons[type]" :size="15" /></span><span class="todo-type-copy"><strong>{{ todoTypeMeta[type].label }}</strong><small>{{ todoTypeMeta[type].hint }}</small></span></button></div>
      </div>
      <form v-else class="drawer-card" @submit.prevent="submitTodo">
        <div class="drawer-head"><h2>添加{{ todoTypeMeta[todoForm.type].label }}</h2><button class="close" type="button" aria-label="关闭" @click="closeTodoDialog"><X :size="18" /></button></div>
        <div class="todo-selected"><span class="icon-disc" :class="`type-${todoForm.type}`"><component :is="typeIcons[todoForm.type]" :size="15" /></span><span class="todo-selected-copy"><strong>{{ todoTypeMeta[todoForm.type].label }}</strong><small>{{ todoTypeMeta[todoForm.type].hint }}</small></span><button class="link-btn" type="button" @click="backToTypeStep">更换类型</button></div>
        <div class="todo-form-grid">
          <label class="todo-field"><span>日期</span><input v-model="todoForm.date" type="date" :min="todoCurrentDate" required></label>
          <label class="todo-field"><span>时间</span><input v-model="todoForm.time" type="time" required></label>
          <template v-if="todoForm.type === 'rotation'">
            <label class="todo-field"><span>起始草场</span><select v-model="todoForm.from" required><option v-for="pasture in pastureOptions" :key="pasture" :value="pasture">{{ pasture }}</option></select></label>
            <label class="todo-field"><span>目标草场</span><select v-model="todoForm.to" required><option v-for="pasture in pastureOptions" :key="pasture" :value="pasture">{{ pasture }}</option></select></label>
            <label class="todo-field todo-field-full"><span>预计转移数量</span><div class="todo-number"><input v-model.number="todoForm.amount" type="number" min="1" step="1" required><span>头</span></div></label>
          </template>
          <template v-else-if="todoForm.type === 'inspection'">
            <label class="todo-field todo-field-full"><span>巡检区域</span><select v-model="todoForm.area" required><option v-for="area in workAreas" :key="area" :value="area">{{ area }}</option></select></label>
          </template>
          <template v-else-if="todoForm.type === 'vaccination'">
            <label class="todo-field"><span>目标畜群</span><select v-model="todoForm.herd" required><option v-for="herd in herdOptions" :key="herd" :value="herd">{{ herd }}</option></select></label>
            <label class="todo-field"><span>疫苗 / 针次</span><input v-model.trim="todoForm.vaccine" type="text" maxlength="30" placeholder="口蹄疫疫苗第一针"></label>
          </template>
          <template v-else-if="todoForm.type === 'maintenance'">
            <label class="todo-field todo-field-full"><span>作业区域</span><select v-model="todoForm.area" required><option v-for="area in workAreas" :key="area" :value="area">{{ area }}</option></select></label>
          </template>
          <template v-else-if="todoForm.type === 'device'">
            <label class="todo-field todo-field-full"><span>设备编号</span><input v-model.trim="todoForm.deviceId" type="text" maxlength="24" placeholder="例如：SC-2026-00220" required></label>
          </template>
          <template v-else>
            <label class="todo-field todo-field-full"><span>事项名称</span><input v-model.trim="todoForm.title" type="text" maxlength="24" placeholder="例如：领取防疫物资" required></label>
          </template>
          <label class="todo-field todo-field-full"><span>备注</span><textarea v-model.trim="todoForm.note" rows="3" maxlength="120" :placeholder="notePlaceholder"></textarea></label>
        </div>
        <div class="drawer-actions todo-form-actions"><button class="btn btn-secondary" type="button" @click="closeTodoDialog">取消</button><button class="btn btn-primary" type="submit" :disabled="todoSaving">{{ todoSaving ? '保存中...' : '保存待办' }}</button></div>
      </form>
    </div>
    <div class="drawer todo-dialog" :class="{ open: editDialogOpen }" @click.self="closeEditTodo">
      <form v-if="editingTodo" class="drawer-card" @submit.prevent="submitEditTodo">
        <div class="drawer-head"><h2>编辑待办</h2><button class="close" type="button" aria-label="关闭" @click="closeEditTodo"><X :size="18" /></button></div>
        <div class="todo-selected"><span class="icon-disc" :class="`type-${editingTodo.type}`"><component :is="typeIcons[editingTodo.type]" :size="15" /></span><span class="todo-selected-copy"><strong>{{ todoTypeMeta[editingTodo.type].label }}</strong><small>{{ editingTodo.status }} · 点击下方内容修改</small></span></div>
        <div class="todo-form-grid">
          <label class="todo-field"><span>日期</span><input v-model="editForm.date" type="date" required></label>
          <label class="todo-field"><span>时间</span><input v-model="editForm.time" type="time" required></label>
          <label class="todo-field todo-field-full"><span>事项名称</span><input v-model.trim="editForm.title" type="text" maxlength="60" required></label>
          <label class="todo-field todo-field-full"><span>备注</span><textarea v-model.trim="editForm.detail" rows="4" maxlength="240" placeholder="补充事项说明"></textarea></label>
        </div>
        <div class="drawer-actions todo-form-actions"><button class="btn btn-secondary" type="button" @click="closeEditTodo">取消</button><button class="btn todo-danger" type="button" :disabled="editSaving" @click="requestDeleteTodo">删除待办</button><button class="btn btn-primary" type="submit" :disabled="editSaving">{{ editSaving ? '处理中...' : '确认修改' }}</button></div>
      </form>
    </div>
    <div class="drawer todo-dialog delete-confirm-dialog" :class="{ open: deleteConfirmOpen }" @click.self="cancelDeleteTodo">
      <div v-if="editingTodo" class="drawer-card">
        <div class="drawer-head"><h2>确认删除</h2><button class="close" type="button" aria-label="关闭" @click="cancelDeleteTodo"><X :size="18" /></button></div>
        <p class="delete-confirm-copy">删除后无法恢复，确定要删除这条待办吗？</p>
        <div class="todo-selected"><span class="icon-disc" :class="`type-${editingTodo.type}`"><component :is="typeIcons[editingTodo.type]" :size="15" /></span><span class="todo-selected-copy"><strong>{{ editingTodo.title }}</strong><small>{{ editingTodo.date }} {{ editingTodo.time }} · {{ editingTodo.status }}</small></span></div>
        <div class="drawer-actions todo-form-actions"><button class="btn btn-secondary" type="button" @click="cancelDeleteTodo">取消</button><button class="btn todo-danger" type="button" :disabled="editSaving" @click="deleteEditingTodo">{{ editSaving ? '删除中...' : '确认删除' }}</button></div>
      </div>
    </div>
    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </PageChrome>
</template>

<style scoped>
.delete-confirm-dialog {
  z-index: 12;
}

.delete-confirm-copy {
  margin: 12px 18px 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.6;
}

.todo-danger {
  background: #fff1f0;
  color: #c62828;
}

.todo-danger:hover:not(:disabled) {
  background: #ffe0dc;
}

.todo-danger:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
</style>
