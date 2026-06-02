/**
 * ============================================================
 *  历史记录数据中心  src/utils/historyStore.js
 * ============================================================
 * 设计要点：
 *   1. 记录三种操作类型：discard（丢弃）、restock（补货）、use（使用）
 *   2. 唯一数据源：localStorage key = `im_history_db_<家庭或个人作用域>`
 *   3. 与 goodsStore 解耦：本文件只负责记录的写入/读取，
 *      由 goodsStore 在 discardGoods / consumeGoods / restockGoods 中调用 addRecord。
 *   4. 提供 subscribe(fn) 实现跨页面同步。
 *
 * HistoryRecord 结构：
 * {
 *   id:          string   // 唯一 ID（自增）
 *   type:        'discard' | 'restock' | 'use'
 *   operator:    string   // 操作人用户名
 *   itemId:      string   // 物资 ID
 *   itemName:    string   // 物资名称（冗余，方便展示）
 *   categoryId:  string   // 物资分类（冗余）
 *   quantity:    number   // 操作数量（正数）
 *   unit:        string   // 单位（冗余）
 *   timestamp:   string   // ISO 时间字符串（如 "2026-06-08T10:30:00.000Z"）
 *   note:        string   // 备注（可选）
 * }
 */

// 通用 localStorage 读写工具
import { loadFromStorage, saveToStorage } from '@/utils/constants'
// 作用域拼接：把基础 key 拼成"基础 key + 当前家庭/个人作用域"
import { getScopedStorageKey } from '@/utils/familyStore'
// 临时登录信息（用于记录"操作者"是谁）
import { getSession } from '@/utils/storage'

// localStorage 基础 key（最终会带上作用域后缀）
export const HISTORY_DB_KEY = 'im_history_db'

// ===== 订阅列表 =====
// 所有调用 subscribe() 的回调都会被收集进来；数据变化时统一通知
const listeners = new Set()

// 内部：取当前作用域下的完整 storage key
function getHistoryDBKey() {
  return getScopedStorageKey(HISTORY_DB_KEY)
}

// 全新数据库结构
function createDefaultDB() {
  return {
    records: [],
    nextId: 1
  }
}

// 确保 localStorage 中存在该作用域的数据；不存在则用默认结构初始化
function ensureInitialized() {
  const storageKey = getHistoryDBKey()
  const saved = loadFromStorage(storageKey, null)
  if (saved && Array.isArray(saved.records)) {
    // 兼容老数据：缺 nextId 时补一个
    if (typeof saved.nextId !== 'number') saved.nextId = 1
    return saved
  }
  const initial = createDefaultDB()
  saveToStorage(storageKey, initial)
  return initial
}

// 读取完整数据
function readDB() {
  return ensureInitialized()
}

// 写入完整数据并广播变更
function writeDB(db) {
  saveToStorage(getHistoryDBKey(), db)
  emitChange()
}

// 触发所有订阅者
function emitChange() {
  const list = getRecords()
  listeners.forEach(fn => {
    try { fn(list) } catch (e) { console.error('[historyStore] listener error:', e) }
  })
}

// ===== 跨标签页同步 =====
// 浏览器 A 标签页改了 localStorage，B 标签页通过 storage 事件感知到
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === getHistoryDBKey()) {
      emitChange()
    }
  })
}

// ============================================================
//  对外公共 API
// ============================================================

/**
 * 获取所有历史记录，按时间降序排列（最新的在前）
 * @returns {Array<HistoryRecord>}
 */
// 返回前做一次浅拷 + 排序，避免外部直接修改内部数组
export function getRecords() {
  const db = readDB()
  return [...(db.records || [])].sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  })
}

/**
 * 添加一条历史记录（自动从 sessionStorage 读取当前操作用户）
 * @param {'discard'|'restock'|'use'} type  操作类型
 * @param {Object} detail
 * @param {string}  detail.itemId
 * @param {string}  detail.itemName
 * @param {string}  [detail.categoryId]
 * @param {number}  detail.quantity
 * @param {string}  detail.unit
 * @param {string}  [detail.note]
 * @returns {HistoryRecord}
 */
export function addRecord(type, detail) {
  const db = readDB()
  // 获取当前操作用户
  const currentUser = getSession('userInfo', null)
  // 构造完整记录，缺失字段全部给默认值，保证渲染不会因数据残缺崩溃
  const record = {
    id: String(db.nextId++),
    type,
    operator: currentUser?.username || '未知用户',
    itemId: detail.itemId || '',
    itemName: detail.itemName || '未知物资',
    categoryId: detail.categoryId || '',
    // 数量始终存正数；展示时再按 type 决定加号/减号
    quantity: Math.abs(Number(detail.quantity) || 0),
    unit: detail.unit || '个',
    timestamp: new Date().toISOString(),
    note: detail.note || ''
  }
  // 新记录放到最前面（与排序一致，避免重复操作）
  db.records.unshift(record)
  writeDB(db)
  return { ...record }
}

/**
 * 清除所有历史记录
 */
// 一键清空；通常由"操作历史"页的清空按钮触发
export function clearRecords() {
  const db = readDB()
  db.records = []
  writeDB(db)
}

/**
 * 按类型筛选记录
 * @param {'discard'|'restock'|'use'} type
 * @returns {Array<HistoryRecord>}
 */
// 在已排序的记录上再过滤一次，保留时间倒序
export function getRecordsByType(type) {
  return getRecords().filter(r => r.type === type)
}

/**
 * 订阅历史记录变更
 * @param {(list:Array)=>void} fn
 * @returns {Function} 取消订阅函数
 */
// 返回的"取消订阅函数"在组件卸载时调用，避免内存泄漏
export function subscribe(fn) {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// 模块加载时确保初始化
// 任何 import 本模块的页面都会触发一次，确保数据可用
ensureInitialized()
