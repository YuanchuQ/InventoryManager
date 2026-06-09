<!--
  ============================================================
  页面说明：操作历史
  集中展示家庭物资在系统中产生的所有操作记录，
  按时间倒序排列。支持按操作类型筛选：
    · 全部记录
    · 丢弃（红色徽章）
    · 补货（绿色徽章）
    · 使用（金色徽章）
  每条记录包含：操作类型、物资名、数量、操作者、时间、备注。
  顶部提供"清空记录"按钮，一键清除所有历史。
  ============================================================
-->

<script setup>
/*
  ============================================================
  脚本区：负责操作历史的展示与筛选。
  主要工作：
    1. 维护当前筛选类型（all / discard / restock / use）
    2. 提供操作类型 → 文案、颜色的映射，便于模板渲染
    3. 提供时间格式化与一键清空
  数据本身全部来自 historyStore，本页只负责"看"。
  ============================================================
*/

import { ref, computed } from 'vue'
// 操作历史数据源
import { useHistoryStore } from '@/stores/history'
import { Delete, Timer, User } from '@element-plus/icons-vue'

const historyStore = useHistoryStore()

// 类型筛选：all / discard / restock / use
const activeType = ref('all')

// 筛选 tab 配置
const typeOptions = [
  { label: '全部记录', value: 'all' },
  { label: '丢弃',     value: 'discard' },
  { label: '补货',     value: 'restock' },
  { label: '使用',     value: 'use' }
]

// 操作类型 → 中文文案
const typeLabels = {
  discard: '丢弃',
  restock: '补货',
  use: '使用'
}

// 操作类型 → 配色
const typeColors = {
  discard: '#F56C6C',
  restock: '#67C23A',
  use: '#E6A23C'
}

// 根据筛选类型派生最终展示的记录列表
const filteredRecords = computed(() => {
  if (activeType.value === 'all') return historyStore.records
  return historyStore.records.filter(r => r.type === activeType.value)
})

/** 格式化时间戳为本地可读格式 */
// 输入：ISO 字符串；输出：YYYY-MM-DD HH:MM
function formatTime(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 清空所有历史记录
function handleClear() {
  historyStore.clearAllRecords()
}
</script>

<template>
  <!--
    ============================================================
    模板区：决定操作历史页的视觉结构，由以下几部分组成：
      1. 装饰背景层
      2. 顶部（标题 + 清空按钮）
      3. 筛选栏（4 个 tab + 记录总数）
      4. 记录列表（每条左侧为操作类型徽章 + 物资信息）
      5. 空状态占位
    ============================================================
  -->
  <div class="history-page">
    <div class="bg-decoration">
      <div class="bg-orb bg-orb--1" />   <!-- 右上角光晕 -->
      <div class="bg-orb bg-orb--2" />   <!-- 左下角光晕 -->
      <div class="bg-grid" />            <!-- 像素风网格 -->
    </div>

    <div class="history-content">
      <!-- 顶部：标题 + 副标题 + 清空按钮 -->
      <div class="page-top">
        <div>
          <h1 class="page-title">操作历史</h1>
          <p class="page-subtitle">查看所有操作记录</p>
        </div>
        <!-- 无记录时按钮禁用 -->
        <button
          class="clear-btn"
          :disabled="historyStore.records.length === 0"
          @click="handleClear"
        >
          <el-icon :size="16"><Delete /></el-icon>
          <span>清空记录</span>
        </button>
      </div>

      <!-- 筛选标签 -->
      <div class="filter-bar">
        <div class="filter-tabs">
          <button
            v-for="opt in typeOptions"
            :key="opt.value"
            class="filter-tab"
            :class="{ 'filter-tab--active': activeType === opt.value }"
            @click="activeType = opt.value"
          >
            {{ opt.label }}
          </button>
        </div>
        <span class="record-count">共 {{ filteredRecords.length }} 条记录</span>
      </div>

      <!-- 记录列表 -->
      <div class="record-list" v-if="filteredRecords.length > 0">
        <div
          v-for="record in filteredRecords"
          :key="record.id"
          class="record-card"
        >
          <div class="record-left">
            <!-- 操作类型徽章：颜色按类型动态绑定 -->
            <span
              class="record-type-badge"
              :style="{
                background: typeColors[record.type] + '22',
                color: typeColors[record.type],
                borderColor: typeColors[record.type]
              }"
            >
              {{ typeLabels[record.type] }}
            </span>
            <div class="record-info">
              <!-- 物资名 + 数量 -->
              <div class="record-name-row">
                <span class="record-name">{{ record.itemName }}</span>
                <span class="record-qty">{{ record.quantity }} {{ record.unit }}</span>
              </div>
              <!-- 操作者 + 时间 + 备注 -->
              <div class="record-meta-row">
                <span class="record-operator-badge">
                  <el-icon :size="12"><User /></el-icon>
                  <span class="record-operator-text">{{ record.operator || '未知用户' }}</span>
                </span>
                <span class="record-time">{{ formatTime(record.timestamp) }}</span>
                <span class="record-note" v-if="record.note">{{ record.note }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <div class="empty-icon">
          <el-icon :size="48" color="#D4875A"><Timer /></el-icon>
        </div>
        <h3 class="empty-title">暂无历史记录</h3>
        <p class="empty-desc">操作记录会在这里显示</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：定义操作历史页的视觉表现。
  采用与库存列表相似的卡片堆叠风格；
  每条记录通过左侧的彩色徽章一眼区分操作类型。
  ============================================================
*/

.history-page {
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

/* 光晕通用样式 */
.bg-orb {
  position: absolute;
  border-radius: 0;
  filter: blur(64px);
  opacity: 0.25;
}

/* 右上角光晕 */
.bg-orb--1 {
  width: 360px;
  height: 360px;
  background: radial-gradient(circle, rgba(212, 135, 90, 0.35), transparent);
  top: -80px;
  right: -60px;
}

/* 左下角光晕 */
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

/* ===== 主内容 ===== */
/* 内容层：限宽居中，纵向排列 */
.history-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
  padding: var(--content-padding-y) var(--content-padding-x);
  max-width: var(--content-max-width);
  margin: 0 auto;
  width: 100%;
}

/* ===== 顶部 ===== */
/* 顶部：标题 + 清空按钮，两端对齐 */
.page-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-top: var(--spacing-xs);
}

/* 主标题 */
.page-title {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-2xl);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin-bottom: var(--spacing-xs);
}

/* 副标题 */
.page-subtitle {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 清空按钮 ===== */
/* 清空按钮：白底红字红边，悬浮变实底红 */
.clear-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--color-danger);
  border: 3px solid var(--color-danger);
  cursor: pointer;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  box-shadow: 4px 4px 0 0 rgba(209, 75, 75, 0.4);
  transition: all var(--transition-fast);
}

.clear-btn:hover:not(:disabled) {
  background: var(--color-danger);
  color: #FFFFFF;
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 0 rgba(209, 75, 75, 0.4);
}

.clear-btn:active:not(:disabled) {
  transform: translate(4px, 4px);
  box-shadow: 0 0 0 0 rgba(209, 75, 75, 0.4);
}

/* 禁用态：半透明 */
.clear-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ===== 筛选栏 ===== */
/* 筛选栏：左 tab 组 + 右记录总数 */
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
}

/* tab 组：横向滚动 */
.filter-tabs {
  display: flex;
  gap: var(--spacing-sm);
  overflow-x: auto;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
}

/* 单个筛选 tab */
.filter-tab {
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

.filter-tab:hover:not(.filter-tab--active) {
  color: var(--color-primary);
  transform: translate(-1px, -1px);
}

/* 激活的 tab：主色实底 */
.filter-tab--active {
  background: var(--color-primary);
  color: #FFFFFF;
  box-shadow: 3px 3px 0 0 rgba(45, 34, 28, 0.4);
}

/* 记录总数文字 */
.record-count {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  flex-shrink: 0;
}

/* ===== 记录列表 ===== */
.record-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

/* 单条记录卡片 */
.record-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 5px 5px 0 0 rgba(139, 115, 85, 0.4);
  padding: var(--spacing-md);
  transition: all var(--transition-fast);
  position: relative;
}

/* 卡片颗粒叠层 */
.record-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

.record-card:hover {
  transform: translate(-2px, -2px);
  box-shadow: 7px 7px 0 0 rgba(139, 115, 85, 0.4);
}

.record-card:active {
  transform: translate(2px, 2px);
  box-shadow: 3px 3px 0 0 rgba(139, 115, 85, 0.4);
}

/* 卡片左侧主体（占据剩余宽度） */
.record-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
  flex: 1;
  position: relative;
  z-index: 1;
}

/* 操作类型徽章 */
.record-type-badge {
  font-family: var(--font-family-pixel);
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border: 2px solid;
  flex-shrink: 0;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 记录信息：纵向排列两行 */
.record-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

/* 物资名行 */
.record-name-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

/* 物资名 */
.record-name {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 数量 */
.record-qty {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-accent);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 元信息行：操作者 + 时间 + 备注 */
.record-meta-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

/* 操作者徽章 */
.record-operator-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  font-weight: 700;
  color: #FFFFFF;
  background: var(--color-primary);
  border: 2px solid var(--pixel-border);
  padding: 2px 8px;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  box-shadow: 2px 2px 0 0 rgba(45, 34, 28, 0.4);
  position: relative;
  z-index: 1;
}

.record-operator-text {
  line-height: 1;
}

/* 卡片右侧（保留旧布局位） */
.record-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

/* 时间文字 */
.record-time {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-placeholder);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 备注文字 */
.record-note {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 空状态 ===== */
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
