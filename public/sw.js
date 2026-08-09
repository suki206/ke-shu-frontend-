const CACHE_NAME = 'ke-shu-v2'

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

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

self.addEventListener('fetch', (event) => {
  const { request } = event

  // 只处理 GET 请求，POST/PUT/DELETE 直接走网络，不缓存
  if (request.method !== 'GET') {
    event.respondWith(fetch(request))
    return
  }

  // 导航请求（HTML页面）网络优先
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          return response
        })
        .catch(() => {
          return caches.match(request)
        })
    )
    return
  }

  // 静态资源缓存优先
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

// ── Web Push：到点提醒的系统级通知 ─────────────────────────────
// 后端 checkDueReminders 推过来的 payload 形如
// { title, body, tag }，见 server.js 里的 sendPushToAll
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch {}
  const title = data.title || '在场'
  const options = {
    body: data.body || '',
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    tag: data.tag || 'presence-reminder',
    data: { url: '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// 点通知：已经开着就把那个窗口拉到前台，没开就新开一个
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow('/')
    })
  )
})