export default function MusicToggle({ playing, onToggle }) {
  return (
    <button type="button" className={`music-btn${playing ? ' is-playing' : ''}`} onClick={onToggle} aria-label="Toggle music">
      <span className="music-btn__bars" aria-hidden="true">
        <i /><i /><i /><i />
      </span>
      <span className="music-btn__off" aria-hidden="true">✕</span>
    </button>
  )
}