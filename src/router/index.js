import { createRouter, createWebHashHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'

const routes = [
  // ===== 不需要登录 =====
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
    meta: { title: '登录', requiresAuth: false }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/Register.vue'),
    meta: { title: '注册', requiresAuth: false }
  },

  // ===== 需要登录 =====
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/Dashboard.vue'),
    meta: { title: '首页仪表盘', requiresAuth: true }
  },
  {
    path: '/inventory',
    name: 'InventoryList',
    component: () => import('@/views/InventoryList.vue'),
    meta: { title: '库存管理', requiresAuth: true }
  },
  {
    path: '/inventory/add',
    name: 'InventoryAdd',
    component: () => import('@/views/InventoryAdd.vue'),
    meta: { title: '添加物资', requiresAuth: true }
  },
  {
    path: '/inventory/:id',
    name: 'InventoryDetail',
    component: () => import('@/views/InventoryDetail.vue'),
    meta: { title: '物资详情', requiresAuth: true }
  },
  {
    path: '/inventory/:id/edit',
    name: 'InventoryEdit',
    component: () => import('@/views/InventoryEdit.vue'),
    meta: { title: '编辑物资', requiresAuth: true }
  },
  {
    path: '/shopping',
    name: 'ShoppingList',
    component: () => import('@/views/ShoppingList.vue'),
    meta: { title: '补货清单', requiresAuth: true }
  },
  {
    path: '/family',
    name: 'Family',
    component: () => import('@/views/Family.vue'),
    meta: { title: '家庭管理', requiresAuth: true }
  },
  {
    path: '/statistics',
    name: 'Statistics',
    component: () => import('@/views/Statistics.vue'),
    meta: { title: '统计报表', requiresAuth: true }
  },
  {
    path: '/drag',
    name: 'DragManage',
    component: () => import('@/views/DragManage.vue'),
    meta: { title: '拖拽管理', requiresAuth: true }
  },
  {
    path: '/history',
    name: 'History',
    component: () => import('@/views/History.vue'),
    meta: { title: '操作历史', requiresAuth: true }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/Settings.vue'),
    meta: { title: '系统设置', requiresAuth: true }
  },

  // ===== 404 兜底 =====
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

/**
 * 路由守卫
 * - 未登录访问受保护页面 → 强制跳转 /login
 * - 已登录访问 /login 或 /register → 跳转首页
 * - 动态设置页面标题
 */
router.beforeEach((to, _from, next) => {
  // 需要在 Pinia 激活后获取 store（确保 useUserStore 可用）
  // 注意：如果 Pinia 未挂载，这里会报错；通过延迟导入避免循环依赖
  const token = sessionStorage.getItem('im_token')
  const isLoggedIn = token && token !== 'null' && token !== ''

  // 更新页面标题
  document.title = to.meta.title ? `${to.meta.title} - 家庭物资库存管家` : '家庭物资库存管家'

  // 需要登录但未登录 → 跳转登录页
  if (to.meta.requiresAuth && !isLoggedIn) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  // 已登录访问登录/注册 → 跳转首页
  if (isLoggedIn && (to.name === 'Login' || to.name === 'Register')) {
    next('/')
    return
  }

  next()
})

export default router
