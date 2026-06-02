import request from './index'

/** 获取补货清单 */
export const fetchShoppingList = () => request.get('/api/shopping')

/** 手动添加补货项 */
export const addShoppingItem = (data) => request.post('/api/shopping', data)

/** 更新补货项（标记已购/取消） */
export const updateShoppingItem = (id, data) => request.put(`/api/shopping/${id}`, data)

/** 删除补货项 */
export const deleteShoppingItem = (id) => request.delete(`/api/shopping/${id}`)
