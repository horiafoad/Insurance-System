import { useEffect, useRef, useCallback } from 'react'

export default function WeddingDetails({ data, onOpenMaps, onComplete }) {
  const done = useRef(false)

  const finish = useCallback(() => {
    if (done.current) return
    done.current = true
    onComplete()
  }, [onComplete])

  useEffect(() => {
    const t = setTimeout(finish, 12000)
    return () => clearTimeout(t)
  }, [finish])

  return (
    <div className="details-scene">
      <div className="details-card">
        <p className="details-eyebrow">Wedding Day</p>
        <div className="details-ornament" aria-hidden="true">
          <span className="details-ornament__line" />
          <span className="details-ornament__diamond" />
          <span className="details-ornament__line" />
        </div>
        <h2 className="details-title">بفرح كبير ندعوكم لمشاركتنا يومنا الخاص</h2>

        <div className="details-row">
          <span className="details-row__label">Date</span>
          <span className="details-row__value">{data.weddingDate}</span>
          <span className="details-row__meta">{data.weddingDay}</span>
        </div>

        <div className="details-row">
          <span className="details-row__label">Time</span>
          <span className="details-row__value">{data.weddingTime}</span>
          <span className="details-row__meta">evening</span>
        </div>

        <div className="details-row details-row--venue">
          <span className="details-row__label">Venue</span>
          <span className="details-row__value">{data.venueName}</span>
          <span className="details-row__meta">{data.venueAddress}</span>
        </div>

        <button type="button" className="maps-btn" onClick={onOpenMaps}>
          OPEN LOCATION
        </button>
      </div>
    </div>
  )
}