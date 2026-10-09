/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'nba-orange': '#F97316',
        'nba-dark': '#0A0A0A',
        'nba-gray': '#1A1A2E',
        'nba-blue': '#16213E',
      },
    },
  },
  plugins: [],
}
