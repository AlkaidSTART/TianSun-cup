import { createInterface } from 'node:readline/promises'
import { bootstrapInitialAdmin, hasAnyUser } from '../src/auth-store.js'
import { closeDatabase, databaseFile } from '../src/db.js'

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || '' : ''
}

function secretQuestion(label) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdin.setRawMode) {
      reject(new Error('请在交互式终端中运行初始化命令'))
      return
    }
    let value = ''
    const input = process.stdin
    process.stdout.write(label)
    input.setRawMode(true)
    input.setEncoding('utf8')
    input.resume()

    const cleanup = () => {
      input.off('data', onData)
      input.setRawMode(false)
      input.pause()
      process.stdout.write('\n')
    }
    const onData = (chunk) => {
      for (const key of chunk) {
        if (key === '\u0003') {
          cleanup()
          reject(new Error('已取消初始化'))
          return
        }
        if (key === '\r' || key === '\n') {
          cleanup()
          resolve(value)
          return
        }
        if (key === '\b' || key === '\u007f') value = value.slice(0, -1)
        else if (key >= ' ' && key !== '\u007f') value += key
      }
    }
    input.on('data', onData)
  })
}

try {
  if (hasAnyUser()) throw new Error('数据库已经有用户；初始化命令只能运行一次')
  console.log(`初始化数据库：${databaseFile}`)
  const reader = createInterface({ input: process.stdin, output: process.stdout })
  const username = argument('--username') || await reader.question('管理员登录账号：')
  const displayName = argument('--display-name') || await reader.question('管理员显示名称：')
  reader.close()
  const password = await secretQuestion('初始密码（6–128 字符，不回显）：')
  const confirmation = await secretQuestion('再次输入密码：')
  if (password !== confirmation) throw new Error('两次密码不一致，未创建管理员')
  const user = bootstrapInitialAdmin({ username, displayName, password })
  console.log(`管理员 ${user.username} 已创建；现有牲畜与待办已归该账号。`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  closeDatabase()
}
