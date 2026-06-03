<!--
  ============================================================
  组件说明：全局应用布局 AppLayout
  整套系统的"骨架"组件，包裹所有登录后页面。负责提供：
    1. 左侧固定侧边栏（品牌区 + 导航菜单 + 版本号）
    2. 顶部固定栏（当前页面标题 + 日期）
    3. 中部主内容区（通过 <slot /> 渲染当前路由对应页面）
  登录 / 注册等 requiresAuth=false 的页面会进入"裸模式"，
  不显示侧边栏与顶栏，仅显示页面本身。
  ============================================================
-->

<script setup>
/*
  ============================================================
  脚本区：维护导航菜单配置、当前激活路径与跳转处理。
  ============================================================
*/

import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  HomeFilled,
  Box,
  ShoppingCart,
  DataAnalysis,
  Setting,
  Box as BoxIcon,
  Grid,
  UserFilled,
  Timer
} from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()

// 是否为需要登录的页面（默认要登录；仅登录/注册等显式 requiresAuth=false 会进入裸模式）
const isAuthPage = computed(() => route.meta.requiresAuth !== false)

// 侧边栏导航菜单配置：name / 文案 / 图标 / 跳转路径
// 调整顺序或新增菜单项只需修改本数组
const navItems = [
  { name: 'Dashboard', label: '仪表盘', icon: HomeFilled, path: '/dashboard' },
  { name: 'InventoryList', label: '库存管理', icon: Box, path: '/inventory' },
  { name: 'DragManage', label: '拖拽管理', icon: Grid, path: '/drag' },
  { name: 'ShoppingList', label: '补货清单', icon: ShoppingCart, path: '/shopping' },
  { name: 'History', label: '操作历史', icon: Timer, path: '/history' },
  { name: 'Family', label: '家庭管理', icon: UserFilled, path: '/family' },
  { name: 'Statistics', label: '统计报表', icon: DataAnalysis, path: '/statistics' },
  { name: 'Settings', label: '系统设置', icon: Setting, path: '/settings' }
]

// 当前路由路径（用于判断哪个菜单项处于激活态）
const activePath = computed(() => route.path)

// 点击菜单跳转；当前路径相同时跳过，避免重复跳转
function handleNav(item) {
  if (route.path !== item.path) {
    router.push(item.path)
  }
}
</script>

<template>
  <!--
    ============================================================
    模板区：整页骨架。结构分两部分：
      1. 左侧侧边栏（aside）—— 仅 isAuthPage 为 true 时显示
      2. 右侧主区（layout-main）—— 顶栏 + 主内容
    主内容通过 <slot /> 占位，由路由对应的页面组件填充。
    ============================================================
  -->
  <div class="app-layout" :class="{ 'app-layout--bare': !isAuthPage }">
    <!-- 侧边栏：仅登录后页面显示 -->
    <aside v-if="isAuthPage" class="sidebar">
      <!-- 品牌区：Logo + 标题 + 副标题 -->
      <div class="sidebar-brand">
        <div class="brand-icon">
          <el-icon :size="22" color="#D4875A"><BoxIcon /></el-icon>
        </div>
        <div class="brand-text">
          <span class="brand-title">库存管家</span>
          <span class="brand-subtitle">家庭物资管理</span>
        </div>
      </div>

      <!-- 导航菜单：当前路径以菜单项 path 开头时高亮 -->
      <nav class="sidebar-nav">
        <button
          v-for="item in navItems"
          :key="item.name"
          class="nav-item"
          :class="{ 'nav-item--active': activePath.startsWith(item.path) }"
          @click="handleNav(item)"
        >
          <el-icon :size="20" class="nav-icon">
            <component :is="item.icon" />
          </el-icon>
          <span class="nav-label">{{ item.label }}</span>
        </button>
      </nav>

      <!-- 侧边栏底部：版本号 -->
      <div class="sidebar-footer">
        <span class="footer-version">v1.0 · 桌面端</span>
      </div>
    </aside>

    <!-- 右侧：顶栏 + 主内容 -->
    <div class="layout-main">
      <!-- 顶栏：显示当前页面标题（来自路由 meta.title）+ 日期 -->
      <header v-if="isAuthPage" class="top-bar">
        <div class="top-bar-inner">
          <div class="top-bar-left">
            <span class="page-breadcrumb">{{ $route.meta.title || '页面' }}</span>
          </div>
          <div class="top-bar-right">
            <span class="top-bar-time">{{ new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }) }}</span>
          </div>
        </div>
      </header>

      <!-- 主内容区：由路由对应的页面组件通过 <slot /> 渲染 -->
      <main class="main-content" :class="{ 'main-content--bare': !isAuthPage }">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：定义整体布局与侧边栏 / 顶栏的视觉表现。
  采用"左固定 + 右可滚"的桌面端经典布局。
  ============================================================
*/

/* ===== 总布局：侧边栏 + 右侧主区域 ===== */
/* 整页骨架：左右两栏，铺满视口 */
.app-layout {
  display: flex;
  min-height: 100vh;
  background: linear-gradient(135deg, #FDF6F0 0%, #F8EDE0 50%, #FDF6F0 100%);
}

/* 右侧主区：占据剩余宽度 */
.layout-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* ===== 侧边栏 ===== */
/* 侧边栏：固定宽度，sticky 跟随滚动 */
.sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.95);
  border-right: 3px solid var(--pixel-border);
  box-shadow: 4px 0 0 0 rgba(107, 93, 85, 0.15);
  display: flex;
  flex-direction: column;
  position: sticky;
  top: 0;
  height: 100vh;
  z-index: 50;
}

/* 品牌区：图标 + 标题，下方有虚线分隔 */
.sidebar-brand {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg) var(--spacing-md);
  border-bottom: 2px solid var(--color-border-light);
}

/* 品牌图标框 */
.brand-icon {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.95);
  border: 2px solid var(--pixel-border);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 3px 3px 0 0 rgba(107, 93, 85, 0.35);
  flex-shrink: 0;
}

/* 品牌文字区 */
.brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* 品牌主标题 */
.brand-title {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-md);
  font-weight: 700;
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  line-height: 1.2;
}

/* 品牌副标题 */
.brand-subtitle {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  line-height: 1.2;
}

/* 导航菜单容器：占据剩余高度，纵向排列 */
.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: var(--spacing-md) var(--spacing-sm);
  gap: var(--spacing-xs);
}

/* 单个导航项 */
.nav-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 10px 12px;
  background: none;
  border: 2px solid transparent;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
  text-align: left;
  width: 100%;
  font-family: var(--font-family-pixel);
  font-weight: 700;
  font-size: var(--font-size-sm);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 导航项悬浮：浅橙底 + 主文色 */
.nav-item:hover {
  background: rgba(212, 135, 90, 0.08);
  border-color: var(--color-border-light);
  color: var(--color-text-primary);
}

/* 激活态：主色实底 + 像素阴影 */
.nav-item--active {
  background: var(--color-primary);
  border-color: var(--pixel-border);
  color: #FFFFFF;
  box-shadow: 3px 3px 0 0 rgba(45, 34, 28, 0.5);
}

/* 激活态悬浮：颜色加深 */
.nav-item--active:hover {
  background: var(--color-primary-dark);
  border-color: var(--pixel-border);
  color: #FFFFFF;
}

/* 导航图标 */
.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 导航文字 */
.nav-label {
  line-height: 1;
}

/* 侧边栏底部：版本号居中显示 */
.sidebar-footer {
  padding: var(--spacing-md);
  border-top: 2px solid var(--color-border-light);
  text-align: center;
}

/* 版本号文字 */
.footer-version {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-placeholder);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 顶栏 ===== */
/* 顶栏：sticky 固定在顶部，滚动时常驻 */
.top-bar {
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 3px solid var(--pixel-border);
  box-shadow: 0 3px 0 0 rgba(107, 93, 85, 0.15);
  position: sticky;
  top: 0;
  z-index: 40;
  flex-shrink: 0;
}

/* 顶栏内部：两端对齐 */
.top-bar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--navbar-height);
  padding: 0 var(--content-padding-x);
  max-width: 100%;
}

/* 页面面包屑（当前页面标题） */
.page-breadcrumb {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  letter-spacing: 0.04em;
}

/* 顶栏右侧的日期胶囊 */
.top-bar-time {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  padding: 4px 10px;
  background: rgba(212, 135, 90, 0.08);
  border: 2px solid var(--color-border-light);
}

/* ===== 主内容 ===== */
/* 主内容区：占据剩余空间 */
.main-content {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
}

/* 裸模式（登录/注册等）：去掉额外内边距 */
.main-content--bare {
  padding: 0;
}
</style>
