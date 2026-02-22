import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { GlassCard } from '../components/GlassCard'
import { AuraButton } from '../components/AuraButton'
import { ProgressSteps } from '../components/ProgressSteps'
import { AnimatedBackground } from '../components/AnimatedBackground'

interface IntakeProps {
  onNavigate: (screen: string) => void
  onFlow?: (flow: 'preop' | 'postop') => void
  initialFlow?: 'preop' | 'postop'
}

export function Intake({ onNavigate, onFlow, initialFlow }: IntakeProps) {
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [procedure, setProcedure] = useState('')
  const [date, setDate] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onFlow?.(initialFlow || 'preop')
    onNavigate('ocular')
  }

  return (
    <>
      <AnimatedBackground />
      <section className="relative z-10 min-h-screen p-6">
        <motion.a
          href="#"
          onClick={(e) => { e.preventDefault(); onNavigate('landing') }}
          className="inline-flex items-center gap-2 text-aura-muted text-sm mb-6 hover:text-aura-teal transition-colors"
          whileHover={{ x: -2 }}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </motion.a>
        <ProgressSteps active={0} steps={4} />
        <motion.div
          className="max-w-lg mx-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <GlassCard>
            <h2 className="text-xl font-semibold mb-6">Patient Intake</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-aura-muted mb-1.5">Patient name</label>
                <input
                  type="text"
                  placeholder="e.g. Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3.5 bg-black/25 border border-aura-border rounded-2xl text-white placeholder-aura-muted focus:border-aura-teal focus:ring-2 focus:ring-aura-teal/20 outline-none transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-aura-muted mb-1.5">Patient ID</label>
                <input
                  type="text"
                  placeholder="e.g. MRN-88492"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  className="w-full px-4 py-3.5 bg-black/25 border border-aura-border rounded-2xl text-white placeholder-aura-muted focus:border-aura-teal focus:ring-2 focus:ring-aura-teal/20 outline-none transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-aura-muted mb-1.5">Procedure type</label>
                <input
                  value={procedure}
                  placeholder="e.g. General anesthesia — Laparoscopic"
                  onChange={(e) => setProcedure(e.target.value)}
                  className="w-full px-4 py-3.5 bg-black/25 border border-aura-border rounded-2xl text-white focus:border-aura-teal focus:ring-2 focus:ring-aura-teal/20 outline-none transition-all"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-aura-muted mb-1.5">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-3.5 bg-black/25 border border-aura-border rounded-2xl text-white focus:border-aura-teal focus:ring-2 focus:ring-aura-teal/20 outline-none transition-all"
                  required
                />
              </div>
              <AuraButton type="submit" className="w-full mt-2">Continue to Assessment</AuraButton>
            </form>
          </GlassCard>
        </motion.div>
      </section>
    </>
  )
}
