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
        // New dark mode theme colors
        'dark-bg': '#020106',
        'dark-bg-secondary': '#0f1115',
        'accent-orange': '#a93400',
        'accent-yellow': '#f2ff26',
        'accent-green': '#94ff94',
        'accent-blue': '#0d75ff',
        'text-primary': '#ffffff',
        'text-secondary': '#888888',
        // Legacy markee colors (can be phased out)
        markee: {
          DEFAULT: '#94ff94',
          50: '#f0fff0',
          100: '#e0ffe0',
          200: '#c1ffc1',
          300: '#94ff94',
          400: '#7aff7a',
          500: '#5fff5f',
          600: '#45e045',
          700: '#2eb82e',
          800: '#1f8f1f',
          900: '#146614',
        },
      },
      fontFamily: {
        barlow: ['Barlow', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
