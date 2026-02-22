import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Clock } from 'lucide-react'
import { AuraButton } from '../components/AuraButton'
import { AnimatedBackground } from '../components/AnimatedBackground'

const PATIENTS = [
  { name: 'Jane Doe', procedure: 'Laparoscopic cholecystectomy', time: '2h 14m', score: 92, status: 'cleared' as const },
  { name: 'Marcus Webb', procedure: 'Knee arthroscopy', time: '1h 48m', score: 88, status: 'cleared' as const },
  { name: 'Elena Vasquez', procedure: 'General — Appendectomy', time: '45m', score: 67, status: 'borderline' as const },
  { name: 'James Liu', procedure: 'Spinal fusion', time: '1h 02m', score: 54, status: 'flagged' as const },
  { name: 'Sarah Kim', procedure: 'Cataract repair', time: '—', score: null, status: 'pending' as const },
  { name: 'David Brown', procedure: 'Hernia repair', time: '—', score: null, status: 'pending' as const },
]

function useLiveClock() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString('en-GB', { hour12: false }))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])
  return time
}

interface DashboardProps {
  onNavigate: (screen: string) => void
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const clock = useLiveClock()

  return (
    <>
      <AnimatedBackground />
      <section className="relative z-10 min-h-screen p-6">
        <motion.div
          className="flex flex-wrap items-center justify-between gap-4 mb-8 pb-4 border-b border-aura-border"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div>
            <div className="text-lg font-semibold text-white">Northgate General — PACU</div>
            <div className="text-sm text-aura-teal">Ward 4 · Recovery</div>
          </div>
          <div className="flex items-center gap-2 text-xl font-semibold tracking-wide">
            <Clock className="w-5 h-5 text-aura-teal" />
            {clock}
          </div>
        </motion.div>
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.06 } },
            hidden: {},
          }}
        >
          {PATIENTS.map((p) => (
            <motion.div
              key={p.name}
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0 },
              }}
              className={`
                bg-aura-glass backdrop-blur-glass border rounded-2xl p-6 transition-all hover:shadow-glow
                ${p.status === 'cleared' ? 'border-l-4 border-l-aura-green' : ''}
                ${p.status === 'borderline' ? 'border-l-4 border-l-aura-amber' : ''}
                ${p.status === 'flagged' ? 'border-l-4 border-l-aura-red' : ''}
                ${p.status === 'pending' ? 'border-l-4 border-l-aura-muted opacity-90' : ''}
              `}
              whileHover={{ y: -2 }}
            >
              <div className="font-semibold text-base mb-1">{p.name}</div>
              <div className="text-xs text-aura-muted mb-3">{p.procedure} · {p.time} since surgery</div>
              <div className="flex items-center justify-between">
                <span
                  className={`text-2xl font-bold ${
                    p.score != null
                      ? p.score >= 80
                        ? 'text-aura-green'
                        : p.score >= 60
                          ? 'text-aura-amber'
                          : 'text-aura-red'
                      : 'text-aura-muted'
                  }`}
                >
                  {p.score != null ? p.score : '—'}
                </span>
                <span
                  className={`
                    text-[11px] uppercase tracking-wider font-semibold px-2 py-1 rounded-md
                    ${p.status === 'cleared' ? 'bg-aura-green/20 text-aura-green' : ''}
                    ${p.status === 'borderline' ? 'bg-aura-amber/20 text-aura-amber' : ''}
                    ${p.status === 'flagged' ? 'bg-aura-red/20 text-aura-red' : ''}
                    ${p.status === 'pending' ? 'bg-white/10 text-aura-muted' : ''}
                  `}
                >
                  {p.status === 'cleared' ? 'Cleared' : p.status === 'borderline' ? 'Monitor' : p.status === 'flagged' ? 'Hold' : 'Awaiting'}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>
        <motion.div className="mt-8 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <AuraButton primary={false} onClick={() => onNavigate('landing')}>
            Exit to AURA Home
          </AuraButton>
        </motion.div>
      </section>
    </>
  )
}
