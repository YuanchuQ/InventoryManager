import request from './index'

/** 获取物资列表 */
export const fetchItems = () => request.get('/api/items')

/** 获取单个物资 */
export const fetchItemById = (id) => request.get(`/api/items/${id}`)

/** 添加物资 */
export const createItem = (data) => request.post('/api/items', data)

/** 编辑物资 */
export const updateItem = (id, data) => request.put(`/api/items/${id}`, data)

/** 删除物资 */
export const deleteItem = (id) => request.delete(`/api/items/${id}`)

/** 消耗物资 */
export const consumeItem = (id, data) => request.post(`/api/items/${id}/consume`, data)

/** 获取即将过期物资 */
export const fetchExpiringItems = () => request.get('/api/items/expiring')
