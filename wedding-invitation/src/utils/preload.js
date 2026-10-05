export function preloadImages(urls) {
  urls.forEach((url) => {
    if (!url) return
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    if (typeof img.decode === 'function') {
      img.decode().catch(() => {})
    }
  })
}