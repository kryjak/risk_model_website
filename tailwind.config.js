/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary Colors
        'safer-blue': '#5B86B5',
        'safer-purple': '#700C8C',
        'safer-charcoal': '#202137',
        'safer-grey': '#F9F8F8',
        // Accent Colors (data visualization)
        'safer-green': '#CADBC0',
        'safer-pink': '#F4DBD8',
        'safer-light-purple': '#E1E2EF',
        'safer-teal': '#5B7B7A',
        'safer-red': '#BC4B51',
      },
      fontFamily: {
        'serif': ['Season Serif', 'Georgia', 'serif'],
        'sans': ['Season Sans', 'system-ui', 'sans-serif'],
        'mono': ['Consolas', 'Monaco', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
}
