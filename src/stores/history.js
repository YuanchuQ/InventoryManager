/**
 * ============================================================
 *  操作历史 Store（Pinia 包装层）  src/stores/history.js
 * ============================================================
 * 文件作用：
 *   把 utils/historyStore.js 中的操作历史数据包装成 Vue 响应式数据，
 *   供操作历史页（History.vue）渲染。
 *
 * 重要约束：
 *   真实数据全部托管在 src/utils/historyStore.js，
 *   本 store 仅做响应式镜像，不持有独立数据副本。
 *   写入由 goodsStore 在 discardGoods / consumeGoods / restockGoods 中自动调用。
 * ============================================================
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
// 操作历史数据中心
import {
  getRecords,
  addRecord,
  clearRecords,
  subscribe
} from '@/utils/historyStore'

export const useHistoryStore = defineStore('history', () => {
  // 全部历史记录的响应式镜像
  const records = ref(getRecords())
  const loading = ref(false)

  // 订阅历史变更
  // 任何写入都会通过 historyStore 广播过来，此处自动刷新 records
  const unsub = subscribe((list) => {
    records.value = list
  })

  // ====== Getters ======

  /** 丢弃记录 */
  const discardRecords = computed(() =>
    records.value.filter(r => r.type === 'discard')
  )

  /** 补货记录 */
  const restockRecords = computed(() =>
    records.value.filter(r => r.type === 'restock')
  )

  /** 使用记录 */
  const useRecords = computed(() =>
    records.value.filter(r => r.type === 'use')
  )

  /** 按物资 ID 筛选 */
  // 返回 computed，便于详情页等场景响应式使用
  const getRecordsByItem = (itemId) =>
    computed(() => records.value.filter(r => r.itemId === itemId))

  // ====== Actions ======

  // 添加一条历史记录（一般由 goodsStore 自动调用，业务页面很少手动调）
  const addHistoryRecord = async (type, detail) => {
    return addRecord(type, detail)
  }

  // 清空所有历史记录（由"操作历史"页的清空按钮触发）
  const clearAllRecords = async () => {
    clearRecords()
  }

  return {
    records, loading,
    discardRecords, restockRecords, useRecords,
    getRecordsByItem,
    addHistoryRecord, clearAllRecords
  }
})
