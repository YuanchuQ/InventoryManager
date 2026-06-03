/**
 * ============================================================
 *  消耗记录 Store  src/stores/consumption.js
 * ============================================================
 * 文件作用：
 *   管理"消耗记录"数据，记录每次物资被使用时的数量、时间、备注等。
 *   主要消费方：
 *     - 物资详情页（InventoryDetail）：展示该物资的所有消耗历史
 *     - 统计报表页（Statistics）：基于消耗记录绘制趋势图、分类消耗等
 *
 * 数据流：
 *   本 store 仅做"取数 + 缓存"：通过 api/consumption 拉取记录，
 *   维护一份响应式 records 数组，再用 computed 派生出按物资 / 按日期的子集。
 *   消耗操作本身由其他模块（goodsStore.consumeGoods / api/items.consumeItem）写入，
 *   写入后调用方再调用 loadAll() 刷新本地缓存。
 * ============================================================
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
// 消耗记录的 API 接口
import { fetchConsumptions, fetchConsumptionsByItem } from '@/api/consumption'

/**
 * 消耗记录 Store（成员B 负责）
 * 对应计划书：useConsumptionStore
 */
export const useConsumptionStore = defineStore('consumption', () => {
  // 所有消耗记录
  const records = ref([])
  const loading = ref(false)

  // ====== Getters ======
  // 按物资 id 过滤，返回 computed 便于详情页响应式渲染
  const getRecordsByItem = (itemId) => {
    return computed(() => records.value.filter(r => r.itemId === itemId))
  }

  /** 指定日期范围的消耗统计 */
  // 用于统计页按周 / 按月汇总
  const getConsumptionStats = (startDate, endDate) => {
    return computed(() =>
      records.value.filter(r => r.date >= startDate && r.date <= endDate)
    )
  }

  // ====== Actions ======
  // 拉取全部消耗记录，并维护 loading 状态
  const loadAll = async () => {
    loading.value = true
    try {
      const res = await fetchConsumptions()
      records.value = res.data || []
    } finally {
      // 无论成功失败都要解除 loading，避免按钮卡在加载态
      loading.value = false
    }
  }

  // 只拉取指定物资的消耗记录（详情页可能用）
  const loadByItem = async (itemId) => {
    const res = await fetchConsumptionsByItem(itemId)
    records.value = res.data || []
    return records.value
  }

  return {
    records, loading,
    getRecordsByItem, getConsumptionStats,
    loadAll, loadByItem
  }
})
