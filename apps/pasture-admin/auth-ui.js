const storageKey = 'tiansun_admin_session'
localStorage.removeItem('tiansun_admin_token') // discard legacy JS-readable bearer tokens
let hasSession = localStorage.getItem(storageKey) === '1'
let currentUser = null
let onAuthenticated = () => {}
let elements
let users = []

export function authHeaders() {
  return {} // The browser automatically sends its HttpOnly, same-origin session cookie.
}

function setLoggedIn(value) {
  hasSession = value
  if (value) localStorage.setItem(storageKey, '1')
  else localStorage.removeItem(storageKey)
}

export function handleUnauthorized(message = '登录已过期，请重新登录') {
  setLoggedIn(false)
  currentUser = null
  showLogin(message)
}

function showLogin(message = '') {
  elements.loginScreen.hidden = false
  elements.adminShell.hidden = true
  elements.loginForm.hidden = false
  elements.passwordForm.hidden = true
  elements.error.textContent = message
  elements.temporaryPassword.textContent = ''
  elements.temporaryPasswordBox.hidden = true
}

function showPasswordForm() {
  elements.loginScreen.hidden = false
  elements.adminShell.hidden = true
  elements.loginForm.hidden = true
  elements.passwordForm.hidden = false
  elements.error.textContent = ''
}

function showAdmin(user) {
  if (user.role !== 'admin') {
    handleUnauthorized('此账号没有管理后台权限')
    return
  }
  currentUser = user
  elements.avatar.textContent = user.displayName.slice(0, 1) || '牧'
  elements.name.textContent = user.displayName
  elements.username.textContent = user.username
  elements.loginScreen.hidden = true
  elements.adminShell.hidden = false
  elements.error.textContent = ''
  onAuthenticated()
  loadUsers()
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'TianSun', ...authHeaders(), ...(options.headers || {}) },
  })
  let payload
  try { payload = await response.json() }
  catch { throw new Error(`接口返回异常（HTTP ${response.status}）`) }
  if (response.status === 401 && path !== '/api/auth/login') handleUnauthorized()
  if (!response.ok || payload.code !== 0) throw new Error(payload.message || '请求失败')
  return payload.data
}

async function restore() {
  if (!hasSession) { showLogin(); return }
  try {
    const user = await api('/api/auth/me')
    if (user.role !== 'admin') { handleUnauthorized('此账号没有管理后台权限'); return }
    currentUser = user
    if (user.mustChangePassword) showPasswordForm()
    else showAdmin(user)
  } catch (error) { handleUnauthorized(error.message) }
}

async function loadUsers() {
  try {
    users = await api('/api/users')
    elements.rows.innerHTML = users.map((user) => `
      <div class="user-row">
        <div><strong>${escapeHtml(user.displayName)} · ${escapeHtml(user.username)}</strong>
          <small>${user.role === 'admin' ? '管理员' : '操作员'} · ${user.isActive ? '已启用' : '已停用'}${user.mustChangePassword ? ' · 待修改初始密码' : ''}</small></div>
        <div class="user-row-actions">
          <button class="button button-secondary" type="button" data-user-action="toggle" data-id="${escapeHtml(user.id)}" ${user.id === currentUser?.id ? 'disabled' : ''}>${user.isActive ? '停用' : '启用'}</button>
          <button class="button button-secondary" type="button" data-user-action="reset" data-id="${escapeHtml(user.id)}" ${user.id === currentUser?.id ? 'disabled' : ''}>重置密码</button>
        </div>
      </div>
    `).join('') || '<p>暂无账号</p>'
  } catch (error) { showAccountError(error.message) }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function showAccountError(message) {
  // The login error area doubles as an aria-live announcement without exposing credentials.
  elements.error.textContent = message
  if (elements.adminShell.hidden) return
  window.alert(message)
}

async function signIn(event) {
  event.preventDefault()
  elements.error.textContent = ''
  const button = elements.loginForm.querySelector('button[type="submit"]')
  button.disabled = true
  const form = new FormData(elements.loginForm)
  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: form.get('username'), password: form.get('password') }),
    })
    if (result.user.role !== 'admin') { showLogin('此账号没有管理后台权限'); return }
    setLoggedIn(true)
    currentUser = result.user
    if (result.user.mustChangePassword) {
      elements.passwordForm.elements.currentPassword.value = String(form.get('password'))
      showPasswordForm()
    } else showAdmin(result.user)
    elements.loginForm.elements.password.value = ''
  } catch (error) { showLogin(error.message) }
  finally { button.disabled = false }
}

async function changePassword(event) {
  event.preventDefault()
  elements.error.textContent = ''
  const form = new FormData(elements.passwordForm)
  if (form.get('newPassword') !== form.get('confirmPassword')) {
    elements.error.textContent = '两次新密码不一致'
    return
  }
  const button = elements.passwordForm.querySelector('button[type="submit"]')
  button.disabled = true
  try {
    const result = await api('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') }),
    })
    setLoggedIn(true)
    elements.passwordForm.reset()
    showAdmin(result.user)
  } catch (error) { elements.error.textContent = error.message }
  finally { button.disabled = false }
}

async function signOut() {
  try { if (hasSession) await api('/api/auth/logout', { method: 'POST' }) }
  catch { /* Clearing the local session still logs out from this browser. */ }
  handleUnauthorized('已退出登录')
}

async function createAccount(event) {
  event.preventDefault()
  const button = elements.createForm.querySelector('button[type="submit"]')
  button.disabled = true
  const form = new FormData(elements.createForm)
  try {
    await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({
        username: form.get('username'), displayName: form.get('displayName'),
        password: form.get('password'), role: form.get('role'),
      }),
    })
    elements.createForm.reset()
    await loadUsers()
  } catch (error) { showAccountError(error.message) }
  finally { button.disabled = false }
}

async function handleUserAction(event) {
  const button = event.target.closest('[data-user-action]')
  if (!button) return
  const user = users.find((item) => item.id === button.dataset.id)
  if (!user) return
  button.disabled = true
  try {
    if (button.dataset.userAction === 'toggle') {
      await api(`/api/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH', body: JSON.stringify({ isActive: !user.isActive }),
      })
    } else {
      const result = await api(`/api/users/${encodeURIComponent(user.id)}/reset-password`, { method: 'POST' })
      elements.temporaryPassword.textContent = result.temporaryPassword
      elements.temporaryPasswordBox.hidden = false
    }
    await loadUsers()
  } catch (error) { showAccountError(error.message); button.disabled = false }
}

export function initAdminAuth(onReady) {
  onAuthenticated = onReady
  elements = {
    loginScreen: document.querySelector('#loginScreen'),
    adminShell: document.querySelector('#adminShell'),
    loginForm: document.querySelector('#adminLoginForm'),
    passwordForm: document.querySelector('#adminPasswordForm'),
    error: document.querySelector('#loginError'),
    avatar: document.querySelector('#adminAvatar'),
    name: document.querySelector('#adminName'),
    username: document.querySelector('#adminUsername'),
    logout: document.querySelector('#logoutButton'),
    createForm: document.querySelector('#createUserForm'),
    rows: document.querySelector('#userRows'),
    temporaryPasswordBox: document.querySelector('#temporaryPasswordBox'),
    temporaryPassword: document.querySelector('#temporaryPassword'),
    copyTemporaryPassword: document.querySelector('#copyTemporaryPassword'),
  }
  elements.loginForm.addEventListener('submit', signIn)
  elements.passwordForm.addEventListener('submit', changePassword)
  elements.logout.addEventListener('click', signOut)
  elements.createForm.addEventListener('submit', createAccount)
  elements.rows.addEventListener('click', handleUserAction)
  elements.copyTemporaryPassword.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(elements.temporaryPassword.textContent) }
    catch { showAccountError('复制失败，请手动选择临时密码') }
  })
  restore()
}
