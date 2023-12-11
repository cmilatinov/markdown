import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';

// https://vitejs.dev/config/
export default defineConfig({
    build: {
        lib: {
            entry: 'src/index.ts',
            fileName: () => 'index.js',
            formats: ['es'],
        },
        sourcemap: true,
        target: 'esnext',
        minify: false
    },
    plugins: [
        vue(),
        dts({ rollupTypes: true })
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        }
    }
});
