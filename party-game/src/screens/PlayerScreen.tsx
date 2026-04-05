import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Plus, X, Play, Users } from 'lucide-react'
import { GAME_MODES, useGameStore } from '../store'

const AVATARS = ['😎', '🤪', '🥳', '😈', '🤠', '👻', '🦄', '🐸', '🍕', '💀', '🔥', '❤️', '🎯', '🌟', '🎪', '🎭', '🦊', '🐼', '🌶️', '🍻']

export default function PlayerScreen() {
  const { players, addPlayer, removePlayer, selectedMode, setScreen, startGame } = useGameStore()
  const [name, setName] = useState('')
  const mode = GAME_MODES.find((m) => m.id === selectedMode)

  const handleAdd = () => {
    const trimmed = name.trim()
    if (trimmed && !players.includes(trimmed) && players.length < 20) {
      addPlayer(trimmed)
      setName('')
    }
  }

  const canStart = players.length >= (mode?.minPlayers || 2)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 pt-8">
        <button
          onClick={() => setScreen('home')}
          className="w-10 h-10 glass rounded-full flex items-center justify-center"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h2 className="font-display font-bold text-xl">
            {mode?.emoji} {mode?.name}
          </h2>
          <p className="text-white/50 text-sm">{mode?.description}</p>
        </div>
      </div>

      {/* Add Player Input */}
      <div className="px-4 py-3">
        <div className="glass rounded-2xl flex items-center overflow-hidden">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Nombre del jugador..."
            maxLength={15}
            className="flex-1 bg-transparent px-4 py-3 text-white placeholder-white/30 outline-none font-body"
          />
          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            className="bg-neon-pink/80 hover:bg-neon-pink w-12 h-12 flex items-center justify-center disabled:opacity-30 transition-colors"
          >
            <Plus size={22} />
          </button>
        </div>
        <p className="text-white/30 text-xs mt-2 px-1">
          <Users size={12} className="inline mr-1" />
          {players.length}/20 jugadores · Mínimo {mode?.minPlayers || 2}
        </p>
      </div>

      {/* Player List */}
      <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-4">
        <AnimatePresence>
          {players.map((player, i) => (
            <motion.div
              key={player}
              initial={{ x: -30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 30, opacity: 0 }}
              className="glass rounded-xl px-4 py-3 flex items-center gap-3"
            >
              <span className="text-2xl">{AVATARS[i % AVATARS.length]}</span>
              <span className="flex-1 font-medium">{player}</span>
              <button
                onClick={() => removePlayer(player)}
                className="text-white/30 hover:text-neon-pink transition-colors"
              >
                <X size={18} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {players.length === 0 && (
          <div className="text-center py-12 text-white/20">
            <Users size={48} className="mx-auto mb-3" />
            <p>Agregá jugadores para empezar</p>
          </div>
        )}
      </div>

      {/* Start Button */}
      <div className="p-4 pb-8">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={startGame}
          disabled={!canStart}
          className={`w-full py-4 rounded-2xl font-display font-bold text-lg flex items-center justify-center gap-2 transition-all ${
            canStart
              ? 'gradient-pink pulse-glow'
              : 'bg-dark-700 text-white/30'
          }`}
        >
          <Play size={22} />
          {canStart ? '¡A JUGAR!' : `Faltan ${(mode?.minPlayers || 2) - players.length} jugadores`}
        </motion.button>
      </div>
    </div>
  )
}
