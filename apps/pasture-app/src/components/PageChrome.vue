<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { currentUser } from '../services/session'
import { authApi } from '../services/authApi'
import { navigateToView } from '../utils/navigation'

const props = defineProps<{ active: string; routeView?: string; avatar?: string }>()
const avatarText = computed(() => props.avatar || currentUser.value?.displayName?.slice(0, 1) || '牧')
const accountDialogOpen = ref(false)
const passwordOpen = ref(false)
const passwordBusy = ref(false)
const accountMessage = ref('')
const passwordForm = reactive({ current: '', next: '', confirm: '' })
const accountTitle = '\u8d26\u6237\u4e0e\u5b89\u5168'
const accountSubtitle = '\u7ba1\u7406\u767b\u5f55\u8d26\u53f7\u4e0e\u5bc6\u7801'
const passwordLabel = '\u4fee\u6539\u5bc6\u7801'
const logoutLabel = '\u9000\u51fa\u767b\u5f55'
const closeLabel = '\u5173\u95ed'
const currentPasswordLabel = '\u5f53\u524d\u5bc6\u7801'
const newPasswordLabel = '\u65b0\u5bc6\u7801\uff0810-128\u4f4d\uff09'
const confirmPasswordLabel = '\u786e\u8ba4\u65b0\u5bc6\u7801'
const savePasswordLabel = '\u4fdd\u5b58\u65b0\u5bc6\u7801'
const cancelLabel = '\u53d6\u6d88'
const accountNameLabel = '\u767b\u5f55\u8d26\u53f7'
const savingLabel = '\u4fdd\u5b58\u4e2d...'

function closeAccountDialog() {
  accountDialogOpen.value = false
  passwordOpen.value = false
  accountMessage.value = ''
  Object.assign(passwordForm, { current: '', next: '', confirm: '' })
}

async function submitPassword() {
  if (passwordBusy.value) return
  if (!passwordForm.current || !passwordForm.next || !passwordForm.confirm) {
    accountMessage.value = '请填写完整的密码信息'
    return
  }
  if (passwordForm.next !== passwordForm.confirm) {
    accountMessage.value = '\u4e24\u6b21\u65b0\u5bc6\u7801\u4e0d\u4e00\u81f4'
    return
  }
  passwordBusy.value = true
  accountMessage.value = ''
  try {
    await authApi.changePassword(passwordForm.current, passwordForm.next)
    Object.assign(passwordForm, { current: '', next: '', confirm: '' })
    passwordOpen.value = false
    accountMessage.value = '\u5bc6\u7801\u5df2\u4fee\u6539'
  } catch (error) {
    accountMessage.value = error instanceof Error ? error.message : '\u4fee\u6539\u5bc6\u7801\u5931\u8d25'
  } finally {
    passwordBusy.value = false
  }
}

async function signOut() {
  try { await authApi.logout() } catch { /* local credentials are cleared by authApi */ }
  closeAccountDialog()
  uni.reLaunch({ url: '/pages/login/index' })
}

function navigate(view: string) {
  if ((props.routeView || props.active) === view) return
  navigateToView(view)
}
</script>

<template>
  <div class="app" :data-route-view="routeView || active">
    <header class="topbar">
      <button class="brand" aria-label="返回总览" @click="navigate('dashboard')"><span class="brand-mark">牧</span><span class="brand-title">牧场智控<span class="brand-sub">· 阿坝示范区</span></span></button>
      <div class="top-actions"><button class="avatar account-avatar-trigger" type="button" :aria-label="accountTitle" @click="accountDialogOpen = true">{{ avatarText }}</button></div>
    </header>
    <div v-if="accountDialogOpen" class="account-modal" @click.self="closeAccountDialog">
      <section class="account-modal-card" role="dialog" aria-modal="true" aria-labelledby="accountDialogTitle">
        <header class="account-modal-head">
          <div><h2 id="accountDialogTitle">{{ accountTitle }}</h2><p>{{ accountSubtitle }}</p></div>
          <button class="account-modal-close" type="button" :aria-label="closeLabel" @click="closeAccountDialog"><AppIcon name="close" :size="18" /></button>
        </header>
        <div class="account-modal-user">
          <span class="account-modal-avatar">{{ avatarText }}</span>
          <span><strong>{{ currentUser?.displayName || currentUser?.username }}</strong><small>{{ accountNameLabel }}: {{ currentUser?.username }}</small></span>
        </div>
        <div v-if="!passwordOpen" class="account-modal-actions">
          <button class="account-modal-action" type="button" @click="passwordOpen = true; accountMessage = ''">{{ passwordLabel }}</button>
          <button class="account-modal-action account-modal-logout" type="button" @click="signOut">{{ logoutLabel }}</button>
        </div>
        <form v-else class="account-password-form" @submit.prevent="submitPassword">
          <input v-model="passwordForm.current" type="password" :placeholder="currentPasswordLabel" autocomplete="current-password" required />
          <input v-model="passwordForm.next" type="password" :placeholder="newPasswordLabel" minlength="10" maxlength="128" autocomplete="new-password" required />
          <input v-model="passwordForm.confirm" type="password" :placeholder="confirmPasswordLabel" minlength="10" maxlength="128" autocomplete="new-password" required />
          <p v-if="accountMessage" class="account-modal-message" role="status">{{ accountMessage }}</p>
          <div class="account-modal-actions">
            <button class="account-modal-action" type="button" :disabled="passwordBusy" @click="passwordOpen = false; accountMessage = ''">{{ cancelLabel }}</button>
            <button class="account-modal-action account-modal-primary" type="button" :disabled="passwordBusy" @click="submitPassword">{{ passwordBusy ? savingLabel : savePasswordLabel }}</button>
          </div>
        </form>
        <p v-if="accountMessage && !passwordOpen" class="account-modal-message" role="status">{{ accountMessage }}</p>
      </section>
    </div>
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

<style scoped>
.account-avatar-trigger { padding: 0; border: 0; font: inherit; cursor: pointer; }
.account-modal { position: fixed; z-index: 40; inset: 0; display: grid; place-items: center; padding: 20px; background: rgba(17, 34, 25, .44); }
.account-modal-card { width: min(420px, 100%); padding: 22px; border: 1px solid #e3ebe4; border-radius: 20px; background: #fff; box-shadow: 0 24px 70px rgba(20, 45, 31, .22); }
.account-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.account-modal-head h2 { margin: 0; color: #1d3029; font-size: 20px; }
.account-modal-head p { margin: 5px 0 0; color: #78877e; font-size: 12px; }
.account-modal-close { display: grid; place-items: center; width: 34px; height: 34px; flex: none; border: 0; border-radius: 50%; background: #f1f5f1; color: #52645a; }
.account-modal-user { display: flex; align-items: center; gap: 12px; margin: 20px 0; padding: 13px; border-radius: 14px; background: #f4f7f3; }
.account-modal-avatar { display: grid; place-items: center; width: 42px; height: 42px; flex: none; border-radius: 50%; background: #dbead8; color: #35634c; font-weight: 800; }
.account-modal-user strong, .account-modal-user small { display: block; }
.account-modal-user strong { color: #263b30; font-size: 14px; }
.account-modal-user small { margin-top: 4px; color: #7a887f; font-size: 11px; }
.account-modal-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 9px; margin-top: 16px; }
.account-modal-action { display: flex; align-items: center; justify-content: center; min-height: 40px; padding: 0 14px; border: 1px solid #dce7de; border-radius: 10px; background: #fff; color: #365143; font-size: 13px; font-weight: 700; line-height: 1.2; text-align: center; }
.account-modal-logout { color: #a33b35; }
.account-modal-primary { border-color: #35634c; background: #35634c; color: #fff; }
.account-modal-action:disabled { opacity: .6; }
.account-password-form { display: grid; gap: 10px; }
.account-password-form input { width: 100%; height: 42px; box-sizing: border-box; padding: 0 12px; border: 1px solid #dce5dc; border-radius: 10px; background: #fff; color: #1d3029; font-size: 13px; }
.account-modal-message { margin: 12px 0 0; color: #a33b35; font-size: 12px; }
@media (max-width: 520px) { .account-modal { align-items: end; padding: 12px; } .account-modal-card { border-radius: 20px; padding: 20px; } }
</style>
