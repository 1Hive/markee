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
        // Dark mode backgrounds
        'dark-bg': '#020106',
        'dark-bg-secondary': '#0f1115',
        // VS Code theme colors
        'accent-purple': '#C678DD',
        'accent-blue': '#61AFEF',
        'accent-red': '#E06C75',
        'accent-peach': '#E5C07B',
        'accent-cyan': '#56B6C2',
        // Text colors
        'text-primary': '#ABB2BF',
        'text-secondary': '#888888',
        'text-white': '#ffffff',
        // Legacy markee colors (for backward compatibility)
        markee: {
          DEFAULT: '#C678DD',
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#C678DD',
          400: '#a855f7',
          500: '#9333ea',
          600: '#7e22ce',
          700: '#6b21a8',
          800: '#581c87',
          900: '#3b0764',
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
