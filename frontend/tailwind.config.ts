import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        // Markee brand colors
        markee: {
          DEFAULT: '#20bf6b',
          50: '#f0fdf7',
          100: '#dcfce9',
          200: '#bbf7d3',
          300: '#86efad',
          400: '#4ade80',
          500: '#20bf6b',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
      },
    },
  },
  plugins: [],
}
export default config
