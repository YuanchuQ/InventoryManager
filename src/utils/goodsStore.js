/**
 * ============================================================
 *  全局物资数据中心  src/utils/goodsStore.js
 * ============================================================
 * 设计要点：
 *   1. 全品类物资共用一套结构，区分 categoryId / id / name / quantity / spec / unit
 *      等字段（详见下方 GoodsItem 类型注释）。
 *   2. 唯一数据源：localStorage key = `im_goods_db_<家庭或个人作用域>`
 *      首次进入页面会从 src/data/defaultGoods.json 一次性灌入默认值；
 *      之后任何新增 / 修改 / 删除 / 丢弃都直接写入这同一份数据。
 *   3. 任何页面，不论是哪个分类，都必须通过本文件暴露的方法
 *      （getGoodsList / addGoods / editGoods / delGoods / restockGoods /
 *      discardGoods / consumeGoods）来操作物资数组；
 *      禁止页面内部维护独立的 push / reactive 数据。
 *   4. 提供 subscribe(fn)：所有页面订阅同一份数据变更，新增/修改后跨页面
 *      自动同步（无需刷新即可看到最新数据，也兼容 Vue 组件 watch）。
 *
 * 批次（batches）模型（2026-06 起）：
 *   - 每个物资持有独立的 batches 数组，结构：
 *     { id, quantity, expiryDate, createdAt }
 *   - 同一物资可同时存在多个批次（保质期不同），如：
 *     鸡蛋：批次 A 4 个 / 还有 3 天过期 + 批次 B 1 个 / 还有 7 天过期
 *   - 消耗 / 丢弃走 FIFO（先过期先消耗）：从最早过期批次里扣，到 0 时移除该批次
 *   - 补货始终 push 新批次，不合并到旧批次
 *   - item.quantity 与 item.expiryDate 是批次汇总的"派生字段"：
 *     quantity = 所有 batch.quantity 之和
 *     expiryDate = 所有非空 expiryDate 的最早日期
 *   - 旧数据（无 batches 字段）在首次加载时自动回填
 *
 * GoodsItem (统一物资结构):
 * {
 *   id:               string   // 物资唯一 ID（字符串自增，"1"、"2"...）
 *   categoryId:       string   // 物资分类 ID，对应 defaultGoods.json -> categories
 *   name:             string   // 物资名称（必填，例如：鸡蛋、洗衣液）
 *   spec:             string   // 物资规格（可选，例如：500ml、3L·薰衣草香）
 *   quantity:         number   // 当前库存数量（= sum of batches.quantity，派生）
 *   unit:             string   // 单位（个、瓶、盒...）
 *   expiryDate:       string   // 过期日期 YYYY-MM-DD（= 最早批次日期，派生）
 *   minQuantity:      number   // 最低库存阈值
 *   price:            number   // 单价（元）
 *   storageLocation:  string   // 存放位置
 *   note:             string   // 备注
 *   createdAt:        string   // 入库日期 YYYY-MM-DD
 *   batches:          Array<{id, quantity, expiryDate, createdAt}>
 * }
 */

import defaultData from '@/data/defaultGoods.json'
// 通用读写函数（裸 localStorage，自己拼接 key）
import { loadFromStorage, saveToStorage } from '@/utils/constants'
// 作用域工具：把"基础 key"拼成"基础 key + 当前家庭/个人作用域"的完整 key
import { FAMILY_CHANGED_EVENT, getScopedStorageKey } from '@/utils/familyStore'
// 历史记录写入入口（丢弃/补货/使用都要写一条记录）
import { addRecord } from '@/utils/historyStore'

// ===== localStorage 基础 key，实际读写时会追加家庭/个人作用域 =====
export const GOODS_DB_KEY = 'im_goods_db'

// ===== 内存订阅列表（跨页面同步） =====
// 任何调用了 subscribe() 的回调都会被存进来；数据变化时统一触发
const listeners = new Set()         // 物资变更订阅
const shoppingListeners = new Set() // 补货清单变更订阅

// 内部使用：取当前作用域下的完整 storage key
function getGoodsDBKey() {
  return getScopedStorageKey(GOODS_DB_KEY)
}

// 对外暴露：让其他模块（如导出功能）也能拿到当前 key
export function getGoodsStorageKey() {
  return getGoodsDBKey()
}

// 构建一份"全新的默认数据"，用于首次进入或重置时初始化数据库
function createDefaultDB() {
  return {
    // 把默认 JSON 中的物资逐条转成带 batches 字段的标准结构
    goods: defaultData.goods.map(g => ({
      ...g,
      batches: [{
        id: '1',
        quantity: Number(g.quantity) || 0,
        expiryDate: g.expiryDate || '',
        createdAt: g.createdAt || new Date().toISOString().slice(0, 10)
      }]
    })),
    nextId: defaultData.nextId || (defaultData.goods.length + 1),
    shoppingList: [],
    nextShoppingId: 1,
    nextBatchId: 2
  }
}

// 切换到一个新的作用域（如新建家庭）时的"种子数据"
// 若历史上有未带作用域后缀的老数据，把它当作种子，避免数据丢失
function getSeedDBForScope(storageKey) {
  if (storageKey === GOODS_DB_KEY) return null
  const legacy = loadFromStorage(GOODS_DB_KEY, null)
  if (legacy && Array.isArray(legacy.goods)) {
    return {
      ...legacy,
      // 深拷一份，避免与老数据共享引用
      goods: legacy.goods.map(g => ({ ...g, batches: Array.isArray(g.batches) ? g.batches.map(b => ({ ...b })) : g.batches })),
      shoppingList: Array.isArray(legacy.shoppingList) ? legacy.shoppingList.map(s => ({ ...s })) : []
    }
  }
  return null
}

/**
 * 触发所有物资订阅者
 */
function emitChange() {
  const list = getGoodsList()
  listeners.forEach(fn => {
    try { fn(list) } catch (e) { console.error('[goodsStore] listener error:', e) }
  })
}

/**
 * 触发所有补货清单订阅者
 */
function emitShoppingChange() {
  const list = getShoppingList()
  shoppingListeners.forEach(fn => {
    try { fn(list) } catch (e) { console.error('[goodsStore] shopping listener error:', e) }
  })
}

/**
 * 监听 localStorage 跨标签页变更（同浏览器多 tab 也能同步）
 * 注：同 tab 内的修改通过 emitChange 直接触发，不需要 storage 事件。
 */
if (typeof window !== 'undefined') {
  // 浏览器 A 标签页改了 localStorage，B 标签页会收到 storage 事件
  window.addEventListener('storage', (e) => {
    if (e.key === getGoodsDBKey()) {
      emitChange()
      emitShoppingChange()
    }
  })
  // 当用户切换家庭 / 加入家庭时，作用域 key 会变 → 重新初始化并广播
  window.addEventListener(FAMILY_CHANGED_EVENT, () => {
    ensureInitialized()
    rescanLowStock()
    emitChange()
    emitShoppingChange()
  })
}

/**
 * 初始化：仅首次运行时从默认 JSON 灌入数据
 * 已存在 localStorage 数据时直接使用，不覆盖用户已有数据。
 * 同时为所有物资补齐 batches 字段（兼容老数据）。
 */
function ensureInitialized() {
  const storageKey = getGoodsDBKey()
  const saved = loadFromStorage(storageKey, null)
  if (saved && Array.isArray(saved.goods)) {
    // 兼容老数据：缺补货字段时补齐
    if (!Array.isArray(saved.shoppingList)) saved.shoppingList = []
    if (typeof saved.nextShoppingId !== 'number') saved.nextShoppingId = 1
    // batches 字段：每件老物资先回填一个批次（id 自增），保证后续 FIFO 逻辑可工作
    if (typeof saved.nextBatchId !== 'number') saved.nextBatchId = 1
    let mutated = false
    saved.goods.forEach(g => {
      // 老数据没有 batches → 用现有 quantity / expiryDate 包装成单批次
      if (!Array.isArray(g.batches) || g.batches.length === 0) {
        g.batches = [{
          id: String(saved.nextBatchId++),
          quantity: Number(g.quantity) || 0,
          expiryDate: g.expiryDate || '',
          createdAt: g.createdAt || new Date().toISOString().slice(0, 10)
        }]
        mutated = true
      }
    })
    // 有改动才写回，避免无意义的 setItem
    if (mutated) saveToStorage(storageKey, saved)
    return saved
  }
  // 当前作用域下无数据 → 用种子数据（老作用域复制）或默认数据初始化
  const initial = getSeedDBForScope(storageKey) || createDefaultDB()
  saveToStorage(storageKey, initial)
  return initial
}

/**
 * 读取完整 DB
 */
function readDB() {
  return ensureInitialized()
}

/**
 * 写入完整 DB 并广播
 */
function writeDB(db, opts = {}) {
  saveToStorage(getGoodsDBKey(), db)
  if (opts.silent !== true) {
    emitChange()
    emitShoppingChange()
  }
}

/**
 * 低库存检查：物资数量 ≤ minQuantity 时自动写入/同步补货清单
 * - 同物资已存在"未采购"的自动项时更新数量，避免库存继续下降后补货缺口过期
 * - 同物资已存在"未采购"的手动项时跳过，避免覆盖用户手动维护的条目
 * - 仅对 quantity > 0 且 ≤ minQuantity 触发；quantity = 0 也触发（库存归零更需补货）
 * @returns {boolean} 补货清单是否发生变化
 */
function checkLowStock(db, item) {
  if (!item) return false
  // 库存充足 → 不需要补货
  if (item.quantity > item.minQuantity) return false

  // 推荐补货数量：把库存补到比阈值高 1 件
  const quantity = Math.max(item.minQuantity - item.quantity + 1, 1)
  // 查找该物资已有的"自动生成且未采购"补货项
  const exists = db.shoppingList.find(s => (
    String(s.itemId) === String(item.id) && !s.isPurchased && s.isAuto
  ))
  if (exists) {
    // 已存在自动项 → 仅在关键字段变化时更新，避免无谓写入
    const changed =
      exists.name !== item.name ||
      exists.categoryId !== item.categoryId ||
      exists.quantity !== quantity ||
      exists.unit !== item.unit

    if (changed) {
      exists.name = item.name
      exists.categoryId = item.categoryId
      exists.quantity = quantity
      exists.unit = item.unit
    }
    return changed
  }

  // 用户已手动加入该物资 → 不重复添加自动项，避免与手动条目冲突
  const manualExists = db.shoppingList.some(s => (
    String(s.itemId) === String(item.id) && !s.isPurchased && !s.isAuto
  ))
  if (manualExists) return false

  // 真正新增一条自动补货项
  db.shoppingList.push({
    id: String(db.nextShoppingId++),
    itemId: item.id,
    name: item.name,
    categoryId: item.categoryId,
    quantity,
    unit: item.unit,
    isAuto: true,
    isPurchased: false
  })
  return true
}

// ============================================================
//  批次（batches）辅助函数
// ============================================================

/**
 * 把 item 上的派生字段（quantity / expiryDate）从 batches 重新计算。
 * 必须在每次修改 batches 后调用，保证库存展示和过期告警都正确。
 */
function syncItemSummary(item) {
  const batches = Array.isArray(item.batches) ? item.batches : []
  item.quantity = batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0)
  const dates = batches
    .map(b => b.expiryDate)
    .filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
  item.expiryDate = dates[0] || ''
}

/**
 * 生成下一个批次 id
 */
function nextBatchId(db) {
  if (typeof db.nextBatchId !== 'number') db.nextBatchId = 1
  return String(db.nextBatchId++)
}

// ============================================================
//  对外公共 API（项目内所有页面统一使用以下函数）
// ============================================================

/**
 * 获取全量所有物资
 * - 每次返回前从 batches 重新汇总 quantity / expiryDate，
 *   防止老数据/外部修改造成派生字段与批次不一致
 * @returns {Array} 物资数组（GoodsItem[]）
 */
export function getGoodsList() {
  return readDB().goods.map(g => {
    // 浅拷一份，避免外部直接修改内部对象
    const out = { ...g, batches: Array.isArray(g.batches) ? g.batches.map(b => ({ ...b })) : [] }
    syncItemSummary(out)
    return out
  })
}

/**
 * 按 ID 获取单个物资
 * @param {string} id
 * @returns {Object|null}
 */
export function getGoodsById(id) {
  const item = readDB().goods.find(g => String(g.id) === String(id))
  if (!item) return null
  const out = { ...item, batches: Array.isArray(item.batches) ? item.batches.map(b => ({ ...b })) : [] }
  syncItemSummary(out)
  return out
}

/**
 * 新增任意品类物资
 * - 自动分配 id 与 createdAt，并初始化首批次（来自表单的 expiryDate）
 * - 字段不全时使用默认值
 * - 写入后自动触发低库存检查（若 quantity ≤ minQuantity 自动加入补货清单）
 * @param {Object} item 物资数据（无需 id）
 * @returns {Object} 入库后的完整物资对象
 */
export function addGoods(item) {
  const db = readDB()
  const today = new Date().toISOString().slice(0, 10)
  const initialQty = Number(item.quantity ?? 1)
  // 构造完整的新物资对象，缺失字段全部给默认值
  const newItem = {
    id: String(db.nextId++),
    categoryId: item.categoryId || '',
    name: item.name || '未命名物资',
    spec: item.spec || '',
    quantity: initialQty,
    unit: item.unit || '个',
    expiryDate: item.expiryDate || '',
    minQuantity: Number(item.minQuantity ?? 1),
    price: Number(item.price ?? 0),
    storageLocation: item.storageLocation || '',
    note: item.note || '',
    createdAt: item.createdAt || today,
    // 首批次：来自表单
    batches: [{
      id: nextBatchId(db),
      quantity: initialQty,
      expiryDate: item.expiryDate || '',
      createdAt: item.createdAt || today
    }]
  }
  // 同步汇总（防止外部传入不一致）
  syncItemSummary(newItem)
  // 新物资放到列表最前面，便于用户立即看到
  db.goods.unshift(newItem)
  // 若本身就低于阈值（如阈值为 5、新增数量为 3），立刻进入补货清单
  checkLowStock(db, newItem)
  writeDB(db)
  return { ...newItem }
}

/**
 * 修改物资
 * - 基本字段（name/spec/unit/minQuantity/price/storageLocation/note）直接覆盖
 * - quantity 字段语义：
 *     a) 传 number：按差额调整最近批次（FIFO：先从最早过期批次扣/加；
 *        差额为正则在最近批次补；差额为负则 FIFO 扣）
 *     b) 不传 quantity：保持不变
 *   ⚠️ 推荐页面改 quantity 时尽量走 restockGoods/discardGoods，避免破坏批次
 * - expiryDate 字段：直接覆盖批次汇总的最早日期（仅在未带 quantity 时使用旧逻辑）
 * - 写入后自动触发低库存检查
 * @param {string} id 物资 ID
 * @param {Object} newData 要覆盖的字段（部分字段即可）
 * @returns {Object|null} 修改后的物资；不存在返回 null
 */
export function editGoods(id, newData) {
  const db = readDB()
  const idx = db.goods.findIndex(g => String(g.id) === String(id))
  if (idx === -1) return null
  const cur = db.goods[idx]
  const data = { ...newData }

  // 若外部要修改 quantity，按差额调整批次（避免破坏多批次历史）
  if (Object.prototype.hasOwnProperty.call(data, 'quantity')) {
    const targetQty = Number(data.quantity) || 0
    // 与当前总量的差额：正值需要补，负值需要扣
    const diff = targetQty - (cur.quantity || 0)
    if (diff > 0) {
      // 增加：在最早过期批次补；若无批次则建一个新批次
      const sortedBatches = [...(cur.batches || [])].sort((a, b) => {
        const da = a.expiryDate || '9999-12-31'
        const db2 = b.expiryDate || '9999-12-31'
        return da.localeCompare(db2)
      })
      if (sortedBatches.length) {
        // 全部加到最早过期批次（FIFO 策略反向）
        sortedBatches[0].quantity += diff
      } else {
        // 无批次时创建一个新批次承接增量
        cur.batches = cur.batches || []
        cur.batches.push({
          id: nextBatchId(db),
          quantity: diff,
          expiryDate: cur.expiryDate || '',
          createdAt: new Date().toISOString().slice(0, 10)
        })
      }
    } else if (diff < 0) {
      // 减少：FIFO 扣
      const sortedBatches = [...(cur.batches || [])].sort((a, b) => {
        const da = a.expiryDate || '9999-12-31'
        const db2 = b.expiryDate || '9999-12-31'
        return da.localeCompare(db2)
      })
      let need = -diff
      // 从最早过期批次开始扣，直到扣完需要的数量
      for (const b of sortedBatches) {
        if (need <= 0) break
        const take = Math.min(b.quantity, need)
        b.quantity -= take
        need -= take
      }
      // 移除已被扣空的批次
      cur.batches = (cur.batches || []).filter(b => b.quantity > 0)
    }
    delete data.quantity // 已通过 batches 处理
  }

  // expiryDate 字段：仅在没有 batches 数据时直接覆盖（兜底）
  if (Object.prototype.hasOwnProperty.call(data, 'expiryDate')
      && (!Array.isArray(cur.batches) || cur.batches.length === 0)) {
    // 此时上面 quantity 分支没有 batches 可写，直接落到 item 上
    // （正常路径下走到这里说明物资本来就没有 batches）
  }

  // 用 newData 浅覆盖；id 永远以原值为准，避免被意外改掉
  db.goods[idx] = { ...cur, ...data, id: cur.id }
  // 重新汇总派生字段
  syncItemSummary(db.goods[idx])
  checkLowStock(db, db.goods[idx])
  writeDB(db)
  return { ...db.goods[idx] }
}

/**
 * 删除物资
 * - 同时清理补货清单中绑定该物资的未采购自动项
 * @param {string} id 物资 ID
 * @returns {boolean} 是否删除成功
 */
export function delGoods(id) {
  const db = readDB()
  const before = db.goods.length
  db.goods = db.goods.filter(g => String(g.id) !== String(id))
  const changed = db.goods.length !== before
  if (changed) {
    // 物资被删除：清掉其对应的"自动生成的未采购"补货项
    db.shoppingList = db.shoppingList.filter(s => {
      if (String(s.itemId) !== String(id)) return true
      return s.isPurchased || !s.isAuto
    })
    writeDB(db)
  }
  return changed
}

/**
 * 丢弃物资（用于拖拽管理的"垃圾桶"等场景）
 * - 走 FIFO：从最早过期批次里扣，到 0 时移除该批次
 * - 数量归 0 时**保留记录**（quantity=0，"已用完" 状态），
 *   这样在拖拽管理页仍能拖到"补货区"补回新批次，让物资可持续管理。
 *   若不再需要，可用库存列表的"删除"按钮彻底移除。
 * - 写入后自动触发低库存检查
 * @param {string} id 物资 ID
 * @param {number} amount 丢弃数量，默认 1
 * @returns {Object|null} 操作后的物资；不存在或数量不足返回 null
 */
export function discardGoods(id, amount = 1) {
  const db = readDB()
  const idx = db.goods.findIndex(g => String(g.id) === String(id))
  if (idx === -1) return null
  const cur = db.goods[idx]
  const initialNeed = Math.min(Number(amount) || 1, cur.quantity || 0)
  let need = initialNeed
  if (need <= 0) return null
  // 按过期日升序排（无保质期批次放最后）
  const sorted = [...(cur.batches || [])].sort((a, b) => {
    const da = a.expiryDate || '9999-12-31'
    const db2 = b.expiryDate || '9999-12-31'
    return da.localeCompare(db2)
  })
  for (const b of sorted) {
    if (need <= 0) break
    const take = Math.min(b.quantity, need)
    b.quantity -= take
    need -= take
  }
  cur.batches = (cur.batches || []).filter(b => b.quantity > 0)
  syncItemSummary(cur)
  checkLowStock(db, cur)
  writeDB(db)
  // 记录丢弃历史（使用扣除前的数量）
  addRecord('discard', {
    itemId: cur.id,
    itemName: cur.name,
    categoryId: cur.categoryId,
    quantity: initialNeed,
    unit: cur.unit
  })
  return { ...cur }
}

/**
 * 消耗物资（数量 -n，FIFO 同 discardGoods，但语义为"使用"，记录为 use 类型）
 * @param {string} id
 * @param {number} amount
 */
export function consumeGoods(id, amount = 1) {
  const db = readDB()
  const idx = db.goods.findIndex(g => String(g.id) === String(id))
  if (idx === -1) return null
  const cur = db.goods[idx]
  const initialNeed = Math.min(Number(amount) || 1, cur.quantity || 0)
  let need = initialNeed
  if (need <= 0) return null
  const sorted = [...(cur.batches || [])].sort((a, b) => {
    const da = a.expiryDate || '9999-12-31'
    const db2 = b.expiryDate || '9999-12-31'
    return da.localeCompare(db2)
  })
  for (const b of sorted) {
    if (need <= 0) break
    const take = Math.min(b.quantity, need)
    b.quantity -= take
    need -= take
  }
  cur.batches = (cur.batches || []).filter(b => b.quantity > 0)
  syncItemSummary(cur)
  checkLowStock(db, cur)
  writeDB(db)
  // 记录使用历史（使用扣除前的数量）
  addRecord('use', {
    itemId: cur.id,
    itemName: cur.name,
    categoryId: cur.categoryId,
    quantity: initialNeed,
    unit: cur.unit
  })
  return { ...cur }
}

/**
 * 补货：往该物资下推入一个新批次
 * - 旧批次不会被合并/修改
 * - 数量回升到阈值之上时，自动清掉对应的自动补货项
 * - 必须传入新批次的 expiryDate：避免新货沿用旧批次过期日
 *
 * @param {string} id
 * @param {number|Object} amountOrPatch
 *   - 传 number：仅加数量，使用 item 当前 expiryDate 作为新批次过期日（兜底）
 *   - 传 { amount, expiryDate, createdAt }：以 patch 为准
 */
export function restockGoods(id, amountOrPatch = 1) {
  const db = readDB()
  const idx = db.goods.findIndex(g => String(g.id) === String(id))
  if (idx === -1) return null
  const item = db.goods[idx]

  // 兼容两种入参：传 number（仅加数量）或传对象 { amount, expiryDate, createdAt }
  const patch = (amountOrPatch && typeof amountOrPatch === 'object') ? amountOrPatch : {}
  const amount = Number(
    Object.prototype.hasOwnProperty.call(patch, 'amount') ? patch.amount : amountOrPatch
  ) || 1
  const today = new Date().toISOString().slice(0, 10)
  // 兜底：没传 expiryDate 时用 item 当前的过期日，再不行就用 today + 30 天
  let newExpiry = ''
  if (Object.prototype.hasOwnProperty.call(patch, 'expiryDate')) {
    newExpiry = patch.expiryDate || ''
  } else if (item.expiryDate) {
    newExpiry = item.expiryDate
  } else {
    newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }
  const newCreatedAt = patch.createdAt || today

  if (!Array.isArray(item.batches)) item.batches = []
  // 把新批次追加到末尾；旧批次保持不动（不与新批次合并）
  item.batches.push({
    id: nextBatchId(db),
    quantity: amount,
    expiryDate: newExpiry,
    createdAt: newCreatedAt
  })
  syncItemSummary(item)

  // 数量回升到阈值之上时，自动清掉对应的自动补货项
  if (item.quantity > item.minQuantity) {
    db.shoppingList = db.shoppingList.filter(s => {
      if (String(s.itemId) !== String(id)) return true
      // 仅清自动生成且未购的；手动项与已购项保留
      return s.isPurchased || !s.isAuto
    })
  }
  writeDB(db)
  // 记录补货历史
  addRecord('restock', {
    itemId: item.id,
    itemName: item.name,
    categoryId: item.categoryId,
    quantity: amount,
    unit: item.unit
  })
  return { ...item }
}

/**
 * 订阅物资变更（跨页面 / 跨组件同步）
 * @param {(list:Array)=>void} fn
 * @returns {Function} 取消订阅函数
 */
// 返回的"取消订阅函数"在组件卸载时调用，避免内存泄漏
export function subscribe(fn) {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ============================================================
//  补货清单 API（与物资同源，单一数据源）
// ============================================================

/**
 * 获取完整补货清单
 */
export function getShoppingList() {
  return readDB().shoppingList.map(s => ({ ...s }))
}

/**
 * 手动新增补货项
 * @param {{name:string, quantity:number, unit:string, categoryId:string, itemId?:string}} data
 */
export function addShoppingItem(data) {
  const db = readDB()
  const item = {
    id: String(db.nextShoppingId++),
    itemId: data.itemId || '',
    name: data.name || '未命名',
    quantity: Number(data.quantity ?? 1),
    unit: data.unit || '个',
    categoryId: data.categoryId || '',
    isAuto: false,
    isPurchased: false
  }
  db.shoppingList.unshift(item)
  writeDB(db)
  return { ...item }
}

/**
 * 更新补货项（标记已购 / 取消）
 */
export function updateShoppingItem(id, patch) {
  const db = readDB()
  const idx = db.shoppingList.findIndex(s => String(s.id) === String(id))
  if (idx === -1) return null
  db.shoppingList[idx] = { ...db.shoppingList[idx], ...patch, id: db.shoppingList[idx].id }
  writeDB(db)
  return { ...db.shoppingList[idx] }
}

/**
 * 删除补货项
 */
export function delShoppingItem(id) {
  const db = readDB()
  const before = db.shoppingList.length
  db.shoppingList = db.shoppingList.filter(s => String(s.id) !== String(id))
  const changed = db.shoppingList.length !== before
  if (changed) writeDB(db)
  return changed
}

/**
 * 清空已采购补货记录，不影响库存和待采购项。
 */
export function clearPurchasedShoppingItems() {
  const db = readDB()
  const before = db.shoppingList.length
  db.shoppingList = db.shoppingList.filter(s => !s.isPurchased)
  const changed = db.shoppingList.length !== before
  if (changed) writeDB(db)
  return changed
}

/**
 * 订阅补货清单变更
 */
export function subscribeShopping(fn) {
  if (typeof fn !== 'function') return () => {}
  shoppingListeners.add(fn)
  return () => shoppingListeners.delete(fn)
}

/**
 * 手动重扫所有物资，把缺货项补进补货清单
 * 用于："已有数据中某些物资本来就低于阈值，但首次进入页面时没有触发新增"
 */
export function rescanLowStock() {
  const db = readDB()
  let added = 0
  db.goods.forEach(g => { if (checkLowStock(db, g)) added++ })
  if (added > 0) writeDB(db)
  return added
}

/**
 * （可选）重置为默认数据
 */
export function resetGoodsToDefault() {
  const initial = createDefaultDB()
  // 立刻基于默认数据扫一遍低库存，确保进入时补货清单就是正确的
  initial.goods.forEach(g => checkLowStock(initial, g))
  saveToStorage(getGoodsDBKey(), initial)
  emitChange()
  emitShoppingChange()
  return getGoodsList()
}

// 首次模块加载时确保初始化 + 扫一次低库存
// 任何页面 import 本模块都会触发一次，保证数据可用且补货清单是最新的
ensureInitialized()
rescanLowStock()
