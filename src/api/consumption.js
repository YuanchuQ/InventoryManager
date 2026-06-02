import request from './index'

/** 获取消耗记录 */
export const fetchConsumptions = () => request.get('/api/consumption')

/** 获取某物资的消耗记录 */
export const fetchConsumptionsByItem = (itemId) => request.get(`/api/consumption?itemId=${itemId}`)

/** 添加消耗记录 */
export const addConsumption = (data) => request.post('/api/consumption', data)
