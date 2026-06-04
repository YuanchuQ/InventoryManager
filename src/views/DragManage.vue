<!--
  ============================================================
  页面说明：拖拽管理
  以"卡片拖动"的方式管理物资日常操作，相比传统按钮更直观。
  页面分为左右两栏：
    - 左侧：所有物资以卡片形式平铺，每张卡片均可拖动
    - 右侧：四个目标投放区
        · 丢弃区 —— 拖入后数量 -1，未过期会二次确认
        · 使用区 —— 拖入后数量 -1
        · 补货区 —— 拖入后数量 +1，并要求填写新批次过期日
        · 自定义区 —— 可指定动作（消耗/补货）与数量
  额外提供"浪费统计"面板，累计记录通过丢弃区处理的物资件数与金额。
  ============================================================
-->

<script setup>
/**
 * 物资卡片拖拽管理页
 * ---------------------------------------------------------------
 * ⚠️ 数据来源：与项目其它页面共用同一份全局物资数据
 *    所有读写均通过 src/utils/goodsStore.js 提供的统一 API：
 *      - getGoodsList()
 *      - addGoods / editGoods / delGoods
 *      - discardGoods（丢弃 / 使用：数量 -1）
 *      - restockGoods（补货：数量 +1，可同时刷新过期日期，避免新货沿用旧批次过期日）
 *      - subscribe()：跨页面订阅变更，保证新增/修改后立即同步
 *
 * 浪费计数为本页独立功能，单独保留在 localStorage:im_drag_waste_v1。
 */

/*
  ============================================================
  脚本区：负责拖拽交互、物资操作和浪费统计三块逻辑。
  主要工作：
    1. 维护拖拽过程中的 UI 状态（半透明卡片、高亮目标区）
    2. 监听物资数据源的变化，保持本页列表与全局同步
    3. 接住"放下"事件，按目标区类型执行对应业务操作
    4. 累计丢弃件数与金额，并持久化到本地
  ============================================================
*/

import { ref, computed, onMounted, onUnmounted } from 'vue'
// 引入消息提示与确认对话框
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Minus, Plus, Box, Operation } from '@element-plus/icons-vue'
// 通用工具：本地存储读写、过期状态计算
import { loadFromStorage, saveToStorage, getExpiryStatus } from '@/utils/constants'
// 全局物资数据源 API（与库存页、详情页等共享同一份数据）
import {
  getGoodsList,
  discardGoods,
  consumeGoods,
  restockGoods,
  subscribe
} from '@/utils/goodsStore'

// 浪费计数（独立 key，与全局物资数据无关）
const STORAGE_WASTE = 'im_drag_waste_v1'

// 拖拽中正在拖的物资 id（用于卡片半透明）
const draggingId = ref(null)
// 当前悬停的目标区域 data-zone（用于高亮边框）
const hoverZone = ref('')

// 自定义区状态
// - customAction: 拖入后要执行的动作（'consume' 消耗 / 'restock' 补货）
// - customAmount: 拖入后要变动的数量（>= 1）
const customAction = ref('consume') // 默认消耗（更安全，避免误增库存）
const customAmount = ref(1)

const items = ref([])        // 物资主列表（仅作 goodsStore 的响应式镜像）
const wasteCount = ref(0)    // 累计丢弃(浪费)件数
const wasteValue = ref(0)    // 累计丢弃(浪费)金额(元)

// 顶部统计
// 当前物资种类数
const totalCount = computed(() => items.value.length)
// 所有物资数量之和
const totalQty = computed(() => items.value.reduce((s, i) => s + (i.quantity || 0), 0))

// 浪费金额(用于统计面板展示,固定两位小数)
const wasteValueText = computed(() => wasteValue.value.toFixed(2))

/**
 * 计算一个物资的过期状态(返回 'danger' / 'warning' / 'safe')
 */
function itemExpiryStatus(item) {
  return getExpiryStatus(item.expiryDate)
}

// 订阅释放函数（取消订阅用）
let unsub = null

// 挂载时：加载全局物资 + 订阅后续变化 + 读取本地浪费计数
onMounted(() => {
  items.value = getGoodsList()
  // 订阅全局物资变更：任何页面新增 / 修改 / 删除后,本页自动同步
  unsub = subscribe((list) => { items.value = list })

  // 读取持久化的浪费计数
  const cachedWaste = loadFromStorage(STORAGE_WASTE, 0)
  // 兼容两种历史格式:
  //   - 旧版: 直接存数字 (件数)
  //   - 新版: { count: 件数, value: 金额 }
  if (cachedWaste && typeof cachedWaste === 'object') {
    wasteCount.value = Number(cachedWaste.count) || 0
    wasteValue.value = Number(cachedWaste.value) || 0
  } else {
    wasteCount.value = Number(cachedWaste) || 0
    wasteValue.value = 0
  }
})

// 卸载时：解除订阅，避免内存泄漏
onUnmounted(() => {
  if (typeof unsub === 'function') unsub()
})

// 将当前浪费计数写回本地存储
function persistWaste() {
  // 升级为对象结构,同时保存件数与金额
  saveToStorage(STORAGE_WASTE, {
    count: wasteCount.value,
    value: wasteValue.value
  })
}

// ====== 拖拽:卡片侧 ======
// 开始拖动时记录物资 id，并写入 DataTransfer 供放置时读取
function onDragStart(e, item) {
  draggingId.value = item.id
  e.dataTransfer.setData('text/plain', String(item.id))
  e.dataTransfer.effectAllowed = 'move'
}
// 结束拖动：清除所有视觉状态
function onDragEnd() {
  draggingId.value = null
  hoverZone.value = ''
}

// ====== 拖拽:目标区域侧 ======
// 拖动经过目标区：阻止默认行为以允许放置，记录高亮
function onDragOver(e, zone) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  hoverZone.value = zone
}
// 离开目标区：取消高亮
function onDragLeave(zone) {
  if (hoverZone.value === zone) hoverZone.value = ''
}

// 物资被放下：按目标区类型分发执行
async function onDrop(e, zone) {
  e.preventDefault()
  const id = e.dataTransfer.getData('text/plain')
  hoverZone.value = ''
  draggingId.value = null

  // 找出对应物资
  const item = items.value.find(i => String(i.id) === String(id))
  if (!item) return

  if (zone === 'trash') {
    // ===== 丢弃区 =====
    if (item.quantity <= 0) {
      ElMessage.warning(`「${item.name}」库存已为 0,无法再丢弃`)
      return
    }

    // 未过期的物资丢弃需二次确认，避免误操作
    const status = itemExpiryStatus(item)
    const isExpired = status === 'danger'
    if (!isExpired) {
      try {
        const tip = !item.expiryDate
          ? `「${item.name}」尚未过期,确认要丢弃 1 个吗?`
          : `「${item.name}」尚未过期(状态:新鲜/临期),确认要丢弃 1 个吗?`
        await ElMessageBox.confirm(tip, '丢弃未过期物资', {
          confirmButtonText: '确认丢弃',
          cancelButtonText: '取消',
          type: 'warning'
        })
      } catch { return }
    }

    // 🚀 统一调用 goodsStore：数量 -1 并写入全局数据源
    // 记录丢弃前单价与丢弃数量,用于统计浪费金额(取丢弃前的 price,避免后续被业务逻辑改动)
    const unitPrice = Number(item.price) || 0
    const updated = discardGoods(item.id, 1)
    if (!updated) return
    const taken = (item.quantity || 0) - (updated.quantity || 0) || 1
    wasteCount.value += taken
    wasteValue.value += taken * unitPrice
    persistWaste()
    ElMessage.success(
      isExpired
        ? `已丢弃过期「${item.name}」1 个,剩余 ${updated.quantity}${item.unit}`
        : `已丢弃「${item.name}」1 个(计入浪费),剩余 ${updated.quantity}${item.unit}`
    )
  } else if (zone === 'use') {
    // ===== 使用区 =====
    if (item.quantity <= 0) {
      ElMessage.warning(`「${item.name}」库存已为 0,无法再使用`)
      return
    }
    const updated = consumeGoods(item.id, 1)
    if (updated) ElMessage.success(`已使用 1 个「${item.name}」,剩余 ${updated.quantity}${item.unit}`)
  } else if (zone === 'restock') {
    // ===== 补货区 =====
    // 补货前先让用户填新批次的生产/过期日期，避免把过期的旧日期带过来。
    // 默认值：今天起 30 天（与新建物资页面保持一致的推荐策略）
    const today = new Date()
    const defaultExpiry = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10)
    let newExpiry = defaultExpiry
    try {
      // 弹出日期输入框
      const { value } = await ElMessageBox.prompt(
        `「${item.name}」即将补货 1 个,请填写新批次的过期日期(留空表示无保质期)`,
        '补货',
        {
          inputType: 'date',
          inputValue: defaultExpiry,
          inputPlaceholder: 'YYYY-MM-DD',
          confirmButtonText: '确认补货',
          cancelButtonText: '取消',
          inputValidator: (val) => {
            // 允许空（无保质期物资）；非空必须是 YYYY-MM-DD
            if (!val) return true
            return /^\d{4}-\d{2}-\d{2}$/.test(val) || '日期格式需为 YYYY-MM-DD'
          }
        }
      )
      newExpiry = value || ''
    } catch {
      // 用户取消补货
      return
    }
    // 调用补货 API（数量 +1，更新过期日）
    const updated = restockGoods(item.id, { amount: 1, expiryDate: newExpiry })
    if (updated) {
      const tip = newExpiry
        ? `已补货 1 个「${item.name}」,新过期日 ${newExpiry},当前 ${updated.quantity}${updated.unit}`
        : `已补货 1 个「${item.name}」,当前 ${updated.quantity}${updated.unit}`
      ElMessage.success(tip)
    }
  } else if (zone === 'custom') {
    // ===== 自定义区 =====
    // 根据用户选择的动作 + 数量执行
    const amount = Math.max(1, Math.floor(Number(customAmount.value) || 1))
    if (customAction.value === 'consume') {
      // 消耗分支：先做合法性校验
      if (!item.quantity || item.quantity <= 0) {
        ElMessage.warning(`「${item.name}」库存已为 0,无法再消耗`)
        return
      }
      if (amount > item.quantity) {
        ElMessage.warning(`「${item.name}」库存仅 ${item.quantity}${item.unit},无法消耗 ${amount}${item.unit}`)
        return
      }
      const updated = consumeGoods(item.id, amount)
      if (updated) {
        ElMessage.success(`已消耗 ${amount} 个「${item.name}」,剩余 ${updated.quantity}${updated.unit}`)
      }
    } else {
      // restock: 弹日期选择窗（与"补货区"行为一致）
      const today = new Date()
      const defaultExpiry = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10)
      let newExpiry = defaultExpiry
      try {
        const { value } = await ElMessageBox.prompt(
          `「${item.name}」即将补货 ${amount} 个,请填写新批次的过期日期(留空表示无保质期)`,
          '自定义补货',
          {
            inputType: 'date',
            inputValue: defaultExpiry,
            inputPlaceholder: 'YYYY-MM-DD',
            confirmButtonText: '确认补货',
            cancelButtonText: '取消',
            inputValidator: (val) => {
              if (!val) return true
              return /^\d{4}-\d{2}-\d{2}$/.test(val) || '日期格式需为 YYYY-MM-DD'
            }
          }
        )
        newExpiry = value || ''
      } catch {
        return // 用户取消
      }
      const updated = restockGoods(item.id, { amount, expiryDate: newExpiry })
      if (updated) {
        const tip = newExpiry
          ? `已补货 ${amount} 个「${item.name}」,新过期日 ${newExpiry},当前 ${updated.quantity}${updated.unit}`
          : `已补货 ${amount} 个「${item.name}」,当前 ${updated.quantity}${updated.unit}`
        ElMessage.success(tip)
      }
    }
  }
}

/** 自定义区数量调节（防止越界 1~999） */
function adjustCustomAmount(delta) {
  const next = (Number(customAmount.value) || 1) + delta
  if (next < 1) return
  if (next > 999) return
  customAmount.value = next
}

/** 重置浪费计数 */
async function resetWaste() {
  if (wasteCount.value === 0 && wasteValue.value === 0) return
  try {
    await ElMessageBox.confirm(
      `确认将浪费计数清零吗?(当前 ${wasteCount.value} 件 / ¥ ${wasteValueText.value})`,
      '重置浪费计数',
      { confirmButtonText: '清零', cancelButtonText: '取消', type: 'warning' }
    )
    wasteCount.value = 0
    wasteValue.value = 0
    persistWaste()
    ElMessage.success('浪费计数已清零')
  } catch {}
}

/** 卡片点击空操作 */
function noop() {}
</script>

<template>
  <!--
    ============================================================
    模板区：决定拖拽管理页的视觉结构，由以下几部分组成：
      1. 顶部信息条（标题 + 数量统计胶囊）
      2. 主板：左侧物资卡片网格 + 右侧四个投放区
      3. 浪费统计面板（累计件数 + 累计金额 + 清零按钮）
    ============================================================
  -->
  <div class="drag-page">
    <!-- 顶部信息条 -->
    <div class="page-top">
      <div class="page-top-left">
        <h2 class="page-title">拖拽管理</h2>
        <p class="page-subtitle">把左侧物资卡片拖到右侧区域,完成日常操作</p>
      </div>
      <!-- 右侧统计胶囊：种类数 + 总件数 -->
      <div class="page-top-right">
        <div class="stat-pill">
          <el-icon :size="14"><Box /></el-icon>
          <span>种类 {{ totalCount }}</span>
        </div>
        <div class="stat-pill stat-pill--accent">
          <span>总件数 {{ totalQty }}</span>
        </div>
      </div>
    </div>

    <!-- 主区域:左侧卡片 + 右侧目标 -->
    <div class="drag-board">
      <!-- 左侧:物资卡片 -->
      <div class="card-column">
        <div class="column-header">
          <span class="column-title">物资列表</span>
          <span class="column-meta">拖动卡片到右侧</span>
        </div>
        <!-- 物资卡片网格：自适应列数，最小列宽 150px -->
        <div v-if="items.length" class="card-grid">
          <div
            v-for="item in items"
            :key="item.id"
            class="drag-card"
            :class="{
              'is-dragging': draggingId === item.id,
              'is-empty': !item.quantity || item.quantity <= 0
            }"
            :title="(!item.quantity || item.quantity <= 0) ? '已用完,拖到补货区可补回新批次' : ''"
            draggable="true"
            @dragstart="onDragStart($event, item)"
            @dragend="onDragEnd"
            @click="noop"
          >
            <!-- 卡片上半：名称 + 数量徽章 -->
            <div class="card-row card-row--top">
              <span class="card-name">{{ item.name }}</span>
              <span class="card-qty">
                {{ item.quantity }}{{ item.unit }}
                <span v-if="!item.quantity || item.quantity <= 0" class="empty-tag">已用完</span>
              </span>
            </div>
            <!-- 卡片下半：规格说明或拖动提示 -->
            <div class="card-row card-row--bottom">
              <span class="card-hint">
                {{
                  !item.quantity || item.quantity <= 0
                    ? '拖到补货区可补回新批次'
                    : (item.spec || '⋮⋮ 可拖动')
                }}
              </span>
            </div>
          </div>
        </div>
        <!-- 无物资时的占位 -->
        <div v-else class="empty-hint">暂无物资,请到「库存管理」添加</div>
      </div>

      <!-- 右侧:三个目标区 -->
      <div class="zone-column">
        <!-- 丢弃区(垃圾桶):过期物资 -1 计入浪费,未过期弹确认 -->
        <div
          class="drop-zone drop-zone--trash"
          :class="{ 'is-hover': hoverZone === 'trash' }"
          @dragover="onDragOver($event, 'trash')"
          @dragleave="onDragLeave('trash')"
          @drop="onDrop($event, 'trash')"
        >
          <div class="zone-icon">
            <el-icon :size="28"><Delete /></el-icon>
          </div>
          <div class="zone-text">
            <span class="zone-title">丢弃区</span>
            <span class="zone-desc">拖入后该物资数量 -1</span>
          </div>
        </div>

        <!-- 使用区 -->
        <div
          class="drop-zone drop-zone--use"
          :class="{ 'is-hover': hoverZone === 'use' }"
          @dragover="onDragOver($event, 'use')"
          @dragleave="onDragLeave('use')"
          @drop="onDrop($event, 'use')"
        >
          <div class="zone-icon">
            <el-icon :size="28"><Minus /></el-icon>
          </div>
          <div class="zone-text">
            <span class="zone-title">使用区</span>
            <span class="zone-desc">拖入后该物资数量 -1</span>
          </div>
        </div>

        <!-- 补货区 -->
        <div
          class="drop-zone drop-zone--restock"
          :class="{ 'is-hover': hoverZone === 'restock' }"
          @dragover="onDragOver($event, 'restock')"
          @dragleave="onDragLeave('restock')"
          @drop="onDrop($event, 'restock')"
        >
          <div class="zone-icon">
            <el-icon :size="28"><Plus /></el-icon>
          </div>
          <div class="zone-text">
            <span class="zone-title">补货区</span>
            <span class="zone-desc">拖入后该物资数量 +1</span>
          </div>
        </div>

        <!-- 自定义区:动作 + 数量可调 -->
        <div
          class="drop-zone drop-zone--custom"
          :class="{ 'is-hover': hoverZone === 'custom' }"
          @dragover="onDragOver($event, 'custom')"
          @dragleave="onDragLeave('custom')"
          @drop="onDrop($event, 'custom')"
        >
          <div class="zone-icon">
            <el-icon :size="28"><Operation /></el-icon>
          </div>
          <div class="zone-text zone-text--custom">
            <span class="zone-title">自定义区</span>
            <span class="zone-desc">选择动作与数量,把卡片拖入即生效</span>

            <!-- 自定义控件：动作切换 + 数量调节 -->
            <div class="custom-controls">
              <!-- 动作切换 -->
              <div class="chip-group" role="tablist">
                <button
                  type="button"
                  class="chip chip--consume"
                  :class="{ 'is-active': customAction === 'consume' }"
                  @click="customAction = 'consume'"
                >
                  <el-icon :size="14"><Minus /></el-icon>
                  <span>消耗</span>
                </button>
                <button
                  type="button"
                  class="chip chip--restock"
                  :class="{ 'is-active': customAction === 'restock' }"
                  @click="customAction = 'restock'"
                >
                  <el-icon :size="14"><Plus /></el-icon>
                  <span>补货</span>
                </button>
              </div>

              <!-- 数量调节 -->
              <div class="qty-stepper">
                <button
                  type="button"
                  class="qty-btn"
                  :disabled="customAmount <= 1"
                  @click="adjustCustomAmount(-1)"
                >
                  <el-icon :size="12"><Minus /></el-icon>
                </button>
                <input
                  v-model.number="customAmount"
                  type="number"
                  class="qty-input"
                  min="1"
                  max="999"
                />
                <button
                  type="button"
                  class="qty-btn"
                  :disabled="customAmount >= 999"
                  @click="adjustCustomAmount(1)"
                >
                  <el-icon :size="12"><Plus /></el-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 浪费统计面板:显示累计丢弃数量 + 重置按钮 -->
    <div class="waste-section">
      <div class="waste-header">
        <div class="waste-header-left">
          <el-icon :size="16" color="#B8653A"><Delete /></el-icon>
          <span class="waste-title">浪费统计</span>
          <span class="waste-meta">累计通过丢弃区处理的物资件数与金额</span>
        </div>
        <!-- 有数据时才显示清零按钮 -->
        <button
          v-if="wasteCount > 0 || wasteValue > 0"
          class="waste-reset"
          @click="resetWaste"
        >
          <el-icon :size="12"><Delete /></el-icon>
          <span>清零</span>
        </button>
      </div>
      <!-- 数据展示区：件数 + 金额 -->
      <div class="waste-body">
        <div class="waste-stat">
          <div class="waste-number">{{ wasteCount }}</div>
          <div class="waste-unit">件</div>
        </div>
        <div class="waste-divider" aria-hidden="true" />
        <div class="waste-stat">
          <div class="waste-number waste-number--value">¥ {{ wasteValueText }}</div>
          <div class="waste-unit">累计金额</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：定义拖拽管理页的视觉表现。
  包括：左右两栏布局、可拖动卡片、四个投放区配色与高亮、
  自定义控件（chip + stepper）、浪费统计面板等。
  ============================================================
*/

/* ====== 页面容器 ====== */
/* 整页容器：限宽居中，纵向排列各模块 */
.drag-page {
  width: 100%;
  max-width: var(--content-max-width, 1200px);
  margin: 0 auto;
  padding: var(--content-padding-y, 16px) var(--content-padding-x, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md, 16px);
}

/* ====== 顶部 ====== */
/* 顶部信息条：左右两端对齐 */
.page-top {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--spacing-md, 16px);
  flex-wrap: wrap;
}
/* 主标题 */
.page-title {
  font-family: var(--font-family-pixel, sans-serif);
  font-size: var(--font-size-2xl, 22px);
  color: var(--color-text-primary, #2D221C);
  margin: 0;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}
/* 副标题 */
.page-subtitle {
  font-family: var(--font-family-pixel, sans-serif);
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-secondary, #6B5D55);
  margin: 4px 0 0;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}
/* 右侧胶囊容器 */
.page-top-right {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
/* 统计胶囊：白底像素边框 */
.stat-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-family: var(--font-family-pixel, sans-serif);
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-primary, #2D221C);
  background: rgba(255, 255, 255, 0.9);
  border: 2px solid var(--pixel-border, #1A1817);
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.25);
}
/* 强调色胶囊：主题色实底 */
.stat-pill--accent {
  color: #FFFFFF;
  background: var(--color-primary, #D4875A);
  border-color: var(--pixel-border, #1A1817);
}
/* ====== 主板:左右两栏 ====== */
/* 主板：左 1.4 : 右 1，窄屏自动堆叠为单列 */
.drag-board {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: var(--spacing-md, 16px);
  align-items: start;
}
@media (max-width: 860px) {
  .drag-board { grid-template-columns: 1fr; }
}

/* ====== 列头 ====== */
/* 列头：标题 + 提示，底部虚线分隔 */
.column-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 4px var(--spacing-xs, 6px);
  border-bottom: 2px dashed rgba(180, 160, 140, 0.4);
  margin-bottom: var(--spacing-sm, 10px);
}
.column-title {
  font-family: var(--font-family-pixel, sans-serif);
  font-size: var(--font-size-md, 15px);
  color: var(--color-text-primary, #2D221C);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}
.column-meta {
  font-family: var(--font-family-pixel, sans-serif);
  font-size: 10px;
  color: var(--color-text-placeholder, #9B8D85);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ====== 左侧卡片网格 ====== */
/* 左侧卡片容器：半透明底 + 厚边框 + 硬阴影 */
.card-column {
  background: rgba(255, 255, 255, 0.6);
  border: 3px solid var(--pixel-border, #1A1817);
  box-shadow: 5px 5px 0 0 rgba(139, 115, 85, 0.3);
  padding: var(--spacing-md, 14px);
  min-height: 360px;
  position: relative;
}
/* 自动列宽栅格：每列最少 150px */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--spacing-sm, 10px);
}

/* 单张可拖动卡片 */
.drag-card {
  background: rgba(255, 255, 255, 0.95);
  border: 3px solid var(--pixel-border, #1A1817);
  box-shadow: 3px 3px 0 0 rgba(139, 115, 85, 0.3);
  padding: 10px 12px;
  cursor: grab;
  user-select: none;
  transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.12s ease;
}
.drag-card:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 0 rgba(139, 115, 85, 0.35);
}
/* 抓取中光标变化 */
.drag-card:active { cursor: grabbing; }

/* 拖动中状态：半透明 + 轻微旋转，让用户清楚知道哪张正在被拖 */
.drag-card.is-dragging {
  opacity: 0.4;
  transform: rotate(-2deg) scale(0.98);
  cursor: grabbing;
}

/* 已用完（quantity=0）状态：灰化、虚线边框、徽章"已用完" */
.drag-card.is-empty {
  background: rgba(245, 240, 235, 0.7);
  border-style: dashed;
  opacity: 0.85;
}
.drag-card.is-empty:hover {
  background: rgba(255, 253, 250, 0.95);
}
.drag-card.is-empty .card-qty {
  background: var(--color-text-placeholder, #9B8D85);
  color: #FFFFFF;
}
.drag-card.is-empty .card-hint {
  color: var(--color-primary, #D4875A);
  font-weight: 600;
}

/* "已用完"徽章 */
.empty-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 16px;
  margin-left: 4px;
  padding: 0 5px;
  font-size: 10px;
  line-height: 1;
  background: rgba(245, 108, 108, 0.85);
  color: #FFFFFF;
  border: 1px solid var(--pixel-border, #1A1817);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  vertical-align: middle;
}

/* 卡片内部行布局 */
.card-row { display: flex; align-items: center; justify-content: space-between; }
.card-row--top { margin-bottom: 4px; }
/* 卡片名称：超长省略 */
.card-name {
  font-family: var(--font-family-pixel, sans-serif);
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-primary, #2D221C);
  font-weight: bold;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
}
/* 数量徽章：主色实底白字 */
.card-qty {
  display: inline-flex;
  align-items: center;
  font-family: var(--font-family-pixel, sans-serif);
  font-size: var(--font-size-xs, 12px);
  color: #FFFFFF;
  background: var(--color-primary, #D4875A);
  padding: 1px 6px;
  border: 2px solid var(--pixel-border, #1A1817);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}
/* 卡片底部提示文字 */
.card-hint {
  font-family: var(--font-family-pixel, sans-serif);
  font-size: 10px;
  color: var(--color-text-placeholder, #9B8D85);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}
/* 空物资占位 */
.empty-hint {
  text-align: center;
  padding: var(--spacing-xl, 24px) 0;
  font-family: var(--font-family-pixel, sans-serif);
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-placeholder, #9B8D85);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ====== 右侧:目标区列 ====== */
/* 右侧投放区容器：纵向排列四个区 */
.zone-column {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md, 14px);
  min-height: 360px;
}

/* 投放区通用样式：虚线边框 + 硬阴影 */
.drop-zone {
  display: flex;
  align-items: center;
  gap: var(--spacing-md, 14px);
  padding: var(--spacing-md, 14px) var(--spacing-lg, 18px);
  background: rgba(255, 255, 255, 0.88);
  border: 3px dashed var(--color-border-light, #B0A89E);
  box-shadow: 4px 4px 0 0 rgba(139, 115, 85, 0.25);
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease, border-color 0.15s ease;
  cursor: default;
}
/* 投放区图标方框 */
.drop-zone .zone-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.95);
  border: 2px solid var(--pixel-border, #1A1817);
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.3);
  flex-shrink: 0;
  color: var(--color-text-primary, #2D221C);
}
/* 投放区文字容器 */
.drop-zone .zone-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.zone-title {
  font-family: var(--font-family-pixel, sans-serif);
  font-size: var(--font-size-md, 15px);
  color: var(--color-text-primary, #2D221C);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}
.zone-desc {
  font-family: var(--font-family-pixel, sans-serif);
  font-size: 10px;
  color: var(--color-text-secondary, #6B5D55);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 主题色：每个投放区有独立配色，便于一眼区分 */
.drop-zone--trash { border-color: rgba(184, 101, 58, 0.5); }
.drop-zone--trash .zone-icon { color: #B8653A; }
.drop-zone--use   { border-color: rgba(212, 135, 90, 0.5); }
.drop-zone--use   .zone-icon { color: #D4875A; }
.drop-zone--restock { border-color: rgba(91, 140, 90, 0.55); }
.drop-zone--restock .zone-icon { color: #5B8C5A; }
.drop-zone--custom { border-color: rgba(124, 105, 168, 0.55); }
.drop-zone--custom .zone-icon { color: #7C69A8; }

/* 高亮：拖入悬停时的整体反馈 */
.drop-zone.is-hover {
  transform: translate(-2px, -2px);
  background: #FFFDFB;
  box-shadow: 6px 6px 0 0 rgba(45, 34, 28, 0.45);
}
/* 各色投放区高亮时的实线边框与浅底色 */
.drop-zone--trash.is-hover {
  border-style: solid;
  border-color: #B8653A;
  background: rgba(184, 101, 58, 0.08);
}
.drop-zone--use.is-hover {
  border-style: solid;
  border-color: #D4875A;
  background: rgba(212, 135, 90, 0.10);
}
.drop-zone--restock.is-hover {
  border-style: solid;
  border-color: #5B8C5A;
  background: rgba(91, 140, 90, 0.10);
}
.drop-zone--custom.is-hover {
  border-style: solid;
  border-color: #7C69A8;
  background: rgba(124, 105, 168, 0.08);
}

/* ====== 自定义区:动作 + 数量控件 ====== */
/* 自定义区文字容器（顶对齐，便于嵌入控件） */
.zone-text--custom {
  align-items: flex-start;
  flex: 1;
  min-width: 0;
}
/* 控件横向排列容器 */
.custom-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  flex-wrap: wrap;
}

/* 动作切换 chips：分段按钮 */
.chip-group {
  display: inline-flex;
  border: 2px solid var(--pixel-border, #1A1817);
  background: #FFFFFF;
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.25);
  overflow: hidden;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #FFFFFF;
  color: var(--color-text-secondary, #6B5D55);
  border: 0;
  border-right: 2px solid var(--pixel-border, #1A1817);
  cursor: pointer;
  font-family: var(--font-family-pixel, sans-serif);
  font-size: 12px;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  transition: all 0.12s ease;
}
.chip:last-child { border-right: 0; }
.chip:hover { background: #FFF8F1; }
.chip.is-active { color: #FFFFFF; }
.chip--consume.is-active { background: #D4875A; }
.chip--restock.is-active { background: #5B8C5A; }

/* 数量调节 stepper：- [数值] + */
.qty-stepper {
  display: inline-flex;
  align-items: center;
  border: 2px solid var(--pixel-border, #1A1817);
  background: #FFFFFF;
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.25);
}
.qty-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 28px;
  background: #FFFFFF;
  border: 0;
  cursor: pointer;
  color: var(--color-text-primary, #2D221C);
  transition: background 0.12s ease;
}
.qty-btn:hover:not(:disabled) { background: #FFF8F1; }
.qty-btn:disabled { color: var(--color-text-placeholder, #9B8D85); cursor: not-allowed; }
/* 数量输入框：去掉浏览器原生上下箭头 */
.qty-input {
  width: 44px;
  height: 28px;
  border: 0;
  border-left: 2px solid var(--pixel-border, #1A1817);
  border-right: 2px solid var(--pixel-border, #1A1817);
  text-align: center;
  font-family: var(--font-family-pixel, sans-serif);
  font-size: 13px;
  color: var(--color-text-primary, #2D221C);
  background: #FFFDFB;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  -moz-appearance: textfield;
  outline: none;
}
.qty-input::-webkit-outer-spin-button,
.qty-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

/* ====== 浪费统计面板 ====== */
/* 浪费统计卡片：红棕色边框，整体突出"警示"语义 */
.waste-section {
  background: rgba(255, 255, 255, 0.7);
  border: 3px solid #B8653A;
  box-shadow: 5px 5px 0 0 rgba(184, 101, 58, 0.3);
  padding: var(--spacing-md, 14px);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm, 10px);
}
/* 头部：标题左 + 清零按钮右 */
.waste-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--spacing-xs, 6px);
  border-bottom: 2px dashed rgba(184, 101, 58, 0.3);
}
.waste-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.waste-title {
  font-family: var(--font-family-pixel, sans-serif);
  font-size: var(--font-size-md, 15px);
  color: #B8653A;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  font-weight: bold;
}
.waste-meta {
  font-family: var(--font-family-pixel, sans-serif);
  font-size: 10px;
  color: var(--color-text-placeholder, #9B8D85);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}
/* 清零按钮：白底红字红边 */
.waste-reset {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.95);
  border: 2px solid #B8653A;
  color: #B8653A;
  cursor: pointer;
  font-family: var(--font-family-pixel, sans-serif);
  font-size: 10px;
  box-shadow: 2px 2px 0 0 rgba(184, 101, 58, 0.3);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.waste-reset:hover {
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 0 rgba(184, 101, 58, 0.4);
}
.waste-reset:active {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 0 rgba(184, 101, 58, 0.3);
}
/* 数据展示区：件数 | 金额，中间用虚线分隔 */
.waste-body {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: var(--spacing-sm, 10px) 4px 0;
}
.waste-stat {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex: 1;
  min-width: 0;
}
/* 中间分隔线：垂直虚线 */
.waste-divider {
  width: 2px;
  align-self: stretch;
  background: repeating-linear-gradient(
    to bottom,
    rgba(184, 101, 58, 0.55) 0 4px,
    transparent 4px 8px
  );
  flex-shrink: 0;
  margin: 4px 0;
}
/* 大数字：48px 像素体 */
.waste-number {
  font-family: var(--font-family-pixel, sans-serif);
  font-size: 48px;
  color: #B8653A;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  line-height: 1;
  font-weight: bold;
}
.waste-number--value {
  font-size: 48px;
}
/* 单位文字（件 / 累计金额） */
.waste-unit {
  font-family: var(--font-family-pixel, sans-serif);
  font-size: var(--font-size-md, 15px);
  color: var(--color-text-secondary, #6B5D55);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}
</style>
