import { imageModules, musicModules } from './media'

export function resolveImageList(names) {
  return names.map((name) => {
    const key = `../assets/images/${name}`
    return imageModules[key] || null
  })
}

export function resolveMusic(basename) {
  const key = `../assets/music/${basename}`
  return musicModules[key] || null
}