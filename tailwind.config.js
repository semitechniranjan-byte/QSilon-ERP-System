/** @type {import('tailwindcss').Config} */
export default {
  content: ['./client/index.html', './client/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Noto Sans"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { 50: '#eef5fb', 100: '#d5e6f4', 200: '#abcde9', 300: '#77acd9', 400: '#4a8bc6', 500: '#2d6fae', 600: '#22588f', 700: '#1d4774', 800: '#1b3c60', 900: '#172f4b' },
        accent: { 400: '#f2b84b', 500: '#e5a027', 600: '#c7831a' },
      },
    },
  },
  plugins: [],
};
