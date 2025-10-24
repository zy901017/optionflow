/**
 * 简单的内存缓存模块
 * 用于缓存 API 响应，避免超过限额
 */

const cache = new Map();

/**
 * 获取缓存
 * @param {string} key - 缓存键
 * @returns {any|null} 缓存的数据或 null
 */
export function getCache(key) {
  const item = cache.get(key);
  
  if (!item) {
    return null;
  }

  // 检查是否过期
  if (Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }

  return item.data;
}

/**
 * 设置缓存
 * @param {string} key - 缓存键
 * @param {any} data - 要缓存的数据
 * @param {number} ttl - 过期时间（秒），默认 300 秒（5 分钟）
 */
export function setCache(key, data, ttl = 300) {
  const expiry = Date.now() + (ttl * 1000);
  cache.set(key, { data, expiry });
}

/**
 * 清除缓存
 * @param {string} key - 缓存键（可选，不提供则清除所有）
 */
export function clearCache(key) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

/**
 * 清理过期缓存
 */
export function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, item] of cache.entries()) {
    if (now > item.expiry) {
      cache.delete(key);
    }
  }
}

// 每 5 分钟清理一次过期缓存
setInterval(cleanExpiredCache, 5 * 60 * 1000);

export default {
  get: getCache,
  set: setCache,
  clear: clearCache,
  clean: cleanExpiredCache
};

