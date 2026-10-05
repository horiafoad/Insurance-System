import SmartImage from './SmartImage'

export default function FinalMoment({ image, groomName, brideName, onReplay }) {
  return (
    <div className="final-scene">
      <SmartImage
        src={image}
        alt="Omar & Hager"
        className="final-photo"
        label="O&H"
      />
      <p className="final-overline">With love and gratitude</p>
      <h2 className="final-names">
        {groomName} <span className="final-names__amp">&amp;</span> {brideName}
      </h2>
      <div className="final-rule" aria-hidden="true">
        <span className="final-rule__diamond" />
      </div>
      <p className="final-mid">Thank you for being part of our story.</p>
      <p className="final-see">We can’t wait to celebrate with you.</p>
      <button type="button" className="replay-btn" onClick={onReplay}>
        <span className="replay-btn__label">↺ replay</span>
      </button>
    </div>
  )
}