/**
 * generate-icons.ts
 *
 * Generates the PWA-required PNG icons (192×192 and 512×512) from the
 * existing /public/ebk-logo.svg source using sharp.
 *
 * Run with:
 *   ts-node --project tsconfig.seed.json scripts/generate-icons.ts
 */

import * as fs from 'fs'
import * as path from 'path'
import sharp from 'sharp'

const ROOT = path.resolve(__dirname, '..')
const SVG_SOURCE = path.join(ROOT, 'public', 'ebk-logo.svg')
const ICONS_DIR = path.join(ROOT, 'public', 'icons')

const SIZES = [192, 512] as const

async function main() {
  if (!fs.existsSync(SVG_SOURCE)) {
    console.error(`SVG source not found: ${SVG_SOURCE}`)
    process.exit(1)
  }

  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true })
    console.log(`Created directory: ${ICONS_DIR}`)
  }

  const svgBuffer = fs.readFileSync(SVG_SOURCE)

  for (const size of SIZES) {
    const outputPath = path.join(ICONS_DIR, `icon-${size}.png`)
    await sharp(svgBuffer)
      .resize(size, size)
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(outputPath)
    const stat = fs.statSync(outputPath)
    console.log(`Generated ${outputPath} (${(stat.size / 1024).toFixed(1)} KB)`)
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
