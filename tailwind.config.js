/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1e40af',
        accent: '#3b82f6',
        dark: '#0f172a',
        light: '#f8fafc'
      },
      fontFamily: {
        display: ['Orbitron', 'ui-sans-serif', 'system-ui'],
        body: ['Inter', 'ui-sans-serif', 'system-ui']
      },
      boxShadow: {
        glow: '0 0 25px rgba(59, 130, 246, 0.5)',
        'glow-lg': '0 0 40px rgba(59, 130, 246, 0.7)'
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite'
      },
      backgroundImage: {
        'hero-glow': 'radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.22), transparent 45%), radial-gradient(circle at 80% 0%, rgba(14, 165, 233, 0.18), transparent 35%), linear-gradient(140deg, #040b16 0%, #0b1b34 60%, #10223d 100%)'
      }
    }
  },
  plugins: []
}
