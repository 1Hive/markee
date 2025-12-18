import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        
        // Core Backgrounds - Deep Space
        'midnight-navy': '#060A2A',
        'deep-space': '#0A0F3D',
        'cosmic-indigo': '#0F1B6B',
        
        // Primary Gradients - Space Glow
        'electric-blue': '#172090',
        'royal-blue': '#30342C',
        'nebula-violet': '#4B3ACC',
        'galactic-purple': '#6A4AE3',
        
        // Accent & UI Highlights
        'soft-pink': '#F897FE',
        'lavender-accent': '#935AF0',
        'periwinkle-blue': '#483ACC',
        'cool-sky-blue': '#7C9CFF',
        
        // Planet / Decorative Accents
        'peach-orb': '#FF8E8E',
        'coral-blush': '#FF7A90',
        'icy-blue': '#8BC8FF',
        'amethyst': '#7B6AF4',
        
        // Text & Subtle UI
        'soft-white': '#EDEEFF',
        'lavender-gray': '#B8B6D9',
        'cool-slate': '#8A8FBF',
        
        // Legacy markee colors (backwards compatibility)
        markee: {
          DEFAULT: '#F897FE',
          50: '#fef5ff',
          100: '#fce8ff',
          200: '#f9d5ff',
          300: '#F897FE',
          400: '#e975f7',
          500: '#d950ed',
          600: '#c130d4',
          700: '#a020ad',
          800: '#82208c',
          900: '#6b1d71',
        },
      },
      fontFamily: {
        'general-sans': ['General Sans', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'space-gradient': 'linear-gradient(135deg, #0A0F3D, #172090, #4B3ACC)',
        'nebula-gradient': 'linear-gradient(135deg, #4B3ACC, #6A4AE3, #F897FE)',
      },
    },
  },
  plugins: [],
};

export default config;
