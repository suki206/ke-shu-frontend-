const CACHE_NAME = 'ke-shu-v2'

// 安装时跳过等待，立即激活
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

// 激活时清理旧缓存，并接管所有客户端
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    }).then(() => self.clients.claim())
  )
})

// 拦截请求
self.addEventListener('fetch', (event) => {
  const { request } = event

  // 对 HTML 页面（导航请求）使用网络优先，确保总是获取最新版本
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 网络请求成功，更新缓存
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => {
          // 网络失败，才用缓存
          return caches.match(request)
        })
    )
    return
  }

  // 对 JS/CSS/图片等静态资源使用缓存优先，加快加载
  event.respondWith(
    caches.match(request).then((response) => {
      return (
        response ||
        fetch(request).then((fetchResponse) => {
          if (fetchResponse.status === 200) {
            const clone = fetchResponse.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return fetchResponse
        })
      )
    })
  )
})