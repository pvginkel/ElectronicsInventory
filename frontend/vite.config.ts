import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'
import fs from 'fs'

function versionPlugin(): Plugin {
  const getGitCommitId = () => {
    try {
      // First try to read from git-rev file (for Docker builds)
      const gitRevFile = path.resolve(__dirname, 'git-rev')
      if (fs.existsSync(gitRevFile)) {
        const fileContent = fs.readFileSync(gitRevFile, 'utf8').trim()
        if (fileContent) {
          return fileContent
        }
      }
      
      // Fallback to git command
      return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
    } catch (error) {
      console.warn('Failed to get git commit:', error)
      return 'unknown'
    }
  }

  return {
    name: 'version-plugin',
    generateBundle() {
      // Generate version.json for production build
      const gitCommitId = getGitCommitId()
      const versionData = { version: gitCommitId }
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(versionData, null, 2)
      })
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
