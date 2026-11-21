/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        nukkad: {
          50: '#F2F7F4',
          100: '#E1EFE7',
          200: '#C2DFCE',
          300: '#95C5AB',
          400: '#64A583',
          500: '#3D8561',
          600: '#2D6A4F',
          700: '#1B4332',
          800: '#163E2B',
          900: '#0F2E1F',
          950: '#071810',
        },
        chalk: '#FBFBF9',
        cream: '#F5F5F0',
        paper: '#FDFDFB'
      },
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'serif'],
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      }
    },
  },
  plugins: [],
}
