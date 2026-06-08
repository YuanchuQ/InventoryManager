<!--
  ============================================================
  页面说明：编辑物资页
  独立的"编辑"入口（与添加页同样使用类似表单结构，但逻辑独立）。
  打开本页时根据 URL 中的物资 id 把原数据回填到表单，
  用户修改后点击"保存修改"将变更写回库存数据源。
  说明：
    - 与 InventoryAdd.vue 视觉一致，但只承担"编辑"职责
    - 找不到物资时直接跳回库存列表并给出错误提示
  ============================================================
-->

<script setup>
/**
 * 编辑物资页
 * ⚠️ 通过 inventoryStore.editItem 写入，底层走 src/utils/goodsStore.js，
 *    切换任意其它页面都会立刻看到修改后的最新数据。
 */

/*
  ============================================================
  脚本区：负责编辑表单的回填、校验、保存。
  主要工作：
    1. 加载分类列表与库存数据，并把指定物资字段填入表单
    2. 数字字段提供 +/- 步进器
    3. 提交时调用 inventoryStore.editItem，成功后跳回列表
    4. 找不到对应物资时跳回列表
  ============================================================
*/

import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useInventoryStore } from '@/stores/inventory'
import { useSettingsStore } from '@/stores/settings'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Minus, Plus } from '@element-plus/icons-vue'
// 单位枚举（个、瓶、盒等）
import { UNIT_OPTIONS } from '@/utils/constants'

const router = useRouter()
const route = useRoute()
const inventoryStore = useInventoryStore()
const settingsStore = useSettingsStore()

const formRef = ref(null)
const submitting = ref(false)
// 当前正在编辑的物资 id
const editId = ref(route.params.id || '')
// 加载中状态：用于卡片整体的 loading 遮罩
const loading = ref(false)

// 表单数据
const form = ref({
  name: '',
  categoryId: '',
  spec: '',
  quantity: 1,
  unit: '个',
  expiryDate: '',
  minQuantity: 1,
  price: 0,
  storageLocation: '',
  note: ''
})

// 校验规则
const rules = {
  name: [{ required: true, message: '请输入物资名称', trigger: 'blur' }],
  categoryId: [{ required: true, message: '请选择分类', trigger: 'change' }],
  quantity: [{ required: true, message: '请输入数量', trigger: 'blur' }],
  unit: [{ required: true, message: '请选择单位', trigger: 'change' }],
  expiryDate: [{ required: true, message: '请选择过期日期', trigger: 'change' }],
  minQuantity: [{ required: true, message: '请输入最低库存阈值', trigger: 'blur' }]
}

// 数字字段调整：带范围校验
function adjustValue(field, delta, min, max) {
  const next = (form.value[field] || 0) + delta
  if (next < min || next > max) return
  form.value[field] = next
}

// 挂载时：并行加载分类与库存，再把对应物资数据回填到表单
onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([
      settingsStore.loadCategories(),
      inventoryStore.loadItems()
    ])

    const item = inventoryStore.items.find(i => i.id === editId.value)
    if (item) {
      form.value = {
        name: item.name,
        categoryId: item.categoryId,
        spec: item.spec || '',
        quantity: item.quantity,
        unit: item.unit,
        expiryDate: item.expiryDate,
        minQuantity: item.minQuantity,
        price: item.price || 0,
        storageLocation: item.storageLocation || '',
        note: item.note || ''
      }
    } else {
      // 找不到物资：提示后跳回列表
      ElMessage.error('未找到该物资')
      router.replace('/inventory')
    }
  } catch {
    ElMessage.error('加载失败，请重试')
  } finally {
    loading.value = false
  }
})

// 提交保存
const submitForm = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await inventoryStore.editItem(editId.value, form.value)
    ElMessage.success('保存成功')
    router.push('/inventory')
  } catch {
    ElMessage.error('保存失败，请重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <!--
    ============================================================
    模板区：决定编辑页的视觉结构，由三部分组成：
      1. 装饰背景层（光晕、网格）
      2. 顶栏（返回到详情页 + 标题）
      3. 表单卡片（与添加页字段一致，按钮文案为"保存修改"）
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
        <!-- 返回到该物资的详情页 -->
        <button class="back-btn" @click="router.replace('/inventory/' + editId)">
          <el-icon :size="18"><ArrowLeft /></el-icon>
          <span>返回</span>
        </button>
        <h2 class="page-title">编辑物资</h2>
        <!-- 占位元素，使标题视觉上居中 -->
        <div style="width: 80px" />
      </div>

      <!-- 表单卡片：加载期间显示 loading 遮罩 -->
      <div v-loading="loading" class="form-card">
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" size="large">
          <!-- 物资名称 -->
          <el-form-item label="物资名称" prop="name">
            <el-input v-model="form.name" placeholder="如：鸡蛋、洗衣液" maxlength="20" show-word-limit />
          </el-form-item>

          <!-- 所属分类 -->
          <el-form-item label="所属分类" prop="categoryId">
            <el-select v-model="form.categoryId" placeholder="选择分类" style="width: 100%">
              <el-option v-for="cat in settingsStore.categories" :key="cat.id" :label="cat.name" :value="cat.id" />
            </el-select>
          </el-form-item>

          <!-- 物资规格（可选） -->
          <el-form-item label="物资规格">
            <el-input v-model="form.spec" placeholder="如：500ml、3L·薰衣草香、土鸡蛋·盒装" maxlength="30" show-word-limit />
          </el-form-item>

          <!-- 数量 + 单位：两列横排 -->
          <div class="form-row">
            <el-form-item label="数量" prop="quantity">
              <div class="number-stepper">
                <button class="stepper-btn" @click="adjustValue('quantity', -1, 0, 999)" :disabled="form.quantity <= 0">
                  <el-icon :size="14"><Minus /></el-icon>
                </button>
                <el-input-number v-model="form.quantity" :min="0" :max="999" :controls="false" class="stepper-input" />
                <button class="stepper-btn" @click="adjustValue('quantity', 1, 0, 999)" :disabled="form.quantity >= 999">
                  <el-icon :size="14"><Plus /></el-icon>
                </button>
              </div>
            </el-form-item>

            <el-form-item label="单位" prop="unit">
              <el-select v-model="form.unit" style="width: 100%">
                <el-option v-for="u in UNIT_OPTIONS" :key="u" :label="u" :value="u" />
              </el-select>
            </el-form-item>
          </div>

          <!-- 过期日期：禁选过去的日期 -->
          <el-form-item label="过期日期" prop="expiryDate">
            <el-date-picker
              v-model="form.expiryDate"
              type="date"
              placeholder="选择日期"
              value-format="YYYY-MM-DD"
              style="width: 100%"
              :disabled-date="(date) => date.getTime() < Date.now() - 86400000"
            />
          </el-form-item>

          <!-- 最低库存阈值 + 购买单价：两列横排 -->
          <div class="form-row">
            <el-form-item label="最低库存阈值" prop="minQuantity">
              <div class="number-stepper">
                <button class="stepper-btn" @click="adjustValue('minQuantity', -1, 0, 99)" :disabled="form.minQuantity <= 0">
                  <el-icon :size="14"><Minus /></el-icon>
                </button>
                <el-input-number v-model="form.minQuantity" :min="0" :max="99" :controls="false" class="stepper-input" />
                <button class="stepper-btn" @click="adjustValue('minQuantity', 1, 0, 99)" :disabled="form.minQuantity >= 99">
                  <el-icon :size="14"><Plus /></el-icon>
                </button>
              </div>
            </el-form-item>

            <el-form-item label="购买单价（元）">
              <div class="number-stepper">
                <button class="stepper-btn" @click="adjustValue('price', -0.5, 0, 99999)" :disabled="form.price <= 0">
                  <el-icon :size="14"><Minus /></el-icon>
                </button>
                <el-input-number v-model="form.price" :min="0" :precision="2" :controls="false" class="stepper-input" />
                <button class="stepper-btn" @click="adjustValue('price', 0.5, 0, 99999)" :disabled="form.price >= 99999">
                  <el-icon :size="14"><Plus /></el-icon>
                </button>
              </div>
            </el-form-item>
          </div>

          <!-- 存放位置（可选） -->
          <el-form-item label="存放位置">
            <el-input v-model="form.storageLocation" placeholder="如：冰箱上层、橱柜、药箱" />
          </el-form-item>

          <!-- 备注（可选） -->
          <el-form-item label="备注">
            <el-input v-model="form.note" type="textarea" :rows="3" placeholder="可选备注" maxlength="100" show-word-limit />
          </el-form-item>

          <!-- 底部按钮：取消（回详情）/ 保存修改 -->
          <div class="form-actions">
            <el-button @click="router.replace('/inventory/' + editId)">取消</el-button>
            <el-button type="primary" :loading="submitting" @click="submitForm">
              保存修改
            </el-button>
          </div>
        </el-form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：与添加页保持一致的像素风视觉。
  数字字段使用统一的步进器；表单卡片为白底厚边框。
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
  max-width: 720px;
  margin: 0 auto;
  padding: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

/* ===== 顶栏 ===== */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--spacing-xs);
}

/* 返回按钮 */
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

/* ===== 表单卡片 ===== */
.form-card {
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 5px 5px 0 0 rgba(139, 115, 85, 0.4);
  padding: var(--spacing-xl);
  position: relative;
}

/* 卡片颗粒叠层 */
.form-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

/* 表单两列布局 */
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
}

/* 表单底部按钮区 */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 2px dashed var(--color-border-light);
}

/* ===== 表单元素统一样式 ===== */
:deep(.el-form-item__label) {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-normal);
  color: var(--color-text-primary);
  padding-bottom: 6px;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

:deep(.el-input__wrapper) {
  background: #FFFFFF;
  border: 2px solid var(--pixel-border);
  box-shadow: 3px 3px 0 0 rgba(107, 93, 85, 0.25);
  transition: all var(--transition-fast);
  padding: 4px 12px;
}

:deep(.el-input__wrapper:hover) {
  border-color: var(--color-primary);
  box-shadow: 4px 4px 0 0 rgba(107, 93, 85, 0.30);
  transform: translate(-1px, -1px);
}

:deep(.el-input__wrapper.is-focus) {
  border-color: var(--color-primary);
  box-shadow: 4px 4px 0 0 rgba(212, 135, 90, 0.35);
  background: #FFFDFB;
  transform: translate(-1px, -1px);
}

:deep(.el-input__inner) {
  font-family: var(--font-family-pixel);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

:deep(.el-textarea__inner) {
  font-family: var(--font-family-pixel);
  color: var(--color-text-primary);
  border: 2px solid var(--pixel-border);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

:deep(.el-button) {
  font-family: var(--font-family-pixel);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 数字步进器（与拖拽管理一致的一体外框样式）===== */
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

/* 隐藏数字输入框的浏览器默认上下箭头 */
.stepper-input :deep(input::-webkit-outer-spin-button),
.stepper-input :deep(input::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}

.stepper-input :deep(input[type='number']) {
  -moz-appearance: textfield;
}
</style>
