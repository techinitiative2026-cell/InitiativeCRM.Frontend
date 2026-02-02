/** @type {import('tailwindcss').Config} */
import tailwindcssForms from '@tailwindcss/forms'; // example plugin
import tailwindcss from '@tailwindcss/vite';

export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx,js,jsx}", // look for Tailwind classes in all TSX/JSX files
  ],
  theme: {
    extend: {},
  },
  plugins: [
    tailwindcssForms, // add the plugin here
  ],
};
