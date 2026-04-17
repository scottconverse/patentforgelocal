const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let n = 0;
async function ss(page, name) {
  n++;
  const f = `${String(n).padStart(2,'0')}-${name}.png`;
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, f), fullPage: true });
  console.log(`  [ss] ${f}`);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('=== PatentForgeLocal E2E Final v2 ===\n');
  const errs = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on('console', msg => { if (msg.type() === 'error') errs.push(msg.text()); });

  try {
    // Step 1: Homepage + dismiss ToU
    console.log('Step 1: Homepage...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(500);
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /understand|agree/i.test(b.innerText));
      if (btn) btn.click();
    });
    await sleep(1000);
    await ss(page, 'homepage');

    // Step 2: Open project
    console.log('\nStep 2: Open project...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Open');
      if (btn) btn.click();
    });
    await sleep(2000);
    console.log(`  URL: ${page.url()}`);

    // Step 3: Click "Run Feasibility Analysis"
    console.log('\nStep 3: Click "Run Feasibility Analysis"...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Run Feasibility Analysis');
      if (btn) btn.click();
    });
    await sleep(2000);
    await ss(page, 'cost-modal');

    // Step 4: Click "Start Analysis" in cost confirmation modal
    console.log('\nStep 4: Confirm — click "Start Analysis"...');
    const confirmed = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Start Analysis');
      if (btn) { btn.click(); return true; }
      // Fallback: look for any confirm-like button
      const fallback = Array.from(document.querySelectorAll('button')).find(b => /confirm|start|proceed|yes/i.test(b.innerText));
      if (fallback) { fallback.click(); return 'fallback: ' + fallback.innerText.trim(); }
      return false;
    });
    console.log(`  Confirmed: ${confirmed}`);
    await sleep(5000);
    await ss(page, 'analysis-started');

    // Step 5: Verify run created
    console.log('\nStep 5: Verify run created...');
    for (let i = 0; i < 5; i++) {
      const status = await page.evaluate(async () => {
        const r = await fetch('/api/projects/5f0e8c6a-8c04-41cc-96fe-f0c2df1f0426/feasibility');
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data) && data.length > 0) return { found: true, status: data[0].status, stages: data[0].stages?.length || 0 };
        }
        return { found: false };
      });
      console.log(`  [${(i+1)*2}s] ${JSON.stringify(status)}`);
      if (status.found) break;
      await sleep(2000);
    }

    // Step 6: Monitor (up to 10 minutes)
    console.log('\nStep 6: Monitoring analysis...');
    let completed = false;
    for (let i = 0; i < 60; i++) {
      await sleep(10000);
      const elapsed = (i + 1) * 10;

      const status = await page.evaluate(async () => {
        try {
          const r = await fetch('/api/projects/5f0e8c6a-8c04-41cc-96fe-f0c2df1f0426/feasibility');
          if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data) && data.length > 0) {
              const run = data[0];
              const done = run.stages?.filter(s => s.status === 'COMPLETE').length || 0;
              const total = run.stages?.length || 0;
              return `${run.status} [${done}/${total} stages]`;
            }
          }
          return 'no-run';
        } catch { return 'error'; }
      });

      console.log(`  [${elapsed}s] ${status}`);

      if (status.includes('COMPLETE') && !status.includes('0/')) {
        // Check if ALL stages are complete
        const allDone = await page.evaluate(async () => {
          const r = await fetch('/api/projects/5f0e8c6a-8c04-41cc-96fe-f0c2df1f0426/feasibility');
          const data = await r.json();
          const run = data[0];
          return run.status === 'COMPLETE';
        });
        if (allDone) {
          completed = true;
          console.log('  ALL STAGES COMPLETE!');
          break;
        }
      }
      if (status.includes('FAILED')) {
        console.log('  RUN FAILED');
        break;
      }
      if (elapsed % 60 === 0) await ss(page, `progress-${elapsed}s`);
    }

    await ss(page, completed ? 'complete' : 'timeout');

    // Step 7: Final state + screenshot
    console.log('\nStep 7: Final state...');
    const finalText = await page.evaluate(() => document.body.innerText.substring(0, 600));
    console.log(`  ${finalText.substring(0, 400)}`);
    await ss(page, 'final');

    console.log(`\nConsole errors: ${errs.length}`);
    errs.slice(0, 5).forEach((e, i) => console.log(`  ${i+1}. ${e.substring(0, 150)}`));

    console.log('\n=== E2E DONE ===');
  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    await ss(page, 'fatal').catch(() => {});
  } finally {
    await browser.close();
  }
})();
