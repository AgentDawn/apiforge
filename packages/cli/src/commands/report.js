import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * apiforge report --format <markdown|json> [--output <file>] [--screenshots] [--url <url>] [--data-dir <dir>]
 */
export async function reportCommand(args, dataDir) {
  let format = 'markdown';
  let output = 'report.md';
  let includeScreenshots = false;
  let url = '';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--format':
      case '-f':
        format = args[++i] || 'markdown';
        break;
      case '--output':
      case '-o':
        output = args[++i] || 'report.md';
        break;
      case '--screenshots':
        includeScreenshots = true;
        break;
      case '--url':
        url = args[++i] || '';
        break;
      case '-h':
      case '--help':
        console.log(HELP);
        return;
    }
  }

  // Ensure output directory exists
  const dir = dirname(output);
  if (dir && dir !== '.' && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Load request history if available
  const history = loadHistory(dataDir);

  if (format === 'json') {
    const report = buildJsonReport(history);
    writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(`Report saved: ${output}`);
    return;
  }

  // Default: markdown
  let md = generateMarkdownReport(history);

  if (includeScreenshots && url) {
    md = await addScreenshots(md, url, output);
  }

  writeFileSync(output, md);
  console.log(`Report saved: ${output}`);
}

/** Parse report args without generating (for testing) */
export function parseReportArgs(args) {
  let format = 'markdown';
  let output = 'report.md';
  let includeScreenshots = false;
  let url = '';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--format':
      case '-f':
        format = args[++i] || 'markdown';
        break;
      case '--output':
      case '-o':
        output = args[++i] || 'report.md';
        break;
      case '--screenshots':
        includeScreenshots = true;
        break;
      case '--url':
        url = args[++i] || '';
        break;
    }
  }

  return { format, output, includeScreenshots, url };
}

function loadHistory(dataDir) {
  const historyDir = join(dataDir, 'history');
  if (!existsSync(historyDir)) return [];

  try {
    const files = readdirSync(historyDir).filter(f => f.endsWith('.json')).sort().reverse();
    return files.slice(0, 50).map(f => {
      try {
        return JSON.parse(readFileSync(join(historyDir, f), 'utf-8'));
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

export function generateMarkdownReport(history) {
  let md = '# API Test Report\n\n';
  md += `**Generated:** ${new Date().toISOString()}\n\n`;

  if (history.length === 0) {
    md += '> No request history found.\n\n';
    md += 'Run some API requests with `apiforge run` first, then generate a report.\n';
    return md;
  }

  // Summary
  const total = history.length;
  const success = history.filter(h => h.status >= 200 && h.status < 300).length;
  const failed = total - success;

  md += '## Summary\n\n';
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Requests | ${total} |\n`;
  md += `| Successful (2xx) | ${success} |\n`;
  md += `| Failed | ${failed} |\n\n`;

  // Request details
  md += '## Request Details\n\n';
  for (const entry of history) {
    const statusEmoji = entry.status >= 200 && entry.status < 300 ? 'PASS' : 'FAIL';
    md += `### ${statusEmoji} ${entry.method || 'GET'} ${entry.url || 'unknown'}\n\n`;
    md += `- **Status:** ${entry.status || 'N/A'}\n`;
    if (entry.timing) md += `- **Time:** ${entry.timing}ms\n`;
    if (entry.timestamp) md += `- **Timestamp:** ${entry.timestamp}\n`;
    md += '\n';
  }

  return md;
}

function buildJsonReport(history) {
  const total = history.length;
  const success = history.filter(h => h.status >= 200 && h.status < 300).length;
  return {
    generated: new Date().toISOString(),
    summary: { total, success, failed: total - success },
    requests: history,
  };
}

async function addScreenshots(md, url, outputPath) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    md += '\n> Screenshots skipped: playwright not installed.\n';
    return md;
  }

  const screenshotDir = join(dirname(outputPath), 'screenshots');
  if (!existsSync(screenshotDir)) {
    mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(url);
    await page.waitForLoadState('networkidle');

    const overviewPath = join(screenshotDir, 'overview.png');
    await page.screenshot({ path: overviewPath, fullPage: false });

    md += '\n## Screenshots\n\n';
    md += '### Overview\n\n';
    md += `![Overview](./screenshots/overview.png)\n\n`;
  } finally {
    await browser.close();
  }

  return md;
}

const HELP = `
apiforge report - Generate API test report

USAGE:
  apiforge report [options]

OPTIONS:
  --format, -f <type>   Report format: markdown (default) or json
  --output, -o <file>   Output file path (default: report.md)
  --screenshots         Include screenshots in report
  --url <url>           URL for screenshots (required with --screenshots)
  -h, --help            Show this help

EXAMPLES:
  apiforge report --format markdown --output report.md
  apiforge report --format json --output report.json
  apiforge report --format markdown --screenshots --url http://localhost:3001 --output report.md
`;
