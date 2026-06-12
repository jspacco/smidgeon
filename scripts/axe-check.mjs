// Runs axe-core accessibility check against a locally previewed app.
// Usage: node scripts/axe-check.mjs <url>
// Exits with code 1 if any violations are found — hard-blocks CI.

import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const url = process.argv[2] ?? 'http://localhost:4173'

const browser = await chromium.launch()
const context = await browser.newContext()
const page = await browser.newPage()

try {
  await page.goto(url)
  const results = await new AxeBuilder({ page }).analyze()

  if (results.violations.length > 0) {
    console.error(`Accessibility violations found on ${url}:`)
    for (const v of results.violations) {
      console.error(`  [${v.impact}] ${v.id}: ${v.description}`)
      for (const node of v.nodes) {
        console.error(`    target: ${node.target.join(', ')}`)
      }
    }
    process.exit(1)
  }

  console.log(`No accessibility violations found on ${url}.`)
} finally {
  await browser.close()
}
