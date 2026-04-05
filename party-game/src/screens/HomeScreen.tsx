import { motion } from 'framer-motion'
import { Crown, Sparkles } from 'lucide-react'
import { GAME_MODES, useGameStore } from '../store'

export default function HomeScreen() {
  const { selectMode, setScreen, isPremium } = useGameStore()

  return (
    <div className="h-full flex flex-col overflow-y-auto pb-8">
      {/* Header */}
      <div className="text-center pt-12 pb-6 px-4">
        <motion.h1
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-5xl font-display font-bold text-gradient mb-2"
        >
          FIESTA FATAL
        </motion.h1>
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="text-white/60 text-lg"
        >
          El juego de fiesta definitivo
        </motion.p>
      </div>

      {/* Game Modes Grid */}
      <div className="flex-1 px-4 space-y-3">
        {GAME_MODES.map((mode, i) => (
          <motion.button
            key={mode.id}
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 * i }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (mode.premium && !isPremium) {
                setScreen('premium')
              } else {
                selectMode(mode.id)
              }
            }}
            className={`w-full ${mode.gradient} rounded-2xl p-4 flex items-center gap-4 relative overflow-hidden`}
          >
            <span className="text-4xl">{mode.emoji}</span>
            <div className="text-left flex-1">
              <h3 className="font-display font-bold text-lg text-white">
                {mode.name}
              </h3>
              <p className="text-white/80 text-sm">{mode.subtitle}</p>
            </div>
            {mode.premium && !isPremium && (
              <div className="bg-black/30 rounded-full px-3 py-1 flex items-center gap-1">
                <Crown size={14} className="text-neon-yellow" />
                <span className="text-xs text-neon-yellow font-semibold">PRO</span>
              </div>
            )}
          </motion.button>
        ))}
      </div>

      {/* Premium Banner */}
      {!isPremium && (
        <motion.button
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.8 }}
          onClick={() => setScreen('premium')}
          className="mx-4 mt-4 glass rounded-2xl p-4 flex items-center gap-3 pulse-glow"
        >
          <Sparkles className="text-neon-yellow" size={24} />
          <div className="text-left flex-1">
            <p className="font-display font-bold text-white">
              Desbloquea TODO
            </p>
            <p className="text-white/60 text-sm">
              +1000 cartas, todos los modos, sin anuncios
            </p>
          </div>
          <div className="bg-neon-pink rounded-full px-4 py-2">
            <span className="font-bold text-sm">$2.99/mes</span>
          </div>
        </motion.button>
      )}
    </div>
  )
}
