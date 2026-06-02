import request from './index'

/** 获取统计数据（分类占比 + 消耗趋势） */
export const fetchStatistics = () => request.get('/api/statistics')
