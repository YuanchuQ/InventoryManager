<!--
  ============================================================
  页面说明：库存概览（首页 / 仪表盘）
  这是用户打开系统后看到的第一个页面，作用是把库存相关的关键信息
  集中展示在一个屏幕上，让用户无需进入子页面就能掌握整体状况。
  本页面提供六类信息：
    1. 物资总数
    2. 即将过期的物资数量
    3. 库存不足的物资数量
    4. 待采购清单的前几条
    5. 各分类物资占比（饼图）
    6. 常用操作的快捷入口
  ============================================================
-->

<script setup>
/*
  ============================================================
  脚本区：负责本页面的数据准备、业务逻辑和事件处理。
  主要工作分为四块：
    1. 从公共数据源（库存、购物清单、用户设置）读取原始数据
    2. 把原始数据加工成页面要展示的统计值和列表
    3. 处理用户操作（点击跳转、勾选已买等）
    4. 控制分类占比饼图的绘制与刷新
  ============================================================
*/

// 引入 Vue 的几个能力：响应式变量、派生数据、生命周期、DOM 更新等待、数据监听
import { ref, computed, onMounted, nextTick, watch } from 'vue'
// 引入路由能力，用于在用户点击后跳转到其他页面
import { useRouter } from 'vue-router'
// 引入库存数据源（存放所有物资信息）
import { useInventoryStore } from '@/stores/inventory'
// 引入购物清单数据源（存放采购计划）
import { useShoppingStore } from '@/stores/shoppingList'
// 引入系统设置数据源（存放分类列表、预警天数等用户偏好）
import { useSettingsStore } from '@/stores/settings'
// 引入三个图标：物资盒子、过期警告、库存不足提示
import {
  Box,
  WarningFilled,
  CircleCloseFilled
} from '@element-plus/icons-vue'
// 引入图表库 echarts，本页用于绘制分类占比饼图
import * as echarts from 'echarts'
// 引入本项目自定义的四个子组件
import StatCard from '@/components/StatCard.vue'         // 顶部统计卡片
import AlertList from '@/components/AlertList.vue'       // 预警列表
import QuickActions from '@/components/QuickActions.vue' // 快捷操作按钮组
import TodoList from '@/components/TodoList.vue'         // 待办（待采购）列表

// 建立路由对象，供后续跳转使用
const router = useRouter()
// 建立与三个数据源的连接，后续直接通过这三个变量读写数据
const inventoryStore = useInventoryStore()
const shoppingStore = useShoppingStore()
const settingsStore = useSettingsStore()

// 用于在脚本中引用模板里那块画图表的容器
const chartRef = ref(null)
// 用于持有图表实例本身，便于后续更新、销毁、自适应
let chartInstance = null

// 统一定义图表中使用的像素风字体，避免重复书写
const PIXEL_FONT_FAMILY = "'Minecraft', 'Ark Pixel', sans-serif"

// 物资总数：来自库存中的物品列表长度
const totalItems = computed(() => inventoryStore.items.length)

// 根据设置中心的"过期预警天数"动态筛选即将过期的物资
// 例如设置中配置为 7 天，则筛出 7 天内即将到期的物品
const expiringItems = computed(() =>
  inventoryStore.getExpiringItemsWithDays(settingsStore.expiryAlertDays).value
)

// 库存不足的物资清单（数量低于设定阈值的物品）
const lowStockItems = computed(() => inventoryStore.getLowStockItems)

// 即将过期物资的数量
const expiringCount = computed(() => expiringItems.value.length)

// 库存不足物资的数量
const lowStockCount = computed(() => lowStockItems.value.length)

// 汇总两类预警（即将过期 + 库存不足）形成统一的预警列表
const alertItems = computed(() => {
  // 当前时间，用于计算每件物资距离过期还有多少天
  const now = Date.now()
  // 处理"即将过期"类，给每条数据补充用于展示与排序的字段
  const expiring = expiringItems.value.map(item => {
    // 过期时间与当前时间的差值（毫秒）
    const diff = new Date(item.expiryDate).getTime() - now
    // 将毫秒差转换为天数；正值表示尚未过期，负值表示已过期
    const days = Math.ceil(diff / (24 * 60 * 60 * 1000))
    return {
      ...item,                                            // 保留物资原有字段
      _alertType: days < 0 ? 'expired' : 'expiring',     // 标记类型：已过期 / 即将过期
      _days: days < 0 ? Math.abs(days) : days,           // 已过期：超出天数；未过期：剩余天数
      _sort: days < 0 ? 0 : 1                            // 排序权重：已过期最优先
    }
  })

  // 处理"库存不足"类
  const lowstock = lowStockItems.value
    // 若一件物资同时出现在两类中，仅保留过期一条，避免重复显示
    .filter(ls => !expiringItems.value.some(e => e.id === ls.id))
    .map(item => ({
      ...item,
      _alertType: 'lowstock',
      _days: 0,
      _sort: 2                  // 库存不足类优先级最低
    }))

  // 合并两类数据，按优先级与天数排序，最多展示 8 条
  return [...expiring, ...lowstock].sort((a, b) => a._sort - b._sort || a._days - b._days).slice(0, 8)
})

// 待采购清单中"未购买"的物品，首页仅展示前 5 条
const pendingShopping = computed(() => shoppingStore.pendingItems.slice(0, 5))

// 构造饼图所需的数据结构：每个分类的名称与对应数量
const categoryChartData = computed(() => {
  // 各分类下的物资数量统计，形式如 { 分类id: 数量 }
  const counts = inventoryStore.categoryCounts
  // 将分类列表整理为"分类id → 分类名称"的对照表
  const names = settingsStore.categories.reduce((map, c) => {
    map[c.id] = c.name
    return map
  }, {})

  // 将统计结果转换为图表所需的 [{ name, value }] 形式
  return Object.entries(counts).map(([id, qty]) => ({
    name: names[id] || `分类${id}`,  // 找不到名称时使用兜底文本
    value: qty
  }))
})

// 点击预警条目时，跳转到对应物资的详情页
function handleAlertClick(item) {
  router.push(`/inventory/${item.id}`)
}

// 点击"待采购清单"区域时，跳转到完整的购物清单页
function handleTodoClick() {
  router.push('/shopping')
}

// 切换某条采购项的"已购买 / 未购买"状态
async function handleToggleTodo(item) {
  try {
    if (item.isPurchased) {
      // 当前为"已购买"，则改回"未购买"
      await shoppingStore.markPending(item.id)
    } else {
      // 当前为"未购买"，则标记为"已购买"
      await shoppingStore.markPurchased(item.id)
    }
  } catch {
    // 失败时静默处理，不打断用户操作
    // ignore
  }
}

// 初始化分类占比饼图（首次渲染、数据变化时均会调用）
function initChart() {
  // 容器尚未挂载，直接返回
  if (!chartRef.value) return

  // 若已存在旧实例，先销毁，避免重复创建
  if (chartInstance) {
    chartInstance.dispose()
  }

  // 基于容器创建新的图表实例
  chartInstance = echarts.init(chartRef.value)

  // 取出准备好的分类数据
  const data = categoryChartData.value
  // 无数据则不进行后续绘制
  if (data.length === 0) return

  // 饼图各扇区的配色（与项目像素风视觉一致）
  const colors = [
    '#D4875A', '#E8834A', '#5B8C5A', '#E0A030',
    '#C47A50', '#B8653A', '#6B7B8D', '#9B8D85'
  ]

  // 设置图表的完整配置（外观、交互、数据）
  chartInstance.setOption({
    // 鼠标悬浮提示框
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
      formatter: '{b}: {c} ({d}%)'   // 展示格式：分类名 : 数量 (百分比)
    },
    // 图表主体：环形饼图
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],        // 内外半径，形成环形
      center: ['50%', '50%'],        // 画布中心
      avoidLabelOverlap: true,       // 自动避免标签互相遮挡
      itemStyle: {
        borderColor: '#1A1817',
        borderWidth: 2,
        borderRadius: 0              // 保持直角边缘，匹配像素风
      },
      label: {
        show: true,
        position: 'outside',         // 标签显示在扇区外侧
        fontFamily: PIXEL_FONT_FAMILY,
        fontSize: 12,
        color: '#2D221C',
        fontWeight: 'normal',
        formatter: '{b}\n{d}%'       // 标签格式：分类名换行显示百分比
      },
      labelLine: {
        lineStyle: {
          color: '#1A1817',
          width: 2
        }
      },
      // 为每个分类指定颜色（按顺序循环取用）
      data: data.map((d, i) => ({
        ...d,
        itemStyle: { color: colors[i % colors.length] }
      }))
    }]
  })
}

// 窗口尺寸变化时，让图表自适应新的容器尺寸
function handleResize() {
  chartInstance?.resize()
}

// 页面挂载后执行：加载所有必要数据，并完成首次图表渲染
onMounted(async () => {
  // 并行加载四项数据，缩短整体等待时间
  await Promise.all([
    inventoryStore.loadItems(),       // 加载物资清单
    shoppingStore.loadList(),         // 加载购物清单
    settingsStore.loadCategories(),   // 加载分类配置
    settingsStore.loadSettings()      // 加载系统设置
  ])
  // 等待 Vue 完成 DOM 更新
  await nextTick()
  // 等待浏览器字体加载完成，避免图表中文字渲染异常
  await document.fonts?.ready
  // 数据与 DOM 均就绪后绘制图表
  initChart()
  // 注册窗口尺寸变化监听，支持图表自适应
  window.addEventListener('resize', handleResize)
})

// 监听分类数据变化（例如新增、删除、修改物资），自动重绘饼图
watch(categoryChartData, () => {
  nextTick().then(initChart)
}, { deep: true })   // 开启深度监听，覆盖对象内部字段的变化
</script>

<template>
  <!--
    ============================================================
    模板区：决定页面的视觉结构与展示内容，分为以下几部分：
      1. 背景装饰层（光晕、网格，不参与交互）
      2. 页面标题区
      3. 顶部统计卡片行（总物资 / 即将过期 / 库存不足）
      4. 主体两列布局：
         · 左列：预警提醒 + 待采购清单
         · 右列：分类占比饼图 + 快捷操作
    ============================================================
  -->
  <!-- 仪表盘最外层容器 -->
  <div class="dashboard">
    <!-- 背景装饰层：纯视觉效果，不响应用户操作 -->
    <div class="bg-decoration">
      <div class="bg-orb bg-orb--1" />   <!-- 右上角橙色光晕 -->
      <div class="bg-orb bg-orb--2" />   <!-- 左下角金色光晕 -->
      <div class="bg-grid" />            <!-- 像素风背景网格 -->
    </div>

    <!-- 内容层：承载所有可见与可交互元素 -->
    <div class="dashboard-content">
      <!-- 欢迎标题 -->
      <div class="dashboard-header">
        <h1 class="dashboard-title">库存概览</h1>           <!-- 页面主标题 -->
        <p class="dashboard-subtitle">今日库存状态一览</p>   <!-- 页面副标题 -->
      </div>

      <!-- 统计卡片行 -->
      <!-- 三张统计卡片，分别展示总物资、即将过期、库存不足 -->
      <div class="stat-row">
        <!-- 总物资卡片 -->
        <StatCard
          :icon="Box"
          :value="totalItems"
          label="总物资"
          color="var(--color-primary)"
          to="/inventory"
        />
        <!-- 即将过期卡片 -->
        <StatCard
          :icon="WarningFilled"
          :value="expiringCount"
          label="即将过期"
          color="var(--color-warning)"
          to="/inventory"
        />
        <!-- 库存不足卡片 -->
        <StatCard
          :icon="CircleCloseFilled"
          :value="lowStockCount"
          label="库存不足"
          color="var(--color-danger)"
          to="/inventory"
        />
      </div>

      <!-- 桌面端两列：左侧预警 + 待办；右侧分类 + 快捷 -->
      <div class="dashboard-main">
        <!-- 左列 -->
        <div class="dashboard-col">
          <!-- 预警列表 -->
          <section class="dashboard-section">
            <div class="section-header">
              <h2 class="section-title">预警提醒</h2>
              <!-- 有预警时显示数量徽章 -->
              <span v-if="alertItems.length" class="section-badge">{{ alertItems.length }}</span>
            </div>
            <!-- 调用预警列表组件：传入数据，监听点击事件 -->
            <AlertList :items="alertItems" @item-click="handleAlertClick" />
          </section>

          <!-- 待办事项 -->
          <section class="dashboard-section">
            <div class="section-header">
              <h2 class="section-title">待采购清单</h2>
              <!-- 待办数量徽章 -->
              <span v-if="pendingShopping.length" class="section-badge">{{ pendingShopping.length }}</span>
            </div>
            <!-- 待办清单组件：响应"区域点击跳转"与"单条勾选切换"两类事件 -->
            <TodoList
              :items="pendingShopping"
              @click="handleTodoClick"
              @mark="handleToggleTodo"
            />
          </section>
        </div>

        <!-- 右列 -->
        <div class="dashboard-col">
          <!-- 分类占比 -->
          <section class="dashboard-section">
            <div class="section-header">
              <h2 class="section-title">分类占比</h2>
            </div>
            <div class="chart-card">
              <!-- 图表容器：脚本中通过 chartRef 引用并在此处绘制图表 -->
              <div ref="chartRef" class="chart-container" />
              <!-- 无数据时的占位提示 -->
              <p v-if="categoryChartData.length === 0" class="chart-empty">暂无数据</p>
            </div>
          </section>

          <!-- 快捷操作 -->
          <section class="dashboard-section">
            <div class="section-header">
              <h2 class="section-title">快捷操作</h2>
            </div>
            <!-- 快捷按钮组件，提供常用操作入口 -->
            <QuickActions />
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：定义本页面的视觉表现，包括布局、字体、颜色与装饰元素。
  使用 scoped 限定作用范围，样式仅对当前页面生效，不会影响其他页面。
  ============================================================
*/

/* 最外层容器：相对定位，最小高度铺满可视区（扣除顶部导航高度） */
.dashboard {
  position: relative;
  min-height: calc(100vh - var(--navbar-height));
}

/* ===== 装饰背景 ===== */
/* 背景装饰层：覆盖整个页面，不响应鼠标，超出部分裁切 */
.bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

/* 光晕通用样式：绝对定位、强模糊、半透明 */
.bg-orb {
  position: absolute;
  border-radius: 0;
  filter: blur(64px);     /* 64 像素高斯模糊，形成柔和光斑 */
  opacity: 0.25;
}

/* 第一个光晕：右上角，暖橙色 */
.bg-orb--1 {
  width: 360px;
  height: 360px;
  background: radial-gradient(circle, rgba(212, 135, 90, 0.35), transparent);
  top: -80px;
  right: -60px;
}

/* 第二个光晕：左下角，金黄色 */
.bg-orb--2 {
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(224, 160, 48, 0.25), transparent);
  bottom: 100px;
  left: -80px;
}

/* 背景网格 */
.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(180, 160, 140, 0.12) 1px, transparent 1px),
    linear-gradient(90deg, rgba(180, 160, 140, 0.12) 1px, transparent 1px);
  background-size: 16px 16px;        /* 网格单元大小 16px × 16px */
}

/* 在网格之上叠加细小圆点，形成颗粒质感 */
.bg-grid::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(180, 150, 130, 0.08) 1px, transparent 1px);
  background-size: 4px 4px;
}

/* ===== 主内容 ===== */
/* 内容层：层级高于装饰层，纵向排列各模块，居中显示并限制最大宽度 */
.dashboard-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  padding: var(--content-padding-y) var(--content-padding-x);
  max-width: var(--content-max-width);  /* 限制最大宽度，避免大屏下过度拉伸 */
  margin: 0 auto;                        /* 水平居中 */
  width: 100%;
}

/* 标题区上方留出少量间距 */
.dashboard-header {
  padding-top: var(--spacing-xs);
}

/* 主标题：像素字体，大字号，关闭字体平滑以保留像素质感 */
.dashboard-title {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-2xl);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin-bottom: var(--spacing-xs);
}

/* 副标题：像素字体，较小字号，颜色较弱 */
.dashboard-subtitle {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 统计卡片行 ===== */
/* 三张统计卡片：采用栅格布局，平均分为三列 */
.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-md);
}

/* ===== 主区域：两列 ===== */
/* 主体内容区域：左右两列等宽，顶部对齐 */
.dashboard-main {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-lg);
  align-items: start;
}

/* 每一列内部：纵向排列各 section */
.dashboard-col {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

/* ===== 区块 ===== */
/* section 通用样式：纵向排列标题与内容 */
.dashboard-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

/* section 标题栏：标题文字与徽章横向排列 */
.section-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding-bottom: var(--spacing-xs);
}

/* section 标题文字：像素字体 */
.section-title {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-normal);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 数量徽章：白字红底，用于显示预警或待办数量 */
.section-badge {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: #FFFFFF;
  background: var(--color-danger);
  padding: 1px 8px;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 图表卡片 ===== */
/* 图表外层卡片：白底、像素风厚边框、右下硬阴影 */
.chart-card {
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 5px 5px 0 0 rgba(139, 115, 85, 0.4);   /* 模拟像素风的硬质投影 */
  padding: var(--spacing-md);
  position: relative;
}

/* 在卡片之上叠加细小圆点，形成颗粒质感 */
.chart-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

/* 图表容器：宽度自适应，高度固定 280 像素 */
.chart-container {
  width: 100%;
  height: 280px;
}

/* "暂无数据"占位文字样式 */
.chart-empty {
  text-align: center;
  padding: var(--spacing-xl);
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-placeholder);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}
</style>
