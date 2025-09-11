import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'

function versionPlugin(): Plugin {
  return {
    name: 'version-plugin',
    generateBundle() {
      try {
        const gitCommitId = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
        const versionData = { version: gitCommitId }
        
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify(versionData, null, 2)
        })
      } catch (error) {
        console.warn('Failed to generate version.json:', error)
        const fallbackVersion = { version: 'unknown' }
        this.emitFile({
          type: 'asset',
          fileName: 'version.json',
          source: JSON.stringify(fallbackVersion, null, 2)
        })
      }
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/components': path.resolve(__dirname, './src/components'),
      '@/routes': path.resolve(__dirname, './src/routes'),
      '@/lib': path.resolve(__dirname, './src/lib'),
      '@/hooks': path.resolve(__dirname, './src/hooks'),
      '@/types': path.resolve(__dirname, './src/types'),
    },
  },
  server: {
    host: true,
    port: 3000,
    allowedHosts: true
  },
})
