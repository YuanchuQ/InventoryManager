/**
 * ============================================================
 *  全局常量与基础工具  src/utils/constants.js
 * ============================================================
 * 文件作用：
 *   集中存放整个项目共享的"常量"和"通用计算函数"，避免硬编码散落各处。
 *   主要内容：
 *     1. 业务枚举：默认分类、单位、过期状态、补货状态
 *     2. 默认配置：过期预警天数、最低库存阈值
 *     3. 通用工具：过期状态计算、localStorage 直读写
 *
 * 与 storage.js 的区别：
 *   - storage.js  提供带前缀 + 错误兜底的通用封装
 *   - 本文件中的 loadFromStorage / saveToStorage 是"裸"版本，
 *     用于 goodsStore / historyStore 这类自己管理 key 拼接的模块。
 * ============================================================
 */

// ====== 分类 ======
// 系统初始化时如果用户没自定义分类，使用这套兜底分类
export const DEFAULT_CATEGORIES = ['蔬菜', '肉类', '水果', '饮料', '日用品', '药品', '其他']

// ====== 单位 ======
// 添加 / 编辑物资时的单位下拉选项
export const UNIT_OPTIONS = ['个', '包', '瓶', '盒', '斤', '袋', '罐', '桶', '卷', '箱', '公斤']

// ====== 过期状态颜色 ======
// 三种过期状态对应的展示颜色，供卡片左侧色条、文字颜色等使用
export const EXPIRY_COLORS = {
  safe: '#67C23A',    // >7天 绿色
  warning: '#E6A23C', // 1-7天 黄色
  danger: '#F56C6C'   // 已过期 红色
}

// 三种过期状态对应的中文文案
export const EXPIRY_STATUS = {
  safe: '新鲜',
  warning: '即将过期',
  danger: '已过期'
}

// ====== 过期预警天数（默认） ======
// 距离过期 7 天内开始预警；用户可在"设置"页修改实际值
export const DEFAULT_EXPIRY_WARNING_DAYS = 7

// ====== 库存最低阈值（默认） ======
// 新增物资时的默认最低阈值；低于该值即视为"库存不足"
export const DEFAULT_MIN_QUANTITY = 3

// ====== 补货状态 ======
// 补货清单中两种状态的中文文案
export const SHOPPING_STATUS = {
  pending: '待采购',
  purchased: '已采购'
}

// ====== 判断过期状态的工具函数 ======
/**
 * 根据过期日期返回三档状态：
 *   - 'danger'  已过期（剩余时间为负）
 *   - 'warning' 即将过期（剩余天数 ≤ warningDays）
 *   - 'safe'    新鲜
 * 多个地方都要判断同一规则，统一放这里避免不同页面口径不一致。
 *
 * @param {string} expiryDate  过期日期字符串（YYYY-MM-DD）
 * @param {number} warningDays 预警天数，默认取 DEFAULT_EXPIRY_WARNING_DAYS
 */
export function getExpiryStatus(expiryDate, warningDays = DEFAULT_EXPIRY_WARNING_DAYS) {
  const now = Date.now()
  // 过期日期与当前时间的差值（毫秒）
  const diff = new Date(expiryDate).getTime() - now
  if (diff < 0) return 'danger'                                    // 已过期
  if (diff <= warningDays * 24 * 60 * 60 * 1000) return 'warning'  // 临近过期
  return 'safe'                                                     // 仍新鲜
}

// ====== localStorage 辅助函数 ======
/**
 * 读取本地存储（裸版本，不加前缀，由调用方自行拼接完整 key）
 * 适用于 goodsStore / historyStore 这类自己管理作用域 key 的模块。
 * @param {string} key       完整的 localStorage key
 * @param {*}     fallback   读取失败时的兜底值
 */
export function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

/**
 * 写入本地存储（裸版本，不加前缀）
 * 写入失败时仅打印警告，不抛错，避免阻断业务流程。
 */
export function saveToStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (e) {
    console.warn('[Storage] 写入失败', e)
  }
}
