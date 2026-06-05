<!--
  ============================================================
  页面说明：家庭管理
  支持把多名已注册用户组合为同一个"家庭"，
  家庭成员之间共享同一份物资库存与补货清单。
  页面有两种主要状态：
    1. 当前账号还没有家庭：展示"创建家庭"引导卡片
    2. 已加入或创建家庭：展示家庭概要、成员列表、添加成员表单
  其他能力：
    - 仅家庭创建者可以移除成员（自身除外）
    - 所有成员权限平等，均可增删改查家庭物资
  ============================================================
-->

<script setup>
/*
  ============================================================
  脚本区：负责家庭信息展示、创建家庭、成员增删等操作。
  主要工作：
    1. 读取当前账号是否已加入家庭，按场景渲染不同模块
    2. 创建家庭、添加成员、移除成员（带校验与确认）
    3. 挂载时刷新一次当前用户信息，保证数据是最新的
  ============================================================
*/

import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, HomeFilled, Plus, User, UserFilled } from '@element-plus/icons-vue'
// 用户数据源（账号信息与家庭关系都托管在此）
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// 两个表单引用 + 两个 loading 状态
const createFormRef = ref(null)
const addFormRef = ref(null)
const creating = ref(false)
const adding = ref(false)

// 创建家庭表单
const createForm = reactive({
  name: ''
})

// 添加成员表单
const addForm = reactive({
  username: ''
})

// 创建家庭校验规则
const createRules = {
  name: [
    { required: true, message: '请输入家庭名称', trigger: 'blur' },
    { min: 2, max: 20, message: '家庭名称长度 2~20 位', trigger: 'blur' }
  ]
}

// 添加成员校验规则
const addRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 20, message: '用户名长度 2~20 位', trigger: 'blur' }
  ]
}

// 当前账号是否已加入家庭
const hasFamily = computed(() => !!userStore.currentFamily)
// 当前家庭名称
const familyName = computed(() => userStore.currentFamily?.name || '')
// 成员人数
const memberCount = computed(() => userStore.familyMembers.length)

// 创建家庭：校验通过后调用 store
async function handleCreateFamily() {
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return

  creating.value = true
  try {
    const result = userStore.createFamily(createForm.name)
    if (result.success) {
      ElMessage.success(result.message)
      createForm.name = ''
    } else {
      ElMessage.error(result.message)
    }
  } finally {
    creating.value = false
  }
}

// 添加成员：通过用户名把对方加入当前家庭
async function handleAddMember() {
  const valid = await addFormRef.value?.validate().catch(() => false)
  if (!valid) return

  adding.value = true
  try {
    const result = userStore.addFamilyMember(addForm.username)
    if (result.success) {
      ElMessage.success(result.message)
      addForm.username = ''
    } else {
      ElMessage.error(result.message)
    }
  } finally {
    adding.value = false
  }
}

// 移除某位成员（仅创建者可见，带二次确认）
async function handleRemoveMember(member) {
  try {
    await ElMessageBox.confirm(
      `确定将「${member.username}」移出当前家庭吗？对方将不再共享这个家庭的物资。`,
      '移除成员',
      {
        type: 'warning',
        confirmButtonText: '移除',
        cancelButtonText: '取消',
        customClass: 'pixel-message-box'
      }
    )
    const result = userStore.removeFamilyMember(member.id)
    if (result.success) {
      ElMessage.success(result.message)
    } else {
      ElMessage.error(result.message)
    }
  } catch {
    // 用户取消
  }
}

// 挂载时刷新一次当前用户信息（确保家庭信息为最新）
onMounted(() => {
  userStore.refreshCurrentUserInfo()
})
</script>

<template>
  <!--
    ============================================================
    模板区：决定家庭管理页的视觉结构，按是否已加入家庭分两套布局：
      · 未加入：展示"创建家庭"引导卡片
      · 已加入：展示家庭概要 + 成员列表 + 添加成员表单
    顶部统一显示"当前账号 + 副标题"。
    ============================================================
  -->
  <div class="family-page">
    <div class="bg-decoration">
      <div class="bg-orb bg-orb--1" />   <!-- 右上角光晕 -->
      <div class="bg-orb bg-orb--2" />   <!-- 左下角光晕 -->
      <div class="bg-grid" />            <!-- 像素风网格 -->
    </div>

    <div class="family-content">
      <!-- 顶部：标题 + 当前用户信息 -->
      <div class="family-header">
        <div>
          <h1 class="page-title">家庭管理</h1>
          <p class="page-subtitle">同一家庭成员共享同一批物资，权限完全平等。</p>
        </div>
        <div class="header-badge">
          <el-icon :size="18"><User /></el-icon>
          <span>{{ userStore.username || '未登录' }}</span>
        </div>
      </div>

      <!-- 场景 A：未加入家庭，展示创建引导 -->
      <section v-if="!hasFamily" class="hero-card">
        <div class="hero-icon">
          <el-icon :size="34" color="#D4875A"><HomeFilled /></el-icon>
        </div>
        <div class="hero-copy">
          <h2 class="hero-title">创建你的家庭空间</h2>
          <p class="hero-desc">创建后，当前账号的物资会成为这个家庭的共享物资。之后添加进来的成员会看到并管理同一批物资。</p>
        </div>

        <el-form
          ref="createFormRef"
          :model="createForm"
          :rules="createRules"
          label-position="top"
          size="large"
          class="family-form"
        >
          <el-form-item label="家庭名称" prop="name">
            <el-input
              v-model="createForm.name"
              placeholder="例如：幸福小家"
              maxlength="20"
              clearable
              @keyup.enter="handleCreateFamily"
            />
          </el-form-item>
          <button class="primary-btn" type="button" :disabled="creating" @click="handleCreateFamily">
            <el-icon :size="16"><Plus /></el-icon>
            <span>{{ creating ? '创建中...' : '创建家庭' }}</span>
          </button>
        </el-form>
      </section>

      <!-- 场景 B：已加入家庭 -->
      <template v-else>
        <!-- 家庭概要卡片：图标 + 名称 + 成员数 + 权限说明 -->
        <section class="summary-card">
          <div class="summary-main">
            <div class="family-icon">
              <el-icon :size="30" color="#FFFFFF"><HomeFilled /></el-icon>
            </div>
            <div>
              <h2 class="family-name">{{ familyName }}</h2>
              <p class="family-meta">{{ memberCount }} 位成员 · 共享库存与补货清单</p>
            </div>
          </div>
          <div class="permission-note">
            所有成员均可增加、减少、编辑、删除家庭物资。
          </div>
        </section>

        <!-- 左侧成员列表 + 右侧添加成员表单 -->
        <div class="content-grid">
          <section class="panel-card">
            <div class="section-header">
              <h2 class="section-title">家庭成员</h2>
              <span class="section-count">{{ memberCount }} 人</span>
            </div>

            <div class="member-list">
              <!-- 单个成员卡片 -->
              <div v-for="member in userStore.familyMembers" :key="member.id" class="member-item">
                <div class="member-main">
                  <div class="member-avatar">
                    <el-icon :size="20"><UserFilled /></el-icon>
                  </div>
                  <div class="member-info">
                    <div class="member-name-row">
                      <span class="member-name">{{ member.username }}</span>
                      <!-- "我"标记：当前登录账号 -->
                      <span v-if="member.isCurrentUser" class="member-tag">我</span>
                      <!-- "创建者"标记：建立该家庭的账号 -->
                      <span v-if="member.isCreator" class="member-tag member-tag--muted">创建者</span>
                    </div>
                    <span class="member-role">家庭成员</span>
                  </div>
                </div>
                <!-- 移除按钮：仅创建者本人可见，且不能移除自己 -->
                <button
                  v-if="userStore.isFamilyCreator && !member.isCurrentUser"
                  class="remove-btn"
                  type="button"
                  title="移除成员"
                  @click="handleRemoveMember(member)"
                >
                  <el-icon :size="14"><Delete /></el-icon>
                  <span>移除</span>
                </button>
              </div>
            </div>
          </section>

          <!-- 添加成员表单 -->
          <section class="panel-card add-card">
            <div class="section-header">
              <h2 class="section-title">添加成员</h2>
            </div>
            <p class="panel-desc">输入其他已注册用户的用户名，即可把对方加入当前家庭。对方下次登录后会进入这个家庭物资空间。</p>

            <el-form
              ref="addFormRef"
              :model="addForm"
              :rules="addRules"
              label-position="top"
              size="large"
              class="family-form"
            >
              <el-form-item label="用户名" prop="username">
                <el-input
                  v-model="addForm.username"
                  placeholder="输入已注册用户名"
                  maxlength="20"
                  clearable
                  @keyup.enter="handleAddMember"
                />
              </el-form-item>
              <button class="primary-btn" type="button" :disabled="adding" @click="handleAddMember">
                <el-icon :size="16"><Plus /></el-icon>
                <span>{{ adding ? '添加中...' : '添加成员' }}</span>
              </button>
            </el-form>
          </section>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：定义家庭管理页的视觉表现。
  采用主标题 + 卡片堆叠的结构，分别为：
    · hero-card：未加入家庭时的引导卡片
    · summary-card：已加入家庭的概要卡片
    · panel-card：成员列表 / 添加成员表单
  整体保持像素风视觉。
  ============================================================
*/

.family-page {
  position: relative;
  min-height: calc(100vh - var(--navbar-height));
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
  width: 340px;
  height: 340px;
  background: radial-gradient(circle, rgba(212, 135, 90, 0.35), transparent);
  top: -90px;
  right: -70px;
}

/* 左下角光晕 */
.bg-orb--2 {
  width: 280px;
  height: 280px;
  background: radial-gradient(circle, rgba(224, 160, 48, 0.25), transparent);
  bottom: 80px;
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

/* 内容容器：限宽居中，纵向排列各区块 */
.family-content {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: var(--content-padding-y) var(--content-padding-x);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

/* 多元素共用基础布局：横向居中 */
.family-header,
.summary-main,
.section-header,
.member-item,
.member-name-row,
.header-badge,
.primary-btn {
  display: flex;
  align-items: center;
}

/* 顶部标题区：左标题 + 右侧用户信息 */
.family-header {
  justify-content: space-between;
  gap: var(--spacing-md);
}

/* 多类标题共享：像素体 + 主文色 */
.page-title,
.hero-title,
.family-name,
.section-title {
  font-family: var(--font-family-pixel);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 主标题 */
.page-title {
  font-size: var(--font-size-2xl);
  margin-bottom: var(--spacing-xs);
}

/* 多类副文本共享：像素体 + 次文色 */
.page-subtitle,
.hero-desc,
.family-meta,
.permission-note,
.panel-desc,
.member-role {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.8;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 顶部当前账号徽章 */
.header-badge {
  gap: 6px;
  flex-shrink: 0;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.9);
  border: 2px solid var(--pixel-border);
  box-shadow: 3px 3px 0 0 rgba(107, 93, 85, 0.28);
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

/* 卡片通用样式：白底厚边 + 硬阴影 */
.hero-card,
.summary-card,
.panel-card {
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  box-shadow: 6px 6px 0 0 rgba(107, 93, 85, 0.35);
}

/* 引导卡片：限宽 + 内边距 */
.hero-card {
  max-width: 720px;
  padding: var(--spacing-xl);
}

/* 图标方框通用样式 */
.hero-icon,
.family-icon,
.member-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--pixel-border);
  box-shadow: 3px 3px 0 0 rgba(107, 93, 85, 0.35);
}

/* 引导卡片图标 */
.hero-icon {
  width: 72px;
  height: 72px;
  margin-bottom: var(--spacing-lg);
  background: #FFFDFB;
}

/* 引导卡片大标题 */
.hero-title {
  font-size: var(--font-size-xl);
  margin-bottom: var(--spacing-sm);
}

.hero-copy {
  margin-bottom: var(--spacing-lg);
}

/* 表单限宽 */
.family-form {
  max-width: 460px;
}

/* 表单标签 */
:deep(.el-form-item__label) {
  font-family: var(--font-family-pixel);
  color: var(--color-text-primary);
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
}

:deep(.el-input__wrapper.is-focus),
:deep(.el-input__wrapper:hover) {
  border-color: var(--color-primary);
  box-shadow: 4px 4px 0 0 rgba(212, 135, 90, 0.32);
  transform: translate(-1px, -1px);
}

:deep(.el-input__inner) {
  font-family: var(--font-family-pixel);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 主题按钮（创建家庭 / 添加成员） */
.primary-btn {
  justify-content: center;
  gap: 6px;
  min-width: 132px;
  padding: 10px 18px;
  background: var(--color-primary);
  color: #FFFFFF;
  border: 3px solid var(--pixel-border);
  cursor: pointer;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  box-shadow: var(--pixel-shadow-button);
  transition: all var(--transition-fast);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.primary-btn:hover:not(:disabled) {
  background: var(--color-primary-dark);
  transform: translate(2px, 2px);
  box-shadow: var(--pixel-shadow-button-hover);
}

.primary-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* 家庭概要卡片：左信息 + 右权限说明 */
.summary-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg);
}

.summary-main {
  gap: var(--spacing-md);
}

/* 家庭图标：主色实底 */
.family-icon {
  width: 56px;
  height: 56px;
  background: var(--color-primary);
  flex-shrink: 0;
}

/* 家庭名称 */
.family-name {
  font-size: var(--font-size-xl);
  margin-bottom: 4px;
}

/* 权限说明胶囊 */
.permission-note {
  padding: 8px 12px;
  border: 2px solid var(--color-border-light);
  background: rgba(212, 135, 90, 0.08);
  color: var(--color-text-primary);
}

/* 双栏布局：左成员列表 + 右添加表单 */
.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 0.8fr);
  gap: var(--spacing-lg);
}

/* 通用面板卡片内边距 */
.panel-card {
  padding: var(--spacing-lg);
}

/* 面板标题栏：标题 + 数量徽章 */
.section-header {
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

/* 面板标题 */
.section-title {
  font-size: var(--font-size-lg);
}

/* 数量徽章 / 成员标签通用样式 */
.section-count,
.member-tag {
  padding: 3px 8px;
  border: 2px solid var(--pixel-border);
  background: var(--color-primary);
  color: #FFFFFF;
  font-family: var(--font-family-pixel);
  font-size: 10px;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 成员列表 */
.member-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

/* 单个成员条目 */
.member-item {
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: 12px;
  border: 2px solid var(--color-border-light);
  background: rgba(255, 253, 251, 0.88);
}

/* 成员主体：头像 + 信息 */
.member-main {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
}

/* 成员头像 */
.member-avatar {
  width: 40px;
  height: 40px;
  background: #FFFFFF;
  color: var(--color-primary);
  flex-shrink: 0;
}

.member-info {
  min-width: 0;
}

/* 名称行：名字 + 标签 */
.member-name-row {
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 2px;
}

/* 成员名字 */
.member-name {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 灰色标签（创建者） */
.member-tag--muted {
  background: #FFFFFF;
  color: var(--color-text-secondary);
  border-color: var(--color-border);
}

/* 移除成员按钮：白底红字 */
.remove-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 6px 10px;
  background: #FFFFFF;
  color: var(--color-danger);
  border: 2px solid var(--pixel-border);
  cursor: pointer;
  font-family: var(--font-family-pixel);
  font-size: 11px;
  box-shadow: 2px 2px 0 0 rgba(107, 93, 85, 0.25);
  transition: all var(--transition-fast);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

.remove-btn:hover {
  background: rgba(209, 75, 75, 0.08);
  transform: translate(1px, 1px);
  box-shadow: 1px 1px 0 0 rgba(107, 93, 85, 0.25);
}

/* 添加成员卡片：顶对齐 */
.add-card {
  align-self: start;
}

.panel-desc {
  margin-bottom: var(--spacing-md);
}

/* 窄屏适配：堆叠为单列 */
@media (max-width: 900px) {
  .family-header,
  .summary-card {
    align-items: flex-start;
    flex-direction: column;
  }

  .content-grid {
    grid-template-columns: 1fr;
  }

  .hero-card,
  .summary-card,
  .panel-card {
    box-shadow: 4px 4px 0 0 rgba(107, 93, 85, 0.35);
  }
}
</style>
