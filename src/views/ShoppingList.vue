<!--
  ============================================================
  页面说明：补货清单
  集中管理需要采购的物资，分"待采购"与"已采购"两个 tab。
  来源分为两类：
    - 自动：系统检测到库存不足时自动加入
    - 手动：用户在本页手动添加
  支持勾选完成、删除单条、清空已采购记录。
  ============================================================
-->

<script setup>
/*
  ============================================================
  脚本区：负责补货清单的展示、增删、状态切换。
  主要工作：
    1. 维护当前 tab（待采购 / 已采购）
    2. 提供"手动添加"对话框（含校验）
    3. 提供单条删除、批量清空已采购、状态切换
  ============================================================
*/

import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
// 两个数据源：补货清单、设置（分类列表）
import { useShoppingStore } from '@/stores/shoppingList'
import { useSettingsStore } from '@/stores/settings'
import { ShoppingCart, Plus, Delete, Check } from '@element-plus/icons-vue'
// 单位枚举（个、瓶、盒等）
import { UNIT_OPTIONS } from '@/utils/constants'

const shoppingStore = useShoppingStore()
const settingsStore = useSettingsStore()

// 当前 tab：'pending' 待采购 / 'purchased' 已采购
const activeTab = ref('pending')
// 手动添加对话框的可见性与提交状态
const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref(null)

// 手动添加表单
const form = ref({
  name: '',
  quantity: 1,
  unit: '个',
  categoryId: ''
})

// 校验规则
const rules = {
  name: [{ required: true, message: '请输入品名', trigger: 'blur' }],
  quantity: [{ required: true, message: '请输入数量', trigger: 'blur' }],
  unit: [{ required: true, message: '请选择单位', trigger: 'change' }],
  categoryId: [{ required: true, message: '请选择分类', trigger: 'change' }]
}

// 当前 tab 对应的清单
const currentItems = computed(() =>
  activeTab.value === 'pending' ? shoppingStore.pendingItems : shoppingStore.purchasedItems
)

// 两个 tab 的数量徽章
const pendingCount = computed(() => shoppingStore.pendingItems.length)
const purchasedCount = computed(() => shoppingStore.purchasedItems.length)

// 工具：根据分类 id 查名字
function categoryName(id) {
  const c = settingsStore.categories.find(cat => cat.id === id)
  return c ? c.name : ''
}

// 切换"已购买/未购买"状态
async function handleToggle(item) {
  try {
    if (item.isPurchased) {
      await shoppingStore.markPending(item.id)
    } else {
      await shoppingStore.markPurchased(item.id)
    }
  } catch {}
}

// 删除单条（带确认；stopPropagation 防止冒泡触发其他点击）
async function handleDelete(item, e) {
  e.stopPropagation()
  try {
    await ElMessageBox.confirm(`确定删除「${item.name}」吗？`, '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await shoppingStore.removeItem(item.id)
    ElMessage.success('已删除')
  } catch {}
}

// 清空所有已采购记录（不影响库存物资本身）
async function handleClearPurchased() {
  if (!purchasedCount.value) return
  try {
    await ElMessageBox.confirm(
      '确定清空所有已采购记录吗？库存物资不会被删除。',
      '清空记录',
      {
        confirmButtonText: '清空',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    const cleared = await shoppingStore.clearPurchased()
    if (cleared) ElMessage.success('已清空已采购记录')
  } catch {}
}

// 打开手动添加对话框并重置表单
function openDialog() {
  form.value = { name: '', quantity: 1, unit: '个', categoryId: '' }
  dialogVisible.value = true
}

// 提交手动添加
async function handleAdd() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    await shoppingStore.addManual({
      name: form.value.name,
      quantity: form.value.quantity,
      unit: form.value.unit,
      categoryId: form.value.categoryId
    })
    ElMessage.success('添加成功')
    dialogVisible.value = false
  } catch {
    ElMessage.error('添加失败')
  } finally {
    submitting.value = false
  }
}

// 挂载时：并行加载补货清单与分类
onMounted(async () => {
  await Promise.all([
    shoppingStore.loadList(),
    settingsStore.loadCategories()
  ])
})
</script>

<template>
  <!--
    ============================================================
    模板区：决定补货清单页的视觉结构，由以下几部分组成：
      1. 装饰背景层
      2. 顶栏（标题 + 清空记录 + 手动添加）
      3. tab 切换（待采购 / 已采购）
      4. 清单列表（每条左侧为勾选框，右侧为删除按钮）
      5. 空状态占位
      6. 手动添加对话框
    ============================================================
  -->
  <div class="page-content">
    <div class="bg-decoration">
      <div class="bg-orb bg-orb--1" />   <!-- 右上角光晕 -->
      <div class="bg-orb bg-orb--2" />   <!-- 左下角光晕 -->
      <div class="bg-grid" />            <!-- 像素风网格 -->
    </div>

    <div class="page-content-inner">
      <!-- 顶栏 -->
      <div class="page-header">
        <h2 class="page-title">补货清单</h2>
        <div class="header-actions">
          <!-- 仅在已采购 tab 且有记录时显示"清空记录"按钮 -->
          <button
            v-if="activeTab === 'purchased' && purchasedCount"
            class="action-btn action-btn--danger"
            @click="handleClearPurchased"
          >
            <el-icon :size="16"><Delete /></el-icon>
            <span>清空记录</span>
          </button>
          <button class="action-btn" @click="openDialog">
            <el-icon :size="16"><Plus /></el-icon>
            <span>手动添加</span>
          </button>
        </div>
      </div>

      <!-- tab 切换：两个 tab 等宽，含数量徽章 -->
      <div class="tab-bar">
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': activeTab === 'pending' }"
          @click="activeTab = 'pending'"
        >
          待采购<span v-if="pendingCount" class="tab-count">{{ pendingCount }}</span>
        </button>
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': activeTab === 'purchased' }"
          @click="activeTab = 'purchased'"
        >
          已采购<span v-if="purchasedCount" class="tab-count">{{ purchasedCount }}</span>
        </button>
      </div>

      <!-- 清单列表 -->
      <div v-if="currentItems.length" class="item-list">
        <div
          v-for="item in currentItems"
          :key="item.id"
          class="item-card"
          :class="{ 'item-card--purchased': item.isPurchased }"
        >
          <!-- 勾选框：用于切换"已购买/未购买"状态 -->
          <button class="item-checkbox" :class="{ 'item-checkbox--checked': item.isPurchased }" @click="handleToggle(item)">
            <span v-if="item.isPurchased" class="checkmark"><el-icon :size="14"><Check /></el-icon></span>
          </button>

          <!-- 中间区：名称 + 自动/手动徽章 + 数量 + 分类 -->
          <div class="item-body">
            <div class="item-top">
              <!-- 已购买时给名称加删除线 -->
              <span class="item-name" :class="{ 'item-name--done': item.isPurchased }">{{ item.name }}</span>
              <span class="item-badge" :class="item.isAuto ? 'item-badge--auto' : 'item-badge--manual'">
                {{ item.isAuto ? '自动' : '手动' }}
              </span>
            </div>
            <div class="item-bottom">
              <span class="item-qty">{{ item.quantity }}{{ item.unit }}</span>
              <span v-if="categoryName(item.categoryId)" class="item-category">{{ categoryName(item.categoryId) }}</span>
            </div>
          </div>

          <!-- 删除按钮：仅未购买项显示 -->
          <button v-if="!item.isPurchased" class="delete-btn" @click="handleDelete(item, $event)" title="删除">
            <el-icon :size="16"><Delete /></el-icon>
          </button>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-state">
        <div class="empty-icon">
          <el-icon :size="48" color="#D4875A"><ShoppingCart /></el-icon>
        </div>
        <h3 class="empty-title">
          {{ activeTab === 'pending' ? '暂无待采购项' : '暂无已采购记录' }}
        </h3>
        <p class="empty-desc">
          {{ activeTab === 'pending' ? '库存不足时系统会自动生成，也可点击右上角手动添加' : '标记待采购项为已购后会出现在这里' }}
        </p>
      </div>
    </div>

    <!-- 手动添加对话框 -->
    <el-dialog v-model="dialogVisible" title="手动添加补货项" width="90%" class="pixel-dialog" :close-on-click-modal="false">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="large">
        <el-form-item label="品名" prop="name">
          <el-input v-model="form.name" placeholder="如：酱油、洗洁精" maxlength="20" />
        </el-form-item>
        <div class="form-row">
          <el-form-item label="数量" prop="quantity">
            <el-input-number v-model="form.quantity" :min="1" :max="999" controls-position="right" style="width: 100%" />
          </el-form-item>
          <el-form-item label="单位" prop="unit">
            <el-select v-model="form.unit" style="width: 100%">
              <el-option v-for="u in UNIT_OPTIONS" :key="u" :label="u" :value="u" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="分类" prop="categoryId">
          <el-select v-model="form.categoryId" placeholder="选择分类" style="width: 100%">
            <el-option v-for="cat in settingsStore.categories" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <button class="dialog-btn dialog-btn--cancel" @click="dialogVisible = false">取消</button>
        <button class="dialog-btn dialog-btn--confirm" :disabled="submitting" @click="handleAdd">
          {{ submitting ? '添加中...' : '添加' }}
        </button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：定义补货清单页的视觉表现。
  采用与库存列表一致的卡片风格；
  已购买条目用半透明和删除线表达"已完成"状态。
  ============================================================
*/

/* 整页容器：撑满高度（扣除导航与标签栏） */
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
  gap: var(--spacing-md);
}

/* 右侧操作组 */
.header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
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

/* 主题色操作按钮 */
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

/* 危险按钮：浅红底 + 红字 + 红边 */
.action-btn--danger {
  background: rgba(209, 75, 75, 0.12);
  color: var(--color-danger);
  border-color: var(--color-danger);
  box-shadow: 4px 4px 0 0 rgba(209, 75, 75, 0.25);
}

.action-btn--danger:hover {
  background: var(--color-danger);
  color: #FFFFFF;
}

/* tab 切换栏 */
.tab-bar {
  display: flex;
  gap: var(--spacing-sm);
}

/* 单个 tab 按钮：两端等宽 */
.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.88);
  border: 2px solid var(--pixel-border);
  cursor: pointer;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  box-shadow: 3px 3px 0 0 rgba(107, 93, 85, 0.25);
  transition: all var(--transition-fast);
}

.tab-btn:hover:not(.tab-btn--active) {
  color: var(--color-primary);
  transform: translate(-1px, -1px);
}

/* 激活的 tab：主色实底 */
.tab-btn--active {
  background: var(--color-primary);
  color: #FFFFFF;
  border-color: var(--color-primary);
  box-shadow: 4px 4px 0 0 rgba(45, 34, 28, 0.35);
}

/* tab 中的数量徽章 */
.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  background: rgba(255, 255, 255, 0.25);
  font-size: 11px;
}

.tab-btn--active .tab-count {
  background: rgba(255, 255, 255, 0.25);
}

/* 清单容器 */
.item-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

/* 单条卡片 */
.item-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 4px 4px 0 0 rgba(139, 115, 85, 0.35);
  position: relative;
  transition: all var(--transition-fast);
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

.item-card:hover {
  transform: translate(-1px, -1px);
  box-shadow: 5px 5px 0 0 rgba(139, 115, 85, 0.35);
}

.item-card:active {
  transform: translate(1px, 1px);
  box-shadow: 3px 3px 0 0 rgba(139, 115, 85, 0.35);
}

/* 已购买条目：整体半透明 */
.item-card--purchased {
  opacity: 0.7;
}

/* 勾选框（圆角方框） */
.item-checkbox {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--pixel-border);
  background: #FFFFFF;
  cursor: pointer;
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.2);
  transition: all var(--transition-fast);
}

.item-checkbox:hover {
  box-shadow: 3px 3px 0 0 rgba(107, 93, 85, 0.3);
  transform: translate(-1px, -1px);
}

.item-checkbox:active {
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 0 rgba(107, 93, 85, 0.2);
}

/* 勾选后的样式：成功色实底 */
.item-checkbox--checked {
  background: var(--color-success);
  border-color: var(--color-success);
}

/* 对勾图标 */
.checkmark {
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 内容区：纵向排列两行 */
.item-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

/* 顶部：名称 + 徽章 */
.item-top {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

/* 物资名称 */
.item-name {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 已购买名称：加删除线 */
.item-name--done {
  text-decoration: line-through;
  color: var(--color-text-placeholder);
}

/* 自动/手动徽章 */
.item-badge {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  padding: 1px 6px;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  flex-shrink: 0;
}

/* 自动徽章：绿色 */
.item-badge--auto {
  background: rgba(91, 140, 90, 0.15);
  color: var(--color-success);
  border: 1px solid var(--color-success);
}

/* 手动徽章：金色 */
.item-badge--manual {
  background: rgba(224, 160, 48, 0.12);
  color: var(--color-warning);
  border: 1px solid var(--color-warning);
}

/* 底部：数量 + 分类 */
.item-bottom {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

/* 数量文字 */
.item-qty {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 分类文字 */
.item-category {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 删除按钮 */
.delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  background: none;
  border: 2px solid var(--color-border);
  color: var(--color-text-placeholder);
  cursor: pointer;
  transition: all var(--transition-fast);
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

/* 表单两列布局（手动添加对话框中） */
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
}

/* 对话框按钮通用样式 */
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

/* 取消按钮：白底 */
.dialog-btn--cancel {
  background: #FFFFFF;
  color: var(--color-text-primary);
}

.dialog-btn--cancel:hover {
  transform: translate(-1px, -1px);
}

/* 确认按钮：主色 */
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
</style>
