import { defineConfig } from 'tsdown'

const clientExternal = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/dsh-client-runtime/client', '@deepseek-ai/dsh-client-ui-primitives']

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    outDir: 'lib',
    clean: true,
    dts: false,
    deps: { neverBundle: ['@deepseek-ai/cordis'] },
  },
  {
    entry: { client: 'src/client/index.tsx' },
    format: 'cjs',
    target: 'es2022',
    platform: 'browser',
    outDir: 'lib',
    clean: false,
    dts: false,
    sourcemap: true,
    deps: {
      neverBundle: clientExternal,
      alwaysBundle: (id: string) => !clientExternal.includes(id),
    },
    define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production') },
    outputOptions: {
      entryFileNames: 'client.js',
      banner: 'window.__ModuleLoader__.load({ id: "@orios/dsh-creator", factory: (require) => {',
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  },
])
