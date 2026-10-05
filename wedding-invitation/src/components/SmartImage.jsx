import { useState } from 'react'

export default function SmartImage({ src, alt = '', className = '', label = 'H&F' }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  return (
    <div className={`image-wrap ${className}${loaded ? ' is-loaded' : ''}`}>
      {src && !failed ? (
        <img src={src} alt={alt} decoding="async" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
      ) : (
        <div className="placeholder" role="img" aria-label={alt}>
          <span className="placeholder__shine" />
          <span className="placeholder__monogram">{label}</span>
          <span className="placeholder__caption">{alt}</span>
        </div>
      )}
      {src && !failed && !loaded && <span className="placeholder__shine" />}
    </div>
  )
}