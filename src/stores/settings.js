/**
 * ============================================================
 *  设置 Store  src/stores/settings.js
 * ============================================================
 * 文件作用：
 *   管理"系统设置"相关的所有数据，包括：
 *     1. 分类列表（增 / 改 / 删）
 *     2. 过期预警天数、默认最低库存阈值
 *     3. 数据导出 / 导入（整库 JSON）
 *
 * 数据流：
 *   本 store 通过 api/categories 与 api/settings 与底层数据源交互，
 *   再用响应式变量（categories / expiryAlertDays / defaultMinQuantity）
 *   暴露给页面使用。任何修改都会同时同步到底层与响应式镜像。
 * ============================================================
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
// 分类增删改查的 API 接口
import { fetchCategories, createCategory, updateCategory, deleteCategory } from '@/api/categories'
// 系统设置 + 导出/导入 API 接口
import { fetchSettings, updateSettings, exportData, importData } from '@/api/settings'
// 默认值常量（用户未配置或加载失败时的兜底）
import { DEFAULT_EXPIRY_WARNING_DAYS, DEFAULT_MIN_QUANTITY } from '@/utils/constants'

/**
 * 设置 Store（成员B 负责）
 * 对应计划书：useSettingsStore
 */
export const useSettingsStore = defineStore('settings', () => {
  // 分类列表
  const categories = ref([])
  // 过期预警天数（用户可在"设置"页修改）
  const expiryAlertDays = ref(DEFAULT_EXPIRY_WARNING_DAYS)
  // 默认最低库存阈值（新增物资时的默认值）
  const defaultMinQuantity = ref(DEFAULT_MIN_QUANTITY)
  // 加载中状态
  const loading = ref(false)

  // ====== Getters ======
  // 仅取分类名数组，常用于下拉框
  const categoryNames = computed(() => categories.value.map(c => c.name))

  // ====== Actions ======
  // 拉取全部分类
  const loadCategories = async () => {
    const res = await fetchCategories()
    categories.value = res.data || []
  }

  // 新增分类：默认图标为 More，调用方可覆盖
  const addCategory = async (name, icon = 'More') => {
    const res = await createCategory({ name, icon })
    categories.value.push(res.data)
    return res.data
  }

  // 编辑分类：找到对应位置就地替换，保持顺序稳定
  const editCategory = async (id, data) => {
    const res = await updateCategory(id, data)
    const index = categories.value.findIndex(c => c.id === id)
    if (index > -1) categories.value[index] = res.data
    return res.data
  }

  // 删除分类
  const removeCategory = async (id) => {
    await deleteCategory(id)
    categories.value = categories.value.filter(c => c.id !== id)
  }

  // 拉取系统设置；任一字段缺失则回退到默认常量
  const loadSettings = async () => {
    const res = await fetchSettings()
    if (res.data) {
      expiryAlertDays.value = res.data.expiryAlertDays ?? DEFAULT_EXPIRY_WARNING_DAYS
      defaultMinQuantity.value = res.data.defaultMinQuantity ?? DEFAULT_MIN_QUANTITY
    }
  }

  // 保存系统设置：仅同步后端返回的字段，避免清空本地未变更的值
  const saveSettings = async (data) => {
    const res = await updateSettings(data)
    if (res.data.expiryAlertDays !== undefined) expiryAlertDays.value = res.data.expiryAlertDays
    if (res.data.defaultMinQuantity !== undefined) defaultMinQuantity.value = res.data.defaultMinQuantity
  }

  // 导出整库数据：返回 JSON 对象，由调用方负责下载
  const doExportData = async () => {
    const res = await exportData()
    return res.data
  }

  // 导入整库数据：会覆盖现有数据；导入后重新拉一次分类与设置
  const doImportData = async (data) => {
    await importData(data)
    await loadCategories()
    await loadSettings()
  }

  return {
    categories, expiryAlertDays, defaultMinQuantity, loading,
    categoryNames,
    loadCategories, addCategory, editCategory, removeCategory,
    loadSettings, saveSettings, doExportData, doImportData
  }
})
