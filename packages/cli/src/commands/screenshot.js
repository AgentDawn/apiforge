import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * apiforge screenshot --url <url> [--output <file>] [--highlight <selector[:color]>] [--element <selector>] [--viewport <WxH>]
 */
export async function screenshotCommand(args, dataDir) {
  // Parse args
  let url = '';
  let output = 'screenshot.png';
  const highlights = [];
  let element = null;
  let viewportWidth = 1280;
  let viewportHeight = 720;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--url':
        url = args[++i] || '';
        break;
      case '--output':
      case '-o':
        output = args[++i] || 'screenshot.png';
        break;
      case '--highlight':
        highlights.push(args[++i] || '');
        break;
      case '--element':
        element = args[++i] || null;
        break;
      case '--viewport': {
        const vp = (args[++i] || '1280x720').split('x');
        viewportWidth = parseInt(vp[0], 10) || 1280;
        viewportHeight = parseInt(vp[1], 10) || 720;
        break;
      }
      case '-h':
      case '--help':
        console.log(HELP);
        return;
    }
  }

  if (!url) {
    console.error('Error: --url is required\n');
    console.log(HELP);
    process.exit(1);
  }

  // Ensure output directory exists
  const dir = dirname(output);
  if (dir && dir !== '.' && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error('Error: playwright is required for screenshots. Install it with: npm install playwright');
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: viewportWidth, height: viewportHeight },
    });

    await page.goto(url);
    await page.waitForLoadState('networkidle');

    // Apply highlights
    for (const highlight of highlights) {
      const colonIdx = highlight.lastIndexOf(':');
      let selector, color;
      if (colonIdx > 0 && !highlight.substring(colonIdx + 1).includes(' ')) {
        selector = highlight.substring(0, colonIdx);
        color = highlight.substring(colonIdx + 1) || 'red';
      } else {
        selector = highlight;
        color = 'red';
      }

      await page.evaluate(({ sel, col }) => {
        document.querySelectorAll(sel).forEach(el => {
          el.style.outline = `3px solid ${col}`;
          el.style.outlineOffset = '2px';
        });
      }, { sel: selector, col: color });
    }

    // Take screenshot
    if (element) {
      const loc = page.locator(element);
      await loc.screenshot({ path: output });
    } else {
      await page.screenshot({ path: output, fullPage: false });
    }

    console.log(`Screenshot saved: ${output}`);
  } finally {
    await browser.close();
  }
}

/** Parse screenshot args without taking a screenshot (for testing) */
export function parseScreenshotArgs(args) {
  let url = '';
  let output = 'screenshot.png';
  const highlights = [];
  let element = null;
  let viewportWidth = 1280;
  let viewportHeight = 720;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--url':
        url = args[++i] || '';
        break;
      case '--output':
      case '-o':
        output = args[++i] || 'screenshot.png';
        break;
      case '--highlight':
        highlights.push(args[++i] || '');
        break;
      case '--element':
        element = args[++i] || null;
        break;
      case '--viewport': {
        const vp = (args[++i] || '1280x720').split('x');
        viewportWidth = parseInt(vp[0], 10) || 1280;
        viewportHeight = parseInt(vp[1], 10) || 720;
        break;
      }
    }
  }

  return { url, output, highlights, element, viewportWidth, viewportHeight };
}

const HELP = `
apiforge screenshot - Take a screenshot of a URL

USAGE:
  apiforge screenshot --url <url> [options]

OPTIONS:
  --url <url>              URL to screenshot (required)
  --output, -o <file>      Output file path (default: screenshot.png)
  --highlight <sel[:color]> Highlight elements matching CSS selector (repeatable)
  --element <selector>     Screenshot only this element
  --viewport <WxH>         Viewport size (default: 1280x720)
  -h, --help               Show this help

EXAMPLES:
  apiforge screenshot --url http://localhost:3001 --output report.png
  apiforge screenshot --url http://localhost:3001 --highlight ".response-status:red" --output status.png
  apiforge screenshot --url http://localhost:3001 --element ".response-panel" --output response.png
`;
