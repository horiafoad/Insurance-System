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

  event.waitUntil(self.registration.showNotification(title, options))
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
  }
})