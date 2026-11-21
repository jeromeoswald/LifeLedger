/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  // 'class' (not 'media'): NativeWind's web dev runtime throws in media mode. The root layout
  // mirrors the system scheme onto the html class on web; native follows the system itself.
  darkMode: 'class',
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#0F766E', light: '#14B8A6', dark: '#115E59' },
      },
    },
  },
  plugins: [],
};
