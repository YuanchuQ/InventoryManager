<!--
  ============================================================
  页面说明：添加物资页
  用户填写一份完整的物资表单（名称、分类、数量、过期日、单价、
  存放位置等）后提交，将其添加到库存系统。
  说明：
    - 本组件其实是"添加 + 编辑"的共用组件，
      路由名为 InventoryEdit 时进入编辑模式（带 id），
      路由名为 InventoryAdd 时进入新增模式。
    - 提交逻辑统一走 inventoryStore.addItem / editItem。
  ============================================================
-->

<script setup>
/**
 * 添加/编辑物资页（共用同一个组件）
 * ⚠️ 任何新增 / 编辑都通过 inventoryStore.addItem / editItem，
 *    底层统一写入 src/utils/goodsStore.js（localStorage 按家庭/个人作用域隔离），
 *    切换到其它页面会立刻看到新增/修改后的数据。
 *    本组件不维护任何独立物资数组。
 */

/*
  ============================================================
  脚本区：负责表单数据、校验规则、提交逻辑以及编辑态回填。
  主要工作：
    1. 判断当前是新增还是编辑（根据路由名）
    2. 编辑模式下从库存数据源把原物资字段回填到表单
    3. 数字字段提供 +/- 步进器
    4. 提交时调用对应的新增 / 编辑接口
  ============================================================
*/

import { ref, onMounted } from 'vue'
// 路由：用于读取参数（如编辑 id）与跳转
import { useRouter, useRoute } from 'vue-router'
import { useInventoryStore } from '@/stores/inventory'
import { useSettingsStore } from '@/stores/settings'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Minus, Plus } from '@element-plus/icons-vue'
// 单位枚举（个、瓶、盒等），用于下拉选项
import { UNIT_OPTIONS } from '@/utils/constants'

const router = useRouter()
const route = useRoute()
const inventoryStore = useInventoryStore()
const settingsStore = useSettingsStore()

const formRef = ref(null)
const submitting = ref(false)
// 是否编辑模式：根据路由名判断
const isEdit = ref(route.name === 'InventoryEdit')
// 编辑模式下的物资 id
const editId = ref(route.params.id || '')

// 表单数据：覆盖一个物资的所有可编辑字段
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

// 数字字段的 +/- 通用调整：带最小/最大范围校验
function adjustValue(field, delta, min, max) {
  const next = (form.value[field] || 0) + delta
  if (next < min || next > max) return
  form.value[field] = next
}

// 挂载时：始终加载分类；若编辑模式则把原物资回填到表单
onMounted(async () => {
  await settingsStore.loadCategories()

  if (isEdit.value && editId.value) {
    await inventoryStore.loadItems()
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
    }
  }
})

// 提交表单：校验通过后调用新增或编辑接口
const submitForm = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (isEdit.value) {
      await inventoryStore.editItem(editId.value, form.value)
      ElMessage.success('编辑成功')
    } else {
      await inventoryStore.addItem(form.value)
      ElMessage.success('添加成功')
    }
    router.push('/inventory')
  } catch {
    ElMessage.error('操作失败，请重试')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <!--
    ============================================================
    模板区：决定本页的视觉结构，由两部分组成：
      1. 顶栏（返回按钮 + 页面标题）
      2. 表单卡片
         - 物资名称、所属分类、物资规格
         - 数量（步进器） + 单位
         - 过期日期
         - 最低库存阈值 + 购买单价
         - 存放位置、备注
         - 取消 / 保存 按钮
    ============================================================
  -->
  <div class="page-content">
    <div class="page-content-inner">
      <!-- 顶栏 -->
      <div class="page-header">
        <!-- 返回按钮：用 router.back() 回到上一页 -->
        <button class="back-btn" @click="router.back()">
          <el-icon :size="18"><ArrowLeft /></el-icon>
          <span>返回</span>
        </button>
        <!-- 标题根据模式动态切换 -->
        <h2 class="page-title">{{ isEdit ? '编辑物资' : '添加物资' }}</h2>
        <!-- 占位元素，使标题视觉上居中 -->
        <div style="width: 80px" />
      </div>

      <!-- 表单卡片 -->
      <div class="form-card">
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

          <!-- 存放位置（可选文本） -->
          <el-form-item label="存放位置">
            <el-input v-model="form.storageLocation" placeholder="如：冰箱上层、橱柜、药箱" />
          </el-form-item>

          <!-- 备注（可选多行文本） -->
          <el-form-item label="备注">
            <el-input v-model="form.note" type="textarea" :rows="3" placeholder="可选备注" maxlength="100" show-word-limit />
          </el-form-item>

          <!-- 底部按钮：取消 / 提交 -->
          <div class="form-actions">
            <el-button @click="router.back()">取消</el-button>
            <el-button type="primary" :loading="submitting" @click="submitForm">
              {{ isEdit ? '保存修改' : '添加物资' }}
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
  样式区：定义本页面的视觉表现。
  外层为暖色渐变背景；中部为一张像素风表单卡片；
  数字字段使用一体化"步进器"控件（左右按钮 + 中间输入框）。
  ============================================================
*/

/* 整页容器：撑满视口高度并居中 */
.page-content {
  width: 100%;
  min-height: calc(100vh - var(--navbar-height));
  display: flex;
  justify-content: center;
  background: linear-gradient(135deg, #FDF6F0 0%, #F8EDE0 50%, #FDF6F0 100%);
}

/* 内容容器：限宽 + 上下结构 */
.page-content-inner {
  width: 100%;
  max-width: 720px;
  padding: var(--content-padding-y) var(--content-padding-x);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

/* ===== 顶栏 ===== */
/* 顶栏：返回按钮、标题、右侧占位三段式 */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--spacing-xs);
}

/* 返回按钮：白底像素边 */
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

/* 页面标题：像素体 */
.page-title {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-xl);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  margin: 0;
}

/* ===== 表单卡片 ===== */
/* 表单容器：白底 + 厚边框 + 硬阴影 */
.form-card {
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 5px 5px 0 0 rgba(139, 115, 85, 0.4);
  padding: var(--spacing-xl);
  position: relative;
}

/* 卡片表面颗粒质感叠层 */
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

/* 表单底部按钮区：右对齐，与上方虚线分隔 */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
  padding-top: var(--spacing-md);
  border-top: 2px dashed var(--color-border-light);
}

/* ===== 表单元素统一样式 ===== */
/* 标签字体 */
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

/* 输入框外壳 */
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

/* 多行文本框 */
:deep(.el-textarea__inner) {
  font-family: var(--font-family-pixel);
  color: var(--color-text-primary);
  border: 2px solid var(--pixel-border);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 按钮统一字体 */
:deep(.el-button) {
  font-family: var(--font-family-pixel);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 数字步进器（与拖拽管理一致的一体外框样式）===== */
/* 步进器外框：左按钮 + 输入框 + 右按钮 一体化 */
.number-stepper {
  display: flex;
  align-items: center;
  width: 100%;
  border: 2px solid var(--pixel-border);
  background: #FFFFFF;
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.25);
}

/* 步进器按钮 */
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

/* 中间输入框：占满剩余空间 */
.stepper-input {
  flex: 1;
  min-width: 0;
  height: 40px;
}

/* 输入框去掉默认边框，并用两侧竖线视觉分割按钮区 */
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
