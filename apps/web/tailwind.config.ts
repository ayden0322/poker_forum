import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 覆寫 blue 色階 — 以品牌色 #39B8BE 為基準
        blue: {
          50: '#eefbfb',
          100: '#d5f3f5',
          200: '#afe9ec',
          300: '#7ddadf',
          400: '#4ec8cd',
          500: '#39B8BE',
          600: '#2f979c',
          700: '#2b7d81',
          800: '#2a656a',
          900: '#275459',
        },
        primary: {
          50: '#eefbfb',
          100: '#d5f3f5',
          200: '#afe9ec',
          300: '#7ddadf',
          400: '#4ec8cd',
          500: '#39B8BE',
          600: '#2f979c',
          700: '#2b7d81',
          800: '#2a656a',
          900: '#275459',
        },
        accent: {
          50: '#fef3c7',
          100: '#fde68a',
          200: '#fcd34d',
          300: '#fbbf24',
          400: '#f59e0b',
          500: '#d97706',
        },
      },
    },
  },
  plugins: [],
};
export default config;
