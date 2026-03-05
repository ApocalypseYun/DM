import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../', import.meta.url).pathname
const srcDir = join(root, 'src')
const distDir = join(root, 'dist')

if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true, force: true })
}
mkdirSync(distDir, { recursive: true })

for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
  cpSync(join(srcDir, entry.name), join(distDir, entry.name), {
    recursive: entry.isDirectory(),
  })
}
