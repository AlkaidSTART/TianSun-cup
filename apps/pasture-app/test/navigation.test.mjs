import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = readFileSync(fileURLToPath(new URL('../src/utils/navigation.ts', import.meta.url)), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function navigationAt(route, authenticated = true) {
  const calls = []
  const exports = {}
  runInNewContext(compiled, {
    exports,
    require: () => ({
      hasAuthSessionHint: () => authenticated,
      goToLogin: () => calls.push(['login']),
    }),
    getCurrentPages: () => route ? [{ route }] : [],
    uni: {
      reLaunch: ({ url }) => calls.push(['reLaunch', url]),
      navigateTo: ({ url }) => calls.push(['navigateTo', url]),
      redirectTo: ({ url }) => calls.push(['redirectTo', url]),
    },
  })
  return { navigate: exports.navigateToView, calls }
}

test('switching main pages asks uni-app to update the rendered page', () => {
  const { navigate, calls } = navigationAt('pages/dashboard/index')
  navigate('livestock')
  assert.deepEqual(calls, [['redirectTo', '/pages/livestock/index']])
})

test('entering from login resets the stack; consultation keeps a return page', () => {
  const login = navigationAt('pages/login/index')
  login.navigate('dashboard')
  assert.deepEqual(login.calls, [['reLaunch', '/pages/dashboard/index']])

  const profile = navigationAt('pages/profile/index')
  profile.navigate('consultation')
  assert.deepEqual(profile.calls, [['navigateTo', '/pages/consultation/index']])
})

test('the current, unknown, and unauthenticated routes do not navigate', () => {
  const current = navigationAt('pages/pasture/index')
  current.navigate('pasture')
  current.navigate('toString')
  assert.deepEqual(current.calls, [])

  const guest = navigationAt('pages/dashboard/index', false)
  guest.navigate('alerts')
  assert.deepEqual(guest.calls, [['login']])
})
