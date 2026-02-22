import { motion } from 'framer-motion'
import { Activity } from 'lucide-react'
import { AuraButton } from '../components/AuraButton'
import { AnimatedBackground } from '../components/AnimatedBackground'

interface LandingProps {
  onNavigate: (screen: string, flow?: 'preop' | 'postop') => void
}

export function Landing({ onNavigate }: LandingProps) {
  return (
    <>
      <AnimatedBackground />
      <motion.section
        className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-6 py-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        <motion.div
          className="w-24 h-24 mb-6"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        >
          <Activity className="w-full h-full text-aura-teal drop-shadow-[0_0_30px_rgba(0,212,255,0.5)]" strokeWidth={1.5} />
        </motion.div>
        <motion.h1
          className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-white to-aura-teal bg-clip-text text-transparent mb-2"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          AURA
        </motion.h1>
        <motion.h1
          className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-white to-aura-teal bg-clip-text text-transparent mb-2"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Automated Undereye Recovery Assessment
        </motion.h1>
        <motion.p
          className="text-xl text-aura-muted mb-10"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          Not just awake. Certified ready.
        </motion.p>
        <motion.div
          className="w-full max-w-md h-1 bg-gradient-to-r from-transparent via-aura-teal to-aura-violet rounded-full mb-10 overflow-hidden"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          style={{ originX: 0 }}
        >
          <motion.div
            className="h-full w-3/5 bg-white/30 rounded-full"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <AuraButton onClick={() => onNavigate('intake', 'preop')}>Begin Pre-Op Baseline</AuraButton>
          <AuraButton primary={false} onClick={() => onNavigate('intake', 'postop')}>
            Begin Post-Op Assessment
          </AuraButton>
        </motion.div>
      </motion.section>
    </>
  )
}
