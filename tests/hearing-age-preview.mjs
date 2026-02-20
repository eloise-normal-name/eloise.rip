import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const targetUrl = process.env.HEARING_AGE_URL || 'http://127.0.0.1:8000/hearing-age-guesser.html';
const screenshotPath = process.env.HEARING_AGE_SCREENSHOT || 'tests/artifacts/hearing-age-guesser-started.png';
const waitMs = Number.parseInt(process.env.HEARING_AGE_WAIT_MS || '4000', 10);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });
const consoleMessages = [];
const pageErrors = [];

page.on('console', (message) => {
    consoleMessages.push({
        type: message.type(),
        text: message.text()
    });
});

page.on('pageerror', (error) => {
    pageErrors.push(error.message);
});

try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#startSweep', { timeout: 15000 });
    await page.click('#startSweep');
    await page.waitForTimeout(waitMs);
    await page.click('#cantHearButton');
    await page.waitForTimeout(250);

    if (pageErrors.length > 0) {
        throw new Error(`Unexpected page error(s) detected: ${JSON.stringify(pageErrors)}`);
    }

    const debugMessages = consoleMessages.filter(({ type }) => type === 'debug');

    if (debugMessages.length > 0) {
        throw new Error(`Unexpected console.debug output detected: ${JSON.stringify(debugMessages)}`);
    }

    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Saved screenshot to ${screenshotPath}`);
    console.log(`Checked ${consoleMessages.length} console message(s); no console.debug output found.`);
} finally {
    await browser.close();
}
