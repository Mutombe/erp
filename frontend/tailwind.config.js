/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Oceanwaves Schools crest: navy shield (#2D3091), ocean wave (#24A9E2),
        // red lettering (#EC1D25). Primary is the shield navy at 600 — the shade
        // buttons and links use.
        primary: {
          50: '#eef0fb',
          100: '#dfe2f7',
          200: '#c1c6f0',
          300: '#9aa2e4',
          400: '#737dd4',
          500: '#4b56b8',
          600: '#2d3091',
          700: '#262878',
          800: '#1e2060',
          900: '#181a4d',
          950: '#0f1033',
        },
        // The wave — accent for highlights, charts and the second brand tone.
        ocean: {
          50: '#eef9fe',
          100: '#d9f1fc',
          200: '#b6e6fa',
          300: '#83d5f5',
          400: '#47bfee',
          500: '#24a9e2',
          600: '#1487bd',
          700: '#136c99',
          800: '#155b7e',
          900: '#164c69',
          950: '#0e3046',
        },
        // Crest red. Reserved for brand marks — status/error red stays semantic.
        crest: {
          DEFAULT: '#ec1d25',
          dark: '#c4151c',
        },
        secondary: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
        // Accent layer: an electric "ion" cyan spark + a deeper azure blue.
        ion: {
          DEFAULT: '#5ee7ff',
          soft: '#7df9ff',
          deep: '#22b8d6',
        },
        // (kept the `plasma` name for the gradient's deep stop; now an azure blue, no violet)
        plasma: '#2b8fff',
        // Premium dark bands — tuned to the platform's own navy/slate scale
        // (not neutral black) so they read as THIS brand, not a foreign band.
        void: '#020617',     // slate-950 — deepest section background
        carbon: '#0f172a',   // slate-900 — standard card surface
        graphite: '#1e293b', // slate-800 — featured / form surface (raised)
        ash: '#334155',      // slate-700
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'shimmer': 'shimmer 2s infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
