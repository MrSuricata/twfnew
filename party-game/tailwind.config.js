/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      colors: {
        dark: {
          900: '#0f0f23',
          800: '#1a1a2e',
          700: '#25253e',
          600: '#33335a',
        },
        neon: {
          pink: '#ff2d75',
          purple: '#b829dd',
          blue: '#00d4ff',
          green: '#00ff88',
          yellow: '#ffe156',
          orange: '#ff6b35',
        },
      },
    },
  },
  plugins: [],
}
