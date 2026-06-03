<!--
  ============================================================
  组件说明：统计卡片 StatCard
  通用的"数字 + 图标 + 标签"展示卡片，用于在首页与统计页
  顶部并排显示总数、即将过期数、库存不足数、待补货数等关键数字。
  支持点击跳转到指定路由。
  ============================================================
-->

<script setup>
/*
  ============================================================
  脚本区：声明组件接收的 props（外部传入参数）。
  组件本身没有内部状态，纯展示型。
  ============================================================
*/

// 接收的属性：
//   icon  ：要显示的图标组件
//   value ：中间显示的数字或文本
//   label ：底部的说明文字（如"总物资"）
//   color ：图标颜色（带边框时也作为边框色）
//   to    ：点击卡片要跳转到的路由路径，空字符串表示不跳转
defineProps({
  icon: { type: [String, Object], required: true },
  value: { type: [Number, String], default: 0 },
  label: { type: String, required: true },
  color: { type: String, default: 'var(--color-primary)' },
  to: { type: String, default: '' }
})
</script>

<template>
  <!--
    ============================================================
    模板区：卡片结构为"左侧图标方框 + 右侧数字与标签"。
    点击时若提供了 to 属性则跳转到对应路由。
    ============================================================
  -->
  <div class="stat-card" @click="to && $router.push(to)">
    <!-- 图标方框：颜色与边框色都跟随 props.color -->
    <div class="stat-card-icon" :style="{ color, borderColor: color }">
      <el-icon :size="24">
        <component :is="icon" />
      </el-icon>
    </div>
    <!-- 右侧文字区：数字 + 标签 -->
    <div class="stat-card-body">
      <span class="stat-card-value">{{ value }}</span>
      <span class="stat-card-label">{{ label }}</span>
    </div>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：定义统计卡片的视觉表现。
  采用白底厚边 + 硬阴影的像素风；悬浮上抬，按下下沉。
  ============================================================
*/

/* 卡片主体：横向排列图标与文字 */
.stat-card {
  flex: 1;
  min-width: 0;
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 5px 5px 0 0 rgba(139, 115, 85, 0.4);
  padding: var(--spacing-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  transition: all var(--transition-fast);
  position: relative;
  cursor: pointer;
}

/* 卡片表面颗粒质感叠层 */
.stat-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

/* 悬浮：上抬，阴影加深 */
.stat-card:hover {
  transform: translate(-2px, -2px);
  box-shadow: 7px 7px 0 0 rgba(139, 115, 85, 0.4);
}

/* 按下：下沉，阴影缩短 */
.stat-card:active {
  transform: translate(2px, 2px);
  box-shadow: 3px 3px 0 0 rgba(139, 115, 85, 0.4);
}

/* 图标方框 */
.stat-card-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--pixel-border);
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.25);
}

/* 文字区：纵向排列大数字与小标签 */
.stat-card-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* 大数字 */
.stat-card-value {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-normal);
  color: var(--color-text-primary);
  line-height: 1;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 标签文字 */
.stat-card-label {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}
</style>
