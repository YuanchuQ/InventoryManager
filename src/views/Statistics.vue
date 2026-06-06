<!--
  ============================================================
  页面说明：统计报表
  以"图 + 表"的形式集中呈现库存与消耗相关的全景数据，
  方便用户从宏观角度了解物资使用情况。页面包含以下板块：
    1. 顶部统计卡片（物资种类 / 即将过期 / 库存不足 / 待补货）
    2. 库存总价值条
    3. 分类占比饼图 + 分类详情列表
    4. 近 30 天消耗趋势折线图
    5. 即将过期 Top 5
    6. 消耗量记录（含分类消耗分布、消耗明细表）
    7. 浪费物品价格表 + 每日浪费金额折线图
    8. 即将过期价值表
    9. 入库 vs 消耗柱状对比图
  ============================================================
-->

<script setup>
/*
  ============================================================
  脚本区：负责本页所有统计数据的派生与图表绘制。
  主要工作分为四块：
    1. 从四个数据源（库存、消耗、设置、购物清单）拉取数据
    2. 通过 computed 派生出页面所需的各种统计数值与图表数据
    3. 使用 echarts 绘制四类图表（饼图、消耗折线、浪费折线、入库消耗柱状）
    4. 监听数据变化自动重绘，并在数据加载后初始化所有图表
  ============================================================
*/

import { ref, computed, onMounted, nextTick, watch, onUnmounted } from 'vue'
// 路由能力（点击即将过期 Top 5 跳转详情页时用）
import { useRouter } from 'vue-router'
// 四个数据源：库存、消耗、设置、购物清单
import { useInventoryStore } from '@/stores/inventory'
import { useConsumptionStore } from '@/stores/consumption'
import { useSettingsStore } from '@/stores/settings'
import { useShoppingStore } from '@/stores/shoppingList'
// 顶部卡片用的图标
import {
  Box,
  WarningFilled,
  CircleCloseFilled,
  ShoppingCart,
  Coin,
  Refresh,
  TrendCharts
} from '@element-plus/icons-vue'
// 图表库：本页用其绘制饼图、折线图、柱状图
import * as echarts from 'echarts'
// 顶部统计卡片组件（与首页共用）
import StatCard from '@/components/StatCard.vue'

const router = useRouter()
const inventoryStore = useInventoryStore()
const consumptionStore = useConsumptionStore()
const settingsStore = useSettingsStore()
const shoppingStore = useShoppingStore()

// 四个图表的容器引用与实例对象
const pieChartRef = ref(null)               // 分类占比饼图
const lineChartRef = ref(null)              // 消耗趋势折线
const wasteChartRef = ref(null)             // 每日浪费金额折线
const stockVsConsumeChartRef = ref(null)    // 入库 vs 消耗柱状
let pieChart = null
let lineChart = null
let wasteChart = null
let stockVsConsumeChart = null

// 统一使用的像素风字体
const PIXEL_FONT_FAMILY = "'Minecraft', 'Ark Pixel', sans-serif"

// 饼图与分类列表共用的配色（按顺序循环使用）
const PIE_COLORS = [
  '#D4875A', '#E8834A', '#5B8C5A', '#E0A030',
  '#C47A50', '#B8653A', '#6B7B8D', '#9B8D85'
]

// ====== 概览数据 ======
// 物资种类总数
const totalItems = computed(() => inventoryStore.items.length)
// 所有物资数量之和
const totalQuantity = computed(() =>
  inventoryStore.items.reduce((sum, i) => sum + (i.quantity || 0), 0)
)
// 库存总价值（数量 × 单价之和）
const totalValue = computed(() =>
  inventoryStore.items.reduce((sum, i) => sum + (i.quantity || 0) * (i.price || 0), 0)
)
// 即将过期物资数量（基于用户设置的预警天数）
const expiringCount = computed(() =>
  inventoryStore.getExpiringItemsWithDays(settingsStore.expiryAlertDays).value.length
)
// 库存不足物资数量
const lowStockCount = computed(() => inventoryStore.getLowStockItems.length)
// 待补货物资数量
const pendingShoppingCount = computed(() => shoppingStore.pendingItems.length)

// ====== 分类占比数据 ======
// 把"分类id → 数量"映射为饼图需要的 [{ name, value }]，并按数量倒序
const categoryPieData = computed(() => {
  const counts = inventoryStore.categoryCounts
  const nameMap = settingsStore.categories.reduce((map, c) => {
    map[c.id] = c.name
    return map
  }, {})
  return Object.entries(counts)
    .map(([id, qty]) => ({ name: nameMap[id] || `分类${id}`, value: qty }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)
})

// ====== 消耗统计(近 30 天) ======
// 把所有消耗记录按日期聚合：{ '2025-01-01': 5, '2025-01-02': 3 }
const consumptionStats = computed(() => {
  const map = {}
  consumptionStore.records.forEach(r => {
    map[r.date] = (map[r.date] || 0) + (r.quantity || 0)
  })
  return map
})

// 构造近 30 天的趋势数据，按日期连续填充（无消耗的日期填 0）
const trendData = computed(() => {
  const trend = []
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const label = `${d.getMonth() + 1}/${d.getDate()}`
    trend.push({ date: label, key, value: consumptionStats.value[key] || 0 })
  }
  return trend
})

// 30 天总消耗
const totalConsumed = computed(() =>
  trendData.value.reduce((sum, d) => sum + d.value, 0)
)

// 日均消耗（保留一位小数）
const avgDailyConsumed = computed(() =>
  (totalConsumed.value / 30).toFixed(1)
)

// 消耗峰值日：取消耗量最高的那天
const peakDay = computed(() => {
  if (totalConsumed.value === 0) return null
  return [...trendData.value].sort((a, b) => b.value - a.value)[0]
})

// ====== 分类汇总表(用于分类饼图下方的详情列表) ======
// 在饼图数据基础上补充百分比字段，用于列表中的进度条展示
const categoryDetail = computed(() => {
  const counts = inventoryStore.categoryCounts
  const nameMap = settingsStore.categories.reduce((map, c) => {
    map[c.id] = c.name
    return map
  }, {})
  const total = totalQuantity.value || 1
  return Object.entries(counts)
    .map(([id, qty]) => ({
      id,
      name: nameMap[id] || `分类${id}`,
      value: qty,
      percent: ((qty / total) * 100).toFixed(1)
    }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)
})

// ====== 即将过期 Top 5 ======
// 取前 5 条临期物资，并附加"剩余天数"字段
const expiringTop = computed(() => {
  return [...inventoryStore.getExpiringItemsWithDays(settingsStore.expiryAlertDays).value]
    .slice(0, 5)
    .map(item => {
      const diff = new Date(item.expiryDate).getTime() - Date.now()
      const days = Math.ceil(diff / (24 * 60 * 60 * 1000))
      return { ...item, _days: days }
    })
})

// ====== 消耗量记录(近 30 天) ======
// 取近 30 天内的所有消耗记录，按日期倒序
const consumptionRecords = computed(() => {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const cutoffKey = cutoff.toISOString().slice(0, 10)
  return consumptionStore.records
    .filter(r => r.date >= cutoffKey)
    .sort((a, b) => b.date.localeCompare(a.date))
})

// 30 天消耗总金额：每条记录的数量 × 对应物资单价
const totalConsumedValue = computed(() => {
  return consumptionRecords.value.reduce((sum, r) => {
    const item = inventoryStore.items.find(i => i.id === r.itemId)
    const price = item?.price || 0
    return sum + r.quantity * price
  }, 0)
})

// ====== 分类消耗汇总 ======
// 按分类聚合 30 天的消耗记录，得到每类的件数与金额
const categoryConsumption = computed(() => {
  const map = {}
  const nameMap = settingsStore.categories.reduce((map, c) => {
    map[c.id] = c.name
    return map
  }, {})
  consumptionRecords.value.forEach(r => {
    const item = inventoryStore.items.find(i => i.id === r.itemId)
    if (!item) return
    const catId = item.categoryId
    if (!map[catId]) {
      map[catId] = { name: nameMap[catId] || `分类${catId}`, qty: 0, value: 0 }
    }
    map[catId].qty += r.quantity
    map[catId].value += r.quantity * (item.price || 0)
  })
  return Object.values(map).sort((a, b) => b.qty - a.qty)
})

// ====== 浪费物品价格表(已过期但仍占用库存) ======
// 筛出当前已过期但还有库存的物资，并算出每条的"超期天数"与"损失金额"
const wastedItems = computed(() => {
  const nameMap = settingsStore.categories.reduce((map, c) => {
    map[c.id] = c.name
    return map
  }, {})
  return inventoryStore.items
    .filter(item => {
      const diff = new Date(item.expiryDate).getTime() - Date.now()
      return diff < 0
    })
    .map(item => {
      const diff = Math.abs(Math.ceil((Date.now() - new Date(item.expiryDate).getTime()) / (24 * 60 * 60 * 1000)))
      const loss = item.quantity * (item.price || 0)
      return {
        ...item,
        _categoryName: nameMap[item.categoryId] || `分类${item.categoryId}`,
        _overdueDays: diff,
        _loss: loss
      }
    })
    .sort((a, b) => b._loss - a._loss)
})

// 浪费总金额
const totalWastedValue = computed(() =>
  wastedItems.value.reduce((sum, i) => sum + i._loss, 0)
)

// ====== 即将过期价值表 ======
// 在临期列表上附加"剩余天数 / 价值"字段，按剩余天数升序
const expiringValueList = computed(() => {
  const nameMap = settingsStore.categories.reduce((map, c) => {
    map[c.id] = c.name
    return map
  }, {})
  return [...inventoryStore.getExpiringItemsWithDays(settingsStore.expiryAlertDays).value]
    .map(item => {
      const diff = new Date(item.expiryDate).getTime() - Date.now()
      const days = Math.ceil(diff / (24 * 60 * 60 * 1000))
      const value = (item.quantity || 0) * (item.price || 0)
      return {
        ...item,
        _categoryName: nameMap[item.categoryId] || `分类${item.categoryId}`,
        _days: days,
        _value: value
      }
    })
    .sort((a, b) => a._days - b._days)
})

// 临期总价值
const totalExpiringValue = computed(() =>
  expiringValueList.value.reduce((sum, i) => sum + i._value, 0)
)

// ====== 入库 vs 消耗对比(近 30 天) ======
// 入库侧:用 createdAt 落在 30 天内的物资 quantity 作为入库量
// 同时把补货"已采购"在 30 天内的也算入库(用 purchasedItems 触发日期不可得,这里只基于 createdAt)
// 逐日构造 30 天的"入库量 / 消耗量"配对数据
const stockVsConsume = computed(() => {
  const list = []
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const label = `${d.getMonth() + 1}/${d.getDate()}`
    const stockIn = inventoryStore.items
      .filter(it => it.createdAt === key)
      .reduce((sum, it) => sum + (it.quantity || 0), 0)
    const consumed = consumptionStats.value[key] || 0
    list.push({ date: label, key, stockIn, consumed })
  }
  return list
})

// 30 天入库总量
const totalStockIn30 = computed(() =>
  stockVsConsume.value.reduce((sum, d) => sum + d.stockIn, 0)
)

// 净增减：入库减消耗，正值代表库存净增
const netChange = computed(() => totalStockIn30.value - totalConsumed.value)

// 入库 vs 消耗的"金额"版本（用单价加权）
const stockVsConsumeValue = computed(() => {
  return stockVsConsume.value.map(d => {
    const consumeValue = consumptionStore.records
      .filter(r => r.date === d.key)
      .reduce((sum, r) => {
        const item = inventoryStore.items.find(i => i.id === r.itemId)
        return sum + r.quantity * (item?.price || 0)
      }, 0)
    const stockInValue = inventoryStore.items
      .filter(it => it.createdAt === d.key)
      .reduce((sum, it) => sum + (it.quantity || 0) * (it.price || 0), 0)
    return { ...d, stockInValue, consumeValue }
  })
})

// 30 天入库总金额
const totalStockInValue30 = computed(() =>
  stockVsConsumeValue.value.reduce((sum, d) => sum + d.stockInValue, 0)
)

// 30 天消耗总金额（用单价加权）
const totalConsumeValue30 = computed(() =>
  stockVsConsumeValue.value.reduce((sum, d) => sum + d.consumeValue, 0)
)

// ====== 每日浪费金额(近 30 天) ======
// 用"在该日处于过期状态且当日尚未被消耗/删除"的物资剩余量 × 单价 估算
// 由于没有过期时间戳,采用简化估算:截至今日已过期的物品,按"过期日"反推 30 天内的逐日累计损失
const dailyWaste = computed(() => {
  const list = []
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const label = `${d.getMonth() + 1}/${d.getDate()}`
    // 截至该日,过期且未被消耗的物品 × 单价
    const dayLoss = inventoryStore.items
      .filter(item => {
        if (!item.expiryDate) return false
        return new Date(item.expiryDate).getTime() < new Date(key).getTime()
      })
      .reduce((sum, item) => sum + (item.quantity || 0) * (item.price || 0), 0)
    list.push({ date: label, key, value: dayLoss })
  }
  return list
})

// 30 天累计浪费金额
const totalDailyWaste = computed(() =>
  dailyWaste.value.reduce((sum, d) => sum + d.value, 0)
)

// 浪费峰值日
const peakWasteDay = computed(() => {
  if (totalDailyWaste.value === 0) return null
  return [...dailyWaste.value].sort((a, b) => b.value - a.value)[0]
})

// 浪费日均金额（保留两位小数）
const avgDailyWaste = computed(() =>
  (totalDailyWaste.value / 30).toFixed(2)
)

// ====== 初始化饼图 ======
// 分类占比饼图：环形布局，外侧标签 + 鼠标悬浮提示
function initPieChart() {
  if (!pieChartRef.value) return
  if (pieChart) pieChart.dispose()
  pieChart = echarts.init(pieChartRef.value)

  const data = categoryPieData.value
  if (data.length === 0) {
    pieChart.setOption({
      title: {
        text: '暂无数据',
        left: 'center',
        top: 'center',
        textStyle: {
          fontFamily: PIXEL_FONT_FAMILY,
          fontSize: 13,
          color: '#9B8D85',
          fontWeight: 'normal'
        }
      }
    })
    return
  }

  pieChart.setOption({
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#1A1817',
      borderWidth: 2,
      textStyle: {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: 12,
        color: '#2D221C'
      },
      formatter: '{b}<br/>数量: {c} ({d}%)'
    },
    series: [{
      type: 'pie',
      radius: ['38%', '68%'],
      center: ['50%', '52%'],
      avoidLabelOverlap: true,
      itemStyle: {
        borderColor: '#1A1817',
        borderWidth: 2,
        borderRadius: 0
      },
      label: {
        show: true,
        position: 'outside',
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: 12,
        color: '#2D221C',
        fontWeight: 'normal',
        formatter: '{b}\n{d}%'
      },
      labelLine: {
        lineStyle: {
          color: '#1A1817',
          width: 2
        }
      },
      data: data.map((d, i) => ({
        ...d,
        itemStyle: { color: PIE_COLORS[i % PIE_COLORS.length] }
      }))
    }]
  })
}

// ====== 初始化折线图 ======
function initLineChart() {
  if (!lineChartRef.value) return
  if (lineChart) lineChart.dispose()
  lineChart = echarts.init(lineChartRef.value)

  const data = trendData.value
  const values = data.map(d => d.value)

  if (values.every(v => v === 0)) {
    lineChart.setOption({
      title: {
        text: '暂无消耗记录',
        left: 'center',
        top: 'center',
        textStyle: {
          fontFamily: PIXEL_FONT_FAMILY,
          fontSize: 13,
          color: '#9B8D85',
          fontWeight: 'normal'
        }
      }
    })
    return
  }

  lineChart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#1A1817',
      borderWidth: 2,
      textStyle: {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: 12,
        color: '#2D221C'
      },
      formatter: (params) => {
        const p = params[0]
        return `${p.axisValue}<br/>消耗: ${p.value}`
      }
    },
    grid: {
      top: 24,
      right: 24,
      bottom: 36,
      left: 48
    },
    xAxis: {
      type: 'category',
      data: data.map(d => d.date),
      axisLine: { lineStyle: { color: '#1A1817', width: 2 } },
      axisTick: { show: false },
      axisLabel: {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: 10,
        color: '#6B5D55',
        interval: 4
      }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(180, 160, 140, 0.25)', type: 'dashed' } },
      axisLabel: {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: 10,
        color: '#6B5D55'
      }
    },
    series: [{
      type: 'line',
      data: values,
      smooth: false,
      symbol: 'rect',
      symbolSize: 6,
      lineStyle: {
        color: '#D4875A',
        width: 3
      },
      itemStyle: {
        color: '#D4875A',
        borderColor: '#1A1817',
        borderWidth: 2
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(212, 135, 90, 0.35)' },
          { offset: 1, color: 'rgba(212, 135, 90, 0.05)' }
        ])
      }
    }]
  })
}

// 窗口尺寸变化时重绘
// 让四个图表都自适应新尺寸
function handleResize() {
  pieChart?.resize()
  lineChart?.resize()
  wasteChart?.resize()
  stockVsConsumeChart?.resize()
}

// ====== 初始化浪费金额折线图 ======
// 每日浪费金额：阶梯状折线图，颜色用警示红棕
function initWasteChart() {
  if (!wasteChartRef.value) return
  if (wasteChart) wasteChart.dispose()
  wasteChart = echarts.init(wasteChartRef.value)

  const data = dailyWaste.value
  const values = data.map(d => d.value)

  if (values.every(v => v === 0)) {
    wasteChart.setOption({
      title: {
        text: '近 30 天无浪费记录',
        left: 'center',
        top: 'center',
        textStyle: {
          fontFamily: PIXEL_FONT_FAMILY,
          fontSize: 13,
          color: '#9B8D85',
          fontWeight: 'normal'
        }
      }
    })
    return
  }

  wasteChart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#1A1817',
      borderWidth: 2,
      textStyle: {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: 12,
        color: '#2D221C'
      },
      formatter: (params) => {
        const p = params[0]
        return `${p.axisValue}<br/>累计损失: ¥ ${p.value.toFixed(2)}`
      }
    },
    grid: { top: 24, right: 24, bottom: 36, left: 56 },
    xAxis: {
      type: 'category',
      data: data.map(d => d.date),
      axisLine: { lineStyle: { color: '#1A1817', width: 2 } },
      axisTick: { show: false },
      axisLabel: {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: 10,
        color: '#6B5D55',
        interval: 4
      }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(180, 160, 140, 0.25)', type: 'dashed' } },
      axisLabel: {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: 10,
        color: '#6B5D55',
        formatter: (v) => `¥${v}`
      }
    },
    series: [{
      type: 'line',
      data: values,
      smooth: false,
      symbol: 'rect',
      symbolSize: 6,
      step: 'end',
      lineStyle: { color: '#B8653A', width: 3 },
      itemStyle: {
        color: '#B8653A',
        borderColor: '#1A1817',
        borderWidth: 2
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(184, 101, 58, 0.35)' },
          { offset: 1, color: 'rgba(184, 101, 58, 0.05)' }
        ])
      }
    }]
  })
}

// ====== 初始化入库 vs 消耗柱状对比图 ======
// 双柱并列：绿色代表入库、橙色代表消耗
function initStockVsConsumeChart() {
  if (!stockVsConsumeChartRef.value) return
  if (stockVsConsumeChart) stockVsConsumeChart.dispose()
  stockVsConsumeChart = echarts.init(stockVsConsumeChartRef.value)

  const data = stockVsConsume.value
  const stockInValues = data.map(d => d.stockIn)
  const consumedValues = data.map(d => d.consumed)

  if (stockInValues.every(v => v === 0) && consumedValues.every(v => v === 0)) {
    stockVsConsumeChart.setOption({
      title: {
        text: '近 30 天暂无入库或消耗',
        left: 'center',
        top: 'center',
        textStyle: {
          fontFamily: PIXEL_FONT_FAMILY,
          fontSize: 13,
          color: '#9B8D85',
          fontWeight: 'normal'
        }
      }
    })
    return
  }

  stockVsConsumeChart.setOption({
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(255,255,255,0.95)',
      borderColor: '#1A1817',
      borderWidth: 2,
      textStyle: {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: 12,
        color: '#2D221C'
      },
      formatter: (params) => {
        const dateLabel = params[0].axisValue
        const lines = params.map(p =>
          `${p.marker} ${p.seriesName}: ${p.value} 件`
        )
        return `${dateLabel}<br/>${lines.join('<br/>')}`
      }
    },
    legend: {
      data: ['入库', '消耗'],
      top: 4,
      right: 8,
      textStyle: {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: 11,
        color: '#2D221C'
      },
      itemWidth: 12,
      itemHeight: 12
    },
    grid: { top: 36, right: 16, bottom: 36, left: 40 },
    xAxis: {
      type: 'category',
      data: data.map(d => d.date),
      axisLine: { lineStyle: { color: '#1A1817', width: 2 } },
      axisTick: { show: false },
      axisLabel: {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: 10,
        color: '#6B5D55',
        interval: 4
      }
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(180, 160, 140, 0.25)', type: 'dashed' } },
      axisLabel: {
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: 10,
        color: '#6B5D55'
      }
    },
    series: [
      {
        name: '入库',
        type: 'bar',
        data: stockInValues,
        itemStyle: {
          color: '#5B8C5A',
          borderColor: '#1A1817',
          borderWidth: 2
        },
        barWidth: 6
      },
      {
        name: '消耗',
        type: 'bar',
        data: consumedValues,
        itemStyle: {
          color: '#D4875A',
          borderColor: '#1A1817',
          borderWidth: 2
        },
        barWidth: 6
      }
    ]
  })
}

// 顶部刷新按钮：重新拉取所有数据并重绘图表
async function refresh() {
  await Promise.all([
    inventoryStore.loadItems(),
    consumptionStore.loadAll(),
    shoppingStore.loadList(),
    settingsStore.loadCategories()
  ])
  await nextTick()
  await document.fonts?.ready
  initPieChart()
  initLineChart()
  initWasteChart()
  initStockVsConsumeChart()
}

// 页面挂载后：加载所有数据 + 等待字体 + 初始化全部图表
onMounted(async () => {
  await Promise.all([
    inventoryStore.loadItems(),
    consumptionStore.loadAll(),
    shoppingStore.loadList(),
    settingsStore.loadCategories(),
    settingsStore.loadSettings()
  ])
  await nextTick()
  await document.fonts?.ready
  initPieChart()
  initLineChart()
  initWasteChart()
  initStockVsConsumeChart()
  // 监听窗口尺寸变化，让图表自适应
  window.addEventListener('resize', handleResize)
})

// 卸载时移除监听，避免内存泄漏
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})

// 数据变化时自动重绘对应图表
watch(categoryPieData, () => nextTick().then(initPieChart), { deep: true })
watch(trendData, () => nextTick().then(initLineChart), { deep: true })
watch(dailyWaste, () => nextTick().then(initWasteChart), { deep: true })
watch(stockVsConsume, () => nextTick().then(initStockVsConsumeChart), { deep: true })

// 点击即将过期 Top 5 中的某条：跳到对应物资详情页
function handleCardClick(path) {
  router.push(path)
}
</script>

<template>
  <!--
    ============================================================
    模板区：决定统计报表的视觉结构，按"行"组织：
      1. 顶部：标题 + 刷新按钮
      2. 第 1 行：四张顶部统计卡片
      3. 第 2 行：库存总价值条
      4. 第 3 行（两列）：分类占比 / 消耗趋势 + 即将过期
      5. 第 4 行（两列）：消耗量记录 / 浪费物品 + 每日浪费图
      6. 第 5 行：即将过期价值表
      7. 第 6 行：入库 vs 消耗柱状图
    ============================================================
  -->
  <div class="statistics-page">
    <div class="bg-decoration">
      <div class="bg-orb bg-orb--1" />
      <div class="bg-orb bg-orb--2" />
      <div class="bg-grid" />
    </div>

    <div class="statistics-content">
      <!-- 顶部 -->
      <div class="page-top">
        <div>
          <h1 class="page-title">统计报表</h1>
          <p class="page-subtitle">库存与消耗全景</p>
        </div>
        <button class="refresh-btn" @click="refresh" title="刷新数据">
          <el-icon :size="16"><Refresh /></el-icon>
        </button>
      </div>

      <!-- 顶部统计卡片(4 列) -->
      <div class="stat-grid">
        <StatCard
          :icon="Box"
          :value="totalItems"
          label="物资种类"
          color="var(--color-primary)"
          to="/inventory"
        />
        <StatCard
          :icon="WarningFilled"
          :value="expiringCount"
          label="即将过期"
          color="var(--color-warning)"
          to="/inventory"
        />
        <StatCard
          :icon="CircleCloseFilled"
          :value="lowStockCount"
          label="库存不足"
          color="var(--color-danger)"
          to="/inventory"
        />
        <StatCard
          :icon="ShoppingCart"
          :value="pendingShoppingCount"
          label="待补货"
          color="var(--color-accent)"
          to="/shopping"
        />
      </div>

      <!-- 价值卡片 -->
      <div class="value-card">
        <div class="value-card-icon" style="color: var(--color-success);">
          <el-icon :size="22"><Coin /></el-icon>
        </div>
        <div class="value-card-body">
          <span class="value-card-label">库存总价值</span>
          <div class="value-card-row">
            <span class="value-card-amount">¥ {{ totalValue.toFixed(2) }}</span>
            <span class="value-card-meta">共 {{ totalQuantity }} 件</span>
          </div>
        </div>
      </div>

      <!-- 桌面端两列：左侧分类饼图+分类详情；右侧消耗趋势+即将过期 -->
      <div class="statistics-main">
        <div class="statistics-col">
          <!-- 分类占比 -->
          <section class="stat-section">
            <div class="section-header">
              <h2 class="section-title">分类占比</h2>
              <span v-if="categoryPieData.length" class="section-badge">
                {{ categoryPieData.length }} 类
              </span>
            </div>

            <div class="chart-card">
              <div ref="pieChartRef" class="chart-container" />
            </div>

            <!-- 分类详情列表 -->
            <div v-if="categoryDetail.length" class="category-list">
              <div
                v-for="(cat, idx) in categoryDetail"
                :key="cat.id"
                class="cat-row"
              >
                <div
                  class="cat-color-dot"
                  :style="{ background: PIE_COLORS[idx % PIE_COLORS.length] }"
                />
                <span class="cat-row-name">{{ cat.name }}</span>
                <div class="cat-bar-track">
                  <div
                    class="cat-bar-fill"
                    :style="{
                      width: cat.percent + '%',
                      background: PIE_COLORS[idx % PIE_COLORS.length]
                    }"
                  />
                </div>
                <span class="cat-row-value">{{ cat.value }}</span>
                <span class="cat-row-percent">{{ cat.percent }}%</span>
              </div>
            </div>
          </section>
        </div>

        <div class="statistics-col">
          <!-- 消耗趋势 -->
          <section class="stat-section">
            <div class="section-header">
              <h2 class="section-title">消耗趋势</h2>
              <span class="section-meta">近 30 天</span>
            </div>

            <div class="trend-summary">
              <div class="trend-stat">
                <span class="trend-stat-label">总消耗</span>
                <span class="trend-stat-value">{{ totalConsumed }}</span>
              </div>
              <div class="trend-stat">
                <span class="trend-stat-label">日均</span>
                <span class="trend-stat-value">{{ avgDailyConsumed }}</span>
              </div>
              <div class="trend-stat" v-if="peakDay">
                <span class="trend-stat-label">峰值日</span>
                <span class="trend-stat-value">{{ peakDay.date }}</span>
                <span class="trend-stat-meta">{{ peakDay.value }} 件</span>
              </div>
            </div>

            <div class="chart-card">
              <div ref="lineChartRef" class="chart-container chart-container--tall" />
            </div>
          </section>

          <!-- 即将过期 Top 5 -->
          <section class="stat-section">
            <div class="section-header">
              <h2 class="section-title">即将过期</h2>
              <span v-if="expiringTop.length" class="section-badge section-badge--warning">
                {{ expiringTop.length }} 项
              </span>
            </div>

            <div v-if="expiringTop.length" class="expiring-list">
              <div
                v-for="item in expiringTop"
                :key="item.id"
                class="expiring-item"
                :class="item._days < 0 ? 'expiring-item--danger' : 'expiring-item--warning'"
                @click="handleCardClick(`/inventory/${item.id}`)"
              >
                <div class="expiring-info">
                  <span class="expiring-name">{{ item.name }}</span>
                  <span class="expiring-meta">
                    剩余 {{ item.quantity }}{{ item.unit }} · 存于 {{ item.storageLocation || '未指定' }}
                  </span>
                </div>
                <div class="expiring-days">
                  <span class="expiring-days-value">
                    <template v-if="item._days < 0">已过 {{ Math.abs(item._days) }} 天</template>
                    <template v-else>{{ item._days }} 天</template>
                  </span>
                  <span class="expiring-days-label">{{ item.expiryDate }}</span>
                </div>
              </div>
            </div>

            <div v-else class="empty-state">
              🎉 暂无临期物资
            </div>
          </section>
        </div>
      </div>

      <!-- 第二行:消耗量记录 + 浪费物品价格 -->
      <div class="statistics-row">
        <!-- 消耗量记录 -->
        <section class="stat-section">
          <div class="section-header">
            <h2 class="section-title">消耗量记录</h2>
            <span v-if="consumptionRecords.length" class="section-badge section-badge--accent">
              {{ consumptionRecords.length }} 条
            </span>
            <span v-else class="section-meta">近 30 天</span>
          </div>

          <!-- 消耗汇总 -->
          <div v-if="consumptionRecords.length" class="consumption-summary">
            <div class="consumption-summary-item">
              <span class="consumption-summary-label">总件数</span>
              <span class="consumption-summary-value">{{ totalConsumed }}</span>
            </div>
            <div class="consumption-summary-item">
              <span class="consumption-summary-label">总价值</span>
              <span class="consumption-summary-value consumption-summary-value--success">
                ¥ {{ totalConsumedValue.toFixed(2) }}
              </span>
            </div>
          </div>

          <!-- 分类消耗分布 -->
          <div v-if="categoryConsumption.length" class="category-consumption-list">
            <div
              v-for="cat in categoryConsumption"
              :key="cat.name"
              class="cat-consumption-row"
            >
              <span class="cat-consumption-name">{{ cat.name }}</span>
              <div class="cat-consumption-bar-track">
                <div
                  class="cat-consumption-bar-fill"
                  :style="{
                    width: (cat.qty / (categoryConsumption[0]?.qty || 1) * 100) + '%'
                  }"
                />
              </div>
              <span class="cat-consumption-qty">{{ cat.qty }} 件</span>
              <span class="cat-consumption-value">¥ {{ cat.value.toFixed(2) }}</span>
            </div>
          </div>

          <!-- 消耗明细表 -->
          <div v-if="consumptionRecords.length" class="data-table-card">
            <div class="data-table">
              <div class="data-table-head">
                <span class="data-th data-th--name">物品</span>
                <span class="data-th">数量</span>
                <span class="data-th">日期</span>
                <span class="data-th data-th--last">备注</span>
              </div>
              <div
                v-for="r in consumptionRecords.slice(0, 12)"
                :key="r.id"
                class="data-table-row"
              >
                <span class="data-td data-td--name">{{ r.itemName }}</span>
                <span class="data-td data-td--qty">{{ r.quantity }}</span>
                <span class="data-td data-td--date">{{ r.date }}</span>
                <span class="data-td data-td--last data-td--note">
                  {{ r.note || '—' }}
                </span>
              </div>
            </div>
            <div v-if="consumptionRecords.length > 12" class="data-table-footer">
              仅显示前 12 条,共 {{ consumptionRecords.length }} 条记录
            </div>
          </div>

          <div v-else class="empty-state">📦 暂无消耗记录</div>
        </section>

        <!-- 浪费物品价格表 -->
        <section class="stat-section">
          <div class="section-header">
            <h2 class="section-title">浪费物品价格</h2>
            <span
              v-if="wastedItems.length"
              class="section-badge section-badge--danger"
            >
              {{ wastedItems.length }} 项
            </span>
            <span v-else class="section-meta">已过期未处理</span>
          </div>

          <!-- 浪费总价值 -->
          <div v-if="wastedItems.length" class="waste-summary">
            <span class="waste-summary-label">累计损失</span>
            <span class="waste-summary-value">¥ {{ totalWastedValue.toFixed(2) }}</span>
          </div>

          <div v-if="wastedItems.length" class="data-table-card">
            <div class="data-table">
              <div class="data-table-head">
                <span class="data-th data-th--name">物品</span>
                <span class="data-th">分类</span>
                <span class="data-th">剩余</span>
                <span class="data-th">单价</span>
                <span class="data-th">过期</span>
                <span class="data-th data-th--last">损失</span>
              </div>
              <div
                v-for="item in wastedItems"
                :key="item.id"
                class="data-table-row data-table-row--danger"
              >
                <span class="data-td data-td--name">{{ item.name }}</span>
                <span class="data-td data-td--cat">{{ item._categoryName }}</span>
                <span class="data-td data-td--qty">{{ item.quantity }}{{ item.unit }}</span>
                <span class="data-td">¥ {{ item.price.toFixed(2) }}</span>
                <span class="data-td data-td--overdue">{{ item._overdueDays }} 天</span>
                <span class="data-td data-td--last data-td--loss">
                  ¥ {{ item._loss.toFixed(2) }}
                </span>
              </div>
            </div>
          </div>

          <div v-else class="empty-state">✨ 暂无过期浪费,继续保持!</div>

          <!-- 每日浪费金额 -->
          <div class="section-header section-header--sub">
            <h3 class="section-subtitle">每日浪费金额</h3>
            <span class="section-meta">近 30 天</span>
          </div>

          <div class="waste-summary waste-summary--chart">
            <div class="waste-summary-stack">
              <span class="waste-summary-label">累计损失</span>
              <span class="waste-summary-value">¥ {{ totalDailyWaste.toFixed(2) }}</span>
            </div>
            <div class="waste-summary-stats">
              <div class="waste-summary-stat">
                <span class="waste-summary-stat-label">日均</span>
                <span class="waste-summary-stat-value">¥ {{ avgDailyWaste }}</span>
              </div>
              <div v-if="peakWasteDay" class="waste-summary-stat">
                <span class="waste-summary-stat-label">峰值</span>
                <span class="waste-summary-stat-value">{{ peakWasteDay.date }}</span>
                <span class="waste-summary-stat-meta">
                  ¥ {{ peakWasteDay.value.toFixed(2) }}
                </span>
              </div>
            </div>
          </div>

          <div class="chart-card">
            <div ref="wasteChartRef" class="chart-container chart-container--tall" />
          </div>
        </section>
      </div>

      <!-- 第三行:即将过期价值 -->
      <div class="statistics-row">
        <section class="stat-section">
          <div class="section-header">
            <h2 class="section-title">即将过期价值</h2>
            <span
              v-if="expiringValueList.length"
              class="section-badge section-badge--warning"
            >
              {{ expiringValueList.length }} 项
            </span>
            <span v-else class="section-meta">预警期内</span>
          </div>

          <!-- 临期价值汇总 -->
          <div v-if="expiringValueList.length" class="expiring-value-card">
            <div class="expiring-value-icon">
              <el-icon :size="20" style="color: var(--color-warning);">
                <WarningFilled />
              </el-icon>
            </div>
            <div class="expiring-value-body">
              <span class="expiring-value-label">临期物资价值</span>
              <span class="expiring-value-amount">¥ {{ totalExpiringValue.toFixed(2) }}</span>
            </div>
            <div class="expiring-value-meta">
              <span>建议优先消耗</span>
            </div>
          </div>

          <div v-if="expiringValueList.length" class="data-table-card">
            <div class="data-table">
              <div class="data-table-head data-table-head--expiring">
                <span class="data-th data-th--name">物品</span>
                <span class="data-th">分类</span>
                <span class="data-th">剩余</span>
                <span class="data-th">单价</span>
                <span class="data-th">临期</span>
                <span class="data-th data-th--last">价值</span>
              </div>
              <div
                v-for="item in expiringValueList"
                :key="item.id"
                class="data-table-row data-table-row--expiring"
              >
                <span class="data-td data-td--name">{{ item.name }}</span>
                <span class="data-td data-td--cat">{{ item._categoryName }}</span>
                <span class="data-td data-td--qty">{{ item.quantity }}{{ item.unit }}</span>
                <span class="data-td">¥ {{ (item.price || 0).toFixed(2) }}</span>
                <span
                  class="data-td"
                  :class="item._days < 0 ? 'data-td--overdue' : 'data-td--warning'"
                >
                  <template v-if="item._days < 0">已过 {{ Math.abs(item._days) }} 天</template>
                  <template v-else>{{ item._days }} 天</template>
                </span>
                <span class="data-td data-td--last data-td--cost">
                  ¥ {{ item._value.toFixed(2) }}
                </span>
              </div>
            </div>
          </div>

          <div v-else class="empty-state">🎉 预警期内无临期物资</div>
        </section>
      </div>

      <!-- 第四行:入库 vs 消耗柱状图 -->
      <div class="statistics-row statistics-row--single">
        <section class="stat-section">
          <div class="section-header">
            <h2 class="section-title">入库 vs 消耗</h2>
            <span class="section-meta">近 30 天</span>
          </div>

          <!-- 摘要条 -->
          <div class="vc-summary">
            <div class="vc-summary-item">
              <span class="vc-summary-dot vc-summary-dot--in" />
              <div class="vc-summary-text">
                <span class="vc-summary-label">入库数量</span>
                <span class="vc-summary-value">{{ totalStockIn30 }} 件</span>
                <span class="vc-summary-sub">¥ {{ totalStockInValue30.toFixed(2) }}</span>
              </div>
            </div>
            <div class="vc-summary-item">
              <span class="vc-summary-dot vc-summary-dot--out" />
              <div class="vc-summary-text">
                <span class="vc-summary-label">消耗数量</span>
                <span class="vc-summary-value">{{ totalConsumed }} 件</span>
                <span class="vc-summary-sub">¥ {{ totalConsumeValue30.toFixed(2) }}</span>
              </div>
            </div>
            <div class="vc-summary-item">
              <span
                class="vc-summary-dot"
                :class="netChange >= 0 ? 'vc-summary-dot--in' : 'vc-summary-dot--loss'"
              />
              <div class="vc-summary-text">
                <span class="vc-summary-label">净增减</span>
                <span
                  class="vc-summary-value"
                  :class="netChange >= 0 ? 'vc-summary-value--in' : 'vc-summary-value--loss'"
                >
                  {{ netChange >= 0 ? '+' : '' }}{{ netChange }} 件
                </span>
              </div>
            </div>
          </div>

          <div class="chart-card">
            <div ref="stockVsConsumeChartRef" class="chart-container chart-container--tall" />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：定义统计报表的视觉表现。
  采用"行 × 列"的栅格布局，统一卡片样式（白底 + 厚边框 + 硬阴影），
  并为不同类型的徽章、表格行（普通、警示、临期）准备配色变体。
  ============================================================
*/

.statistics-page {
  position: relative;
  min-height: calc(100vh - var(--navbar-height));
}

/* ===== 装饰背景 ===== */
.bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.bg-orb {
  position: absolute;
  border-radius: 0;
  filter: blur(64px);
  opacity: 0.25;
}

.bg-orb--1 {
  width: 360px;
  height: 360px;
  background: radial-gradient(circle, rgba(91, 140, 90, 0.30), transparent);
  top: -100px;
  left: -80px;
}

.bg-orb--2 {
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, rgba(212, 135, 90, 0.30), transparent);
  bottom: 150px;
  right: -90px;
}

.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(180, 160, 140, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(180, 160, 140, 0.12) 1px, transparent 1px);
  background-size: 16px 16px;
}

.bg-grid::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(180, 150, 130, 0.08) 1px, transparent 1px);
  background-size: 4px 4px;
}

/* ===== 主内容 ===== */
.statistics-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--content-padding-y) var(--content-padding-x);
  max-width: var(--content-max-width);
  margin: 0 auto;
  width: 100%;
}

/* ===== 顶部 ===== */
.page-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-top: var(--spacing-xs);
}

.page-title {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-2xl);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin-bottom: 2px;
}

.page-subtitle {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.refresh-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.92);
  border: 2px solid var(--pixel-border);
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.3);
  flex-shrink: 0;
}

.refresh-btn:hover {
  color: var(--color-primary);
  box-shadow: 3px 3px 0 0 rgba(139, 115, 85, 0.4);
  transform: translate(-1px, -1px);
}

.refresh-btn:active {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 0 rgba(107, 93, 85, 0.3);
}

/* ===== 统计卡片网格 ===== */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-md);
}

/* ===== 价值卡片 ===== */
.value-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  background: linear-gradient(135deg, rgba(91, 140, 90, 0.15), rgba(91, 140, 90, 0.05));
  border: 3px solid var(--color-success);
  box-shadow: 5px 5px 0 0 rgba(91, 140, 90, 0.3);
  position: relative;
}

.value-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(91, 140, 90, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

.value-card-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-success);
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 2px 2px 0 0 rgba(91, 140, 90, 0.3);
  flex-shrink: 0;
}

.value-card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.value-card-label {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.value-card-row {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.value-card-amount {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-2xl);
  color: var(--color-success);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  line-height: 1;
}

.value-card-meta {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 主区域：两列 ===== */
.statistics-main {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
  align-items: start;
}

.statistics-col {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

/* ===== 区块 ===== */
.stat-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.section-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding-bottom: var(--spacing-xs);
}

.section-title {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-normal);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.section-badge {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-primary);
  background: rgba(212, 135, 90, 0.15);
  border: 2px solid var(--color-primary);
  padding: 1px 8px;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.section-badge--warning {
  color: var(--color-warning);
  background: rgba(224, 160, 48, 0.15);
  border-color: var(--color-warning);
}

.section-meta {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.section-header--sub {
  margin-top: var(--spacing-xs);
  padding-top: var(--spacing-sm);
  border-top: 1px dashed rgba(180, 160, 140, 0.4);
}

.section-subtitle {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-normal);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 图表卡片 ===== */
.chart-card {
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 5px 5px 0 0 rgba(139, 115, 85, 0.4);
  padding: var(--spacing-md);
  position: relative;
}

.chart-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

.chart-container {
  width: 100%;
  height: 320px;
}

.chart-container--tall {
  height: 280px;
}

/* ===== 分类详情列表 ===== */
.category-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 4px 4px 0 0 rgba(139, 115, 85, 0.35);
  padding: var(--spacing-md);
  position: relative;
}

.category-list::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.05) 1px, transparent 1px);
  background-size: 4px 4px;
}

.cat-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 4px 0;
}

.cat-color-dot {
  width: 12px;
  height: 12px;
  border: 2px solid var(--pixel-border);
  flex-shrink: 0;
}

.cat-row-name {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  width: 70px;
  flex-shrink: 0;
}

.cat-bar-track {
  flex: 1;
  height: 10px;
  background: rgba(180, 160, 140, 0.2);
  border: 1px solid var(--color-border);
  position: relative;
  min-width: 60px;
}

.cat-bar-fill {
  height: 100%;
  transition: width var(--transition-base);
}

.cat-row-value {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  width: 36px;
  text-align: right;
  flex-shrink: 0;
}

.cat-row-percent {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  width: 50px;
  text-align: right;
  flex-shrink: 0;
}

/* ===== 消耗趋势摘要 ===== */
.trend-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-sm);
}

.trend-stat {
  background: rgba(255, 255, 255, 0.92);
  border: 2px solid var(--pixel-border);
  box-shadow: 3px 3px 0 0 rgba(139, 115, 85, 0.3);
  padding: var(--spacing-sm) var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
}

.trend-stat::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.05) 1px, transparent 1px);
  background-size: 4px 4px;
}

.trend-stat-label {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.trend-stat-value {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-lg);
  color: var(--color-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  line-height: 1.2;
}

.trend-stat-meta {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 即将过期列表 ===== */
.expiring-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.expiring-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: rgba(255, 255, 255, 0.92);
  border: 2px solid var(--pixel-border);
  box-shadow: 3px 3px 0 0 rgba(139, 115, 85, 0.3);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}

.expiring-item::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.05) 1px, transparent 1px);
  background-size: 4px 4px;
}

.expiring-item:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 0 rgba(139, 115, 85, 0.35);
}

.expiring-item:active {
  transform: translate(1px, 1px);
  box-shadow: 2px 2px 0 0 rgba(139, 115, 85, 0.3);
}

.expiring-item--warning {
  border-left: 4px solid var(--color-warning);
}

.expiring-item--danger {
  border-left: 4px solid var(--color-danger);
}

.expiring-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.expiring-name {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.expiring-meta {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.expiring-days {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

.expiring-days-value {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.expiring-item--warning .expiring-days-value {
  color: var(--color-warning);
}

.expiring-item--danger .expiring-days-value {
  color: var(--color-danger);
}

.expiring-days-label {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-placeholder);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.empty-state {
  text-align: center;
  padding: var(--spacing-xl);
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-placeholder);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  border: 2px dashed var(--color-border-light);
  background: rgba(255, 255, 255, 0.5);
}

/* ===== 第二行:消耗记录 + 浪费物品 ===== */
.statistics-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
  align-items: start;
}

.statistics-row--single {
  grid-template-columns: 1fr;
}

@media (max-width: 960px) {
  .statistics-row {
    grid-template-columns: 1fr;
  }
}

.section-badge--accent {
  color: var(--color-accent);
  background: rgba(232, 131, 74, 0.15);
  border-color: var(--color-accent);
}

.section-badge--danger {
  color: var(--color-danger);
  background: rgba(184, 101, 58, 0.15);
  border-color: var(--color-danger);
}

/* ===== 消耗汇总条 ===== */
.consumption-summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.consumption-summary-item {
  background: rgba(255, 255, 255, 0.92);
  border: 2px solid var(--pixel-border);
  box-shadow: 3px 3px 0 0 rgba(139, 115, 85, 0.3);
  padding: var(--spacing-sm) var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
}

.consumption-summary-item::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.05) 1px, transparent 1px);
  background-size: 4px 4px;
}

.consumption-summary-label {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.consumption-summary-value {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  line-height: 1.2;
}

.consumption-summary-value--success {
  color: var(--color-success);
}

/* ===== 分类消耗分布 ===== */
.category-consumption-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 4px 4px 0 0 rgba(139, 115, 85, 0.35);
  padding: var(--spacing-md);
  position: relative;
  margin-bottom: var(--spacing-sm);
}

.category-consumption-list::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.05) 1px, transparent 1px);
  background-size: 4px 4px;
}

.cat-consumption-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 4px 0;
}

.cat-consumption-name {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  width: 64px;
  flex-shrink: 0;
}

.cat-consumption-bar-track {
  flex: 1;
  height: 10px;
  background: rgba(180, 160, 140, 0.2);
  border: 1px solid var(--color-border);
  min-width: 60px;
  position: relative;
}

.cat-consumption-bar-fill {
  height: 100%;
  background: var(--color-accent);
  transition: width var(--transition-base);
}

.cat-consumption-qty {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  width: 56px;
  text-align: right;
  flex-shrink: 0;
}

.cat-consumption-value {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  width: 72px;
  text-align: right;
  flex-shrink: 0;
}

/* ===== 数据表格卡片 ===== */
.data-table-card {
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 5px 5px 0 0 rgba(139, 115, 85, 0.4);
  padding: var(--spacing-md);
  position: relative;
}

.data-table-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

.data-table {
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
}

.data-table-head {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr 1fr 1.4fr;
  gap: var(--spacing-sm);
  padding: 6px 4px;
  border-bottom: 2px solid var(--pixel-border);
  background: rgba(212, 135, 90, 0.08);
}

.data-table-card:has(.data-th--cat) .data-table-head,
.data-table-card:has(.data-td--cat) .data-table-head {
  grid-template-columns: 1.2fr 0.9fr 0.8fr 0.7fr 0.7fr 1fr;
}

.data-th {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  text-align: left;
  font-weight: var(--font-weight-normal);
}

.data-table-row {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr 1fr 1.4fr;
  gap: var(--spacing-sm);
  padding: 8px 4px;
  border-bottom: 1px dashed rgba(180, 160, 140, 0.3);
  align-items: center;
  transition: background var(--transition-fast);
}

.data-table-row:last-child {
  border-bottom: none;
}

.data-table-row:hover {
  background: rgba(212, 135, 90, 0.06);
}

.data-table-card:has(.data-td--cat) .data-table-row {
  grid-template-columns: 1.2fr 0.9fr 0.8fr 0.7fr 0.7fr 1fr;
}

.data-table-row--danger {
  background: rgba(184, 101, 58, 0.04);
}

.data-table-row--danger:hover {
  background: rgba(184, 101, 58, 0.1);
}

.data-td {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-td--name {
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

.data-td--qty {
  color: var(--color-accent);
}

.data-td--date {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.data-td--note {
  color: var(--color-text-placeholder);
  font-size: 10px;
}

.data-td--cat {
  color: var(--color-text-secondary);
  font-size: 10px;
}

.data-td--overdue {
  color: var(--color-danger);
}

.data-td--loss {
  color: var(--color-danger);
  font-weight: var(--font-weight-bold);
}

.data-table-footer {
  margin-top: var(--spacing-sm);
  padding-top: var(--spacing-sm);
  border-top: 1px dashed rgba(180, 160, 140, 0.4);
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-placeholder);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  text-align: center;
  position: relative;
  z-index: 1;
}

/* ===== 浪费汇总条 ===== */
.waste-summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  background: linear-gradient(135deg, rgba(184, 101, 58, 0.15), rgba(184, 101, 58, 0.05));
  border: 3px solid var(--color-danger);
  box-shadow: 5px 5px 0 0 rgba(184, 101, 58, 0.3);
  position: relative;
}

.waste-summary::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(184, 101, 58, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

.waste-summary-label {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.waste-summary-value {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xl);
  color: var(--color-danger);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  line-height: 1;
}

.waste-summary--chart {
  align-items: center;
  gap: var(--spacing-md);
}

.waste-summary-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.waste-summary-stats {
  display: flex;
  gap: var(--spacing-md);
}

.waste-summary-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-end;
}

.waste-summary-stat-label {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.waste-summary-stat-value {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.waste-summary-stat-meta {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 补货预算卡片 ===== */
.shopping-budget-card {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.shopping-budget-item {
  background: linear-gradient(135deg, rgba(232, 131, 74, 0.15), rgba(232, 131, 74, 0.05));
  border: 3px solid var(--color-accent);
  box-shadow: 4px 4px 0 0 rgba(232, 131, 74, 0.3);
  padding: var(--spacing-sm) var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
}

.shopping-budget-item::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(232, 131, 74, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

.shopping-budget-item--meta {
  background: rgba(255, 255, 255, 0.92);
  border-color: var(--pixel-border);
  box-shadow: 3px 3px 0 0 rgba(139, 115, 85, 0.3);
}

.shopping-budget-label {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.shopping-budget-value {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xl);
  color: var(--color-accent);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  line-height: 1.1;
}

.shopping-budget-value-sm {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  line-height: 1.2;
}

/* 表格变体(补货/临期) */
.data-table-head--shopping {
  grid-template-columns: 1.4fr 0.8fr 0.9fr 0.9fr 1fr;
}

.data-table-row--shopping {
  grid-template-columns: 1.4fr 0.8fr 0.9fr 0.9fr 1fr;
}

.data-table-head--expiring {
  grid-template-columns: 1.2fr 0.8fr 0.7fr 0.7fr 0.8fr 0.9fr;
}

.data-table-row--expiring {
  grid-template-columns: 1.2fr 0.8fr 0.7fr 0.7fr 0.8fr 0.9fr;
}

.data-td--unpriced {
  color: var(--color-text-placeholder);
  font-style: italic;
}

.data-td--cost {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-bold);
}

.data-td--warning {
  color: var(--color-warning);
}

/* ===== 临期价值卡片 ===== */
.expiring-value-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  background: linear-gradient(135deg, rgba(224, 160, 48, 0.15), rgba(224, 160, 48, 0.05));
  border: 3px solid var(--color-warning);
  box-shadow: 5px 5px 0 0 rgba(224, 160, 48, 0.3);
  position: relative;
}

.expiring-value-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(224, 160, 48, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

.expiring-value-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-warning);
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 2px 2px 0 0 rgba(224, 160, 48, 0.3);
  flex-shrink: 0;
}

.expiring-value-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.expiring-value-label {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.expiring-value-amount {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xl);
  color: var(--color-warning);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  line-height: 1.1;
}

.expiring-value-meta {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-placeholder);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  flex-shrink: 0;
}

/* ===== 入库 vs 消耗 摘要 ===== */
.vc-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.vc-summary-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  background: rgba(255, 255, 255, 0.92);
  border: 2px solid var(--pixel-border);
  box-shadow: 3px 3px 0 0 rgba(139, 115, 85, 0.3);
  padding: var(--spacing-sm) var(--spacing-md);
  position: relative;
}

.vc-summary-item::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.05) 1px, transparent 1px);
  background-size: 4px 4px;
}

.vc-summary-dot {
  width: 10px;
  height: 10px;
  border: 2px solid var(--pixel-border);
  flex-shrink: 0;
}

.vc-summary-dot--in {
  background: #5B8C5A;
}

.vc-summary-dot--out {
  background: #D4875A;
}

.vc-summary-dot--loss {
  background: var(--color-danger);
}

.vc-summary-text {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
}

.vc-summary-label {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.vc-summary-value {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  line-height: 1.2;
}

.vc-summary-value--in {
  color: #5B8C5A;
}

.vc-summary-value--loss {
  color: var(--color-danger);
}

.vc-summary-sub {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-placeholder);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}
</style>
