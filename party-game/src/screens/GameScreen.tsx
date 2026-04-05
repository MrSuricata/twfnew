import { useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence, PanInfo } from 'framer-motion'
import { ArrowLeft, SkipForward, Home, ChevronRight } from 'lucide-react'
import { GAME_MODES, useGameStore } from '../store'
import { getCardsForMode, fillPlayerNames } from '../data/cards'

export default function GameScreen() {
  const { selectedMode, players, currentCardIndex, nextCard, resetGame, isPremium } = useGameStore()
  const mode = GAME_MODES.find((m) => m.id === selectedMode)

  const cards = useMemo(() => {
    const raw = getCardsForMode(selectedMode || '', isPremium)
    // Shuffle cards
    return [...raw].sort(() => Math.random() - 0.5)
  }, [selectedMode, isPremium])

  const [direction, setDirection] = useState(1)

  const currentCard = cards[currentCardIndex % cards.length]
  const cardText = currentCard ? fillPlayerNames(currentCard.text, players) : ''
  const progress = ((currentCardIndex % cards.length) + 1) / cards.length

  const handleNext = useCallback(() => {
    setDirection(1)
    nextCard()
  }, [nextCard])

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 80) {
      handleNext()
    }
  }

  if (!currentCard) return null

  const getTypeLabel = () => {
    switch (currentCard.type) {
      case 'everyone': return '👥 TODOS'
      case 'player': return '🎯 INDIVIDUAL'
      case 'versus': return '⚔️ VERSUS'
      case 'trivia': return '🧠 TRIVIA'
      case 'challenge': return '💪 RETO'
      default: return ''
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pt-8">
        <button onClick={resetGame} className="w-10 h-10 glass rounded-full flex items-center justify-center">
          <Home size={18} />
        </button>
        <div className="text-center">
          <p className="font-display font-bold text-sm text-white/60">
            {mode?.emoji} {mode?.name}
          </p>
          <p className="text-xs text-white/30">
            Carta {(currentCardIndex % cards.length) + 1} de {cards.length}
          </p>
        </div>
        <button onClick={handleNext} className="w-10 h-10 glass rounded-full flex items-center justify-center">
          <SkipForward size={18} />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="px-4 mb-4">
        <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full gradient-pink rounded-full"
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center px-4 py-2">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentCardIndex}
            custom={direction}
            initial={{ x: 300 * direction, opacity: 0, rotateZ: 5 * direction }}
            animate={{ x: 0, opacity: 1, rotateZ: 0 }}
            exit={{ x: -300 * direction, opacity: 0, rotateZ: -5 * direction }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.3}
            onDragEnd={handleDragEnd}
            className={`w-full max-w-sm ${mode?.gradient || 'gradient-pink'} rounded-3xl p-8 min-h-[350px] flex flex-col items-center justify-center text-center shadow-2xl cursor-grab active:cursor-grabbing`}
          >
            {/* Card Type Badge */}
            <div className="bg-black/20 rounded-full px-4 py-1 mb-6">
              <span className="text-sm font-semibold text-white/90">
                {getTypeLabel()}
              </span>
            </div>

            {/* Card Text */}
            <p className="font-display font-bold text-xl leading-relaxed text-white">
              {cardText}
            </p>

            {currentCard.spicy && (
              <div className="mt-6 bg-black/20 rounded-full px-3 py-1">
                <span className="text-xs">🌶️ PICANTE</span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Next Button */}
      <div className="p-4 pb-8">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleNext}
          className="w-full py-4 glass rounded-2xl font-display font-bold text-lg flex items-center justify-center gap-2"
        >
          Siguiente <ChevronRight size={20} />
        </motion.button>
      </div>
    </div>
  )
}
