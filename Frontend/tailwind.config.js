/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // The Deep Pacific Palette
        ocean: {
          primary: '#0f4c75',       // Deep Navy (For Headers, Admin, Seller)
          'primary-hover': '#0a3655', 
          
          secondary: '#3282b8',     // Reef Blue (For Buyer actions, Cart)
          'secondary-hover': '#276692',
          
          teal: '#14b8a6',          // Vibrant Teal (For Login, Success)
          'teal-dark': '#0d9488',
          
          accent: '#bbe1fa',        // Foam (Highlights, borders, light text)
          
          light: '#f0f8ff',         // Mist (App Background - AliceBlue)
          surface: '#ffffff',       // Card Backgrounds
          
          text: '#1b262c',          // Deep Dark Blue (Main Text)
          'text-muted': '#576b7e',  // Muted text
          'text-light': '#8fa6bd',  // Lighter text (on dark backgrounds)
          
          coral: '#ff7b54',         // Warning/Wishlist/Logout (Complementary contrast)
          'coral-hover': '#e0603a'
        }
      }
    },
  },
  plugins: [],
}