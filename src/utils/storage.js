/**
 * ============================================================
 *  本地存储工具  src/utils/storage.js
 * ============================================================
 * 文件作用：
 *   对浏览器原生 localStorage / sessionStorage 做一层薄封装，
 *   统一处理三件事：
 *     1. 自动 JSON 序列化与反序列化（存进去什么类型，取出来还是什么类型）
 *     2. 自动加统一前缀 "im_"，避免与其他应用的存储 key 冲突
 *     3. 错误兜底（localStorage 不可用、解析失败等场景不抛错，返回默认值）
 *
 * 命名约定：
 *   - localStorage  → 永久保存（关闭浏览器仍在）
 *   - sessionStorage → 临时保存（关闭标签页即失效），用于登录态等
 *
 * 项目内所有页面/模块都通过本文件读写本地存储，不直接调用原生 API。
 * ============================================================
 */

// 所有 key 统一加这个前缀，避免与浏览器中的其他应用数据冲突
const STORAGE_PREFIX = 'im_'

/**
 * 获取 localStorage 值
 * @param {string} key
 * @param {*} defaultValue 默认值
 * @returns {*}
 */
// 读取永久存储；不存在或解析失败时返回 defaultValue
export function get(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (raw === null) return defaultValue
    return JSON.parse(raw)
  } catch {
    return defaultValue
  }
}

/**
 * 设置 localStorage 值（自动序列化）
 * @param {string} key
 * @param {*} value
 */
// 写入永久存储；写入失败时仅打印错误，不影响主流程
export function set(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
  } catch (e) {
    console.error(`storage.set("${key}") 失败:`, e)
  }
}

/**
 * 删除指定 key
 * @param {string} key
 */
// 移除永久存储中的某条记录
export function remove(key) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + key)
  } catch {
    // 静默失败
  }
}

/**
 * 获取 sessionStorage 值。用于每个标签页独立的临时登录态。
 * @param {string} key
 * @param {*} defaultValue 默认值
 * @returns {*}
 */
// 读取临时存储（仅当前标签页有效）
export function getSession(key, defaultValue = null) {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key)
    if (raw === null) return defaultValue
    return JSON.parse(raw)
  } catch {
    return defaultValue
  }
}

/**
 * 设置 sessionStorage 值（自动序列化）
 * @param {string} key
 * @param {*} value
 */
// 写入临时存储
export function setSession(key, value) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value))
  } catch (e) {
    console.error(`storage.setSession("${key}") 失败:`, e)
  }
}

/**
 * 删除指定 sessionStorage key
 * @param {string} key
 */
// 移除临时存储中的某条记录（例如退出登录时）
export function removeSession(key) {
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + key)
  } catch {
    // 静默失败
  }
}

/**
 * 清空所有带前缀的数据
 */
// 一键清空本应用所有永久存储数据（按前缀过滤，不影响其他应用）
export function clearAll() {
  try {
    const keysToRemove = []
    // 遍历所有 key，挑出带本应用前缀的
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(k)
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k))
  } catch {
    // 静默失败
  }
}

/**
 * 检查 localStorage 是否可用（容量检测）
 * @returns {boolean}
 */
// 试探性写入再删除，能成功就说明可用（隐私模式 / 配额耗尽时会失败）
export function isAvailable() {
  try {
    const testKey = '__storage_test__'
    localStorage.setItem(testKey, '1')
    localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}
