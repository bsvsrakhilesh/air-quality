import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const output = new URL('../test-results/review/', import.meta.url)
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' })
const findings = []
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    for (const view of ['overview', 'series', 'statistics', 'collocation']) {
      await page.goto(`http://127.0.0.1:5173/?view=${view}`)
      await page.waitForLoadState('networkidle')
      if (await page.locator('.recovery-state').count()) errors.push(`Error boundary shown for ${view}`)
      await page.screenshot({ path: fileURLToPath(new URL(`${view}-${width}.png`, output)), fullPage: true })
      findings.push({ width, view, overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), errors: [...errors], heading: await page.locator('h1').allTextContents() })
    }
    await page.close()
  }
  await writeFile(new URL('findings.json', output), JSON.stringify(findings, null, 2))
  console.log(JSON.stringify(findings, null, 2))
  if (findings.some(item => item.overflow || item.errors.length)) process.exitCode = 1
} finally {
  await browser.close()
}
