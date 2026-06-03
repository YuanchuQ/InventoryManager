import request from './index'

/** 获取设置 */
export const fetchSettings = () => request.get('/api/settings')

/** 更新设置 */
export const updateSettings = (data) => request.put('/api/settings', data)

/** 导出数据 */
export const exportData = () => request.post('/api/data/export')

/** 导入数据 */
export const importData = (data) => request.post('/api/data/import', data)
