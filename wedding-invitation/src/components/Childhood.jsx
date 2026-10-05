import { useEffect, useRef, useState, useCallback } from 'react'
import SmartImage from './SmartImage'

const STEPS = [
  { key: 'memory', dur: 2600 },
  { key: 'memory', dur: 2600 },
  { key: 'memory', dur: 2600 },
]

export default function Childhood({
  images,
  onComplete,
  tone = 'memory',
  kicker = 'Where it all began',
  caption = 'ومن هنا بدأت الحكاية…',
  altPrefix = 'Memory',
}) {
  const [idx, setIdx] = useState(0)
  const done = useRef(false)

  const finish = useCallback(() => {
    if (done.current) return
    done.current = true
    onComplete()
  }, [onComplete])

  useEffect(() => {
    let timer
    if (idx < STEPS.length - 1) {
      timer = setTimeout(() => setIdx((i) => i + 1), STEPS[idx].dur)
    } else {
      timer = setTimeout(finish, 3200)
    }
    return () => clearTimeout(timer)
  }, [idx, finish])

  const count = Math.min(3, images.length || 0)

  return (
    <div className={`childhood-scene${tone === 'present' ? ' childhood-scene--present' : ''}`}>
      <div className="childhood-track">
        {images.slice(0, 3).map((src, i) => {
          const visible = i === idx
          return (
            <SmartImage
              key={`childhood-${i}`}
              src={src}
              alt={`${altPrefix} ${i + 1}`}
              className={`childhood-photo childhood-photo--${i + 1}${visible ? ' is-active' : ''}`}
              label="O&H"
            />
          )
        })}
      </div>

      <div className={`childhood-overlay${idx >= count ? ' childhood-overlay--end' : ''}`}>
        <p className="childhood-kicker">{kicker}</p>
        <p className="childhood-text">{caption}</p>
        <div className="childhood-progress">
          <span
            className="childhood-progress__bar"
            style={{ width: `${((idx + 1) / Math.max(count, 1)) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}