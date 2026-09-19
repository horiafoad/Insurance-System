import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { clientsClaim } from 'workbox-core'

self.skipWaiting()
clientsClaim()

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// تحتاج كل تطبيقات Vite SPA إلى fallback لملاحة العملاء.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// بدون كاش لبيانات Supabase — دائماً من الشبكة.
registerRoute(
  ({ url }) => url.origin.includes('supabase.co'),
  new NetworkOnly(),
  'GET'
)

// الخطوط: cache-first مع تحديث خلفي.
registerRoute(
  ({ url }) =>
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com',
  new StaleWhileRevalidate({
    cacheName: 'google-fonts',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  }),
  'GET'
)

// ============ Push Notifications ============

// سجل تشخيص مؤقت لمسار Android: يسجّل اللحظة التي يصل فيها push إلى الـ SW،
// ومتى يستدعى showNotification، وأي خطأ فيه — لا يغيّر سلوك الإشعار نفسه.
const DIAG_DB = 'push-debug-v1'
function openDiagDB() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DIAG_DB, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore('events')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch (e) {
      resolve(null)
    }
  })
}
async function diagSave(stage, extra) {
  try {
    const db = await openDiagDB()
    if (!db) return
    const tx = db.transaction('events', 'readwrite')
    tx.objectStore('events').put(
      { stage, t: Date.now(), ...(extra || {}) },
      'last'
    )
  } catch (e) {
    // ignore
  }
}
async function diagRead() {
  try {
    const db = await openDiagDB()
    if (!db) return null
    return await new Promise((resolve) => {
      const tx = db.transaction('events', 'readonly')
      const rq = tx.objectStore('events').get('last')
      rq.onsuccess = () => resolve(rq.result || null)
      rq.onerror = () => resolve(null)
    })
  } catch (e) {
    return null
  }
}
async function diagBroadcast(stage, extra) {
  await diagSave(stage, extra)
  try {
    const message = { type: 'PUSH_DEBUG', stage, t: Date.now(), ...(extra || {}) }
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    })
    clients.forEach((c) => c.postMessage(message))
  } catch (e) {
    // ignore
  }
}

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    const data = event.data ? event.data.json() : null
    payload = data || {}
  } catch (e) {
    payload = { title: 'إشعار جديد', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'إشعار جديد'
  const options = {
    body: payload.body || '',
    icon: payload.icon || './icons/icon-192.png',
    badge: payload.badge || './icons/icon-192.png',
    dir: payload.dir || 'rtl',
    lang: payload.lang || 'ar',
    renotify: true,
    data: payload,
  }

  event.waitUntil(
    (async () => {
      await diagBroadcast('push-received', {
        hasData: Boolean(event.data && event.data.text()),
      })
      try {
        await self.registration.showNotification(title, options)
        await diagBroadcast('shown')
      } catch (err) {
        await diagBroadcast('show-error', {
          error: String((err && err.message) || err).slice(0, 160),
        })
      }
    })()
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url || event.notification.data?.openUrl || '/'

  event.waitUntil(
    (async () => {
      const open = async () => {
        if (!url) return
        const target = new URL(url, self.location.origin).href
        const windowClients = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        })
        for (const client of windowClients) {
          try {
            await client.navigate(target)
            await client.focus()
            return
          } catch (e) {
            // try next client
          }
        }
        await self.clients.openWindow(target)
      }
      await open()
    })()
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }
  if (event.data && event.data.type === 'PUSH_DEBUG_QUERY') {
    event.waitUntil(
      (async () => {
        const record = await diagRead()
        try {
          if (event.source) {
            event.source.postMessage({ type: 'PUSH_DEBUG_RESULT', record })
          }
        } catch (e) {
          // ignore
        }
      })()
    )
  }
})