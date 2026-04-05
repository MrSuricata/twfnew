import { create } from 'zustand'

export type GameMode = 'no-te-rias' | 'yo-nunca' | 'quien-es-mas' | 'verdad-o-shot' | 'retos-virales' | 'pickleball'

export type Screen = 'home' | 'players' | 'game' | 'premium' | 'settings'

export interface GameModeInfo {
  id: GameMode
  name: string
  subtitle: string
  emoji: string
  gradient: string
  description: string
  premium: boolean
  minPlayers: number
}

export const GAME_MODES: GameModeInfo[] = [
  {
    id: 'no-te-rias',
    name: 'No Te Rías',
    subtitle: 'El que se ríe, bebe',
    emoji: '😂',
    gradient: 'gradient-pink',
    description: 'Se leen chistes malísimos en voz alta. Si alguien se ríe... ¡bebe!',
    premium: false,
    minPlayers: 2,
  },
  {
    id: 'yo-nunca',
    name: 'Yo Nunca',
    subtitle: 'Never Have I Ever',
    emoji: '🙈',
    gradient: 'gradient-blue',
    description: 'Se lee una frase. Los que SÍ lo hayan hecho... ¡beben!',
    premium: false,
    minPlayers: 2,
  },
  {
    id: 'quien-es-mas',
    name: '¿Quién Es Más...?',
    subtitle: 'El grupo decide',
    emoji: '👉',
    gradient: 'gradient-green',
    description: 'El grupo señala a quien más encaje con la pregunta. El más votado bebe.',
    premium: true,
    minPlayers: 3,
  },
  {
    id: 'verdad-o-shot',
    name: 'Verdad o Shot',
    subtitle: 'Confiesa o bebe',
    emoji: '🥃',
    gradient: 'gradient-orange',
    description: 'Responde con la verdad o bebe un shot. Tú decides.',
    premium: true,
    minPlayers: 2,
  },
  {
    id: 'retos-virales',
    name: 'Retos Virales',
    subtitle: 'Atrévete o bebe',
    emoji: '🔥',
    gradient: 'gradient-purple',
    description: 'Retos locos de TikTok y redes. Si no te atreves... ¡bebe!',
    premium: true,
    minPlayers: 2,
  },
  {
    id: 'pickleball',
    name: 'Modo Pickleball',
    subtitle: '¿Sabés de Pickle?',
    emoji: '🏓',
    gradient: 'gradient-green',
    description: 'Preguntas, retos y trivias de Pickleball. El que no sabe... ¡bebe!',
    premium: false,
    minPlayers: 2,
  },
]

interface GameState {
  screen: Screen
  selectedMode: GameMode | null
  players: string[]
  currentCardIndex: number
  isPremium: boolean
  roundNumber: number

  setScreen: (screen: Screen) => void
  selectMode: (mode: GameMode) => void
  addPlayer: (name: string) => void
  removePlayer: (name: string) => void
  setPlayers: (players: string[]) => void
  nextCard: () => void
  resetGame: () => void
  setPremium: (val: boolean) => void
  startGame: () => void
}

export const useGameStore = create<GameState>((set) => ({
  screen: 'home',
  selectedMode: null,
  players: [],
  currentCardIndex: 0,
  isPremium: false,
  roundNumber: 1,

  setScreen: (screen) => set({ screen }),
  selectMode: (mode) => set({ selectedMode: mode, screen: 'players' }),
  addPlayer: (name) =>
    set((s) => ({
      players: s.players.length < 20 ? [...s.players, name] : s.players,
    })),
  removePlayer: (name) =>
    set((s) => ({ players: s.players.filter((p) => p !== name) })),
  setPlayers: (players) => set({ players }),
  nextCard: () =>
    set((s) => ({ currentCardIndex: s.currentCardIndex + 1 })),
  resetGame: () =>
    set({ currentCardIndex: 0, roundNumber: 1, screen: 'home', selectedMode: null }),
  setPremium: (val) => set({ isPremium: val }),
  startGame: () => set({ currentCardIndex: 0, screen: 'game' }),
}))
