/**
 * ============================================================
 *  物资 Store（Pinia 包装层）  src/stores/inventory.js
 * ============================================================
 * 文件作用：
 *   把 utils/goodsStore.js 中的原始数据"包装"成 Vue 响应式数据，
 *   让所有页面可以通过 useInventoryStore() 直接读取并自动响应变化。
 *
 * 重要约束：
 *   ⚠️ 真实数据全部托管在 src/utils/goodsStore.js（localStorage：按家庭/个人作用域隔离）。
 *   本 store 只做 Vue 响应式镜像 + 计算属性派生，禁止再持有独立数据副本。
 *   任何页面新增 / 修改 / 删除物资都必须通过下方 addItem / editItem / removeItem
 *   或直接调用 goodsStore 的 addGoods / editGoods / delGoods —— 写入完成会
 *   触发跨页面同步，无需再 await loadItems()。
 *
 * 数据流：
 *   用户操作 → store.addItem(...) → goodsStore.addGoods(...) → localStorage
 *           → goodsStore 广播变更 → 本 store subscribe 回调更新 items
 *           → Vue 响应式 → 所有用到 items 的页面自动重渲染
 * ============================================================
 */

import { defineStore } from 'pinia'
import { ref, computed, onScopeDispose } from 'vue'
// 物资数据中心：所有写入与查询都走这一层
import {
  getGoodsList,
  addGoods,
  editGoods,
  delGoods,
  consumeGoods,
  subscribe
} from '@/utils/goodsStore'
// 过期状态判断与默认预警天数
import { getExpiryStatus, DEFAULT_EXPIRY_WARNING_DAYS } from '@/utils/constants'
// 家庭切换事件（用于在切换家庭/账号后重新拉数据）
import { FAMILY_CHANGED_EVENT } from '@/utils/familyStore'

export const useInventoryStore = defineStore('inventory', () => {
  // 物资列表的响应式镜像，初始值来自 goodsStore
  const items = ref(getGoodsList())
  const loading = ref(false)

  // 订阅 goodsStore：所有页面共用，任何写入都会立刻刷新 items
  const unsub = subscribe((list) => {
    items.value = list
  })
  // 家庭切换 / 退出登录后，作用域 key 会变 → 重新拉一次本作用域的数据
  function handleFamilyChanged() {
    items.value = getGoodsList()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener(FAMILY_CHANGED_EVENT, handleFamilyChanged)
  }
  // store 卸载时取消订阅与监听，避免内存泄漏
  onScopeDispose(() => {
    if (typeof unsub === 'function') unsub()
    if (typeof window !== 'undefined') {
      window.removeEventListener(FAMILY_CHANGED_EVENT, handleFamilyChanged)
    }
  })

  // ====== Getters ======
  // 按分类 id 筛选物资（返回 computed，外部用 .value 取结果）
  const getItemsByCategory = (categoryId) =>
    computed(() => items.value.filter(i => i.categoryId === categoryId))

  // 按指定预警天数筛出"即将过期 / 已过期"的物资，按过期日升序
  const getExpiringItemsWithDays = (warningDays) => computed(() =>
    items.value
      .filter(i => {
        // 数量为 0 的物资已经被消耗/丢弃完，不再提醒"过期"（用户已经处理过/或者根本拿不到）
        if (!i.quantity || i.quantity <= 0) return false
        const status = getExpiryStatus(i.expiryDate, warningDays)
        return status === 'warning' || status === 'danger'
      })
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))
  )

  // 用系统默认预警天数派生的"即将过期"列表
  const getExpiringItems = computed(() =>
    getExpiringItemsWithDays(DEFAULT_EXPIRY_WARNING_DAYS).value
  )

  // 库存不足列表：数量 ≤ 最低阈值
  const getLowStockItems = computed(() =>
    items.value.filter(i => i.quantity <= i.minQuantity)
  )

  // 按 id 查找单个物资（返回 computed，便于详情页响应式使用）
  const getItemById = (id) => computed(() =>
    items.value.find(i => String(i.id) === String(id))
  )

  // 各分类下的物资数量汇总：{ 分类id: 数量 }
  const categoryCounts = computed(() => {
    const map = {}
    items.value.forEach(i => {
      map[i.categoryId] = (map[i.categoryId] || 0) + i.quantity
    })
    return map
  })

  // ====== Actions（全部直接转发到 goodsStore） ======

  /** 兼容旧调用：刷新本地镜像（实际无需异步请求，立即同步） */
  // 保留 async 签名是为了兼容老页面 await loadItems() 的写法
  const loadItems = async () => {
    items.value = getGoodsList()
    return items.value
  }

  // 兼容旧调用：返回当前预警物资
  const loadExpiringItems = async () => getExpiringItems.value

  // 新增物资：转发到 goodsStore，subscribe 会自动刷新 items
  const addItem = async (data) => {
    const created = addGoods(data)
    // subscribe 已自动刷新 items，无需手动 unshift
    return created
  }

  // 编辑物资
  const editItem = async (id, data) => {
    return editGoods(id, data)
  }

  // 删除物资
  const removeItem = async (id) => {
    delGoods(id)
  }

  /** 消耗物资（数量 -n） */
  // 走 FIFO 出库（先过期先用），并记录一条历史
  const consume = async (id, quantity) => {
    return consumeGoods(id, quantity)
  }

  // 按关键词筛选（不区分大小写在调用方处理；这里仅做 includes 匹配）
  const searchItems = (keyword) => {
    if (!keyword) return items.value
    return items.value.filter(i => i.name.includes(keyword))
  }

  // 按指定字段排序，返回新数组（不修改原 items）
  const sortItems = (field, order = 'asc') => {
    const sorted = [...items.value]
    sorted.sort((a, b) => {
      let va, vb
      // 过期日期：转成时间戳比较
      if (field === 'expiryDate') { va = new Date(a.expiryDate).getTime(); vb = new Date(b.expiryDate).getTime() }
      else { va = a[field]; vb = b[field] }
      // 字符串字段用 localeCompare 支持中文排序
      if (typeof va === 'string') return order === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      return order === 'asc' ? va - vb : vb - va
    })
    return sorted
  }

  return {
    items, loading,
    getItemsByCategory, getExpiringItems, getExpiringItemsWithDays, getLowStockItems, getItemById, categoryCounts,
    loadItems, loadExpiringItems, addItem, editItem, removeItem, consume,
    searchItems, sortItems
  }
})
