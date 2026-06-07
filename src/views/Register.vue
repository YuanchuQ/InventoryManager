<!--
  ============================================================
  页面说明：注册页
  系统的入口页面之一，用于新用户创建账号。
  填写用户名、密码、确认密码并通过校验后即可注册成功，
  注册成功后自动跳转到登录页，由用户重新登录进入系统。
  与之配套的还有：
    - 登录页（Login.vue）：已注册用户跳转过去登录
  ============================================================
-->

<script setup>
/*
  ============================================================
  脚本区：负责注册表单的数据绑定、校验和提交逻辑。
  主要工作：
    1. 定义表单字段（用户名、密码、确认密码）及校验规则
    2. 自定义"两次密码一致"的校验函数
    3. 提交时调用用户数据源完成账号创建
    4. 根据结果给出消息提示并跳转登录页
  ============================================================
*/

// 引入响应式工具
import { reactive, ref } from 'vue'
// 引入路由能力，注册成功后用它跳转登录页
import { useRouter } from 'vue-router'
// 引入用户数据源（账号注册逻辑写在这里）
import { useUserStore } from '@/stores/user'
// 引入 Element Plus 的全局消息提示组件
import { ElMessage } from 'element-plus'

const router = useRouter()
const userStore = useUserStore()

// 表单引用，用于触发整体校验
const formRef = ref(null)

// 表单数据：用户名、密码、再次确认密码
const form = reactive({
  username: '',
  password: '',
  confirmPassword: ''
})

// 自定义验证：确认密码一致
// 比较"确认密码"与"密码"是否相等，不等则返回错误
const validateConfirmPassword = (_rule, value) => {
  if (value !== form.password) {
    return Promise.reject(new Error('两次输入的密码不一致'))
  }
  return Promise.resolve()
}

// 表单验证规则
const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, max: 20, message: '用户名长度 2~20 位', trigger: 'blur' },
    // 用户名仅允许中英文、数字、下划线，避免出现特殊字符
    { pattern: /^[a-zA-Z0-9_一-龥]+$/, message: '用户名只能包含中英文、数字和下划线', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' }
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    { validator: validateConfirmPassword, trigger: 'blur' }
  ]
}

// 注册中状态：用于按钮 loading 显示
const loading = ref(false)

/**
 * 提交注册
 */
async function handleRegister() {
  if (!formRef.value) return

  // 触发表单校验，未通过直接返回
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true

  // 通过短延时让 loading 状态可见，提升交互反馈感
  setTimeout(() => {
    // 调用用户数据源完成账号创建，返回 { success, message }
    const result = userStore.register(form.username, form.password)
    loading.value = false

    if (result.success) {
      ElMessage.success(result.message)
      // 注册成功，跳转登录页
      router.push('/login')
    } else {
      ElMessage.error(result.message)
    }
  }, 400)
}
</script>

<template>
  <!--
    ============================================================
    模板区：决定注册页的视觉结构，由以下几部分组成：
      1. 装饰背景层（光晕、网格）
      2. Logo + 标题区
      3. 注册表单卡片（用户名、密码、确认密码、注册按钮、跳转登录链接）
      4. 底部版权信息
    ============================================================
  -->
  <div class="register-page">
    <!-- 装饰性背景元素 -->
    <div class="bg-decoration">
      <div class="bg-orb bg-orb--1" />   <!-- 右上角光晕 -->
      <div class="bg-orb bg-orb--2" />   <!-- 左下角光晕 -->
      <div class="bg-orb bg-orb--3" />   <!-- 中心光晕 -->
      <div class="bg-grid" />            <!-- 像素风网格 -->
    </div>

    <!-- 主内容区 -->
    <div class="register-container">
      <!-- Logo & 标题 -->
      <div class="register-header">
        <div class="register-logo">
          <!-- Logo 图标：人形图案，表示"创建新用户" -->
          <div class="logo-icon">
            <el-icon :size="32" color="#D4875A">
              <UserFilled />
            </el-icon>
          </div>
        </div>
        <h1 class="register-title">创建账号</h1>                       <!-- 主标题 -->
        <p class="register-subtitle">注册后即可管理您的家庭物资</p>     <!-- 副标题 -->
      </div>

      <!-- 注册表单 - 像素磨砂卡片 -->
      <div class="register-card">
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          size="large"
          @submit.prevent="handleRegister"
        >
          <!-- 用户名输入框 -->
          <el-form-item prop="username" label="用户名">
            <el-input
              v-model="form.username"
              placeholder="请输入用户名（2~20位）"
              :prefix-icon="User"
              clearable
            />
          </el-form-item>

          <!-- 密码输入框 -->
          <el-form-item prop="password" label="密码">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="请输入密码（至少6位）"
              :prefix-icon="Lock"
              show-password
            />
          </el-form-item>

          <!-- 确认密码输入框（回车直接提交） -->
          <el-form-item prop="confirmPassword" label="确认密码">
            <el-input
              v-model="form.confirmPassword"
              type="password"
              placeholder="请再次输入密码"
              :prefix-icon="Lock"
              show-password
              @keyup.enter="handleRegister"
            />
          </el-form-item>

          <!-- 注册按钮（带加载状态） -->
          <el-form-item>
            <el-button
              type="primary"
              :loading="loading"
              class="register-btn"
              @click="handleRegister"
            >
              {{ loading ? '注册中...' : '注 册' }}
            </el-button>
          </el-form-item>
        </el-form>

        <!-- 跳转登录 -->
        <!-- 底部链接：已有账号用户可跳转到登录页 -->
        <div class="register-footer">
          <span class="footer-text">已有账号？</span>
          <router-link to="/login" class="footer-link">
            去登录
            <el-icon :size="14" class="link-arrow"><ArrowRight /></el-icon>
          </router-link>
        </div>
      </div>

      <!-- 底部版权 -->
      <p class="register-copyright">© 2025 家庭物资库存管家 · 桌面端</p>
    </div>
  </div>
</template>

<style scoped>
/*
  ============================================================
  样式区：定义注册页的视觉表现。
  整体设计与登录页保持一致（同套像素风视觉语言），
  仅在配色与图标上稍作区分。
  ============================================================
*/

/* ===== 页面容器 ===== */
/* 整页容器：撑满视口，内容居中，背景为暖色渐变 */
.register-page {
  width: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-2xl) var(--spacing-lg);
  background: linear-gradient(135deg, #FDF6F0 0%, #F8EDE0 25%, #F2E0D0 50%, #FDF6F0 100%);
  position: relative;
  overflow: hidden;
}

/* ===== 装饰性背景 ===== */
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
  opacity: 0.35;
  animation: orb-float 20s ease-in-out infinite;
}

/* 第一个光晕：右上角，暖橙色 */
.bg-orb--1 {
  width: 420px;
  height: 420px;
  background: radial-gradient(circle, rgba(212, 135, 90, 0.45), transparent);
  top: -120px;
  right: -100px;
  animation-delay: 0s;
}

/* 第二个光晕：左下角，金黄色 */
.bg-orb--2 {
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, rgba(224, 160, 48, 0.35), transparent);
  bottom: -100px;
  left: -80px;
  animation-delay: -7s;
}

/* 第三个光晕：屏幕中心，橘红色 */
.bg-orb--3 {
  width: 280px;
  height: 280px;
  background: radial-gradient(circle, rgba(232, 131, 74, 0.3), transparent);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation-delay: -14s;
}

/* 光晕漂浮关键帧 */
@keyframes orb-float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(24px, -24px) scale(1.08); }
  50% { transform: translate(-16px, 16px) scale(0.94); }
  75% { transform: translate(-24px, -16px) scale(1.04); }
}

/* 背景网格 */
.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(180, 160, 140, 0.15) 1px, transparent 1px),
    linear-gradient(90deg, rgba(180, 160, 140, 0.15) 1px, transparent 1px);
  background-size: 16px 16px;
}

/* 网格上叠加细小圆点，形成颗粒质感 */
.bg-grid::after {
  content: '';
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(180, 150, 130, 0.12) 1px, transparent 1px);
  background-size: 4px 4px;
}

/* ===== 主容器 ===== */
/* 内容容器：限制最大宽度 */
.register-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 460px;
}

/* ===== Header ===== */
/* 头部区域：Logo 与标题居中显示 */
.register-header {
  text-align: center;
  margin-bottom: var(--spacing-xl);
}

.register-logo {
  margin-bottom: var(--spacing-lg);
}

/* Logo 图标方框 */
.logo-icon {
  width: 72px;
  height: 72px;
  background: rgba(255, 255, 255, 0.92);
  border: 3px solid var(--pixel-border);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  box-shadow: 5px 5px 0 0 rgba(107, 93, 85, 0.45);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}

/* 主标题 */
.register-title {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-3xl);
  font-weight: var(--font-weight-normal);
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xs);
  letter-spacing: 0.08em;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  text-shadow: 2px 2px 0 rgba(180, 150, 130, 0.3);
}

/* 副标题 */
.register-subtitle {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-md);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-normal);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* ===== 像素磨砂卡片 ===== */
/* 注册卡片：半透明白底 + 厚边框 + 双层阴影 */
.register-card {
  background: rgba(255, 255, 255, 0.92);
  padding: var(--spacing-2xl) var(--spacing-xl);
  border: 3px solid var(--pixel-border);
  box-shadow:
    6px 6px 0 0 rgba(139, 115, 85, 0.4),
    inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  transition: box-shadow var(--transition-base), transform var(--transition-base);
  position: relative;
}

/* 卡片表面颗粒质感叠层 */
.register-card::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(rgba(180, 150, 130, 0.06) 1px, transparent 1px);
  background-size: 4px 4px;
}

/* ===== 表单样式覆盖 ===== */
:deep(.el-form-item) {
  margin-bottom: 22px;
}

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
  border-width: 2px;
  box-shadow: 4px 4px 0 0 rgba(212, 135, 90, 0.35);
  background: #FFFDFB;
  transform: translate(-1px, -1px);
}

:deep(.el-input__inner) {
  font-family: var(--font-family-pixel);
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

:deep(.el-input__inner::placeholder) {
  color: var(--color-text-placeholder);
}

:deep(.el-input__prefix) {
  color: var(--color-text-secondary);
}

:deep(.el-input__suffix) {
  color: var(--color-text-secondary);
}

/* ===== 注册按钮 — 像素风实体按钮 ===== */
.register-btn {
  width: 100%;
  height: 48px;
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-normal);
  letter-spacing: 0.15em;
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  background: var(--color-primary);
  color: #FFFFFF;
  border: 3px solid var(--pixel-border);
  box-shadow: 4px 4px 0 0 rgba(45, 34, 28, 0.5);
  transition: all var(--transition-fast);
  margin-top: var(--spacing-xs);
}

/* 悬浮：按钮下沉，阴影缩短 */
.register-btn:hover {
  background: var(--color-primary-dark);
  box-shadow: 2px 2px 0 0 rgba(45, 34, 28, 0.5);
  transform: translate(2px, 2px);
}

/* 按下/加载中：完全贴到阴影位置 */
.register-btn:active,
.register-btn.is-loading {
  background: var(--color-primary-dark);
  box-shadow: 0px 0px 0 0 rgba(45, 34, 28, 0.5);
  transform: translate(4px, 4px);
}

/* ===== 底部链接 ===== */
/* 底部链接区：与上方表单用虚线分隔 */
.register-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-lg);
  border-top: 2px dashed var(--color-border);
}

.footer-text {
  font-family: var(--font-family-pixel);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}

/* 跳转登录的链接 */
.footer-link {
  font-family: var(--font-family-pixel);
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-normal);
  color: var(--color-primary-dark);
  text-decoration: none;
  transition: all var(--transition-fast);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
  padding: 2px 6px;
  border-bottom: 2px solid var(--color-primary);
}

/* 悬浮：颜色加深，箭头向右挪动 */
.footer-link:hover {
  color: var(--color-primary);
  gap: 4px;
  border-bottom-color: var(--pixel-border);
}

.link-arrow {
  transition: transform var(--transition-fast);
}

.footer-link:hover .link-arrow {
  transform: translateX(2px);
}

/* ===== 底部版权 ===== */
.register-copyright {
  font-family: var(--font-family-pixel);
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  margin-top: var(--spacing-xl);
  -webkit-font-smoothing: none;
  -moz-osx-font-smoothing: unset;
  font-smooth: never;
}
</style>
