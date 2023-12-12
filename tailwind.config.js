/** @type {import('tailwindcss').Config} */
export default {
    content: ['./src/**/*.vue'],
    theme: {
        extend: {}
    },
    plugins: [
        require('@tailwindcss/typography')
    ]
};

