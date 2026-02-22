import { useRef, useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Eye, Mic, Video } from 'lucide-react'
import { GlassCard } from '../components/GlassCard'
import { AuraButton } from '../components/AuraButton'
import { ProgressSteps } from '../components/ProgressSteps'
import { AnimatedBackground } from '../components/AnimatedBackground'
import { useCamera } from '../hooks/useCamera'
import { useOcularTracking } from '../hooks/useOcularTracking'

interface PostOpProps {
  onNavigate: (screen: string) => void
}

export function PostOp({ onNavigate }: PostOpProps) {
  const [tracking, setTracking] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const dotPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const tRef = useRef(0)
  const rafRef = useRef<number>(0)
  const testStartTimeRef = useRef<number>(0)

  const { status: cameraStatus, error: cameraError, stream, start: startCamera, stop: stopCamera } = useCamera()

  const getDotPosition = useCallback(() => dotPositionRef.current, [])

  const {
    state: ocularState,
    testMetrics: ocularMetrics,
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

  // Smooth horizontal dot motion: left-right-left, 3 times total (~15 seconds)
  // Each cycle is: 2.5 seconds left->right + 2.5 seconds right->left = 5 seconds per cycle
  const startHorizontalDot = () => {
    const step = () => {
      const wrap = wrapRef.current
      const dot = dotRef.current
      if (!wrap || !dot) return
      
      const w = wrap.offsetWidth
      const h = wrap.offsetHeight
      const cy = h / 2 // Center vertically
      const padding = w * 0.1 // 10% padding from edges
      const minX = padding
      const maxX = w - padding
      
      const t = tRef.current
      const cycleDuration = 5.0 // 5 seconds per full cycle (left->right->left)
      const cycleProgress = (t % cycleDuration) / cycleDuration // 0 to 1
      
      let x: number
      if (cycleProgress < 0.5) {
        // First half: move left to right (0 to 1 over 2.5 seconds)
        const progress = cycleProgress * 2 // 0 to 1
        x = minX + (maxX - minX) * progress
      } else {
        // Second half: move right to left (1 to 0 over 2.5 seconds)
        const progress = (cycleProgress - 0.5) * 2 // 0 to 1
        x = maxX - (maxX - minX) * progress
      }
      
      dotPositionRef.current = { x, y: cy }
      dot.style.left = `${x}px`
      dot.style.top = `${cy}px`
      
      tRef.current += 0.016 // ~60fps
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
      testStartTimeRef.current = performance.now()
      startHorizontalDot()
      
      // Give video a moment to load and get dimensions
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const video = videoRef.current
      if (video) {
        console.log('📹 Video ready:', { 
          readyState: video.readyState, 
          videoWidth: video.videoWidth, 
          videoHeight: video.videoHeight,
          hasStream: !!video.srcObject 
        })
        console.log('📊 Test Setup: 15s duration | 10 Hz detection | 0.15 deviation threshold')
      }
      
      await startOcularRecording()
      
      // Auto-stop test after 15 seconds (3 cycles of 5 seconds each)
      const timeoutId = setTimeout(() => {
        cancelAnimationFrame(rafRef.current)
        setTracking(false)
        stopOcularRecording()
        stopCamera()
      }, 15000)
      
      return () => clearTimeout(timeoutId)
    }
  }

  const displayOcularScore = ocularMetrics
    ? Math.round(Math.max(0, 100 - ocularMetrics.averageDeviation * 600)) // Convert deviation to score
    : null
  const displayOcularPct = displayOcularScore ?? 61

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
          <h2 className="text-2xl font-semibold text-center mb-8">Post-Op Assessment</h2>
          <p className="text-aura-muted text-center max-w-md mx-auto mb-8 leading-relaxed">
            Repeat the same tests to compare against your baseline. Results will be analyzed automatically.
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
              <div ref={wrapRef} className="relative w-full h-52 bg-black/30 rounded-2xl mb-4 overflow-hidden">
                <div
                  ref={dotRef}
                  className="absolute w-4 h-4 rounded-full bg-aura-teal shadow-[0_0_24px_#00d4ff] z-10"
                  style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
                />
                {cameraStatus === 'active' && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute bottom-3 right-3 w-28 h-28 rounded-xl overflow-hidden border-2 border-aura-amber/50 shadow-lg z-20"
                  >
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    <span className="absolute bottom-1 left-1 right-1 text-center text-[10px] font-medium text-white bg-aura-amber/80 rounded py-0.5 flex items-center justify-center gap-1">
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
                    background: `conic-gradient(#ffb800 ${displayOcularPct}%, rgba(255,255,255,0.08) 0)`,
                  }}
                >
                  <div className="w-full h-full rounded-full bg-aura-deep flex items-center justify-center text-sm font-semibold text-aura-amber">
                    {tracking && ocularState === 'recording' && ocularMetrics == null
                      ? '…'
                      : `${displayOcularPct}%`}
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
              {ocularMetrics && (
                <div className="mt-4 p-3 rounded-lg bg-aura-deep/50 border border-aura-teal/30 text-xs space-y-1">
                  <div><span className="text-aura-muted">Avg Deviation:</span> {ocularMetrics.averageDeviation.toFixed(4)}</div>
                  <div><span className="text-aura-muted">Max Deviation:</span> {ocularMetrics.maxDeviation.toFixed(4)}</div>
                  <div><span className="text-aura-muted">Tracking Failures:</span> {ocularMetrics.trackingFailures}</div>
                  <div><span className="text-aura-muted">Duration:</span> {ocularMetrics.totalDuration.toFixed(1)}s</div>
                  <div><span className="text-aura-muted">FPS:</span> {ocularMetrics.framesPerSecond.toFixed(1)}</div>
                  <div><span className="text-aura-muted">Frames:</span> {ocularMetrics.frameCount}</div>
                </div>
              )}
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
                    animate={{
                      scaleY: [0.3, 0.9, 0.2, 0.7, 0.3],
                      scaleX: [1.2, 0.8, 1.1, 0.9, 1.2],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.08, ease: 'easeInOut' }}
                  />
                ))}
              </div>
              <motion.button
                type="button"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl border font-medium text-sm bg-aura-red/20 border-aura-red text-aura-red"
                whileTap={{ scale: 0.98 }}
              >
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'currentColor' }} />
                Recording...
              </motion.button>
            </GlassCard>
          </div>
          <GlassCard className="!border-aura-amber/30 text-center mb-8">
            <div className="text-4xl font-bold text-aura-amber">
              {ocularMetrics ? displayOcularScore : 61}
            </div>
            <div className="text-aura-muted mt-1">/ 100 — {ocularMetrics ? (displayOcularScore! >= 70 ? 'Good tracking' : 'Below baseline') : 'Awaiting test'}</div>
            {ocularMetrics && (
              <div className="text-xs text-aura-muted mt-3 space-y-2">
                <p>Test completed in {ocularMetrics.totalDuration.toFixed(1)} seconds</p>
                <p>Tracked at {ocularMetrics.framesPerSecond.toFixed(1)} FPS ({ocularMetrics.frameCount} frames)</p>
                <p>{ocularMetrics.trackingFailures} tracking failures detected</p>
              </div>
            )}
          </GlassCard>
          <div className="flex justify-center">
            <AuraButton onClick={() => onNavigate('report')}>View Readiness Report</AuraButton>
          </div>
        </motion.div>
      </section>
    </>
  )
}
