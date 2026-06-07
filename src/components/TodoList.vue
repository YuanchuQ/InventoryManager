<!--
  ============================================================
  组件说明：待办清单 TodoList
  用于首页"待采购清单"等场景的待办列表展示。
  每条左侧为可点击的勾选框；点击勾选框切换"已完成"状态，
  点击条目其他位置则跳到详细的待办管理页。
  对外两个事件：
    · @mark  ：点击勾选框时触发，参数为该条数据
    · @click ：点击条目时触发，参数为该条数据
  ============================================================
-->

<script setup>
/*
  ============================================================
  脚本区：纯展示型组件，只声明 props 与 emits。
  ============================================================
*/

// 接收的属性：items 是父组件传入的待办数组
// 每条至少包含 id、name、quantity、unit、isPurchased
defineProps({
  items: { type: Array, default: () => [] }
})

// 对外事件：
//   mark  → 用户点击勾选框（切换已完成状态）
//   click → 用户点击条目其他区域（跳转到详情页）
defineEmits(['mark', 'click'])
</script>

<template>
  <!--
    ============================================================
    模板区：纵向待办列表，空列表时显示占位文字。
    ============================================================
  -->
  <div class="todo-list">
    <div
      v-for="item in items"
      :key="item.id"
      class="todo-item"
      @click="$emit('click', item)"
    >
      <!-- 勾选框：.stop 阻止冒泡，避免触发外层 click 事件 -->
      <button
        class="todo-checkbox"
        :class="{ 'todo-checkbox--checked': item.isPurchased }"
        @click.stop="$emit('mark', item)"
      >
        <span v-if="item.isPurchased" class="todo-checkmark">✓</span>
      </button>
      <!-- 主体：名称 + 数量；已完成的名称加删除线 -->
      <div class="todo-body">
        <span class="todo-name" :class="{ 'todo-name--done': item.isPurchased }">
          {{ item.name }}
        </span>
        <span class="todo-qty" v-if="item.quantity">
          {{ item.quantity }}{{ item.unit }}
        </span>
      </div>
    </div>
    <!-- 空状态占位 -->
    <div v-if="items.length === 0" class="todo-empty">
      暂无待办事项
    </div>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：定义待办清单的视觉表现。
  与预警列表保持一致的卡片风格，统一项目像素风视觉。
  ============================================================
*/

/* 列表容器：纵向排列 */
.todo-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

/* 单条待办卡片 */
.todo-item {
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
.todo-item::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.05) 1px, transparent 1px);
  background-size: 4px 4px;
}

/* 悬浮：上抬 */
.todo-item:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 0 rgba(139, 115, 85, 0.35);
}

/* 按下：下沉 */
.todo-item:active {
  transform: translate(1px, 1px);
  box-shadow: 2px 2px 0 0 rgba(139, 115, 85, 0.3);
}

/* 勾选框（圆角方框） */
.todo-checkbox {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--pixel-border);
  background: #FFFFFF;
  cursor: pointer;
  box-shadow: 1px 1px 0 0 rgba(107, 93, 85, 0.2);
  transition: all var(--transition-fast);
}

.todo-checkbox:hover {
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.3);
}

/* 勾选后样式：成功色实底 */
.todo-checkbox--checked {
  background: var(--color-success);
  border-color: var(--color-success);
}

/* 对勾符号 */
.todo-checkmark {
  color: #FFFFFF;
  font-size: 14px;
  font-weight: bold;
}

/* 主体：名称 + 数量横向排列 */
.todo-body {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
}

/* 名称文字 */
.todo-name {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 已完成：加删除线 + 颜色变淡 */
.todo-name--done {
  text-decoration: line-through;
  color: var(--color-text-placeholder);
}

/* 数量文字：右对齐 */
.todo-qty {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin-left: auto;
  flex-shrink: 0;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 空状态占位 */
.todo-empty {
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
