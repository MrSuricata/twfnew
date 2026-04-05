import { motion } from 'framer-motion'
import { ArrowLeft, Crown, Check, Sparkles, Zap, Palette, Ban } from 'lucide-react'
import { useGameStore } from '../store'

const FEATURES = [
  { icon: Zap, text: 'Todos los modos de juego desbloqueados' },
  { icon: Sparkles, text: '+1000 cartas y preguntas' },
  { icon: Palette, text: 'Cartas 🌶️ PICANTES exclusivas' },
  { icon: Ban, text: 'Sin anuncios, para siempre' },
  { icon: Crown, text: 'Packs nuevos cada semana' },
]

export default function PremiumScreen() {
  const { setScreen, setPremium } = useGameStore()

  const handleSubscribe = (plan: 'monthly' | 'yearly') => {
    // TODO: Integrate with RevenueCat / Stripe
    // For now, just unlock premium for demo
    setPremium(true)
    setScreen('home')
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pt-8">
        <button
          onClick={() => setScreen('home')}
          className="w-10 h-10 glass rounded-full flex items-center justify-center"
        >
          <ArrowLeft size={20} />
        </button>
      </div>

      {/* Hero */}
      <div className="text-center px-6 py-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.1 }}
          className="w-20 h-20 gradient-pink rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <Crown size={40} className="text-white" />
        </motion.div>
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="font-display text-3xl font-bold text-gradient mb-2"
        >
          FIESTA FATAL PRO
        </motion.h1>
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-white/50"
        >
          Llevá la fiesta al siguiente nivel
        </motion.p>
      </div>

      {/* Features */}
      <div className="px-6 space-y-3 py-4">
        {FEATURES.map((feat, i) => (
          <motion.div
            key={i}
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.3 + i * 0.1 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-neon-pink/20 rounded-xl flex items-center justify-center">
              <feat.icon size={20} className="text-neon-pink" />
            </div>
            <span className="text-white/80">{feat.text}</span>
          </motion.div>
        ))}
      </div>

      {/* Pricing */}
      <div className="px-6 py-6 space-y-3 mt-auto">
        {/* Yearly - Best Value */}
        <motion.button
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => handleSubscribe('yearly')}
          className="w-full gradient-pink rounded-2xl p-4 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 bg-neon-yellow text-black text-xs font-bold px-3 py-1 rounded-bl-xl">
            AHORRÁ 58%
          </div>
          <div className="text-left">
            <p className="font-display font-bold text-lg">Plan Anual</p>
            <p className="text-white/80 text-sm">$19.99 USD / año</p>
            <p className="text-white/60 text-xs mt-1">Solo $1.66/mes · 7 días gratis</p>
          </div>
        </motion.button>

        {/* Monthly */}
        <motion.button
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.8 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => handleSubscribe('monthly')}
          className="w-full glass rounded-2xl p-4"
        >
          <div className="text-left">
            <p className="font-display font-bold text-lg">Plan Mensual</p>
            <p className="text-white/60 text-sm">$2.99 USD / mes</p>
          </div>
        </motion.button>

        {/* Restore */}
        <button className="w-full text-center text-white/30 text-sm py-2">
          Restaurar compra
        </button>
      </div>

      <p className="text-center text-white/20 text-xs px-6 pb-6">
        La suscripción se renueva automáticamente. Podés cancelar en cualquier momento.
        Al suscribirte aceptás los Términos de Servicio.
      </p>
    </div>
  )
}
