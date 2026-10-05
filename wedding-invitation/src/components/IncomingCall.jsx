export default function IncomingCall({ brideName, groomName, onAnswer }) {
  return (
    <div className="call-scene">
      <div className="call-vignette" aria-hidden="true" />
      <div className="call-aura" aria-hidden="true" />

      <div className="call-names">
        <div className="call-kicker">
          <span className="call-kicker__rule" aria-hidden="true" />
          <span className="call-kicker__text">Wedding Invitation</span>
          <span className="call-kicker__rule" aria-hidden="true" />
        </div>

        <h1 className="call-names__title">
          {groomName} <span className="call-names__amp">&amp;</span> {brideName}
        </h1>

        <div className="call-rule" aria-hidden="true">
          <span className="call-rule__diamond" />
        </div>

        <p className="call-names__sub">The Wedding Invitation</p>
      </div>

      <button type="button" className="answer-btn" onClick={onAnswer}>
        <span className="answer-btn__label">OPEN INVITATION</span>
      </button>

      <p className="call-hint">tap to begin</p>
    </div>
  )
}