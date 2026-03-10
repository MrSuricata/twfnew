import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Lightbulb } from '@phosphor-icons/react'
import { motion, AnimatePresence } from 'framer-motion'

import { Language, translations } from '@/lib/i18n'

interface LogisticsFactsProps {
  language?: Language
}

export default function LogisticsFacts({ language = 'es' }: LogisticsFactsProps) {
  const currentLang = language
  const [currentFactIndex, setCurrentFactIndex] = useState(0)
  const t = translations[currentLang].facts

  const facts = [
    t.fact1,
    t.fact2,
    t.fact3,
    t.fact4,
    t.fact5
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFactIndex((prev) => (prev + 1) % facts.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [facts.length])

  return (
    <div className="w-full max-w-4xl mx-auto my-8 px-4">
      <div className="relative overflow-hidden rounded-2xl bg-white/40 dark:bg-slate-900/40 backdrop-blur-md border border-white/20 dark:border-slate-700/30 shadow-lg">
        <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
          <Lightbulb size={120} weight="duotone" className="text-amber-500/50" />
        </div>
        
        <div className="flex flex-col md:flex-row items-center gap-6 p-8">
          <div className="shrink-0">
            <div className="p-4 bg-amber-500/10 rounded-full shadow-inner ring-1 ring-amber-500/20">
              <Lightbulb size={32} weight="fill" className="text-amber-500" />
            </div>
          </div>
          
          <div className="flex-1 w-full text-center md:text-left">
            <h4 className="font-bold text-xs text-amber-600 dark:text-amber-400 mb-2 uppercase tracking-widest opacity-80">
              {t.title}
            </h4>
            <div className="relative h-24 md:h-16 flex items-center justify-center md:justify-start">
              <AnimatePresence mode="wait">
                <motion.p
                  key={currentFactIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="absolute w-full text-lg md:text-xl font-medium text-slate-800 dark:text-slate-100 leading-snug"
                >
                  {facts[currentFactIndex]}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            {facts.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentFactIndex(idx)}
                className={`h-2 rounded-full transition-all duration-500 ${
                  idx === currentFactIndex 
                    ? 'w-8 bg-amber-500' 
                    : 'w-2 bg-slate-400/30 hover:bg-slate-400/50'
                }`}
                aria-label={`Go to fact ${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}