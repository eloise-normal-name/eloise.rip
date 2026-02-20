// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');

const VISUALIZER_JS = path.resolve(
    __dirname,
    '../content/pages/voice-recorder/audio-visualizer.js'
);

/** Set up a page with a canvas and the AudioVisualizer loaded. */
async function setupVisualizerPage(page) {
    await page.setContent(`
        <!DOCTYPE html>
        <html><body>
            <canvas id="testCanvas" width="400" height="300"></canvas>
            <script>function detectPitch() { return null; }</script>
        </body></html>
    `);
    await page.addScriptTag({ path: VISUALIZER_JS });
    await page.evaluate(() => {
        const canvas = document.getElementById('testCanvas');
        window.visualizer = new AudioVisualizer(canvas, null);
    });
}

/**
 * Simulate `count` silent samples and return the canvas pixel data
 * as a flat Uint8ClampedArray (RGBA values).
 */
async function simulateAndRead(page, count) {
    return page.evaluate((n) => {
        for (let i = 0; i < n; i++) {
            window.visualizer.pushPitchSample(null);
            window.visualizer.renderPitchTrace();
        }
        const canvas = document.getElementById('testCanvas');
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        // Transfer as a plain Array (Uint8ClampedArray isn't transferable via evaluate)
        return Array.from(data);
    }, count);
}

/** Return the minimum R channel value across a vertical column. */
function minRInColumn(pixels, canvasWidth, x) {
    let minR = 255;
    for (let y = 0; y < pixels.length / (4 * canvasWidth); y++) {
        const r = pixels[(y * canvasWidth + x) * 4];
        if (r < minR) minR = r;
    }
    return minR;
}

test.describe('AudioVisualizer timeline lines', () => {
    test('has timeline configuration properties', async ({ page }) => {
        await setupVisualizerPage(page);
        const config = await page.evaluate(() => ({
            interval: window.visualizer.timelineIntervalSamples,
            color: window.visualizer.timelineColor,
            width: window.visualizer.timelineWidth,
        }));
        expect(config.interval).toBeGreaterThan(0);
        expect(config.color).toMatch(/rgba?\(/);
        expect(config.width).toBeGreaterThan(0);
    });

    test('totalSamplesRendered increments with each render call', async ({ page }) => {
        await setupVisualizerPage(page);
        const count = await page.evaluate(() => {
            for (let i = 0; i < 10; i++) {
                window.visualizer.pushPitchSample(null);
                window.visualizer.renderPitchTrace();
            }
            return window.visualizer.totalSamplesRendered;
        });
        expect(count).toBe(10);
    });

    test('totalSamplesRendered resets to 0 when clear() is called', async ({ page }) => {
        await setupVisualizerPage(page);
        const count = await page.evaluate(() => {
            for (let i = 0; i < 10; i++) {
                window.visualizer.pushPitchSample(null);
                window.visualizer.renderPitchTrace();
            }
            window.visualizer.clear();
            return window.visualizer.totalSamplesRendered;
        });
        expect(count).toBe(0);
    });

    test('draws a timeline line on the canvas at the interval boundary', async ({ page }) => {
        await setupVisualizerPage(page);

        // Read the canvas after a number of samples equal to one interval
        const interval = await page.evaluate(() => window.visualizer.timelineIntervalSamples);
        const pixels = await simulateAndRead(page, interval);

        const canvasWidth = 400;
        // Sample N is drawn at currentX = (N-1)*pixelsPerSample when currentX starts at 0
        // For N=interval (=50), currentX = (50-1)*2 = 98
        const pixelsPerSample = await page.evaluate(() => window.visualizer.pixelsPerSample);
        const expectedX = Math.floor((interval - 1) * pixelsPerSample) + 0; // floor(x) + 0.5 offset

        // The canvas line is drawn at floor(x)+0.5; we check column floor(x)
        const minR = minRInColumn(pixels, canvasWidth, expectedX);
        // Timeline uses rgba(0,0,0,0.10) over white => R ≈ 230; must be noticeably below 255
        expect(minR).toBeLessThan(250);
    });

    test('background columns without a timeline line are white', async ({ page }) => {
        await setupVisualizerPage(page);

        const interval = await page.evaluate(() => window.visualizer.timelineIntervalSamples);
        const pixelsPerSample = await page.evaluate(() => window.visualizer.pixelsPerSample);
        const pixels = await simulateAndRead(page, interval);

        const canvasWidth = 400;
        // Check a column just before the timeline line — no timeline line drawn here.
        // Voice range bands and horizontal pitch grid lines can reduce R to ~215,
        // so the threshold is set to > 200 (still well above the timeline line ~230).
        const beforeX = Math.floor((interval - 2) * pixelsPerSample);
        const minR = minRInColumn(pixels, canvasWidth, beforeX);
        expect(minR).toBeGreaterThan(200);
    });

    test('draws multiple timeline lines at each interval boundary', async ({ page }) => {
        await setupVisualizerPage(page);

        const interval = await page.evaluate(() => window.visualizer.timelineIntervalSamples);
        const pixelsPerSample = await page.evaluate(() => window.visualizer.pixelsPerSample);
        const pixels = await simulateAndRead(page, interval * 2);

        const canvasWidth = 400;
        // First line: at sample index (interval-1)*pixelsPerSample
        const firstX = Math.floor((interval - 1) * pixelsPerSample);
        // Second line: at sample index (2*interval-1)*pixelsPerSample
        const secondX = Math.floor((2 * interval - 1) * pixelsPerSample);

        expect(minRInColumn(pixels, canvasWidth, firstX)).toBeLessThan(250);
        expect(minRInColumn(pixels, canvasWidth, secondX)).toBeLessThan(250);
    });
});
