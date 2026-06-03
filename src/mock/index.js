import Mock from 'mockjs'
import { loadFromStorage, saveToStorage } from '@/utils/constants'
import { getScopedStorageKey } from '@/utils/familyStore'
import {
  getGoodsList,
  addGoods,
  editGoods,
  delGoods,
  consumeGoods,
  getGoodsStorageKey,
  getShoppingList,
  addShoppingItem,
  updateShoppingItem,
  delShoppingItem
} from '@/utils/goodsStore'

// ====== 演示数据（非物资部分仍走旧 mock；物资 CRUD 已统一到 goodsStore） ======
// 注：DEMO_ITEMS 已迁移到 src/data/defaultGoods.json，由 goodsStore 唯一管理。

const DEMO_CONSUMPTIONS = [
  { id: '1', itemId: '1', itemName: '鸡蛋', quantity: 2, date: '2026-05-30', note: '早餐' },
  { id: '2', itemId: '1', itemName: '鸡蛋', quantity: 3, date: '2026-05-31', note: '晚饭' },
  { id: '3', itemId: '3', itemName: '西红柿', quantity: 1, date: '2026-05-31', note: '' },
  { id: '4', itemId: '10', itemName: '可乐', quantity: 2, date: '2026-05-30', note: '' },
  { id: '5', itemId: '9', itemName: '纸巾', quantity: 1, date: '2026-05-29', note: '' },
  { id: '6', itemId: '2', itemName: '牛奶', quantity: 1, date: '2026-06-01', note: '早餐' },
  { id: '7', itemId: '4', itemName: '猪肉', quantity: 1, date: '2026-05-30', note: '' },
  { id: '8', itemId: '13', itemName: '土豆', quantity: 2, date: '2026-05-31', note: '' }
]

const DEMO_CATEGORIES = [
  { id: '1', name: '蔬菜', icon: 'Food', sort: 1 },
  { id: '2', name: '肉类', icon: 'Dish', sort: 2 },
  { id: '3', name: '水果', icon: 'Apple', sort: 3 },
  { id: '4', name: '饮料', icon: 'Mug', sort: 4 },
  { id: '5', name: '日用品', icon: 'Box', sort: 5 },
  { id: '6', name: '药品', icon: 'FirstAidKit', sort: 6 },
  { id: '7', name: '其他', icon: 'More', sort: 7 }
]

const DEMO_SETTINGS = {
  expiryAlertDays: 7,
  defaultMinQuantity: 3
}

// ====== 内存数据库（仅保留：消耗记录 / 分类 / 设置） ======
// ⚠️ 物资数组与补货清单均不再放这里，统一由 src/utils/goodsStore.js 管理。
const STORAGE_BASE_KEY = 'inventory_db'

function getDBKey() {
  return getScopedStorageKey(STORAGE_BASE_KEY)
}

function createDefaultDB() {
  return {
    consumptions: DEMO_CONSUMPTIONS.map(c => ({ ...c })),
    categories: DEMO_CATEGORIES.map(c => ({ ...c })),
    settings: { ...DEMO_SETTINGS },
    nextConsumptionId: 9,
    nextCategoryId: 8
  }
}

function cloneDB(db) {
  return {
    consumptions: Array.isArray(db.consumptions) ? db.consumptions.map(c => ({ ...c })) : [],
    categories: Array.isArray(db.categories) ? db.categories.map(c => ({ ...c })) : DEMO_CATEGORIES.map(c => ({ ...c })),
    settings: { ...DEMO_SETTINGS, ...(db.settings || {}) },
    nextConsumptionId: db.nextConsumptionId || 1,
    nextCategoryId: db.nextCategoryId || 1
  }
}

function getDB() {
  const storageKey = getDBKey()
  const saved = loadFromStorage(storageKey, null)
  if (saved) return saved
  const legacy = storageKey === STORAGE_BASE_KEY ? null : loadFromStorage(STORAGE_BASE_KEY, null)
  const initial = legacy ? cloneDB(legacy) : createDefaultDB()
  saveToStorage(storageKey, initial)
  return initial
}

function saveDB(db) {
  saveToStorage(getDBKey(), db)
}

/**
 * 当前所有物资（统一从 goodsStore 拉取）
 */
function getGoods() { return getGoodsList() }

// ====== Mock 配置 ======
Mock.setup({ timeout: '100-300' })

// ---------- 物资 CRUD（全部代理到 goodsStore） ----------
Mock.mock('/api/items', 'get', () => ({ code: 200, data: getGoods() }))

Mock.mock('/api/items/expiring', 'get', () => {
  const now = Date.now()
  const sevenDays = 7 * 24 * 60 * 60 * 1000
  const expiring = getGoods()
    .filter(i => {
      const diff = new Date(i.expiryDate).getTime() - now
      return diff <= sevenDays
    })
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate))
  return { code: 200, data: expiring }
})

Mock.mock(/\/api\/items\/(\d+)$/, 'get', (options) => {
  const id = options.url.match(/\/items\/(\d+)$/)[1]
  const item = getGoods().find(i => String(i.id) === String(id))
  return { code: 200, data: item || null }
})

Mock.mock('/api/items', 'post', (options) => {
  const body = JSON.parse(options.body)
  // goodsStore.addGoods 内部已自动 checkLowStock
  const item = addGoods(body)
  return { code: 200, data: item }
})

Mock.mock(/\/api\/items\/(\d+)$/, 'put', (options) => {
  const id = options.url.match(/\/items\/(\d+)$/)[1]
  const body = JSON.parse(options.body)
  // goodsStore.editGoods 内部已自动 checkLowStock
  const updated = editGoods(id, body)
  return { code: 200, data: updated }
})

Mock.mock(/\/api\/items\/(\d+)$/, 'delete', (options) => {
  const id = options.url.match(/\/items\/(\d+)$/)[1]
  delGoods(id)
  return { code: 200, data: null }
})

// ---------- 消耗物资 ----------
Mock.mock(/\/api\/items\/(\d+)\/consume$/, 'post', (options) => {
  const id = options.url.match(/\/items\/(\d+)\/consume$/)[1]
  const db = getDB()
  const body = JSON.parse(options.body)
  // consumeGoods 内部自动 checkLowStock
  const item = consumeGoods(id, body.quantity)
  if (item) {
    db.consumptions.push({
      id: String(db.nextConsumptionId++),
      itemId: id,
      itemName: item.name,
      quantity: body.quantity,
      date: new Date().toISOString().slice(0, 10),
      note: body.note || ''
    })
  }
  saveDB(db)
  return { code: 200, data: item }
})

// ---------- 消耗记录 ----------
Mock.mock('/api/consumption', 'get', (options) => {
  const db = getDB()
  const url = new URL(options.url, 'http://localhost')
  const itemId = url.searchParams.get('itemId')
  let records = db.consumptions
  if (itemId) records = records.filter(r => r.itemId === itemId)
  return { code: 200, data: [...records].reverse() }
})

Mock.mock('/api/consumption', 'post', (options) => {
  const db = getDB()
  const body = JSON.parse(options.body)
  const record = { ...body, id: String(db.nextConsumptionId++), date: new Date().toISOString().slice(0, 10) }
  db.consumptions.push(record)
  saveDB(db)
  return { code: 200, data: record }
})

// ---------- 分类 ----------
Mock.mock('/api/categories', 'get', () => ({ code: 200, data: getDB().categories }))
Mock.mock('/api/categories', 'post', (options) => {
  const db = getDB()
  const body = JSON.parse(options.body)
  const item = { id: String(db.nextCategoryId++), name: body.name, icon: body.icon || 'More', sort: body.sort || 99 }
  db.categories.push(item)
  saveDB(db)
  return { code: 200, data: item }
})
Mock.mock(/\/api\/categories\/(\d+)$/, 'put', (options) => {
  const id = options.url.match(/\/categories\/(\d+)$/)[1]
  const db = getDB()
  const body = JSON.parse(options.body)
  const index = db.categories.findIndex(c => c.id === id)
  if (index > -1) db.categories[index] = { ...db.categories[index], ...body }
  saveDB(db)
  return { code: 200, data: db.categories[index] }
})
Mock.mock(/\/api\/categories\/(\d+)$/, 'delete', (options) => {
  const id = options.url.match(/\/categories\/(\d+)$/)[1]
  const db = getDB()
  db.categories = db.categories.filter(c => c.id !== id)
  saveDB(db)
  return { code: 200, data: null }
})

// ---------- 补货清单（全部代理到 goodsStore） ----------
Mock.mock('/api/shopping', 'get', () => ({ code: 200, data: getShoppingList() }))
Mock.mock('/api/shopping', 'post', (options) => {
  const body = JSON.parse(options.body)
  const item = addShoppingItem(body)
  return { code: 200, data: item }
})
Mock.mock(/\/api\/shopping\/(\d+)$/, 'put', (options) => {
  const id = options.url.match(/\/shopping\/(\d+)$/)[1]
  const body = JSON.parse(options.body)
  const updated = updateShoppingItem(id, body)
  return { code: 200, data: updated }
})
Mock.mock(/\/api\/shopping\/(\d+)$/, 'delete', (options) => {
  const id = options.url.match(/\/shopping\/(\d+)$/)[1]
  delShoppingItem(id)
  return { code: 200, data: null }
})

// ---------- 统计 ----------
Mock.mock('/api/statistics', 'get', () => {
  const db = getDB()
  const goods = getGoods()
  // 分类占比
  const categoryMap = {}
  goods.forEach(i => {
    const cat = db.categories.find(c => c.id === i.categoryId)
    const name = cat ? cat.name : '未知'
    categoryMap[name] = (categoryMap[name] || 0) + i.quantity
  })
  // 近30天消耗趋势
  const trend = []
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`
    const count = db.consumptions
      .filter(r => r.date === d.toISOString().slice(0, 10))
      .reduce((sum, r) => sum + r.quantity, 0)
    trend.push({ date: dateStr, count })
  }
  return { code: 200, data: { categoryPie: categoryMap, consumptionTrend: trend } }
})

// ---------- 设置 ----------
Mock.mock('/api/settings', 'get', () => ({ code: 200, data: getDB().settings }))
Mock.mock('/api/settings', 'put', (options) => {
  const db = getDB()
  const body = JSON.parse(options.body)
  db.settings = { ...db.settings, ...body }
  saveDB(db)
  return { code: 200, data: db.settings }
})

// ---------- 数据导入导出 ----------
Mock.mock('/api/data/export', 'post', () => {
  const db = getDB()
  return {
    code: 200,
    data: {
      items: getGoods(),
      consumptions: db.consumptions,
      shoppingList: getShoppingList(),
      categories: db.categories,
      settings: db.settings,
      exportTime: new Date().toISOString()
    }
  }
})

Mock.mock('/api/data/import', 'post', (options) => {
  const db = getDB()
  const body = JSON.parse(options.body)
  if (body.items || body.shoppingList) {
    // 物资 + 补货同源覆盖写入
    const goodsStorageKey = getGoodsStorageKey()
    const existing = loadFromStorage(goodsStorageKey, { goods: [], nextId: 1, shoppingList: [], nextShoppingId: 1, nextBatchId: 1 })
    const nextDB = {
      goods: Array.isArray(body.items) ? body.items.map(g => ({ ...g })) : existing.goods,
      nextId: Math.max(
        ...(Array.isArray(body.items) ? body.items : existing.goods).map(g => Number(g.id) || 0),
        existing.nextId || 0
      ) + 1,
      shoppingList: Array.isArray(body.shoppingList) ? body.shoppingList.map(s => ({ ...s })) : existing.shoppingList,
      nextShoppingId: Math.max(
        ...(Array.isArray(body.shoppingList) ? body.shoppingList : existing.shoppingList).map(s => Number(s.id) || 0),
        existing.nextShoppingId || 0
      ) + 1,
      nextBatchId: Math.max(
        ...(Array.isArray(body.items) ? body.items : existing.goods).flatMap(g => (
          Array.isArray(g.batches) ? g.batches.map(b => Number(b.id) || 0) : []
        )),
        existing.nextBatchId || 0
      ) + 1
    }
    saveToStorage(goodsStorageKey, nextDB)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new StorageEvent('storage', { key: goodsStorageKey }))
    }
  }
  if (body.consumptions) db.consumptions = body.consumptions
  if (body.categories) db.categories = body.categories
  if (body.settings) db.settings = body.settings
  saveDB(db)
  return { code: 200, data: null, message: '导入成功' }
})

console.log('[Mock] 已就绪，物资 + 补货清单按家庭/个人作用域托管在 goodsStore')
