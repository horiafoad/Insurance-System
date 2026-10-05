import { useEffect, useRef, useState, useCallback } from 'react'
import SmartImage from './SmartImage'

const SHOT_DUR = 2800

export default function CouplePhotos({ images, onComplete }) {
  const shots = images.slice()
  const count = shots.length || 0
  const [idx, setIdx] = useState(0)
  const done = useRef(false)

  const finish = useCallback(() => {
    if (done.current) return
    done.current = true
    onComplete()
  }, [onComplete])

  useEffect(() => {
    let timer
    if (idx < count - 1) {
      timer = setTimeout(() => setIdx((i) => i + 1), SHOT_DUR)
    } else {
      timer = setTimeout(finish, SHOT_DUR + 900)
    }
    return () => clearTimeout(timer)
  }, [idx, count, finish])

  return (
    <div className="couple-scene">
      <p className="couple-eyebrow">Our Story in Frames</p>
      <div className="couple-stage">
        {shots.map((src, i) => {
          const visible = i === idx
          return (
            <SmartImage
              key={`couple-${i}`}
              src={src}
              alt={`Couple photo ${i + 1}`}
              className={`couple-photo couple-photo--${(i % 4) + 1}${visible ? ' is-active' : ''}`}
              label="O&H"
            />
          )
        })}
      </div>
      <div className="couple-dots">
        {shots.map((_, i) => (
          <span key={i} className={`couple-dots__dot${i === idx ? ' is-active' : ''}`} />
        ))}
      </div>
    </div>
  )
}