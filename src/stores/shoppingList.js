/**
 * ============================================================
 *  补货清单 Store（Pinia 包装层）  src/stores/shoppingList.js
 * ============================================================
 * 文件作用：
 *   把 utils/goodsStore.js 中的补货清单数据包装成 Vue 响应式数据，
 *   并提供"勾选已购 / 取消已购 / 手动添加 / 清空已购"等业务动作。
 *
 * 与 inventory store 共享同一份底层数据源（goodsStore），
 * 因此勾选"已购买"后，对应物资的库存数量会同步变化。
 *
 * 重要约束：
 *   ⚠️ 真实数据全部托管在 src/utils/goodsStore.js（localStorage：按家庭/个人作用域隔离）。
 *   物资低库存时会由 goodsStore 自动写入对应的"自动补货"项，无需此处轮询。
 * ============================================================
 */

import { defineStore } from 'pinia'
import { ref, computed, onScopeDispose } from 'vue'
// 补货清单 + 物资读写 API（与 inventory store 共用同一份数据源）
import {
  getShoppingList,
  addShoppingItem,
  updateShoppingItem,
  delShoppingItem,
  clearPurchasedShoppingItems,
  subscribeShopping,
  rescanLowStock,
  getGoodsList,
  addGoods,
  editGoods
} from '@/utils/goodsStore'
import { ElMessage } from 'element-plus'
// 家庭切换事件
import { FAMILY_CHANGED_EVENT } from '@/utils/familyStore'

export const useShoppingStore = defineStore('shopping', () => {
  // 补货清单的响应式镜像
  const items = ref(getShoppingList())
  const loading = ref(false)

  // 订阅 goodsStore 的补货清单变更：任何写入都会自动刷新 items
  const unsub = subscribeShopping((list) => { items.value = list })
  // 家庭切换后作用域会变，需要重新拉数据
  function handleFamilyChanged() {
    items.value = getShoppingList()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener(FAMILY_CHANGED_EVENT, handleFamilyChanged)
  }
  // store 卸载时清理订阅与监听
  onScopeDispose(() => {
    if (typeof unsub === 'function') unsub()
    if (typeof window !== 'undefined') {
      window.removeEventListener(FAMILY_CHANGED_EVENT, handleFamilyChanged)
    }
  })

  // ====== Getters ======
  // 待采购：未购买的全部条目
  const pendingItems = computed(() => items.value.filter(i => !i.isPurchased))
  // 已采购：已勾选完成的全部条目
  const purchasedItems = computed(() => items.value.filter(i => i.isPurchased))

  // ====== Actions ======
  /** 兼容旧调用：刷新本地镜像 + 重扫低库存 */
  // rescanLowStock 会把所有当前低库存物资重新生成自动补货项
  const loadList = async () => {
    rescanLowStock()
    items.value = getShoppingList()
    return items.value
  }

  /** 手动添加补货项 */
  const addManual = async (data) => {
    return addShoppingItem(data)
  }

  /** 标记已购：库存同名 +n，无则创建新物资 */
  // 业务规则：勾选"已购买" → 该物资库存数量自动增加
  //           若库存中没有同名物资 → 新建一条（默认保质期 1 年后）
  const markPurchased = async (id) => {
    const item = items.value.find(i => i.id === id)
    if (!item) return
    // 先把补货项标记为已购买
    updateShoppingItem(id, { isPurchased: true })

    // 查找库存中是否已有同名物资
    const goods = getGoodsList()
    const existing = goods.find(g => g.name === item.name)
    if (existing) {
      // 已存在 → 增加库存数量
      editGoods(existing.id, { quantity: existing.quantity + item.quantity })
    } else {
      // 不存在 → 新建一条，默认保质期 1 年后（用户后续可在编辑页修正）
      const d = new Date()
      d.setFullYear(d.getFullYear() + 1)
      addGoods({
        name: item.name,
        categoryId: item.categoryId || '',
        spec: '',
        quantity: item.quantity,
        unit: item.unit || '个',
        expiryDate: d.toISOString().slice(0, 10),
        minQuantity: 1,
        price: 0,
        storageLocation: '',
        note: '来自补货清单'
      })
    }
  }

  /** 取消已购：库存同名 -n，最小 0 */
  // 业务规则：取消"已购买"→ 把之前增加的库存数量退回去
  const markPending = async (id) => {
    const item = items.value.find(i => i.id === id)
    if (!item) return
    updateShoppingItem(id, { isPurchased: false })

    const goods = getGoodsList()
    const existing = goods.find(g => g.name === item.name)
    if (existing) {
      // 不允许减成负数
      const qty = Math.max(0, existing.quantity - item.quantity)
      // 减到 0 时提示一下，方便用户确认现实库存状况
      if (qty === 0 && existing.quantity > 0) {
        ElMessage.warning(`「${item.name}」库存已归零`)
      }
      editGoods(existing.id, { quantity: qty })
    }
  }

  // 删除单条补货项
  const removeItem = async (id) => {
    delShoppingItem(id)
  }

  // 清空所有已购买条目（不影响待采购与库存）
  const clearPurchased = async () => {
    return clearPurchasedShoppingItems()
  }

  return {
    items, loading,
    pendingItems, purchasedItems,
    loadList, addManual, markPurchased, markPending, removeItem, clearPurchased
  }
})
