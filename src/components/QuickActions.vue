<!--
  ============================================================
  组件说明：快捷操作 QuickActions
  首页右下角的"快捷入口"组件，提供 4 个常用入口按钮：
    · 添加物资 → 跳到新增页
    · 库存清单 → 跳到库存管理页
    · 补货清单 → 跳到补货清单页
    · 统计报表 → 跳到统计报表页
  本组件不接收任何 props，内部维护按钮配置表后自行处理跳转。
  ============================================================
-->

<script setup>
/*
  ============================================================
  脚本区：定义按钮配置表与跳转处理函数。
  ============================================================
*/

import { useRouter } from 'vue-router'
import { Plus, List, ShoppingCart, DataLine } from '@element-plus/icons-vue'

// 路由对象：用于跳转
const router = useRouter()

// 按钮配置表：label / 图标 / 跳转路径 / 颜色
// 修改这里就能调整按钮顺序、文案或新增/删除入口
const actions = [
  { label: '添加物资', icon: Plus, path: '/inventory/add', color: 'var(--color-primary)' },
  { label: '库存清单', icon: List, path: '/inventory', color: 'var(--color-primary-dark)' },
  { label: '补货清单', icon: ShoppingCart, path: '/shopping', color: 'var(--color-accent)' },
  { label: '统计报表', icon: DataLine, path: '/statistics', color: 'var(--color-success)' }
]

// 点击按钮时跳转到对应路由
function handleAction(action) {
  router.push(action.path)
}
</script>

<template>
  <!--
    ============================================================
    模板区：4 个按钮以 2×2 栅格排列。
    每个按钮纵向显示"图标 + 文字"，颜色由配置表动态注入。
    ============================================================
  -->
  <div class="quick-actions">
    <button
      v-for="action in actions"
      :key="action.label"
      class="action-btn"
      :style="{ '--btn-color': action.color }"
      @click="handleAction(action)"
    >
      <!-- 图标方框：颜色用 CSS 变量 --btn-color 注入 -->
      <div class="action-btn-icon">
        <el-icon :size="24">
          <component :is="action.icon" />
        </el-icon>
      </div>
      <!-- 按钮文字 -->
      <span class="action-btn-label">{{ action.label }}</span>
    </button>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：定义快捷操作组件的视觉表现。
  按钮以 2 列栅格排列，与项目其他像素风卡片视觉一致。
  ============================================================
*/

/* 容器：2 列栅格 */
.quick-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
}

/* 按钮主体：纵向居中排列图标与文字 */
.action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-lg) var(--spacing-md);
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 4px 4px 0 0 rgba(139, 115, 85, 0.35);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  color: var(--color-text-primary);
}

/* 按钮颗粒叠层 */
.action-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

/* 悬浮：上抬 */
.action-btn:hover {
  transform: translate(-2px, -2px);
  box-shadow: 6px 6px 0 0 rgba(139, 115, 85, 0.35);
}

/* 按下：下沉 */
.action-btn:active {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 0 rgba(139, 115, 85, 0.35);
}

/* 图标方框：颜色由配置表通过 --btn-color 注入 */
.action-btn-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--pixel-border);
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.25);
  color: var(--btn-color);
}

/* 按钮文字 */
.action-btn-label {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}
</style>
