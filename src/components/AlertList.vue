<!--
  ============================================================
  组件说明：预警列表 AlertList
  用于首页"预警提醒"区块的列表展示，承载三类预警：
    · expired   ：已过期（红色边条 + 红色图标）
    · expiring  ：即将过期（黄色边条 + 黄色图标）
    · lowstock  ：库存不足（黄色边条）
  数据从父组件以 props.items 传入，每条点击会向上抛出
  item-click 事件，由父组件负责跳转到对应物资详情页。
  ============================================================
-->

<script setup>
/*
  ============================================================
  脚本区：仅声明 props 与 emits，无内部业务逻辑。
  ============================================================
*/

import { WarningFilled, CircleCloseFilled } from '@element-plus/icons-vue'

// 接收的属性：
//   items 是已经过父组件加工好的预警数组，
//   每个元素至少包含 id、name、_alertType（'expired'/'expiring'/'lowstock'）、_days
defineProps({
  items: { type: Array, default: () => [] }
})

// 对外事件：item-click —— 用户点击某条预警时触发
defineEmits(['item-click'])
</script>

<template>
  <!--
    ============================================================
    模板区：纵向列表，每条预警一行。空列表时显示占位文字。
    ============================================================
  -->
  <div class="alert-list">
    <div
      v-for="item in items"
      :key="item.id"
      class="alert-item"
      :class="[item._alertType === 'expired' ? 'alert-item--danger' : 'alert-item--warning']"
      @click="$emit('item-click', item)"
    >
      <!-- 左侧图标：已过期用红色圆叉，其余用黄色感叹号 -->
      <div class="alert-item-icon">
        <el-icon :size="18">
          <CircleCloseFilled v-if="item._alertType === 'expired'" />
          <WarningFilled v-else />
        </el-icon>
      </div>
      <!-- 中间文字：名称 + 描述（按类型动态展示） -->
      <div class="alert-item-body">
        <span class="alert-item-name">{{ item.name }}</span>
        <span class="alert-item-desc">
          <template v-if="item._alertType === 'expired'">已过期 {{ item._days }} 天</template>
          <template v-else-if="item._alertType === 'expiring'">{{ item._days }} 天后过期</template>
          <template v-else-if="item._alertType === 'lowstock'">库存不足 ({{ item.quantity }}{{ item.unit }})</template>
        </span>
      </div>
      <!-- 右侧操作图标：默认隐藏，悬浮时显示 -->
      <div class="alert-item-action">
        <el-icon :size="16"><WarningFilled /></el-icon>
      </div>
    </div>
    <!-- 空状态占位 -->
    <div v-if="items.length === 0" class="alert-empty">
      暂无预警
    </div>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：定义预警列表的视觉表现。
  采用白底厚边卡片 + 左侧彩色边条（按类型上色）。
  ============================================================
*/

/* 列表容器：纵向排列 */
.alert-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

/* 单条预警卡片 */
.alert-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: rgba(255, 255, 255, 0.92);
  border: 2px solid var(--pixel-border);
  box-shadow: 3px 3px 0 0 rgba(139, 115, 85, 0.3);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}

/* 卡片颗粒叠层 */
.alert-item::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.05) 1px, transparent 1px);
  background-size: 4px 4px;
}

/* 悬浮：上抬 */
.alert-item:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 0 rgba(139, 115, 85, 0.35);
}

/* 按下：下沉 */
.alert-item:active {
  transform: translate(1px, 1px);
  box-shadow: 2px 2px 0 0 rgba(139, 115, 85, 0.3);
}

/* 已过期图标：红色 */
.alert-item--danger .alert-item-icon {
  color: var(--color-danger);
}

/* 即将过期 / 库存不足图标：黄色 */
.alert-item--warning .alert-item-icon {
  color: var(--color-warning);
}

/* 已过期卡片左侧红边 */
.alert-item--danger {
  border-left: 4px solid var(--color-danger);
}

/* 即将过期 / 库存不足卡片左侧黄边 */
.alert-item--warning {
  border-left: 4px solid var(--color-warning);
}

/* 中间文字区 */
.alert-item-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* 物资名称 */
.alert-item-name {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 预警描述文字 */
.alert-item-desc {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 右侧操作图标：默认透明，悬浮时显现 */
.alert-item-action {
  color: var(--color-text-placeholder);
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.alert-item:hover .alert-item-action {
  opacity: 1;
}

/* 空状态占位 */
.alert-empty {
  text-align: center;
  padding: var(--spacing-lg);
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-placeholder);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  border: 2px dashed var(--color-border-light);
}
</style>
