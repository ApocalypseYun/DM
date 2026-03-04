import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../', import.meta.url).pathname
const srcDir = join(root, 'src')
const distDir = join(root, 'dist')

if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true })
}

for (const fileName of readdirSync(srcDir)) {
  cpSync(join(srcDir, fileName), join(distDir, fileName))
}
