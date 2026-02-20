import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const targetUrl = process.env.HEARING_AGE_URL || 'http://127.0.0.1:8000/hearing-age-guesser.html';
const screenshotPath = process.env.HEARING_AGE_SCREENSHOT || 'tests/artifacts/hearing-age-guesser-started.png';
const waitMs = Number.parseInt(process.env.HEARING_AGE_WAIT_MS || '4000', 10);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });

try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#startSweep', { timeout: 15000 });
    await page.click('#startSweep');
    await page.waitForTimeout(waitMs);
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved screenshot to ${screenshotPath}`);
} finally {
    await browser.close();
}
