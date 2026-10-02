<script setup lang="ts">
import { onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import { authApi } from '../../services/authApi'
import { hasAuthSessionHint } from '../../services/session'
import { navigateToView } from '../../utils/navigation'

const username = ref('')
const password = ref('')
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const changingPassword = ref(false)
const busy = ref(false)
const errorText = ref('')

onShow(async () => {
  if (!hasAuthSessionHint()) return
  try {
    const user = await authApi.me()
    if (user.mustChangePassword) changingPassword.value = true
    else navigateToView('dashboard')
  } catch {
    errorText.value = '登录已过期，请重新登录'
  }
})

async function signIn() {
  if (busy.value) return
  errorText.value = ''
  busy.value = true
  try {
    const user = await authApi.login(username.value.trim(), password.value)
    if (user.mustChangePassword) {
      currentPassword.value = password.value
      changingPassword.value = true
      password.value = ''
    } else {
      password.value = ''
      navigateToView('dashboard')
    }
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '登录失败'
  } finally {
    busy.value = false
  }
}

async function setPassword() {
  if (busy.value) return
  if (newPassword.value !== confirmPassword.value) {
    errorText.value = '两次新密码不一致'
    return
  }
  errorText.value = ''
  busy.value = true
  try {
    await authApi.changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    changingPassword.value = false
    navigateToView('dashboard')
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : '修改密码失败'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <view class="login-screen">
    <view class="login-card">
      <view class="login-brand"><view class="login-mark">牧</view><view><text class="login-title">数牧空间</text><text class="login-subtitle">阿坝示范区 · 账号登录</text></view></view>
      <view v-if="!changingPassword">
        <view class="login-heading">欢迎回来</view>
        <text class="login-description">请使用管理员发放的账号和密码登录</text>
        <view class="login-field"><text>登录账号</text><input v-model.trim="username" type="text" maxlength="32" placeholder="请输入账号" /></view>
        <view class="login-field"><text>登录密码</text><input v-model="password" type="password" placeholder="请输入密码" @confirm="signIn" /></view>
        <button class="login-submit" type="button" :disabled="busy" @click="signIn">{{ busy ? '登录中…' : '登录' }}</button>
      </view>
      <view v-else>
        <view class="login-heading">设置新密码</view>
        <text class="login-description">首次登录或密码重置后，请修改初始密码</text>
        <view class="login-field"><text>当前密码</text><input v-model="currentPassword" type="password" placeholder="输入初始密码" /></view>
        <view class="login-field"><text>新密码</text><input v-model="newPassword" type="password" placeholder="6–128 个字符" /></view>
        <view class="login-field"><text>确认新密码</text><input v-model="confirmPassword" type="password" placeholder="再次输入新密码" @confirm="setPassword" /></view>
        <button class="login-submit" type="button" :disabled="busy" @click="setPassword">{{ busy ? '保存中…' : '修改密码并继续' }}</button>
      </view>
      <view v-if="errorText" class="login-error"><AppIcon name="circleAlert" :size="16" />{{ errorText }}</view>
    </view>
  </view>
</template>

<style scoped>
.login-screen { min-height: 100svh; display: flex; align-items: center; justify-content: center; padding: 32px 18px; background: #f4f6f1; }
.login-card { width: 100%; max-width: 420px; padding: 30px 24px; background: #fff; border: 1px solid #e5ebe5; border-radius: 22px; box-shadow: 0 20px 50px rgba(26, 59, 46, .09); }
.login-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 34px; }
.login-mark { display: grid; place-items: center; width: 42px; height: 42px; color: #fff; background: #1d3b30; border-radius: 13px; font-weight: 800; }
.login-title, .login-subtitle { display: block; }
.login-title { color: #1d3029; font-size: 17px; font-weight: 800; }
.login-subtitle { margin-top: 2px; color: #7e8b84; font-size: 11px; }
.login-heading { color: #1d3029; font-size: 24px; font-weight: 750; }
.login-description { display: block; margin: 6px 0 24px; color: #718077; font-size: 12px; }
.login-field { margin-bottom: 17px; }
.login-field text { display: block; margin-bottom: 7px; color: #384d40; font-size: 12px; font-weight: 700; }
.login-field input { box-sizing: border-box; width: 100%; height: 43px; padding: 0 12px; border: 1px solid #dce5dc; border-radius: 10px; background: #fff; color: #1d3029; font-size: 14px; }
.login-submit { display: block; width: 100%; margin-top: 22px; padding: 11px; border: 0; border-radius: 11px; background: #35634c; color: #fff; font-size: 14px; font-weight: 700; text-align: center; }
.login-submit[disabled] { opacity: .6; }
.login-error { display: flex; align-items: center; gap: 6px; margin-top: 18px; color: #b93832; font-size: 12px; }
</style>
