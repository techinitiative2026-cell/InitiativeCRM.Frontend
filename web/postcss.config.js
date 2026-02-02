/** @type {import('postcss').ProcessOptions} */
export default {
  plugins: {
    "@tailwindcss/postcss": {}, // this is now required in v4+
    autoprefixer: {},
  },
};
