import request from './index'

/** 获取分类列表 */
export const fetchCategories = () => request.get('/api/categories')

/** 添加分类 */
export const createCategory = (data) => request.post('/api/categories', data)

/** 编辑分类 */
export const updateCategory = (id, data) => request.put(`/api/categories/${id}`, data)

/** 删除分类 */
export const deleteCategory = (id) => request.delete(`/api/categories/${id}`)
