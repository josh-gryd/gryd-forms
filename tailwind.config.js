/** @type {import('tailwindcss').Config} */
// Only Tailwind's base reset is used (globals.css); styles are CSS variables and inline.
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: { extend: { fontFamily: { sans: ['system-ui', 'sans-serif'], mono: ['ui-monospace', 'monospace'] } } },
  plugins: [],
}
