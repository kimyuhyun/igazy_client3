// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

export default defineConfig({
    base: process.env.NODE_ENV === 'production' ? '/igazy_client3/' : '/',
    plugins: [react()],
    build: {
        outDir: "./docs",
    },
    css: {
        postcss: {
            plugins: [tailwindcss(), autoprefixer()],
        },
    },
});
