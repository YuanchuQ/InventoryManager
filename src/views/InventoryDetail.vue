<!--
  ============================================================
  页面说明：物资详情
  展示某件物资的完整信息，并提供常用操作。页面分为几个模块：
    1. 顶栏（返回 + 标题）
    2. 概览卡片（名称、分类、过期状态、库存进度条、快捷操作）
    3. 详细信息（规格、过期、位置、单价、添加时间、备注）
    4. 库存批次列表（仅当存在多批次时显示，按"先过期先用"出库）
    5. 消耗历史列表
    6. 记录消耗对话框（数量步进器 + 备注）
  ============================================================
-->

<script setup>
/*
  ============================================================
  脚本区：负责详情页的数据加载、状态派生与操作交互。
  主要工作：
    1. 根据路由参数 id 从库存数据源取出物资详情
    2. 加载该物资的消耗历史
    3. 派生过期状态、是否低库存、批次视图、库存进度等
    4. 提供"记录消耗"对话框与提交逻辑
    5. 提供"编辑"与"删除"操作入口
  ============================================================
*/

import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
// 三个数据源：库存、消耗记录、设置（分类列表）
import { useInventoryStore } from '@/stores/inventory'
import { useConsumptionStore } from '@/stores/consumption'
import { useSettingsStore } from '@/stores/settings'
import { ElMessage, ElMessageBox } from 'element-plus'
// 单独的消耗接口（不走 store，因为消耗会同时联动库存与消耗记录）
import { consumeItem } from '@/api/items'
import {
  ArrowLeft, Edit, Delete, Box, Location,
  Calendar, Money, Histogram, Document,
  WarningFilled, CircleCloseFilled, CircleCheckFilled,
  Minus, Plus
} from '@element-plus/icons-vue'
// 过期状态计算与配色常量
import { getExpiryStatus, EXPIRY_COLORS, EXPIRY_STATUS } from '@/utils/constants'

const route = useRoute()
const router = useRouter()
const inventoryStore = useInventoryStore()
const consumptionStore = useConsumptionStore()
const settingsStore = useSettingsStore()

// 加载状态与物资详情/消耗记录
const loading = ref(true)
const item = ref(null)
const records = ref([])

// 消耗对话框相关状态
const consumeDialogVisible = ref(false)
const consumeFormRef = ref(null)
const consumeSubmitting = ref(false)
const consumeForm = ref({ quantity: 1, note: '' })

// 消耗表单校验规则
const rules = {
  quantity: [{ required: true, message: '请输入消耗数量', trigger: 'blur' }]
}

// 当前物资 id（来自路由参数）
const itemId = computed(() => route.params.id)

// 物资所属分类名（找不到时显示"未分类"）
const categoryName = computed(() => {
  if (!item.value) return '未分类'
  const c = settingsStore.categories.find(cat => cat.id === item.value.categoryId)
  return c ? c.name : '未分类'
})

// 过期信息派生：status / 文案 / 颜色 / 图标 / 剩余天数
const expiryInfo = computed(() => {
  if (!item.value) return { status: 'safe', text: '-', color: EXPIRY_COLORS.safe, icon: CircleCheckFilled, days: 0 }
  // 数量为 0：物资已用完，过期提示无意义 → 显示"已用完"
  if (!item.value.quantity || item.value.quantity <= 0) {
    return { status: 'safe', text: '已用完', color: '#9B8D85', icon: CircleCheckFilled, days: 0 }
  }
  const status = getExpiryStatus(item.value.expiryDate)
  const diff = Math.ceil((new Date(item.value.expiryDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  let text
  if (status === 'danger') text = `已过期 ${Math.abs(diff)} 天`
  else if (status === 'warning') text = `${diff} 天后过期`
  else text = `${diff} 天后过期`
  const icon = status === 'danger' ? CircleCloseFilled : status === 'warning' ? WarningFilled : CircleCheckFilled
  return { status, text, color: EXPIRY_COLORS[status], icon, days: diff }
})

// 是否低库存
const isLowStock = computed(() => item.value && item.value.quantity <= item.value.minQuantity)

// 库存进度百分比（参考值 = 最低阈值的 2 倍）
const stockPercent = computed(() => {
  if (!item.value || !item.value.minQuantity) return 0
  // 目标参考值 = 最低阈值的 2 倍，避免除以 0 / 太小
  const target = Math.max(item.value.minQuantity * 2, item.value.quantity)
  return Math.min(100, Math.round((item.value.quantity / target) * 100))
})

// 累计消耗量
const totalConsumed = computed(() =>
  records.value.reduce((sum, r) => sum + r.quantity, 0)
)

// 消耗记录按日期倒序排列
const recordsSorted = computed(() => {
  return [...records.value].sort((a, b) => new Date(b.date) - new Date(a.date))
})

// 批次视图：按过期日升序（无保质期批次放最后）
// 同时附加 status / diffDays 用于展示
const batchesView = computed(() => {
  if (!item.value || !Array.isArray(item.value.batches)) return []
  return [...item.value.batches]
    .sort((a, b) => {
      const da = a.expiryDate || '9999-12-31'
      const db2 = b.expiryDate || '9999-12-31'
      return da.localeCompare(db2)
    })
    .map(b => ({
      ...b,
      status: getExpiryStatus(b.expiryDate),
      diffDays: b.expiryDate
        ? Math.ceil((new Date(b.expiryDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        : null
    }))
})

// 消耗对话框中的最大可消耗数 = 当前剩余库存
const maxConsume = computed(() => item.value ? item.value.quantity : 0)

// 加载物资详情与消耗记录
async function loadData() {
  loading.value = true
  try {
    // 确保有库存数据
    if (!inventoryStore.items.length) {
      await inventoryStore.loadItems()
    }
    item.value = inventoryStore.items.find(i => i.id === itemId.value) || null
    if (item.value) {
      await consumptionStore.loadAll()
      records.value = consumptionStore.records.filter(r => r.itemId === itemId.value)
    }
  } finally {
    loading.value = false
  }
}

// 根据过期日期返回对应图标
function getExpiryIcon(date) {
  const s = getExpiryStatus(date)
  if (s === 'danger') return CircleCloseFilled
  if (s === 'warning') return WarningFilled
  return CircleCheckFilled
}

// 根据过期日期返回对应颜色
function getExpiryColor(date) {
  return EXPIRY_COLORS[getExpiryStatus(date)]
}

// 工具：格式化日期为 YYYY-MM-DD
function formatDate(date) {
  if (!date) return '-'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '-'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 跳转到编辑页
function goEdit() {
  router.push(`/inventory/${itemId.value}/edit`)
}

// 打开记录消耗对话框并重置表单
function openConsumeDialog() {
  consumeForm.value = { quantity: 1, note: '' }
  consumeDialogVisible.value = true
}

// 消耗对话框中的 +/- 调整：超过库存时给出警告
function adjustConsume(delta) {
  const next = (consumeForm.value.quantity || 0) + delta
  if (next < 1) return
  if (next > maxConsume.value) {
    ElMessage.warning(`剩余库存仅 ${maxConsume.value}${item.value.unit}`)
    return
  }
  consumeForm.value.quantity = next
}

// 提交消耗：调用后端接口，成功后重新加载本页数据
async function handleConsume() {
  const valid = await consumeFormRef.value.validate().catch(() => false)
  if (!valid) return
  if (consumeForm.value.quantity > maxConsume.value) {
    ElMessage.warning(`消耗数量不能超过剩余库存 ${maxConsume.value}${item.value.unit}`)
    return
  }
  consumeSubmitting.value = true
  try {
    await consumeItem(itemId.value, { quantity: consumeForm.value.quantity, note: consumeForm.value.note })
    ElMessage.success('已记录消耗')
    consumeDialogVisible.value = false
    // 刷新库存与消耗历史
    await inventoryStore.loadItems()
    item.value = inventoryStore.items.find(i => i.id === itemId.value) || null
    await consumptionStore.loadAll()
    records.value = consumptionStore.records.filter(r => r.itemId === itemId.value)
  } catch {
    ElMessage.error('操作失败，请重试')
  } finally {
    consumeSubmitting.value = false
  }
}

// 删除物资（带确认）
async function handleDelete() {
  try {
    await ElMessageBox.confirm(`确定删除「${item.value.name}」吗？该操作不可恢复。`, '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await inventoryStore.removeItem(itemId.value)
    ElMessage.success('已删除')
    router.replace('/inventory')
  } catch {}
}

// 挂载时：先加载分类，再加载物资详情数据
onMounted(async () => {
  await settingsStore.loadCategories()
  await loadData()
})
</script>

<template>
  <!--
    ============================================================
    模板区：决定详情页的视觉结构，按场景分为三种状态：
      · loading：加载中卡片
      · 未找到：占位卡片 + 返回按钮
      · 找到物资：概览 / 详情 / 批次 / 消耗历史 多卡片堆叠
    末尾另含一个"记录消耗"对话框。
    ============================================================
  -->
  <div class="page-content">
    <div class="page-content-inner">
      <!-- 顶栏 -->
      <div class="page-header">
        <button class="back-btn" @click="router.replace('/inventory')">
          <el-icon :size="18"><ArrowLeft /></el-icon>
          <span>返回</span>
        </button>
        <h2 class="page-title">物资详情</h2>
        <div style="width: 80px" />
      </div>

      <!-- 加载中 -->
      <div v-if="loading" class="loading-card">
        <p class="loading-text">加载中...</p>
      </div>

      <!-- 未找到 -->
      <div v-else-if="!item" class="placeholder-card">
        <div class="placeholder-icon">
          <el-icon :size="48" color="#D4875A"><Box /></el-icon>
        </div>
        <h3 class="placeholder-title">物资不存在</h3>
        <p class="placeholder-desc">未找到 ID 为 {{ itemId }} 的物资，可能已被删除。</p>
        <button class="action-btn" @click="router.replace('/inventory')">返回库存列表</button>
      </div>

      <template v-else>
        <!-- 概览卡片：标题 + 状态徽章 + 操作 -->
        <div class="overview-card">
          <div class="overview-top">
            <div class="overview-info">
              <div class="overview-title-row">
                <h3 class="overview-name">{{ item.name }}</h3>
                <span class="category-badge">{{ categoryName }}</span>
              </div>
              <div class="overview-status">
                <span
                  class="status-badge"
                  :class="`status-badge--${expiryInfo.status}`"
                  :style="{ color: expiryInfo.color, borderColor: expiryInfo.color }"
                >
                  <el-icon :size="14"><component :is="expiryInfo.icon" /></el-icon>
                  {{ expiryInfo.text }}
                </span>
                <span v-if="isLowStock" class="status-badge status-badge--danger">
                  库存不足
                </span>
              </div>
            </div>
            <div class="overview-actions">
              <button class="icon-btn" @click="goEdit" title="编辑">
                <el-icon :size="16"><Edit /></el-icon>
              </button>
              <button class="icon-btn icon-btn--danger" @click="handleDelete" title="删除">
                <el-icon :size="16"><Delete /></el-icon>
              </button>
            </div>
          </div>

          <!-- 库存进度 -->
          <div class="stock-section">
            <div class="stock-row">
              <span class="stock-label">当前库存</span>
              <span class="stock-value">
                <span class="stock-num">{{ item.quantity }}</span>
                <span class="stock-unit">{{ item.unit }}</span>
              </span>
            </div>
            <div class="stock-bar">
              <div
                class="stock-bar-fill"
                :class="isLowStock ? 'stock-bar-fill--danger' : 'stock-bar-fill--ok'"
                :style="{ width: stockPercent + '%' }"
              />
            </div>
            <div class="stock-meta">
              <span>最低阈值：{{ item.minQuantity }}{{ item.unit }}</span>
              <span>已消耗：{{ totalConsumed }}{{ item.unit }}</span>
            </div>
          </div>

          <!-- 快捷操作 -->
          <div class="quick-actions">
            <button class="quick-btn quick-btn--primary" @click="openConsumeDialog">
              <el-icon :size="16"><Minus /></el-icon>
              <span>记录消耗</span>
            </button>
            <button class="quick-btn" @click="goEdit">
              <el-icon :size="16"><Edit /></el-icon>
              <span>编辑信息</span>
            </button>
          </div>
        </div>

        <!-- 详细信息 -->
        <div class="detail-card">
          <h4 class="section-title">详细信息</h4>
          <div class="info-grid">
            <div class="info-item">
              <div class="info-icon">
                <el-icon :size="16" color="#D4875A"><Box /></el-icon>
              </div>
              <div class="info-body">
                <span class="info-label">物资规格</span>
                <span class="info-value">{{ item.spec || '未指定' }}</span>
              </div>
            </div>

            <div class="info-item">
              <div class="info-icon">
                <el-icon :size="16" color="#D4875A"><Calendar /></el-icon>
              </div>
              <div class="info-body">
                <span class="info-label">
                  过期日期
                  <span v-if="batchesView.length > 1" class="info-label-hint">（{{ batchesView.length }} 个批次，取最早）</span>
                </span>
                <span class="info-value">{{ formatDate(item.expiryDate) }}</span>
              </div>
            </div>

            <div class="info-item">
              <div class="info-icon">
                <el-icon :size="16" color="#D4875A"><Location /></el-icon>
              </div>
              <div class="info-body">
                <span class="info-label">存放位置</span>
                <span class="info-value">{{ item.storageLocation || '未指定' }}</span>
              </div>
            </div>

            <div class="info-item">
              <div class="info-icon">
                <el-icon :size="16" color="#D4875A"><Money /></el-icon>
              </div>
              <div class="info-body">
                <span class="info-label">购买单价</span>
                <span class="info-value">{{ item.price ? `¥ ${item.price}` : '未填写' }}</span>
              </div>
            </div>

            <div class="info-item">
              <div class="info-icon">
                <el-icon :size="16" color="#D4875A"><Histogram /></el-icon>
              </div>
              <div class="info-body">
                <span class="info-label">添加时间</span>
                <span class="info-value">{{ formatDate(item.createdAt) }}</span>
              </div>
            </div>

            <div v-if="item.note" class="info-item info-item--full">
              <div class="info-icon">
                <el-icon :size="16" color="#D4875A"><Document /></el-icon>
              </div>
              <div class="info-body">
                <span class="info-label">备注</span>
                <span class="info-value info-value--note">{{ item.note }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 批次列表（仅当存在多批次时显示；单批次直接并入"详细信息"） -->
        <div v-if="batchesView.length > 1" class="batches-card">
          <div class="batches-header">
            <h4 class="section-title">库存批次</h4>
            <span class="batches-hint">消耗时按"先过期先用"自动出库</span>
          </div>
          <div class="batches-list">
            <div
              v-for="b in batchesView"
              :key="b.id"
              class="batch-item"
              :class="`batch-item--${b.status}`"
            >
              <div class="batch-qty">
                <span class="batch-num">{{ b.quantity }}</span>
                <span class="batch-unit">{{ item.unit }}</span>
              </div>
              <div class="batch-info">
                <div class="batch-expiry">
                  <el-icon :size="14"><component :is="getExpiryIcon(b.expiryDate)" /></el-icon>
                  <span :style="{ color: getExpiryColor(b.expiryDate) }">
                    {{
                      !b.expiryDate
                        ? '无保质期'
                        : b.status === 'danger'
                          ? `已过期 ${Math.abs(b.diffDays)} 天`
                          : `${b.diffDays} 天后过期`
                    }}
                  </span>
                </div>
                <div class="batch-meta">入库：{{ formatDate(b.createdAt) }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 消耗历史 -->
        <div class="history-card">
          <div class="history-header">
            <h4 class="section-title">消耗历史</h4>
            <span class="history-count">共 {{ records.length }} 条</span>
          </div>

          <div v-if="recordsSorted.length" class="history-list">
            <div
              v-for="record in recordsSorted"
              :key="record.id"
              class="history-item"
            >
              <div class="history-date">
                <el-icon :size="14" color="#6B5D55"><Calendar /></el-icon>
                <span>{{ formatDate(record.date) }}</span>
              </div>
              <div class="history-body">
                <span class="history-qty">-{{ record.quantity }}{{ item.unit }}</span>
                <span v-if="record.note" class="history-note">{{ record.note }}</span>
              </div>
            </div>
          </div>

          <div v-else class="empty-mini">
            <el-icon :size="32" color="#9B8D85"><Histogram /></el-icon>
            <p>暂无消耗记录</p>
          </div>
        </div>
      </template>
    </div>

    <!-- 消耗弹窗 -->
    <el-dialog v-model="consumeDialogVisible" title="记录消耗" width="480px" class="pixel-dialog" :close-on-click-modal="false">
      <el-form ref="consumeFormRef" :model="consumeForm" :rules="rules" label-position="top" size="large">
        <div class="consume-summary">
          <div class="consume-summary-row">
            <span class="consume-summary-label">物资</span>
            <span class="consume-summary-value">{{ item?.name }}</span>
          </div>
          <div class="consume-summary-row">
            <span class="consume-summary-label">剩余库存</span>
            <span class="consume-summary-value">{{ maxConsume }}{{ item?.unit }}</span>
          </div>
        </div>

        <el-form-item label="消耗数量" prop="quantity">
          <div class="number-stepper">
            <button class="stepper-btn" @click="adjustConsume(-1)" :disabled="consumeForm.quantity <= 1">
              <el-icon :size="14"><Minus /></el-icon>
            </button>
            <el-input-number
              v-model="consumeForm.quantity"
              :min="1"
              :max="maxConsume"
              :controls="false"
              class="stepper-input"
            />
            <button class="stepper-btn" @click="adjustConsume(1)" :disabled="consumeForm.quantity >= maxConsume">
              <el-icon :size="14"><Plus /></el-icon>
            </button>
          </div>
        </el-form-item>

        <el-form-item label="备注（可选）">
          <el-input
            v-model="consumeForm.note"
            type="textarea"
            :rows="2"
            placeholder="如：早餐、烹饪..."
            maxlength="50"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <button class="dialog-btn dialog-btn--cancel" @click="consumeDialogVisible = false">取消</button>
        <button class="dialog-btn dialog-btn--confirm" :disabled="consumeSubmitting" @click="handleConsume">
          {{ consumeSubmitting ? '提交中...' : '确认消耗' }}
        </button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：定义详情页所有卡片与控件的视觉表现。
  采用统一的"白底厚边 + 硬阴影"卡片风格；
  对过期、低库存、危险按钮等使用对应配色。
  ============================================================
*/

.page-content {
  width: 100%;
  min-height: calc(100vh - var(--navbar-height));
  background: linear-gradient(135deg, #FDF6F0 0%, #F8EDE0 50%, #FDF6F0 100%);
}

.page-content-inner {
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: var(--content-padding-y) var(--content-padding-x);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

/* ===== 顶栏 ===== */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--spacing-xs);
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.92);
  border: 2px solid var(--pixel-border);
  cursor: pointer;
  color: var(--color-text-primary);
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.3);
  transition: all var(--transition-fast);
}

.back-btn:hover {
  color: var(--color-primary);
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 0 rgba(139, 115, 85, 0.4);
}

.back-btn:active {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 0 rgba(107, 93, 85, 0.3);
}

.page-title {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xl);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin: 0;
}

/* ===== 加载/未找到 ===== */
.loading-card,
.placeholder-card {
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 5px 5px 0 0 rgba(139, 115, 85, 0.4);
  padding: var(--spacing-3xl) var(--spacing-xl);
  text-align: center;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
}

.placeholder-card::before,
.loading-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

.loading-text {
  font-family: var(--font-family-pixel);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin: 0;
}

.placeholder-icon {
  width: 80px;
  height: 80px;
  background: rgba(212, 135, 90, 0.1);
  border: 3px solid var(--pixel-border);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 4px 4px 0 0 rgba(107, 93, 85, 0.3);
}

.placeholder-title {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xl);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin: 0;
}

.placeholder-desc {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  max-width: 480px;
  line-height: 1.6;
  margin: 0;
}

/* ===== 概览卡片 ===== */
.overview-card {
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 5px 5px 0 0 rgba(139, 115, 85, 0.4);
  padding: var(--spacing-lg);
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.overview-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

.overview-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.overview-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.overview-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.overview-name {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xl);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin: 0;
}

.category-badge {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: #FFFFFF;
  background: var(--color-primary);
  padding: 2px 8px;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  flex-shrink: 0;
}

.overview-status {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.6);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  border: 1.5px solid;
}

.status-badge--danger {
  color: var(--color-danger) !important;
  border-color: var(--color-danger) !important;
  background: rgba(209, 75, 75, 0.08);
}

.overview-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: #FFFFFF;
  border: 2px solid var(--pixel-border);
  color: var(--color-text-secondary);
  cursor: pointer;
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.2);
  transition: all var(--transition-fast);
}

.icon-btn:hover {
  color: var(--color-primary);
  transform: translate(-1px, -1px);
  box-shadow: 3px 3px 0 0 rgba(107, 93, 85, 0.3);
}

.icon-btn:active {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 0 rgba(107, 93, 85, 0.2);
}

.icon-btn--danger:hover {
  color: var(--color-danger);
  border-color: var(--color-danger);
  box-shadow: 3px 3px 0 0 rgba(209, 75, 75, 0.3);
}

/* ===== 库存进度 ===== */
.stock-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--spacing-md);
  background: rgba(212, 135, 90, 0.05);
  border: 2px dashed var(--color-border-light);
}

.stock-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.stock-label {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.stock-value {
  display: inline-flex;
  align-items: baseline;
  gap: 2px;
  color: var(--color-text-primary);
}

.stock-num {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  line-height: 1;
}

.stock-unit {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.stock-bar {
  height: 10px;
  background: #FFFFFF;
  border: 2px solid var(--pixel-border);
  overflow: hidden;
  position: relative;
}

.stock-bar-fill {
  height: 100%;
  transition: width var(--transition-base);
  background: var(--color-success);
}

.stock-bar-fill--danger {
  background: var(--color-danger);
}

.stock-bar-fill--ok {
  background: var(--color-success);
}

.stock-meta {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin-top: 2px;
}

/* ===== 快捷操作 ===== */
.quick-actions {
  display: flex;
  gap: var(--spacing-sm);
}

.quick-btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  background: #FFFFFF;
  border: 2px solid var(--pixel-border);
  cursor: pointer;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  box-shadow: 3px 3px 0 0 rgba(107, 93, 85, 0.25);
  transition: all var(--transition-fast);
}

.quick-btn:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 0 rgba(107, 93, 85, 0.3);
  color: var(--color-primary);
}

.quick-btn:active {
  transform: translate(1px, 1px);
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.25);
}

.quick-btn--primary {
  background: var(--color-primary);
  color: #FFFFFF;
  border-color: var(--color-primary);
  box-shadow: 3px 3px 0 0 rgba(45, 34, 28, 0.45);
}

.quick-btn--primary:hover {
  background: var(--color-primary-dark);
  color: #FFFFFF;
  box-shadow: 4px 4px 0 0 rgba(45, 34, 28, 0.5);
}

/* ===== 通用卡片 ===== */
.detail-card,
.history-card,
.batches-card {
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 5px 5px 0 0 rgba(139, 115, 85, 0.4);
  padding: var(--spacing-lg);
  position: relative;
}

.detail-card::before,
.history-card::before,
.batches-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

.section-title {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin: 0 0 var(--spacing-md) 0;
  padding-bottom: var(--spacing-sm);
  border-bottom: 2px dashed var(--color-border-light);
}

/* ===== 信息网格 ===== */
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
}

.info-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
  background: rgba(212, 135, 90, 0.04);
  border: 1.5px solid var(--color-border-lighter);
}

.info-item--full {
  grid-column: 1 / -1;
}

.info-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(212, 135, 90, 0.1);
  border: 1.5px solid var(--color-border-light);
}

.info-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.info-label {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.info-value {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  word-break: break-word;
}

.info-value--note {
  line-height: 1.5;
  color: var(--color-text-regular);
}

/* ===== 消耗历史 ===== */
.history-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);
}

.history-header .section-title {
  margin: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.history-count {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: rgba(212, 135, 90, 0.05);
  border-left: 3px solid var(--color-primary);
  transition: all var(--transition-fast);
}

.history-item:hover {
  background: rgba(212, 135, 90, 0.1);
  transform: translateX(2px);
}

.history-date {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  flex-shrink: 0;
}

.history-body {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
  flex: 1;
  justify-content: flex-end;
}

.history-qty {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-danger);
  font-weight: var(--font-weight-semibold);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  flex-shrink: 0;
}

.history-note {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--color-border-lighter);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-mini {
  text-align: center;
  padding: var(--spacing-xl);
  color: var(--color-text-placeholder);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-xs);
}

.empty-mini p {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin: 0;
}

/* ===== 库存批次 ===== */
.batches-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
  padding-bottom: var(--spacing-sm);
  border-bottom: 2px dashed var(--color-border-light);
}

.batches-header .section-title {
  margin: 0;
  padding: 0;
  border: 0;
}

.batches-hint {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.batches-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.batch-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  background: rgba(91, 140, 90, 0.06);
  border-left: 4px solid #67C23A;
  transition: all var(--transition-fast);
}

.batch-item--warning {
  background: rgba(230, 162, 60, 0.08);
  border-left-color: #E6A23C;
}

.batch-item--danger {
  background: rgba(245, 108, 108, 0.10);
  border-left-color: #F56C6C;
}

.batch-item--safe {
  background: rgba(103, 194, 58, 0.06);
  border-left-color: #67C23A;
}

.batch-qty {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 80px;
  flex-shrink: 0;
}

.batch-num {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xl);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.batch-unit {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.batch-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.batch-expiry {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.batch-meta {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.info-label-hint {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  font-weight: var(--font-weight-normal);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 弹窗按钮 ===== */
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
  box-shadow: 3px 3px 0 0 rgba(45, 34, 28, 0.45);
  transition: all var(--transition-fast);
  margin-top: var(--spacing-sm);
}

.action-btn:hover {
  background: var(--color-primary-dark);
  transform: translate(1px, 1px);
  box-shadow: 2px 2px 0 0 rgba(45, 34, 28, 0.45);
}

.dialog-btn {
  padding: 8px 20px;
  border: 2px solid var(--pixel-border);
  cursor: pointer;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  transition: all var(--transition-fast);
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.25);
}

.dialog-btn--cancel {
  background: #FFFFFF;
  color: var(--color-text-primary);
}

.dialog-btn--cancel:hover {
  transform: translate(-1px, -1px);
}

.dialog-btn--confirm {
  background: var(--color-primary);
  color: #FFFFFF;
  border-color: var(--color-primary);
}

.dialog-btn--confirm:hover {
  background: var(--color-primary-dark);
  transform: translate(-1px, -1px);
}

.dialog-btn--confirm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* ===== 消耗表单 ===== */
.consume-summary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--spacing-sm) var(--spacing-md);
  background: rgba(212, 135, 90, 0.06);
  border: 1.5px dashed var(--color-border-light);
  margin-bottom: var(--spacing-md);
}

.consume-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.consume-summary-label {
  color: var(--color-text-secondary);
}

.consume-summary-value {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
}

.number-stepper {
  display: flex;
  align-items: center;
  width: 100%;
  border: 2px solid var(--pixel-border);
  background: #FFFFFF;
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.25);
}

.stepper-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background: #FFFFFF;
  border: 0;
  cursor: pointer;
  color: var(--color-text-primary);
  transition: background 0.12s ease;
}

.stepper-btn:hover:not(:disabled) {
  background: #FFF8F1;
  color: var(--color-text-primary);
}

.stepper-btn:active:not(:disabled) {
  background: #F0E6DA;
}

.stepper-btn:disabled {
  color: var(--color-text-placeholder, #9B8D85);
  cursor: not-allowed;
}

.stepper-input {
  flex: 1;
  min-width: 0;
  height: 40px;
}

.stepper-input :deep(.el-input__wrapper) {
  border: 0;
  border-left: 2px solid var(--pixel-border);
  border-right: 2px solid var(--pixel-border);
  border-radius: 0;
  box-shadow: none;
  padding: 0 4px;
  background: #FFFDFB;
  height: 40px;
}

.stepper-input :deep(.el-input__wrapper:hover) {
  transform: none;
  box-shadow: none;
}

.stepper-input :deep(.el-input__wrapper.is-focus) {
  transform: none;
  box-shadow: none;
  background: #FFFDFB;
}

.stepper-input :deep(.el-input__inner) {
  text-align: center;
  font-size: 14px;
  height: 40px;
}

.stepper-input :deep(input::-webkit-outer-spin-button),
.stepper-input :deep(input::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}

.stepper-input :deep(input[type='number']) {
  -moz-appearance: textfield;
}
</style>
