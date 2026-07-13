import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * electron-vite build configuration.
 * - `better-sqlite3` is a native module and must stay external (externalizeDepsPlugin).
 * - Main and preload are bundled to CommonJS in `out/`, the renderer to `out/renderer`.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.js') },
        // Forceer CommonJS met .cjs-extensie. Het project is "type": "module",
        // dus een .js-main zou als ESM geladen worden — en Electron kan ESM NIET
        // uit een asar-archief laden (de verpakte .exe toont dan geen venster).
        // .cjs laadt betrouwbaar uit asar, ongeacht het package-type.
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.js') },
        // Forceer CommonJS met .cjs-extensie. Het project is "type": "module",
        // dus een .js-preload zou door Electron als ESM geladen worden en de
        // require()-aanroepen zouden falen (preload crasht → window.api undefined).
        // De .cjs-extensie dwingt de CommonJS-loader af, ongeacht het package-type.
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    }
  }
})
