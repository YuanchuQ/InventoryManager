<!--
  ============================================================
  页面说明：库存管理（物资列表）
  以列表形式展示所有库存物资，是用户最常用的入口之一。
  页面提供：
    1. 分类标签切换（按分类筛选）
    2. 关键词搜索（按物资名称模糊匹配）
    3. 三种排序（按过期日期 / 按数量 / 按名称），可切换升降序
    4. 物资卡片列表（显示名称、分类、数量、过期状态、低库存提示）
    5. 删除单条物资（带二次确认）
    6. 点击单条进入详情页；右上角"添加物资"跳到新增页
  ============================================================
-->

<script setup>
/*
  ============================================================
  脚本区：负责库存列表的筛选、排序、跳转和删除逻辑。
  主要工作：
    1. 把搜索关键词 / 分类筛选 / 排序字段叠加，派生最终列表
    2. 提供分类名查询、过期颜色、过期文案、是否低库存等工具
    3. 处理删除（带确认）与跳转详情
  ============================================================
*/

import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useInventoryStore } from '@/stores/inventory'
import { useSettingsStore } from '@/stores/settings'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Box, Plus, Search, Delete,
  WarningFilled, CircleCloseFilled, CircleCheckFilled,
  Timer, TrendCharts, List
} from '@element-plus/icons-vue'
// 过期状态计算与配色常量
import { getExpiryStatus, EXPIRY_COLORS } from '@/utils/constants'

const router = useRouter()
const inventoryStore = useInventoryStore()
const settingsStore = useSettingsStore()

// 搜索关键词
const searchKeyword = ref('')
// 当前选中的分类 id（空字符串代表"全部"）
const selectedCategory = ref('')
// 当前排序字段（'expiryDate' / 'quantity' / 'name'，空代表不排序）
const sortField = ref('')
// 是否升序（true=升序，false=降序）
const sortAsc = ref(true)

// 所有分类（用于顶部 tab 渲染）
const categories = computed(() => settingsStore.categories)

// 综合筛选与排序后的物资列表
const filteredItems = computed(() => {
  let result = inventoryStore.items
  // 1. 按分类筛选
  if (selectedCategory.value) {
    result = result.filter(i => i.categoryId === selectedCategory.value)
  }
  // 2. 按关键词模糊匹配（不区分大小写）
  const kw = searchKeyword.value.trim().toLowerCase()
  if (kw) {
    result = result.filter(i => i.name.toLowerCase().includes(kw))
  }
  // 3. 按指定字段排序
  if (sortField.value) {
    const order = sortAsc.value ? 1 : -1
    result = [...result].sort((a, b) => {
      if (sortField.value === 'expiryDate') {
        return (new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()) * order
      }
      if (sortField.value === 'quantity') {
        return (a.quantity - b.quantity) * order
      }
      return a.name.localeCompare(b.name) * order
    })
  }
  return result
})

// 工具：根据分类 id 查名字
function categoryName(id) {
  const c = settingsStore.categories.find(cat => cat.id === id)
  return c ? c.name : '未分类'
}

// 工具：切换排序字段或方向（同字段第二次点击则反转方向）
function toggleSort(field) {
  if (sortField.value === field) {
    sortAsc.value = !sortAsc.value
  } else {
    sortField.value = field
    sortAsc.value = true
  }
}

// 工具：根据过期日期 + 数量返回过期状态对应颜色
function getExpiryColor(date, quantity) {
  // 数量为 0：已消耗/丢弃，过期颜色弱化为灰色，避免误导
  if (!quantity || quantity <= 0) return '#9B8D85'
  return EXPIRY_COLORS[getExpiryStatus(date)]
}

// 工具：根据过期日期返回对应图标
function getExpiryIcon(date) {
  const s = getExpiryStatus(date)
  if (s === 'danger') return CircleCloseFilled
  if (s === 'warning') return WarningFilled
  return CircleCheckFilled
}

// 工具：把过期状态格式化成可读文案
function formatExpiry(date, quantity) {
  // 数量为 0：直接显示"已用完"，不再做"X 天后过期"这种误导性提示
  if (!quantity || quantity <= 0) return '已用完'
  const s = getExpiryStatus(date)
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (s === 'danger') return `已过期 ${Math.abs(diff)} 天`
  return `${diff} 天后过期`
}

// 工具：判断某物资是否库存不足
function isLowStock(item) {
  return item.quantity <= item.minQuantity
}

// 跳转到该物资的详情页
function goToDetail(id) {
  router.push(`/inventory/${id}`)
}

// 删除单条物资（带二次确认；stopPropagation 防止冒泡到卡片导致进入详情）
async function handleDelete(item, e) {
  e.stopPropagation()
  try {
    await ElMessageBox.confirm(`确定删除「${item.name}」吗？`, '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await inventoryStore.removeItem(item.id)
    ElMessage.success('已删除')
  } catch {}
}

// 排序按钮配置：字段、文案、图标
const sortOptions = [
  { field: 'expiryDate', label: '按过期', icon: Timer },
  { field: 'quantity', label: '按数量', icon: TrendCharts },
  { field: 'name', label: '按名称', icon: List }
]

// 挂载时并行加载库存与分类数据
onMounted(async () => {
  await Promise.all([
    inventoryStore.loadItems(),
    settingsStore.loadCategories()
  ])
})
</script>

<template>
  <!--
    ============================================================
    模板区：决定库存列表的视觉结构，由以下几部分组成：
      1. 装饰背景层
      2. 顶栏（标题 + 添加物资按钮）
      3. 分类标签 tab
      4. 搜索框 + 排序按钮组
      5. 物资卡片列表（每张卡片左侧用彩色边表示过期状态）
      6. 空状态占位
    ============================================================
  -->
  <div class="page-content">
    <div class="bg-decoration">
      <div class="bg-orb bg-orb--1" />   <!-- 右上角光晕 -->
      <div class="bg-orb bg-orb--2" />   <!-- 左下角光晕 -->
      <div class="bg-grid" />            <!-- 像素风网格 -->
    </div>

    <div class="page-content-inner">
      <!-- 顶栏：标题 + 添加物资按钮 -->
      <div class="page-header">
        <h2 class="page-title">库存管理</h2>
        <button class="action-btn" @click="router.push('/inventory/add')">
          <el-icon :size="16"><Plus /></el-icon>
          <span>添加物资</span>
        </button>
      </div>

      <!-- 分类标签：第一个为"全部"，其余按分类动态渲染 -->
      <div class="category-tabs">
        <button
          class="cat-tab"
          :class="{ 'cat-tab--active': !selectedCategory }"
          @click="selectedCategory = ''"
        >全部</button>
        <button
          v-for="cat in categories"
          :key="cat.id"
          class="cat-tab"
          :class="{ 'cat-tab--active': selectedCategory === cat.id }"
          @click="selectedCategory = cat.id"
        >{{ cat.name }}</button>
      </div>

      <!-- 工具栏：搜索框 + 排序按钮 -->
      <div class="toolbar">
        <div class="search-wrapper">
          <el-input v-model="searchKeyword" placeholder="搜索物资名称" clearable size="large">
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
        <!-- 排序按钮组：点击切换字段，二次点击切换升降序 -->
        <div class="sort-group">
          <button
            v-for="opt in sortOptions"
            :key="opt.field"
            class="sort-btn"
            :class="{
              'sort-btn--active': sortField === opt.field,
              'sort-btn--desc': sortField === opt.field && !sortAsc
            }"
            @click="toggleSort(opt.field)"
            :title="opt.label"
          >
            <el-icon :size="16"><component :is="opt.icon" /></el-icon>
            <!-- 显示当前升降序箭头 -->
            <span class="sort-arrow">{{ sortField === opt.field ? (sortAsc ? '↑' : '↓') : '' }}</span>
          </button>
        </div>
      </div>

      <!-- 物资列表：每张卡片左侧的彩色条对应过期状态 -->
      <div v-if="filteredItems.length" class="item-list">
        <div
          v-for="item in filteredItems"
          :key="item.id"
          class="item-card"
          :style="{ borderLeftColor: getExpiryColor(item.expiryDate, item.quantity) }"
          @click="goToDetail(item.id)"
        >
          <!-- 顶部：名称 + 分类徽章 + 删除按钮 -->
          <div class="item-card-top">
            <div class="item-card-info">
              <span class="item-name">{{ item.name }}</span>
              <span class="item-category">{{ categoryName(item.categoryId) }}</span>
            </div>
            <button class="delete-btn" @click="handleDelete(item, $event)" title="删除">
              <el-icon :size="16"><Delete /></el-icon>
            </button>
          </div>
          <!-- 规格（若存在） -->
          <div v-if="item.spec" class="item-spec">{{ item.spec }}</div>
          <!-- 底部：数量 + 过期状态 -->
          <div class="item-card-bottom">
            <span class="item-qty">{{ item.quantity }}{{ item.unit }}</span>
            <span class="item-expiry" :style="{ color: getExpiryColor(item.expiryDate, item.quantity) }">
              <el-icon :size="14"><component :is="getExpiryIcon(item.expiryDate)" /></el-icon>
              {{ formatExpiry(item.expiryDate, item.quantity) }}
            </span>
          </div>
          <!-- 库存不足提示（仅在低库存时显示） -->
          <div v-if="isLowStock(item)" class="item-lowstock">库存不足！</div>
        </div>
      </div>

      <!-- 空状态：根据是否在筛选状态显示不同文案 -->
      <div v-else class="empty-state">
        <div class="empty-icon">
          <el-icon :size="48" color="#D4875A"><Box /></el-icon>
        </div>
        <h3 class="empty-title">{{ searchKeyword || selectedCategory ? '没有匹配的物资' : '暂无物资' }}</h3>
        <p class="empty-desc">{{ searchKeyword || selectedCategory ? '试试其他关键词或分类' : '点击右上角「添加物资」开始管理' }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：定义库存列表的视觉表现。
  整体采用"白底卡片 + 像素风厚边框 + 硬阴影"，
  每张物资卡片左侧用彩色边条快速传达过期状态。
  ============================================================
*/

/* 整页容器：撑满高度，扣除导航栏与底部标签栏 */
.page-content {
  position: relative;
  width: 100%;
  min-height: calc(100vh - var(--navbar-height) - var(--tabbar-height) - var(--spacing-md));
  background: linear-gradient(135deg, #FDF6F0 0%, #F8EDE0 25%, #F2E0D0 50%, #FDF6F0 100%);
}

/* 装饰背景层 */
.bg-decoration {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

/* 光晕通用样式 */
.bg-orb {
  position: absolute;
  border-radius: 0;
  filter: blur(64px);
  opacity: 0.25;
}

/* 右上角光晕 */
.bg-orb--1 {
  width: 300px;
  height: 300px;
  background: radial-gradient(circle, rgba(212, 135, 90, 0.35), transparent);
  top: -80px;
  right: -60px;
}

/* 左下角光晕 */
.bg-orb--2 {
  width: 240px;
  height: 240px;
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
  background-size: 16px 16px;
}

/* 网格颗粒叠层 */
.bg-grid::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(180, 150, 130, 0.08) 1px, transparent 1px);
  background-size: 4px 4px;
}

/* 内容容器：限宽居中 */
.page-content-inner {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: var(--content-padding-y) var(--content-padding-x);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

/* 顶栏 */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 页面标题 */
.page-title {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-2xl);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin: 0;
}

/* 主题色操作按钮（添加物资） */
.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--color-primary);
  color: #FFFFFF;
  border: 3px solid var(--pixel-border);
  cursor: pointer;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  box-shadow: 4px 4px 0 0 rgba(45, 34, 28, 0.5);
  transition: all var(--transition-fast);
}

.action-btn:hover {
  background: var(--color-primary-dark);
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 0 rgba(45, 34, 28, 0.5);
}

.action-btn:active {
  transform: translate(4px, 4px);
  box-shadow: 0 0 0 0 rgba(45, 34, 28, 0.5);
}

/* 分类标签栏：横向滚动 */
.category-tabs {
  display: flex;
  gap: var(--spacing-sm);
  overflow-x: auto;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
}

/* 单个分类 tab */
.cat-tab {
  flex-shrink: 0;
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.88);
  border: 2px solid var(--pixel-border);
  cursor: pointer;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.25);
  transition: all var(--transition-fast);
}

.cat-tab:hover:not(.cat-tab--active) {
  color: var(--color-primary);
  transform: translate(-1px, -1px);
}

/* 激活的 tab：主色实底 */
.cat-tab--active {
  background: var(--color-primary);
  color: #FFFFFF;
  box-shadow: 3px 3px 0 0 rgba(45, 34, 28, 0.4);
}

/* 工具栏：搜索框 + 排序按钮组 */
.toolbar {
  display: flex;
  gap: var(--spacing-sm);
  align-items: center;
}

/* 搜索框容器：占据剩余空间 */
.search-wrapper {
  flex: 1;
  min-width: 0;
}

/* 输入框外壳样式 */
:deep(.el-input__wrapper) {
  background: #FFFFFF;
  border: 2px solid var(--pixel-border);
  box-shadow: 3px 3px 0 0 rgba(107, 93, 85, 0.25);
  transition: all var(--transition-fast);
  padding: 4px 12px;
}

:deep(.el-input__wrapper:hover) {
  border-color: var(--color-primary);
  box-shadow: 4px 4px 0 0 rgba(107, 93, 85, 0.3);
  transform: translate(-1px, -1px);
}

:deep(.el-input__wrapper.is-focus) {
  border-color: var(--color-primary);
  box-shadow: 4px 4px 0 0 rgba(212, 135, 90, 0.35);
  background: #FFFDFB;
  transform: translate(-1px, -1px);
}

:deep(.el-input__inner) {
  font-family: var(--font-family-pixel);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 排序按钮组 */
.sort-group {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

/* 单个排序按钮 */
.sort-btn {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.88);
  border: 2px solid var(--pixel-border);
  cursor: pointer;
  color: var(--color-text-secondary);
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.2);
  transition: all var(--transition-fast);
}

.sort-btn:hover:not(.sort-btn--active):not(.sort-btn--desc) {
  color: var(--color-primary);
  transform: translate(-1px, -1px);
}

/* 升序激活态 */
.sort-btn--active {
  color: var(--color-primary);
  background: rgba(212, 135, 90, 0.1);
  border-color: var(--color-primary);
}

/* 降序激活态：主色实底 */
.sort-btn--desc {
  background: var(--color-primary);
  color: #FFFFFF;
  border-color: var(--color-primary);
}

/* 升降序箭头 */
.sort-arrow {
  font-family: var(--font-family-pixel);
  font-size: 11px;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 物资列表容器 */
.item-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

/* 物资卡片：白底厚边 + 左侧彩色条（代表过期状态） */
.item-card {
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  border-left: 4px solid var(--color-success);
  box-shadow: 5px 5px 0 0 rgba(139, 115, 85, 0.4);
  padding: var(--spacing-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}

/* 卡片颗粒叠层 */
.item-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

/* 卡片悬浮：上抬 */
.item-card:hover {
  transform: translate(-2px, -2px);
  box-shadow: 7px 7px 0 0 rgba(139, 115, 85, 0.4);
}

/* 卡片按下：下沉 */
.item-card:active {
  transform: translate(2px, 2px);
  box-shadow: 3px 3px 0 0 rgba(139, 115, 85, 0.4);
}

/* 卡片顶部：名称 + 分类 + 删除按钮 */
.item-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 6px;
}

/* 名称与分类的左侧块 */
.item-card-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
}

/* 物资名称 */
.item-name {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-normal);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 分类徽章 */
.item-category {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: #FFFFFF;
  background: var(--color-primary);
  padding: 1px 8px;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  flex-shrink: 0;
}

/* 删除按钮 */
.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  background: none;
  border: 2px solid var(--color-border);
  color: var(--color-text-placeholder);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.15);
}

.delete-btn:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 0 rgba(209, 75, 75, 0.25);
}

.delete-btn:active {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 0 rgba(209, 75, 75, 0.2);
}

/* 卡片底部行 */
.item-card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

/* 规格胶囊 */
.item-spec {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin: 2px 0 6px;
  padding: 2px 6px;
  background: rgba(212, 135, 90, 0.08);
  border-left: 2px solid var(--color-border-lighter);
  display: inline-block;
}

/* 数量文字 */
.item-qty {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 过期状态文字 + 图标 */
.item-expiry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  flex-shrink: 0;
}

/* 库存不足红字提示 */
.item-lowstock {
  margin-top: 6px;
  padding-top: 6px;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-danger);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  border-top: 1px dashed rgba(209, 75, 75, 0.25);
}

/* 空状态卡片 */
.empty-state {
  text-align: center;
  padding: var(--spacing-3xl) var(--spacing-xl);
  background: rgba(255, 255, 255, 0.88);
  border: 3px solid var(--pixel-border);
  box-shadow: 6px 6px 0 0 rgba(139, 115, 85, 0.35);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  position: relative;
}

/* 空状态颗粒叠层 */
.empty-state::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

/* 空状态图标框 */
.empty-icon {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(212, 135, 90, 0.1);
  border: 3px solid var(--pixel-border);
  box-shadow: 4px 4px 0 0 rgba(107, 93, 85, 0.3);
}

/* 空状态主标题 */
.empty-title {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin: 0;
}

/* 空状态描述文字 */
.empty-desc {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin: 0;
  max-width: 320px;
  line-height: 1.6;
}
</style>
