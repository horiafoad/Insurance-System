import { useEffect, useRef, useState, useCallback } from 'react'
import SmartImage from './SmartImage'

export default function Reveal({ image, onComplete }) {
  const done = useRef(false)
  const [newsGone, setNewsGone] = useState(false)

  const finish = useCallback(() => {
    if (done.current) return
    done.current = true
    onComplete()
  }, [onComplete])

  useEffect(() => {
    const t = setTimeout(finish, 9800)
    return () => clearTimeout(t)
  }, [finish])

  useEffect(() => {
    const t = setTimeout(() => setNewsGone(true), 3900)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className="reveal-scene">
      <div className="reveal-stage">
        <SmartImage src={image} alt="Omar & Hager" className="reveal-photo" label="O&H" />
        <div className="reveal-stage__scrim" aria-hidden="true" />
        <div className="reveal-stage__vignette" aria-hidden="true" />
      </div>

      <div className="reveal-content">
        {!newsGone && <p className="reveal-news">عندنا خبر حلو…</p>}

        <div className="reveal-announce">
          <h2 className="reveal-headline">
            <span className="reveal-headline__line reveal-headline__line--1">هاجر وعمر</span>
            <span className="reveal-headline__line reveal-headline__line--2">هيتجوزوا</span>
          </h2>
          <div className="reveal-rule" aria-hidden="true">
            <span className="reveal-rule__diamond" />
          </div>
        </div>

        <p className="reveal-hint">كمّلوا معانا…</p>
      </div>
    </div>
  )
}