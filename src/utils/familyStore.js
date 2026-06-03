/**
 * ============================================================
 *  家庭与作用域工具  src/utils/familyStore.js
 * ============================================================
 * 文件作用：
 *   1. 提供"用户表"与"家庭表"的统一读写入口
 *      （底层都落在 localStorage 的 im_users / im_families 这两个 key 上）
 *   2. 计算当前登录账号所属的"数据作用域"（scope），
 *      告诉其他模块（goodsStore / historyStore 等）应该把数据写到哪个 key 下：
 *        - 已加入家庭     → family_<familyId>
 *        - 仅注册个人账号 → user_<userId>
 *        - 未登录         → guest
 *   3. 提供作用域 key 拼接、跨作用域数据拷贝、家庭切换事件广播等辅助能力。
 *
 * 为什么要"作用域"：
 *   不同账号 / 不同家庭看到的库存物资是隔离的。
 *   通过为每个 scope 拼接独立的 localStorage key，
 *   就实现了"同一台浏览器上多人切换账号 / 切换家庭，互不污染数据"。
 * ============================================================
 */

import { get, getSession, set } from '@/utils/storage'

// 家庭信息变化时通过该自定义事件广播，供 goodsStore / historyStore 等响应刷新
export const FAMILY_CHANGED_EVENT = 'im-family-changed'
// 与家庭/账号信息相关的 localStorage key（带前缀的全名）
export const FAMILY_STORAGE_KEYS = ['im_users', 'im_families']

// 读取所有用户记录；非数组时返回空数组兜底
export function getUsersTable() {
  const users = get('users', [])
  return Array.isArray(users) ? users : []
}

// 写入用户表；非数组时落空数组，避免坏数据被持久化
export function saveUsersTable(users) {
  set('users', Array.isArray(users) ? users : [])
}

// 读取所有家庭记录
export function getFamiliesTable() {
  const families = get('families', [])
  return Array.isArray(families) ? families : []
}

// 写入家庭表
export function saveFamiliesTable(families) {
  set('families', Array.isArray(families) ? families : [])
}

// 取当前登录用户的完整记录
// 优先从 users 表查最新数据；查不到时回退到 sessionStorage 中暂存的登录信息
export function getCurrentUserRecord() {
  const userInfo = getSession('userInfo', null)
  if (!userInfo?.id) return null

  const user = getUsersTable().find(u => u.id === userInfo.id)
  return user ? { ...user } : { ...userInfo }
}

// 按家庭 id 查找家庭信息
export function getFamilyById(familyId) {
  if (!familyId) return null
  return getFamiliesTable().find(f => f.id === familyId) || null
}

// 个人作用域的 key 后缀
export function getUserScopeKey(userId) {
  return `user_${userId}`
}

// 家庭作用域的 key 后缀
export function getFamilyScopeKey(familyId) {
  return `family_${familyId}`
}

// 根据一个用户记录，推算应该使用哪个数据作用域
// 优先级：家庭 > 个人 > 游客
export function getUserInventoryScope(user = getCurrentUserRecord()) {
  if (!user?.id) {
    return { type: 'guest', id: 'guest', key: 'guest' }
  }

  if (user.familyId) {
    return { type: 'family', id: user.familyId, key: getFamilyScopeKey(user.familyId) }
  }

  return { type: 'user', id: user.id, key: getUserScopeKey(user.id) }
}

// 取当前登录账号的数据作用域
export function getCurrentInventoryScope() {
  return getUserInventoryScope(getCurrentUserRecord())
}

// 把"基础 key"和"当前作用域"拼成最终用于读写 localStorage 的完整 key
// 例如：baseKey = "im_goods_db"，当前作用域 = family_3
//       → 返回 "im_goods_db_family_3"
export function getScopedStorageKey(baseKey, scope = getCurrentInventoryScope()) {
  return `${baseKey}_${scope.key}`
}

/**
 * 把当前作用域下某份数据拷贝到另一个作用域。
 * 典型场景：用户首次创建家庭时，把自己个人作用域下的物资数据
 *           复制到新家庭的作用域，避免老数据丢失。
 *
 * @param {string} baseKey         基础 key（不含作用域后缀）
 * @param {string} targetScopeKey  目标作用域后缀（如 "family_3"）
 * @param {{overwrite?:boolean}} opts  默认不覆盖目标已有数据
 * @returns {boolean} 是否真的拷贝了数据
 */
export function copyScopedStorageData(baseKey, targetScopeKey, opts = {}) {
  if (typeof window === 'undefined') return false

  const targetKey = `${baseKey}_${targetScopeKey}`
  // 目标已有数据且未指定覆盖 → 直接跳过，保护现有数据
  if (opts.overwrite !== true && localStorage.getItem(targetKey) !== null) {
    return false
  }

  // 优先取当前作用域下的数据；若没有再尝试取裸 baseKey（兼容老数据）
  const sourceKey = getScopedStorageKey(baseKey)
  const source = localStorage.getItem(sourceKey) ?? localStorage.getItem(baseKey)
  if (source === null) return false

  localStorage.setItem(targetKey, source)
  return true
}

// 广播"家庭信息已变化"自定义事件
// goodsStore / historyStore 等模块监听此事件后会重新初始化数据
export function emitFamilyChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(FAMILY_CHANGED_EVENT))
}
