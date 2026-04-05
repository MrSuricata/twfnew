import { AnimatePresence, motion } from 'framer-motion'
import { useGameStore } from './store'
import HomeScreen from './screens/HomeScreen'
import PlayerScreen from './screens/PlayerScreen'
import GameScreen from './screens/GameScreen'
import PremiumScreen from './screens/PremiumScreen'

const screenVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
}

export default function App() {
  const { screen } = useGameStore()

  const renderScreen = () => {
    switch (screen) {
      case 'home':
        return <HomeScreen key="home" />
      case 'players':
        return <PlayerScreen key="players" />
      case 'game':
        return <GameScreen key="game" />
      case 'premium':
        return <PremiumScreen key="premium" />
      default:
        return <HomeScreen key="home" />
    }
  }

  return (
    <div className="h-full max-w-md mx-auto bg-dark-900 relative overflow-hidden">
      {/* Background Decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-neon-pink/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-neon-blue/5 rounded-full blur-3xl" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          variants={screenVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.2 }}
          className="h-full relative z-10"
        >
          {renderScreen()}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
