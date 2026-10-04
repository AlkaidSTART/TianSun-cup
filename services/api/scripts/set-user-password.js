import { randomBytes, scryptSync } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { db, databaseFile, closeDatabase } from '../src/db.js'

function argument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || '' : ''
}

function secretQuestion(label) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || !process.stdin.setRawMode) {
      reject(new Error('请在交互式终端中运行；密码不会作为命令行参数读取'))
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
          reject(new Error('已取消'))
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
  const username = argument('--username')
  if (!username) throw new Error('请指定账号：--username admin')
  if (!process.stdin.isTTY || !process.stdin.setRawMode) {
    throw new Error('请在交互式终端中运行')
  }
  const user = db.prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE').get(username)
  if (!user) throw new Error(`本地数据库中不存在账号：${username}`)
  console.log(`目标数据库：${databaseFile}`)
  console.log(`目标账号：${user.username}`)
  const password = await secretQuestion('输入要设置的新密码（10–128 字符，不回显）：')
  const confirmation = await secretQuestion('再次输入新密码：')
  if (password.length < 10 || password.length > 128) throw new Error('密码长度需为 10–128 个字符')
  if (password !== confirmation) throw new Error('两次密码不一致，未修改')
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 5, maxmem: 64 * 1024 * 1024 })
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare(`UPDATE users SET password_salt = ?, password_hash = ?, must_change_password = 0, updated_at = ? WHERE id = ?`)
      .run(salt.toString('hex'), `scrypt$16384$8$5$${derived.toString('hex')}`, new Date().toISOString(), user.id)
    db.prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(user.id)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  console.log(`已更新本地账号 ${user.username} 的密码，并撤销其现有登录会话。`)
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  closeDatabase()
}
