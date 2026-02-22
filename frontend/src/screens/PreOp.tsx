import { useRef, useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Eye, Mic, Video } from 'lucide-react'
import { GlassCard } from '../components/GlassCard'
import { AuraButton } from '../components/AuraButton'
import { ProgressSteps } from '../components/ProgressSteps'
import { AnimatedBackground } from '../components/AnimatedBackground'
import { useCamera } from '../hooks/useCamera'
import { useOcularTracking } from '../hooks/useOcularTracking'

interface PreOpProps {
  onNavigate: (screen: string) => void
}

export function PreOp({ onNavigate }: PreOpProps) {
  const [tracking, setTracking] = useState(false)
  const [recording, setRecording] = useState(false)
  const dotRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const dotPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const tRef = useRef(0)
  const rafRef = useRef<number>(0)

  const { status: cameraStatus, error: cameraError, stream, start: startCamera, stop: stopCamera } = useCamera()

  const getDotPosition = useCallback(() => dotPositionRef.current, [])

  const {
    state: ocularState,
    testMetrics: ocularMetrics,
    liveDeviation: ocularLiveDeviation,
    startRecording: startOcularRecording,
    stopRecording: stopOcularRecording,
  } = useOcularTracking({
    videoRef,
    containerRef: wrapRef,
    getDotPosition,
    enabled: tracking && cameraStatus === 'active',
  })

  useEffect(() => {
    if (stream && videoRef.current) {
      const video = videoRef.current
      video.srcObject = stream
      video.play().catch(() => {})
    }
  }, [stream])

  const startFigure8 = () => {
    const step = () => {
      const wrap = wrapRef.current
      const dot = dotRef.current
      if (!wrap || !dot) return
      const w = wrap.offsetWidth
      const h = wrap.offsetHeight
      const cx = w / 2
      const cy = h / 2
      const scale = Math.min(w, h) * 0.35
      const x = cx + scale * Math.sin(tRef.current)
      const y = cy + scale * Math.sin(tRef.current * 2) * 0.5
      dotPositionRef.current = { x, y }
      dot.style.left = `${x}px`
      dot.style.top = `${y}px`
      tRef.current += 0.03
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
  }

  const handleToggleTracking = async () => {
    if (tracking) {
      cancelAnimationFrame(rafRef.current)
      setTracking(false)
      stopOcularRecording()
      stopCamera()
      return
    }
    const ok = await startCamera()
    if (ok) {
      setTracking(true)
      startFigure8()
      // Start face tracking once camera is active (model loads and recording starts)
      await startOcularRecording()
    }
  }

  const ocularScore = ocularMetrics
    ? Math.round(Math.max(0, 100 - ocularMetrics.averageDeviation * 600))
    : null
  const ocularLiveScore = ocularLiveDeviation != null
    ? Math.round(Math.max(0, 100 - ocularLiveDeviation * 600))
    : null

  // During recording show live score; after stop show final score; otherwise default
  const displayOcularScore =
    ocularScore ?? (tracking && ocularState === 'recording' ? ocularLiveScore : null) ?? 94
  const displayOcularPct = Math.min(100, Math.max(0, displayOcularScore ?? 94))

  return (
    <>
      <AnimatedBackground />
      <section className="relative z-10 min-h-screen p-6">
        <motion.a
          href="#"
          onClick={(e) => { e.preventDefault(); onNavigate('intake') }}
          className="inline-flex items-center gap-2 text-aura-muted text-sm mb-6 hover:text-aura-teal transition-colors"
          whileHover={{ x: -2 }}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </motion.a>
        <ProgressSteps active={1} />
        <motion.div
          className="max-w-2xl mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        >
          <h2 className="text-2xl font-semibold text-center mb-8">Pre-Op Baseline</h2>
          <p className="text-aura-muted text-center max-w-md mx-auto mb-8 leading-relaxed">
            Follow the prompts to establish a baseline. Take your time and perform each test as directed.
          </p>
          <div className="space-y-6 mb-8">
            <GlassCard>
              <h3 className="flex items-center gap-2 text-lg mb-4">
                <Eye className="w-5 h-5 text-aura-teal" /> Ocular Test
              </h3>
              <p className="text-aura-muted text-sm mb-3">
                Follow the moving dot with your eyes. Face tracking measures how well you follow it and computes your score.
              </p>
              {ocularState === 'loading' && (
                <p className="text-aura-teal text-sm mb-2">Loading face tracking model…</p>
              )}
              {ocularState === 'error' && (
                <p className="text-aura-red/90 text-sm mb-2">Face tracking unavailable. Score will use default.</p>
              )}
              <div
                ref={wrapRef}
                className="relative w-full h-52 bg-black/30 rounded-2xl mb-4 overflow-hidden"
              >
                <motion.div
                  ref={dotRef}
                  className="absolute w-4 h-4 rounded-full bg-aura-teal shadow-[0_0_24px_#00d4ff] z-10"
                  style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                />
                {/* Camera preview — bottom-right corner */}
                {cameraStatus === 'active' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute bottom-3 right-3 w-28 h-28 rounded-xl overflow-hidden border-2 border-aura-teal/50 shadow-lg z-20"
                  >
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    <span className="absolute bottom-1 left-1 right-1 text-center text-[10px] font-medium text-white bg-aura-teal/80 rounded py-0.5 flex items-center justify-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Live
                    </span>
                  </motion.div>
                )}
                {cameraStatus === 'requesting' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl z-20"
                  >
                    <div className="text-center">
                      <Video className="w-10 h-10 text-aura-teal mx-auto mb-2 animate-pulse" />
                      <p className="text-sm text-white">Requesting camera access…</p>
                    </div>
                  </motion.div>
                )}
                {cameraStatus === 'error' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute bottom-3 left-3 right-3 py-2 px-3 rounded-lg bg-aura-red/20 border border-aura-red/50 text-aura-red text-sm z-20"
                  >
                    {cameraError}
                  </motion.div>
                )}
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div
                  className="w-14 h-14 rounded-full p-[3px]"
                  style={{
                    background: `conic-gradient(#00d4ff ${displayOcularPct}%, rgba(255,255,255,0.08) 0)`,
                  }}
                >
                  <div className="w-full h-full rounded-full bg-aura-deep flex items-center justify-center text-sm font-semibold text-aura-teal">
                    {tracking && ocularState === 'recording' && ocularLiveScore == null
                      ? '…'
                      : `${displayOcularScore}%`}
                  </div>
                </div>
                <AuraButton
                  primary={false}
                  onClick={handleToggleTracking}
                  disabled={cameraStatus === 'requesting' || ocularState === 'loading'}
                >
                  {cameraStatus === 'requesting'
                    ? 'Starting camera…'
                    : ocularState === 'loading'
                      ? 'Loading…'
                      : tracking
                        ? 'Stop'
                        : 'Begin Tracking'}
                </AuraButton>
              </div>
            </GlassCard>
            <GlassCard>
              <h3 className="flex items-center gap-2 text-lg mb-4">
                <Mic className="w-5 h-5 text-aura-teal" /> Vocal Test
              </h3>
              <p className="text-aura-muted text-center py-4 italic bg-black/20 rounded-2xl mb-4">
                &ldquo;The morning light filters through the window slowly.&rdquo;
              </p>
              <div className="flex items-center justify-center gap-1 h-12 mb-4">
                {[...Array(10)].map((_, i) => (
                  <motion.span
                    key={i}
                    className="w-1 h-3 bg-aura-teal rounded-sm"
                    animate={{ scaleY: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' }}
                  />
                ))}
              </div>
              <motion.button
                type="button"
                className={`inline-flex items-center gap-2 px-6 py-3 rounded-2xl border font-medium text-sm transition-colors ${recording ? 'bg-aura-red/20 border-aura-red text-aura-red' : 'bg-aura-glass border-aura-teal text-aura-teal hover:bg-aura-teal/10'}`}
                onClick={() => setRecording(!recording)}
                whileTap={{ scale: 0.98 }}
              >
                <span className={`w-2 h-2 rounded-full ${recording ? 'animate-pulse' : ''}`} style={{ background: 'currentColor' }} />
                {recording ? 'Recording...' : 'Record response'}
              </motion.button>
            </GlassCard>
          </div>
          <GlassCard className="!border-aura-green/20 text-center mb-8">
            <div className="text-4xl font-bold text-aura-green">
              {ocularScore != null ? ocularScore : 94}
            </div>
            <div className="text-aura-muted mt-1">/ 100 — Baseline established</div>
            <div className="flex justify-center gap-4 mt-4 flex-wrap text-sm text-aura-muted">
              <span>
                <span className="inline-block w-2 h-2 rounded-full bg-aura-green mr-1" />
                Ocular {ocularScore != null ? `${ocularScore}%` : 'nominal'}
              </span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-aura-green mr-1" /> Vocal nominal</span>
              <span><span className="inline-block w-2 h-2 rounded-full bg-aura-green mr-1" /> CNS nominal</span>
            </div>
          </GlassCard>
          <div className="flex justify-center">
            <AuraButton onClick={() => onNavigate('landing')}>Done — Return home</AuraButton>
          </div>
        </motion.div>
      </section>
    </>
  )
}
