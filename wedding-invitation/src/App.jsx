import { useEffect, useRef, useState, useCallback } from 'react'
import weddingData from './data/weddingData'
import { resolveImageList, resolveMusic } from './utils/resolveAssets'
import { preloadImages } from './utils/preload'
import IncomingCall from './components/IncomingCall'
import Childhood from './components/Childhood'
import Reveal from './components/Reveal'
import CouplePhotos from './components/CouplePhotos'
import WeddingDetails from './components/WeddingDetails'
import FinalMoment from './components/FinalMoment'
import MusicToggle from './components/MusicToggle'
import './App.css'

const NEXT = {
  current: 'news',
  news: 'couple',
  couple: 'details',
  details: 'final',
}

const DAWN_TIMING = { bloom: 1300, fade: 650 }

export default function App() {
  const [phase, setPhase] = useState('intro')
  const [dawn, setDawn] = useState('off')
  const [musicOn, setMusicOn] = useState(false)
  const audioRef = useRef(null)
  const newsSeenRef = useRef(false)
  const musicPendingRef = useRef(false)
  const justUnlockedRef = useRef(false)
  const unlockMusicRef = useRef(null)
  const musicSrc = resolveMusic(weddingData.musicFile)
  const currentImages = resolveImageList(weddingData.currentImages)
  const surpriseImages = resolveImageList([weddingData.togetherChildhoodImage])
  const coupleImages = resolveImageList(weddingData.coupleImages)

  const unlockMusic = useCallback(() => {
    if (!musicPendingRef.current) return
    musicPendingRef.current = false
    justUnlockedRef.current = true
    const audio = audioRef.current
    if (!audio) return
    audio.volume = 0.35
    audio.loop = true
    const attempt = audio.play()
    if (attempt !== undefined) {
      attempt
        .then(() => setMusicOn(true))
        .catch(() => {
          musicPendingRef.current = true
          window.addEventListener('pointerdown', unlockMusicRef.current, { once: true, capture: true })
        })
    } else {
      setMusicOn(true)
    }
  }, [])

  useEffect(() => {
    unlockMusicRef.current = unlockMusic
  }, [unlockMusic])

  useEffect(() => {
    preloadImages([...currentImages, ...surpriseImages, ...coupleImages])
  }, [currentImages, surpriseImages, coupleImages])

  const startMusic = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = 0.35
    audio.loop = true
    const attempt = audio.play()
    if (attempt !== undefined) {
      attempt
        .then(() => setMusicOn(true))
        .catch(() => {
          musicPendingRef.current = true
          setMusicOn(false)
          window.addEventListener('pointerdown', unlockMusic, { once: true, capture: true })
        })
    } else {
      setMusicOn(true)
    }
  }, [unlockMusic])

  useEffect(() => {
    if (phase !== 'news' || newsSeenRef.current) return
    newsSeenRef.current = true
    const t = setTimeout(startMusic, 4600)
    return () => clearTimeout(t)
  }, [phase, startMusic])

  const handleOpen = useCallback(() => {
    setDawn('blooming')
    setTimeout(() => setPhase('current'), DAWN_TIMING.bloom)
    setTimeout(() => setDawn('fading'), DAWN_TIMING.bloom)
    setTimeout(() => setDawn('off'), DAWN_TIMING.bloom + DAWN_TIMING.fade)
  }, [])

  const openMaps = useCallback(() => {
    window.open(weddingData.googleMapsUrl, '_blank', 'noopener,noreferrer')
  }, [])

  const replay = useCallback(() => {
    setPhase('intro')
    setMusicOn(false)
    newsSeenRef.current = false
    musicPendingRef.current = false
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }, [])

  return (
    <div className="app">
      {dawn !== 'off' && <div className={`dawn ${dawn === 'fading' ? 'dawn--fade' : ''}`} aria-hidden="true" />}

      <div className="scene" key={phase}>
        {phase === 'intro' && (
          <IncomingCall
            brideName={weddingData.brideName}
            groomName={weddingData.groomName}
            onAnswer={handleOpen}
          />
        )}

        {phase === 'current' && (
          <Childhood
            images={currentImages}
            tone="present"
            kicker="Present Day"
            caption="دلوقتي… إحنا سوا"
            altPrefix="Omar & Hager"
            onComplete={() => setPhase(NEXT.current)}
          />
        )}

        {phase === 'news' && (
          <Reveal image={surpriseImages[0] || null} onComplete={() => setPhase(NEXT.news)} />
        )}

        {phase === 'couple' && <CouplePhotos images={coupleImages} onComplete={() => setPhase(NEXT.couple)} />}

        {phase === 'details' && <WeddingDetails data={weddingData} onOpenMaps={openMaps} onComplete={() => setPhase(NEXT.details)} />}

        {phase === 'final' && (
          <FinalMoment
            image={coupleImages[0] || null}
            groomName={weddingData.groomName}
            brideName={weddingData.brideName}
            onReplay={replay}
          />
        )}
      </div>

      {phase !== 'intro' && (
        <MusicToggle
          playing={musicOn}
          onToggle={() => {
            if (justUnlockedRef.current) {
              justUnlockedRef.current = false
              return
            }
            const audio = audioRef.current
            if (!audio) {
              setMusicOn((m) => !m)
              return
            }
            if (audio.paused) {
              audio.play().catch(() => {})
              setMusicOn(true)
            } else {
              audio.pause()
              setMusicOn(false)
            }
          }}
        />
      )}

      {musicSrc && (
        <audio ref={audioRef} src={musicSrc} preload="metadata" loop playsInline />
      )}
    </div>
  )
}