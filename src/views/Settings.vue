<!--
  ============================================================
  页面说明：系统设置中心
  集中管理与系统运行相关的所有配置项，包括：
    1. 物资分类管理（增 / 改 / 删，以及图标选择）
    2. 预警阈值配置（过期预警天数、默认最低库存）
    3. 数据备份（导出 / 导入 JSON 备份文件）
    4. 退出登录入口
  页面采用"顶部导航卡片 + 锚点跳转"的方式组织，
  方便用户在不同设置模块之间快速定位。
  ============================================================
-->

<script setup>
/*
  ============================================================
  脚本区：负责本页所有设置项的状态管理与业务操作。
  主要工作分为五块：
    1. 分类管理：新增、编辑、删除分类
    2. 阈值配置：读取、保存、恢复默认
    3. 数据备份：导出 JSON / 选择文件导入并覆盖
    4. 退出登录：带确认对话框
    5. 锚点跳转：点击顶部导航卡片滚动到对应区块
  ============================================================
*/

import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
// 引入 Element Plus 的全局消息提示与确认对话框组件
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Setting,
  Folder,
  Bell,
  Download,
  Upload,
  Plus,
  Edit,
  Delete,
  Check,
  Close,
  SwitchButton,
  User
} from '@element-plus/icons-vue'
// 引入三个数据源：系统设置、用户、库存
import { useSettingsStore } from '@/stores/settings'
import { useUserStore } from '@/stores/user'
import { useInventoryStore } from '@/stores/inventory'
// 引入两个默认常量：预警天数、最低库存
import { DEFAULT_EXPIRY_WARNING_DAYS, DEFAULT_MIN_QUANTITY } from '@/utils/constants'

const router = useRouter()
const settingsStore = useSettingsStore()
const userStore = useUserStore()
const inventoryStore = useInventoryStore()

// 隐藏文件选择框的引用，触发导入时调用
const fileInputRef = ref(null)
// 当前激活的设置区块（用于锚点跳转高亮）
const activeSection = ref('categories')

// 阈值表单：本地缓存编辑中的值，保存时才写入数据源
const thresholdForm = reactive({
  expiryAlertDays: DEFAULT_EXPIRY_WARNING_DAYS,
  defaultMinQuantity: DEFAULT_MIN_QUANTITY
})
const thresholdSaving = ref(false)

// 新增分类表单
const newCategory = ref({ name: '', icon: 'More' })
const addingCategory = ref(false)

// 编辑分类状态：editingId 记录当前正在编辑哪一项，editingDraft 暂存编辑值
const editingId = ref(null)
const editingDraft = ref({ name: '', icon: 'More' })

// Element Plus 可选图标（覆盖默认分类用过的 + 常用补充）
const ICON_OPTIONS = [
  'Food', 'Dish', 'Apple', 'Mug', 'Box', 'FirstAidKit', 'More',
  'KnifeFork', 'Goblet', 'Sugar', 'Present', 'Coin', 'CreditCard',
  'ShoppingCart', 'Goods', 'PriceTag', 'SoldOut', 'Stamp',
  'Sunny', 'Moon', 'Star', 'Lightning', 'TrendCharts'
]

// 页面挂载后并行加载分类与设置数据，并把数据库中的值填入表单
onMounted(async () => {
  await Promise.all([
    settingsStore.loadCategories(),
    settingsStore.loadSettings()
  ])
  thresholdForm.expiryAlertDays = settingsStore.expiryAlertDays
  thresholdForm.defaultMinQuantity = settingsStore.defaultMinQuantity
})

// ====== 分类管理 ======
// 新增一条分类
async function handleAddCategory() {
  if (!newCategory.value.name.trim()) {
    ElMessage.warning('请输入分类名称')
    return
  }
  addingCategory.value = true
  try {
    await settingsStore.addCategory(newCategory.value.name.trim(), newCategory.value.icon)
    ElMessage.success('分类已添加')
    // 清空输入，方便继续添加
    newCategory.value = { name: '', icon: 'More' }
  } catch {
    ElMessage.error('添加失败')
  } finally {
    addingCategory.value = false
  }
}

// 进入"编辑分类"模式：把当前值复制到 editingDraft，避免直接修改原数据
function startEditCategory(cat) {
  editingId.value = cat.id
  editingDraft.value = { name: cat.name, icon: cat.icon || 'More' }
}

// 取消编辑：清空编辑状态
function cancelEditCategory() {
  editingId.value = null
  editingDraft.value = { name: '', icon: 'More' }
}

// 保存编辑结果到数据源
async function saveEditCategory(cat) {
  if (!editingDraft.value.name.trim()) {
    ElMessage.warning('名称不能为空')
    return
  }
  try {
    await settingsStore.editCategory(cat.id, {
      name: editingDraft.value.name.trim(),
      icon: editingDraft.value.icon
    })
    ElMessage.success('已保存')
    cancelEditCategory()
  } catch {
    ElMessage.error('保存失败')
  }
}

// 删除分类（带二次确认，避免误删）
async function handleDeleteCategory(cat) {
  try {
    await ElMessageBox.confirm(
      `确定要删除「${cat.name}」分类吗?该分类下的物资分类信息将失效。`,
      '删除确认',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        customClass: 'pixel-message-box'
      }
    )
    await settingsStore.removeCategory(cat.id)
    ElMessage.success('分类已删除')
  } catch {
    // 用户取消或失败
  }
}

// ====== 阈值配置 ======
// 保存预警阈值前先做合法性校验
async function handleSaveThreshold() {
  if (thresholdForm.expiryAlertDays < 1 || thresholdForm.expiryAlertDays > 60) {
    ElMessage.warning('预警天数应在 1-60 之间')
    return
  }
  if (thresholdForm.defaultMinQuantity < 0 || thresholdForm.defaultMinQuantity > 99) {
    ElMessage.warning('默认阈值应在 0-99 之间')
    return
  }
  thresholdSaving.value = true
  try {
    await settingsStore.saveSettings({
      expiryAlertDays: thresholdForm.expiryAlertDays,
      defaultMinQuantity: thresholdForm.defaultMinQuantity
    })
    ElMessage.success('阈值已保存')
  } catch {
    ElMessage.error('保存失败')
  } finally {
    thresholdSaving.value = false
  }
}

// 恢复阈值为系统默认值并立即保存
async function handleResetThreshold() {
  thresholdForm.expiryAlertDays = DEFAULT_EXPIRY_WARNING_DAYS
  thresholdForm.defaultMinQuantity = DEFAULT_MIN_QUANTITY
  await handleSaveThreshold()
}

// ====== 数据导出 ======
// 将所有业务数据序列化为 JSON 并触发浏览器下载
async function handleExport() {
  try {
    const data = await settingsStore.doExportData()
    // 把数据对象转成 JSON 字符串，封装为 Blob
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    // 动态生成 <a> 标签触发下载，文件名带当天日期
    const a = document.createElement('a')
    const ts = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = `inventory-backup-${ts}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    ElMessage.success('数据已导出')
  } catch {
    ElMessage.error('导出失败')
  }
}

// ====== 数据导入 ======
// 触发隐藏的文件选择框
function triggerImport() {
  fileInputRef.value?.click()
}

// 处理文件选择：读取 → 解析 → 校验 → 二次确认 → 写入
async function handleFileChange(e) {
  const file = e.target.files?.[0]
  if (!file) return

  try {
    // 读取文件内容为文本
    const text = await file.text()
    const data = JSON.parse(text)

    // 基础格式校验：必须是对象且包含必要字段
    if (typeof data !== 'object' || data === null) {
      throw new Error('文件格式错误')
    }
    if (!Array.isArray(data.items) || !Array.isArray(data.categories)) {
      throw new Error('文件缺少必要字段(items / categories)')
    }

    // 汇总各类数据数量，用于二次确认提示
    const summary = [
      data.items.length,
      data.categories.length,
      data.consumptions?.length || 0,
      data.shoppingList?.length || 0
    ].join(' / ')

    try {
      // 二次确认：导入会覆盖当前数据，需要明示用户
      await ElMessageBox.confirm(
        `将导入 ${summary} 条数据(物资/分类/消耗/补货),此操作会覆盖当前数据,是否继续?`,
        '导入确认',
        {
          type: 'warning',
          confirmButtonText: '导入',
          cancelButtonText: '取消',
          customClass: 'pixel-message-box'
        }
      )
    } catch {
      e.target.value = ''
      return
    }

    // 执行导入并刷新库存视图
    await settingsStore.doImportData(data)
    await inventoryStore.loadItems()
    ElMessage.success('数据导入成功')
  } catch (err) {
    if (err && err.message && !err.message.includes('取消')) {
      ElMessage.error('导入失败:' + (err.message || '文件格式错误'))
    }
  } finally {
    // 重置 input，确保用户连续导入同一文件也能触发 change
    e.target.value = ''
  }
}

// ====== 退出登录 ======
// 退出登录（带确认对话框），成功后跳回登录页
async function handleLogout() {
  try {
    await ElMessageBox.confirm(
      '确定要退出登录吗?',
      '退出确认',
      {
        type: 'warning',
        confirmButtonText: '退出',
        cancelButtonText: '取消',
        customClass: 'pixel-message-box'
      }
    )
    userStore.logout()
    ElMessage.success('已退出登录')
    router.push('/login')
  } catch {
    // 取消
  }
}

// 顶部导航卡片：平滑滚动到指定区块
function scrollToSection(id) {
  activeSection.value = id
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <!--
    ============================================================
    模板区：决定设置页的视觉结构，由以下几部分组成：
      1. 装饰背景层
      2. 顶部欢迎区（头像 + 用户名）
      3. 导航卡片网格（4 个入口：分类 / 阈值 / 备份 / 退出）
      4. 分类管理区
      5. 预警阈值区
      6. 数据备份区（导出 + 导入）
      7. 页脚版本信息
    ============================================================
  -->
  <div class="settings-page">
    <!-- 装饰背景 -->
    <div class="bg-decoration">
      <div class="bg-orb bg-orb--1" />   <!-- 右上角光晕 -->
      <div class="bg-orb bg-orb--2" />   <!-- 左下角光晕 -->
      <div class="bg-grid" />            <!-- 像素风网格 -->
    </div>

    <div class="settings-content">
      <!-- 顶部欢迎 -->
      <!-- 展示当前登录用户名 -->
      <div class="settings-header">
        <div class="header-avatar">
          <el-icon :size="32" color="#D4875A"><User /></el-icon>
        </div>
        <div class="header-info">
          <h1 class="header-name">{{ userStore.username || '未登录' }}</h1>
          <p class="header-subtitle">设置与管理</p>
        </div>
      </div>

      <!-- 导航卡片 -->
      <!-- 4 个快捷入口，点击后滚动到对应区块，最后一项是危险操作（退出登录） -->
      <nav class="nav-grid">
        <button class="nav-card" @click="scrollToSection('categories')">
          <div class="nav-card-icon" style="color: var(--color-primary);">
            <el-icon :size="24"><Folder /></el-icon>
          </div>
          <span class="nav-card-label">分类管理</span>
        </button>
        <button class="nav-card" @click="scrollToSection('threshold')">
          <div class="nav-card-icon" style="color: var(--color-warning);">
            <el-icon :size="24"><Bell /></el-icon>
          </div>
          <span class="nav-card-label">预警阈值</span>
        </button>
        <button class="nav-card" @click="scrollToSection('data')">
          <div class="nav-card-icon" style="color: var(--color-success);">
            <el-icon :size="24"><Setting /></el-icon>
          </div>
          <span class="nav-card-label">数据备份</span>
        </button>
        <button class="nav-card nav-card--danger" @click="handleLogout">
          <div class="nav-card-icon" style="color: var(--color-danger);">
            <el-icon :size="24"><SwitchButton /></el-icon>
          </div>
          <span class="nav-card-label">退出登录</span>
        </button>
      </nav>

      <!-- 分类管理 -->
      <section id="categories" class="settings-section">
        <div class="section-header">
          <h2 class="section-title">分类管理</h2>
          <!-- 右侧显示当前分类总数 -->
          <span class="section-count">{{ settingsStore.categories.length }} 项</span>
        </div>

        <div class="card">
          <!-- 新增分类行：名称 + 图标 + 添加按钮 -->
          <div class="add-row">
            <el-input
              v-model="newCategory.name"
              placeholder="新分类名称"
              maxlength="8"
              show-word-limit
              clearable
              style="flex: 1;"
              @keyup.enter="handleAddCategory"
            />
            <el-select v-model="newCategory.icon" style="width: 140px;">
              <el-option
                v-for="icon in ICON_OPTIONS"
                :key="icon"
                :label="icon"
                :value="icon"
              />
            </el-select>
            <el-button
              type="primary"
              :loading="addingCategory"
              :disabled="!newCategory.name.trim()"
              @click="handleAddCategory"
            >
              <el-icon><Plus /></el-icon>
              <span>添加</span>
            </el-button>
          </div>

          <!-- 已有分类列表 -->
          <div class="category-list">
            <div
              v-for="cat in settingsStore.categories"
              :key="cat.id"
              class="category-item"
              :class="{ 'category-item--editing': editingId === cat.id }"
            >
              <!-- 编辑模式：显示输入框与保存/取消按钮 -->
              <template v-if="editingId === cat.id">
                <el-input
                  v-model="editingDraft.name"
                  size="small"
                  maxlength="8"
                  show-word-limit
                  style="flex: 1;"
                />
                <el-select v-model="editingDraft.icon" size="small" style="width: 130px;">
                  <el-option
                    v-for="icon in ICON_OPTIONS"
                    :key="icon"
                    :label="icon"
                    :value="icon"
                  />
                </el-select>
                <button class="icon-btn icon-btn--primary" @click="saveEditCategory(cat)">
                  <el-icon :size="14"><Check /></el-icon>
                </button>
                <button class="icon-btn" @click="cancelEditCategory">
                  <el-icon :size="14"><Close /></el-icon>
                </button>
              </template>

              <!-- 普通模式：显示图标、名称、排序、编辑/删除按钮 -->
              <template v-else>
                <div class="cat-icon-box">
                  <el-icon :size="20" color="var(--color-primary)">
                    <!-- 若图标名在允许列表里则动态渲染，否则用默认 Folder 兜底 -->
                    <component :is="cat.icon" v-if="['Food','Dish','Apple','Mug','Box','FirstAidKit','More','KnifeFork','Goblet','Sugar','Present','Coin','CreditCard','ShoppingCart','Goods','PriceTag','SoldOut','Stamp','Sunny','Moon','Star','Lightning','TrendCharts'].includes(cat.icon)" />
                    <Folder v-else />
                  </el-icon>
                </div>
                <span class="cat-name">{{ cat.name }}</span>
                <span class="cat-sort">#{{ cat.sort }}</span>
                <button class="icon-btn" @click="startEditCategory(cat)" title="编辑">
                  <el-icon :size="14"><Edit /></el-icon>
                </button>
                <button class="icon-btn icon-btn--danger" @click="handleDeleteCategory(cat)" title="删除">
                  <el-icon :size="14"><Delete /></el-icon>
                </button>
              </template>
            </div>

            <!-- 无分类时的占位 -->
            <div v-if="settingsStore.categories.length === 0" class="empty-state">
              暂无分类,请添加
            </div>
          </div>
        </div>
      </section>

      <!-- 预警阈值 -->
      <section id="threshold" class="settings-section">
        <div class="section-header">
          <h2 class="section-title">预警阈值</h2>
        </div>

        <div class="card">
          <!-- 过期预警天数配置 -->
          <div class="threshold-row">
            <div class="threshold-label">
              <span class="threshold-name">过期预警天数</span>
              <span class="threshold-hint">距过期多少天开始预警</span>
            </div>
            <el-input-number
              v-model="thresholdForm.expiryAlertDays"
              :min="1"
              :max="60"
              size="default"
              controls-position="right"
            />
            <span class="threshold-unit">天</span>
          </div>

          <div class="divider" />

          <!-- 默认最低库存配置 -->
          <div class="threshold-row">
            <div class="threshold-label">
              <span class="threshold-name">默认最低库存</span>
              <span class="threshold-hint">新增物资时默认的最低阈值</span>
            </div>
            <el-input-number
              v-model="thresholdForm.defaultMinQuantity"
              :min="0"
              :max="99"
              size="default"
              controls-position="right"
            />
            <span class="threshold-unit">个</span>
          </div>

          <!-- 操作按钮：恢复默认 / 保存 -->
          <div class="threshold-actions">
            <el-button @click="handleResetThreshold">恢复默认</el-button>
            <el-button type="primary" :loading="thresholdSaving" @click="handleSaveThreshold">
              保存设置
            </el-button>
          </div>
        </div>
      </section>

      <!-- 数据备份 -->
      <section id="data" class="settings-section">
        <div class="section-header">
          <h2 class="section-title">数据备份</h2>
        </div>

        <div class="card">
          <!-- 导出区域 -->
          <div class="data-card">
            <div class="data-card-icon" style="color: var(--color-success);">
              <el-icon :size="32"><Download /></el-icon>
            </div>
            <div class="data-card-body">
              <h3 class="data-card-title">导出数据</h3>
              <p class="data-card-desc">将所有物资、分类、消耗、补货、设置导出为 JSON 文件,用于备份或迁移。</p>
              <el-button type="success" plain @click="handleExport">
                <el-icon><Download /></el-icon>
                <span>导出 JSON</span>
              </el-button>
            </div>
          </div>

          <div class="divider" />

          <!-- 导入区域：附带隐藏的文件选择 input -->
          <div class="data-card">
            <div class="data-card-icon" style="color: var(--color-warning);">
              <el-icon :size="32"><Upload /></el-icon>
            </div>
            <div class="data-card-body">
              <h3 class="data-card-title">导入数据</h3>
              <p class="data-card-desc">从 JSON 备份恢复,导入后会覆盖当前所有数据,请提前导出当前数据以防丢失。</p>
              <el-button type="warning" plain @click="triggerImport">
                <el-icon><Upload /></el-icon>
                <span>选择文件</span>
              </el-button>
              <!-- 真正的文件选择框，通过按钮触发 -->
              <input
                ref="fileInputRef"
                type="file"
                accept=".json,application/json"
                style="display: none;"
                @change="handleFileChange"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- 页脚：版本信息 -->
      <div class="page-footer">
        <span>家庭物资库存管家 v1.0 · 桌面端</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：定义设置页的视觉表现。
  整体采用"卡片堆叠 + 区块标题"的结构，与项目像素风视觉一致。
  ============================================================
*/

/* 最外层容器：相对定位，最小高度撑满视口（扣除导航栏高度） */
.settings-page {
  position: relative;
  min-height: calc(100vh - var(--navbar-height));
}

/* ===== 装饰背景 ===== */
/* 背景装饰层：铺满整页，不响应鼠标 */
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

/* 右上角光晕：暖橙色 */
.bg-orb--1 {
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, rgba(212, 135, 90, 0.35), transparent);
  top: -60px;
  right: -80px;
}

/* 左下角光晕：金黄色 */
.bg-orb--2 {
  width: 280px;
  height: 280px;
  background: radial-gradient(circle, rgba(224, 160, 48, 0.28), transparent);
  bottom: 200px;
  left: -60px;
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

/* 网格上叠加细小圆点，形成颗粒质感 */
.bg-grid::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(180, 150, 130, 0.08) 1px, transparent 1px);
  background-size: 4px 4px;
}

/* ===== 主内容 ===== */
/* 内容层：纵向排列各模块，水平居中并限宽 */
.settings-content {
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

/* ===== 头部 ===== */
/* 头部欢迎区：头像 + 用户名 横向排列 */
.settings-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) 0;
}

/* 用户头像方框 */
.header-avatar {
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 4px 4px 0 0 rgba(107, 93, 85, 0.35);
  flex-shrink: 0;
}

.header-info {
  flex: 1;
  min-width: 0;
}

/* 用户名（大字号像素体） */
.header-name {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-2xl);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin-bottom: 2px;
}

/* 副标题 */
.header-subtitle {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 导航卡片 ===== */
/* 4 个导航卡片：四列等宽栅格 */
.nav-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-md);
}

/* 导航卡片本体 */
.nav-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 4px 4px 0 0 rgba(139, 115, 85, 0.35);
  cursor: pointer;
  transition: all var(--transition-fast);
  color: var(--color-text-primary);
}

/* 悬浮：上抬，阴影加深 */
.nav-card:hover {
  transform: translate(-2px, -2px);
  box-shadow: 6px 6px 0 0 rgba(139, 115, 85, 0.4);
}

/* 按下：下沉，阴影变小 */
.nav-card:active {
  transform: translate(1px, 1px);
  box-shadow: 2px 2px 0 0 rgba(139, 115, 85, 0.35);
}

/* 危险卡片（退出登录）：悬浮时边框变红 */
.nav-card--danger:hover {
  border-color: var(--color-danger);
}

/* 卡片图标方框 */
.nav-card-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--pixel-border);
  background: rgba(255, 255, 255, 0.6);
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.2);
}

/* 卡片文字 */
.nav-card-label {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 区块 ===== */
/* 通用 section：纵向排列标题与卡片 */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

/* section 标题栏：标题左对齐，数量徽章右对齐 */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--spacing-xs);
}

/* section 标题文字 */
.section-title {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-normal);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 数量徽章（如"4 项"） */
.section-count {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  background: rgba(255, 255, 255, 0.92);
  border: 2px solid var(--color-border);
  padding: 1px 8px;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 卡片容器 ===== */
/* 通用卡片：白底 + 厚边框 + 硬阴影 */
.card {
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 5px 5px 0 0 rgba(139, 115, 85, 0.4);
  padding: var(--spacing-lg);
  position: relative;
}

/* 卡片表面颗粒质感叠层 */
.card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

/* ===== 分类管理 ===== */
/* 新增分类行：横向排列输入框、下拉、按钮 */
.add-row {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
  align-items: center;
}

/* 分类列表：纵向排列 */
.category-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

/* 单个分类条目 */
.category-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: rgba(253, 246, 240, 0.6);
  border: 2px solid var(--color-border);
  transition: all var(--transition-fast);
}

/* 编辑中的分类条目：高亮边框 */
.category-item--editing {
  border-color: var(--color-primary);
  background: rgba(232, 184, 152, 0.2);
}

/* 分类图标方框 */
.cat-icon-box {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--pixel-border);
  background: #FFFFFF;
  flex-shrink: 0;
}

/* 分类名称：占据剩余空间 */
.cat-name {
  flex: 1;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  min-width: 0;
}

/* 分类排序号（#1、#2 等） */
.cat-sort {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 小图标按钮（编辑 / 删除 / 保存 / 取消） */
.icon-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #FFFFFF;
  border: 2px solid var(--pixel-border);
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
  box-shadow: 1px 1px 0 0 rgba(107, 93, 85, 0.2);
  flex-shrink: 0;
}

.icon-btn:hover {
  color: var(--color-primary);
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.3);
}

/* 主要操作（保存）按钮：成功色 */
.icon-btn--primary {
  color: var(--color-success);
  background: rgba(91, 140, 90, 0.1);
}

/* 危险操作（删除）按钮：悬浮时变红 */
.icon-btn--danger:hover {
  color: var(--color-danger);
  border-color: var(--color-danger);
}

/* 空数据占位 */
.empty-state {
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

/* ===== 阈值配置 ===== */
/* 阈值单行：标签 + 数字输入 + 单位 横向排列 */
.threshold-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

/* 阈值标签区：纵向显示名称与说明 */
.threshold-label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

/* 阈值项名称 */
.threshold-name {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 阈值项说明文字 */
.threshold-hint {
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 单位文字（天、个） */
.threshold-unit {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  min-width: 20px;
}

/* 分隔线 */
.divider {
  height: 1px;
  background: var(--color-border-light);
  margin: var(--spacing-md) 0;
}

/* 阈值操作按钮组 */
.threshold-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}

/* ===== 数据备份 ===== */
/* 数据卡片单元：图标 + 文字说明 + 操作按钮 */
.data-card {
  display: flex;
  gap: var(--spacing-md);
  align-items: flex-start;
}

/* 数据卡片图标方框 */
.data-card-icon {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid var(--pixel-border);
  background: rgba(255, 255, 255, 0.6);
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.25);
  flex-shrink: 0;
}

/* 数据卡片正文区 */
.data-card-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  min-width: 0;
}

/* 数据卡片标题 */
.data-card-title {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  font-weight: var(--font-weight-normal);
}

/* 数据卡片说明文字 */
.data-card-desc {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  line-height: 1.5;
  margin-bottom: var(--spacing-xs);
}

/* 数据卡片中的按钮：左对齐 */
.data-card-body .el-button {
  align-self: flex-start;
}

/* ===== 页脚 ===== */
/* 页脚版本号文字 */
.page-footer {
  text-align: center;
  padding: var(--spacing-lg) 0;
  font-family: var(--font-family-pixel);
  font-size: 10px;
  color: var(--color-text-placeholder);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}
</style>
