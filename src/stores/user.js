/**
 * ============================================================
 *  用户 Store  src/stores/user.js
 * ============================================================
 * 文件作用：
 *   集中管理与账号、登录态、家庭关系相关的所有数据与操作。
 *
 * 数据存储：
 *   - token / userInfo  → 存 sessionStorage（每个标签页独立）
 *     这样允许同一台浏览器开多个标签页，各自登录不同账号互不干扰。
 *   - 用户表 / 家庭表    → 存 localStorage（全浏览器共享）
 *     这样所有用户的注册信息与家庭关系是一份"全局名册"。
 *
 * 关键概念：
 *   - "家庭"：把多名账号绑定到一起，共享同一份物资数据。
 *     创建者拥有移除成员的特权，其他操作权限完全一致。
 * ============================================================
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
// sessionStorage 工具（用于登录态）
import { getSession, setSession, removeSession } from '@/utils/storage'
// 家庭/作用域相关的辅助函数
import {
  copyScopedStorageData,
  emitFamilyChanged,
  FAMILY_STORAGE_KEYS,
  getFamiliesTable,
  getFamilyScopeKey,
  getUsersTable,
  saveFamiliesTable,
  saveUsersTable
} from '@/utils/familyStore'

/**
 * 用户 Store
 * - 管理登录/注册/退出逻辑
 * - token & userInfo 持久化到 sessionStorage，确保每个浏览器标签页可登录不同账号
 * - 用户表以数组形式存储（im_users），每个用户包含 id, username, password
 */
export const useUserStore = defineStore('user', () => {
  // ===== State =====
  // 登录令牌（标签页级）
  const token = ref(getSession('token', ''))
  // 当前登录用户信息（标签页级）
  const userInfo = ref(getSession('userInfo', null))
  // 全部已注册用户表（全浏览器共享）
  const users = ref(getUsersTable())
  // 全部家庭表（全浏览器共享）
  const families = ref(getFamiliesTable())

  // ===== Getters =====
  // 是否登录
  const isLoggedIn = computed(() => !!token.value)
  // 当前账号用户名
  const username = computed(() => userInfo.value?.username || '')
  // 当前所属家庭对象；未加入家庭则为 null
  const currentFamily = computed(() => {
    const familyId = userInfo.value?.familyId
    if (!familyId) return null
    return families.value.find(f => f.id === familyId) || null
  })
  // 当前用户是否是家庭创建者
  const isFamilyCreator = computed(() => (
    !!currentFamily.value && currentFamily.value.createdBy === userInfo.value?.id
  ))
  // 当前家庭的成员列表，附带"是不是我"、"是不是创建者"两个标记
  const familyMembers = computed(() => {
    const family = currentFamily.value
    if (!family) return []
    return family.memberIds
      .map(id => users.value.find(u => u.id === id))
      .filter(Boolean)   // 过滤掉数据脏了找不到的成员
      .map(u => ({
        id: u.id,
        username: u.username,
        isCurrentUser: u.id === userInfo.value?.id,
        isCreator: u.id === family.createdBy
      }))
  })

  // ===== 内部方法：获取用户表 =====
  // 从 localStorage 重新读取用户表
  function getUsers() {
    return getUsersTable()
  }

  // 把用户表写回 localStorage 并同步响应式镜像
  function saveUsers(usersData) {
    users.value = Array.isArray(usersData) ? usersData : []
    saveUsersTable(users.value)
  }

  // 从 localStorage 重新读取家庭表
  function getFamilies() {
    return getFamiliesTable()
  }

  // 把家庭表写回 localStorage 并同步响应式镜像
  function saveFamilies(familiesData) {
    families.value = Array.isArray(familiesData) ? familiesData : []
    saveFamiliesTable(families.value)
  }

  // 同时刷新用户表与家庭表（外部数据可能被其他标签页改动）
  function reloadFamilyData() {
    users.value = getUsers()
    families.value = getFamilies()
  }

  // 把"当前登录用户的关键信息"写入 sessionStorage
  function persistCurrentUser(user) {
    if (!user) return
    userInfo.value = {
      id: user.id,
      username: user.username,
      familyId: user.familyId || ''
    }
    setSession('userInfo', userInfo.value)
  }

  // 从最新的用户表中拉取当前登录账号的最新信息（如刚被加入新家庭）
  function refreshCurrentUserInfo() {
    if (!userInfo.value?.id) return null
    reloadFamilyData()
    const latest = users.value.find(u => u.id === userInfo.value.id)
    if (!latest) return null
    persistCurrentUser(latest)
    return latest
  }

  // ===== Actions =====
  /**
   * 登录
   * @param {string} username
   * @param {string} password
   * @returns {{ success: boolean, message: string }}
   */
  function login(username, password) {
    reloadFamilyData()
    const user = users.value.find(u => u.username === username)

    if (!user) {
      return { success: false, message: '用户不存在，请先注册' }
    }

    if (user.password !== password) {
      return { success: false, message: '密码错误，请重试' }
    }

    // 生成简单 token（实际项目应使用 JWT；本项目为前端演示，用随机串）
    const newToken = 'token_' + Date.now() + '_' + Math.random().toString(36).slice(2)
    token.value = newToken
    persistCurrentUser(user)

    // 持久化
    setSession('token', newToken)
    // 通知 goodsStore / historyStore 重新切换到当前账号的作用域
    emitFamilyChanged()

    return { success: true, message: '登录成功' }
  }

  /**
   * 注册
   * @param {string} username
   * @param {string} password
   * @returns {{ success: boolean, message: string }}
   */
  function register(username, password) {
    reloadFamilyData()

    // 用户名唯一校验
    if (users.value.some(u => u.username === username)) {
      return { success: false, message: '该用户名已被注册，请换一个' }
    }

    // 创建新用户
    const newUser = {
      id: 'user_' + Date.now(),
      username,
      password,
      familyId: ''
    }

    saveUsers([...users.value, newUser])

    return { success: true, message: '注册成功，请登录' }
  }

  /**
   * 创建家庭。创建后当前用户的个人物资数据会复制为家庭物资数据。
   */
  function createFamily(name) {
    // 权限与数据完整性校验
    const current = refreshCurrentUserInfo()
    if (!current) return { success: false, message: '请先登录' }
    if (current.familyId) return { success: false, message: '您已经加入了家庭' }

    const familyName = name?.trim()
    if (!familyName) return { success: false, message: '请输入家庭名称' }

    // 构造新家庭对象
    const family = {
      id: 'family_' + Date.now(),
      name: familyName,
      memberIds: [current.id],
      createdBy: current.id,
      createdAt: new Date().toISOString()
    }

    // 把个人作用域的物资数据复制一份到新家庭作用域，避免历史数据丢失
    copyScopedStorageData('im_goods_db', getFamilyScopeKey(family.id))
    copyScopedStorageData('inventory_db', getFamilyScopeKey(family.id))

    // 更新用户表（绑定 familyId）与家庭表（新增一条）
    const nextUsers = users.value.map(u => (
      u.id === current.id ? { ...u, familyId: family.id } : u
    ))
    saveUsers(nextUsers)
    saveFamilies([...families.value, family])
    persistCurrentUser({ ...current, familyId: family.id })
    // 广播家庭变化，让其他 store 切换数据作用域
    emitFamilyChanged()

    return { success: true, message: '家庭已创建' }
  }

  /**
   * 通过用户名把已注册用户加入当前家庭。成员权限完全一致。
   */
  function addFamilyMember(memberUsername) {
    // 一连串前置校验
    const current = refreshCurrentUserInfo()
    if (!current) return { success: false, message: '请先登录' }
    if (!current.familyId) return { success: false, message: '请先创建家庭' }

    const name = memberUsername?.trim()
    if (!name) return { success: false, message: '请输入用户名' }

    const target = users.value.find(u => u.username === name)
    if (!target) return { success: false, message: '用户不存在，请确认对方已注册' }

    const family = families.value.find(f => f.id === current.familyId)
    if (!family) return { success: false, message: '当前家庭不存在' }

    if (target.familyId === family.id || family.memberIds.includes(target.id)) {
      return { success: false, message: '该用户已在当前家庭中' }
    }
    if (target.familyId) {
      return { success: false, message: '该用户已经加入了其他家庭' }
    }

    // 同时更新家庭成员列表与目标用户的 familyId
    const nextFamily = {
      ...family,
      memberIds: [...family.memberIds, target.id]
    }
    const nextUsers = users.value.map(u => (
      u.id === target.id ? { ...u, familyId: family.id } : u
    ))
    saveUsers(nextUsers)
    saveFamilies(families.value.map(f => f.id === family.id ? nextFamily : f))
    emitFamilyChanged()

    return { success: true, message: `已添加 ${target.username}` }
  }

  /**
   * 创建者移除家庭成员。被移除成员会回到自己的个人物资空间。
   */
  function removeFamilyMember(memberId) {
    // 权限校验
    const current = refreshCurrentUserInfo()
    if (!current) return { success: false, message: '请先登录' }
    if (!current.familyId) return { success: false, message: '请先创建家庭' }

    const family = families.value.find(f => f.id === current.familyId)
    if (!family) return { success: false, message: '当前家庭不存在' }
    if (family.createdBy !== current.id) return { success: false, message: '只有创建者可以移除成员' }
    if (memberId === current.id) return { success: false, message: '创建者不能移除自己' }
    if (!family.memberIds.includes(memberId)) return { success: false, message: '该用户不在当前家庭中' }

    const target = users.value.find(u => u.id === memberId)
    if (!target) return { success: false, message: '用户不存在' }

    // 同时从家庭表与目标用户身上解除关联
    const nextFamily = {
      ...family,
      memberIds: family.memberIds.filter(id => id !== memberId)
    }
    const nextUsers = users.value.map(u => (
      u.id === memberId ? { ...u, familyId: '' } : u
    ))

    saveUsers(nextUsers)
    saveFamilies(families.value.map(f => f.id === family.id ? nextFamily : f))
    emitFamilyChanged()

    return { success: true, message: `已移除 ${target.username}` }
  }

  /**
   * 退出登录
   */
  // 清掉本标签页登录态；广播家庭变化让其他 store 切换回 guest 作用域
  function logout() {
    token.value = ''
    userInfo.value = null

    removeSession('token')
    removeSession('userInfo')
    emitFamilyChanged()
  }

  // 跨标签页同步：若其他标签页改了用户/家庭表（如被加入新家庭），本标签页要感知
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (FAMILY_STORAGE_KEYS.includes(e.key)) {
        const previousFamilyId = userInfo.value?.familyId || ''
        const latest = refreshCurrentUserInfo()
        // 家庭 id 真的变了才需要广播切换作用域（避免无变化也触发刷新）
        if (latest && (latest.familyId || '') !== previousFamilyId) {
          emitFamilyChanged()
        }
      }
    })
  }

  return {
    // State
    token,
    userInfo,
    users,
    families,
    // Getters
    isLoggedIn,
    username,
    currentFamily,
    isFamilyCreator,
    familyMembers,
    // Actions
    login,
    register,
    logout,
    refreshCurrentUserInfo,
    createFamily,
    addFamilyMember,
    removeFamilyMember
  }
})
