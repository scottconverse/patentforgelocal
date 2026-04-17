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
  console.log('=== PatentForgeLocal E2E Final ===\n');
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

    // Step 2: Click Open on project
    console.log('\nStep 2: Open project...');
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Open');
      if (btn) btn.click();
    });
    await sleep(2000);
    console.log(`  URL: ${page.url()}`);
    await ss(page, 'project-detail');

    // Step 3: Click the CORRECT "Run Feasibility Analysis" button (not the sidebar action)
    console.log('\nStep 3: Click "Run Feasibility Analysis" button...');
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      // Target the exact full text to avoid hitting the sidebar "Run Feasibility" action
      const btn = btns.find(b => b.innerText.trim() === 'Run Feasibility Analysis');
      if (btn) { btn.click(); return true; }
      return false;
    });
    console.log(`  Clicked: ${clicked}`);
    if (!clicked) {
      console.log('  FAIL: Could not find "Run Feasibility Analysis" button');
      const allBtns = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim()));
      console.log(`  All buttons: ${JSON.stringify(allBtns)}`);
      await browser.close();
      return;
    }
    await sleep(5000);
    await ss(page, 'analysis-started');

    // Step 4: Verify the run was created via API
    console.log('\nStep 4: Verify run created...');
    const runCreated = await page.evaluate(async () => {
      try {
        const r = await fetch('/api/projects/5f0e8c6a-8c04-41cc-96fe-f0c2df1f0426/feasibility');
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data) && data.length > 0) {
            return { status: data[0].status, stages: data[0].stages?.length || 0 };
          }
        }
        return { error: `HTTP ${r.status}` };
      } catch (e) { return { error: e.message }; }
    });
    console.log(`  Run status: ${JSON.stringify(runCreated)}`);

    // Step 5: Monitor progress (up to 10 minutes)
    console.log('\nStep 5: Monitoring...');
    let completed = false;
    for (let i = 0; i < 60; i++) {
      await sleep(10000);
      const elapsed = (i + 1) * 10;

      // Check via API
      const status = await page.evaluate(async () => {
        try {
          const r = await fetch('/api/projects/5f0e8c6a-8c04-41cc-96fe-f0c2df1f0426/feasibility');
          if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data) && data.length > 0) {
              const run = data[0];
              const stagesComplete = run.stages?.filter(s => s.status === 'COMPLETE').length || 0;
              const stagesTotal = run.stages?.length || 0;
              return { status: run.status, stagesComplete, stagesTotal };
            }
          }
          return { status: 'no-run' };
        } catch (e) { return { error: e.message }; }
      });

      console.log(`  [${elapsed}s] ${status.status || 'unknown'} — stages: ${status.stagesComplete || 0}/${status.stagesTotal || '?'}`);

      if (status.status === 'COMPLETE' || status.status === 'DONE') {
        completed = true;
        console.log('  ANALYSIS COMPLETE!');
        break;
      }
      if (status.status === 'FAILED' || status.status === 'ERROR') {
        console.log('  ANALYSIS FAILED');
        break;
      }

      if (elapsed % 60 === 0) await ss(page, `progress-${elapsed}s`);
    }

    await ss(page, completed ? 'complete' : 'final');

    // Step 6: Final page state
    console.log('\nStep 6: Final state...');
    const pageText = await page.evaluate(() => document.body.innerText.substring(0, 800));
    console.log(`  Content: ${pageText.substring(0, 400)}`);
    const finalBtns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => ({ text: b.innerText.trim().substring(0, 40), disabled: b.disabled }))
    );
    console.log(`  Buttons: ${JSON.stringify(finalBtns)}`);

    // Step 7: Console errors
    console.log(`\nStep 7: Console errors: ${errs.length}`);
    errs.slice(0, 5).forEach((e, i) => console.log(`  ${i+1}. ${e.substring(0, 150)}`));

    console.log('\n=== E2E DONE ===');
  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    await ss(page, 'fatal').catch(() => {});
  } finally {
    await browser.close();
  }
})();
