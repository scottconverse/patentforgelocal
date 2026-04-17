const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let stepNum = 0;
async function ss(page, name) {
  stepNum++;
  const fname = `${String(stepNum).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, fname), fullPage: true });
  console.log(`  [ss] ${fname}`);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('=== PatentForgeLocal E2E Test Run 3 ===\n');
  const errs = [];

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on('console', msg => { if (msg.type() === 'error') errs.push(msg.text()); });

  try {
    // Step 1: Homepage
    console.log('Step 1: Homepage...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 15000 });
    await sleep(1000);

    // Accept disclaimer
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => /understand|agree/i.test(b.innerText));
      if (btn) btn.click();
    });
    await sleep(1500);
    await ss(page, 'project-list');

    const hasProject = await page.evaluate(() => document.body.innerText.includes('Irrigation'));
    console.log(`  Project visible: ${hasProject}`);

    if (!hasProject) { console.log('  FAIL: project not found'); await browser.close(); return; }

    // Step 2: Click "Open" button on the project
    console.log('\nStep 2: Click Open button...');
    // The Open button is specific to the project card. Use XPath to find button with text "Open"
    const clicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const openBtn = btns.find(b => b.innerText.trim() === 'Open');
      if (openBtn) { openBtn.click(); return true; }
      // Also try links
      const links = Array.from(document.querySelectorAll('a'));
      const link = links.find(l => l.innerText.includes('Irrigation') || l.href.includes('project'));
      if (link) { link.click(); return true; }
      return false;
    });
    console.log(`  Clicked: ${clicked}`);
    await sleep(3000);
    console.log(`  URL: ${page.url()}`);
    await ss(page, 'after-open-click');

    // Step 3: Check if we're on project detail
    console.log('\nStep 3: Project detail page...');
    const detailText = await page.evaluate(() => document.body.innerText.substring(0, 800));
    console.log(`  Content (400 chars): ${detailText.substring(0, 400)}`);

    const buttons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => ({ text: b.innerText.trim().substring(0, 40), disabled: b.disabled }))
    );
    console.log(`  Buttons: ${JSON.stringify(buttons)}`);
    await ss(page, 'project-detail');

    // Step 4: Find and click Run Analysis
    console.log('\nStep 4: Run Analysis...');
    const runBtn = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => /run|analyze|feasibility|start analysis/i.test(b.innerText) && !b.disabled);
      if (btn) { btn.click(); return btn.innerText.trim(); }
      return null;
    });

    if (!runBtn) {
      console.log('  No Run button. Listing all interactive elements...');
      const interactive = await page.evaluate(() => {
        const els = [...document.querySelectorAll('button, a, [role="button"], input, select, [tabindex]')];
        return els.map(e => ({ tag: e.tagName, text: (e.innerText || e.value || '').trim().substring(0, 50), href: e.href || '' })).slice(0, 30);
      });
      console.log(JSON.stringify(interactive, null, 2));
      await ss(page, 'no-run-button');
      console.log('\n=== Test ended: no Run button ===');
      await browser.close();
      return;
    }

    console.log(`  Clicked: "${runBtn}"`);
    await sleep(5000);
    await ss(page, 'analysis-started');

    // Step 5: Monitor (up to 10 minutes for local LLM)
    console.log('\nStep 5: Monitoring analysis...');
    let completed = false;
    for (let i = 0; i < 60; i++) {
      await sleep(10000);
      const text = await page.evaluate(() => document.body.innerText);
      const elapsed = (i + 1) * 10;

      if (/all\s*(stages?\s*)?complete|analysis\s*complete|feasibility.*complete/i.test(text)) {
        console.log(`  [${elapsed}s] COMPLETE!`);
        completed = true;
        break;
      }

      // Stage info
      const stageMatch = text.match(/Stage\s*(\d+)/i) || text.match(/(\d+)\s*(?:of|\/)\s*(\d+)/);
      const statusStr = stageMatch ? `Stage ${stageMatch[1]}${stageMatch[2] ? '/' + stageMatch[2] : ''}` : 'running';
      const hasErr = /error|failed/i.test(text) && !/no error/i.test(text);
      console.log(`  [${elapsed}s] ${statusStr}${hasErr ? ' ERROR' : ''}`);

      if (elapsed % 60 === 0) await ss(page, `progress-${elapsed}s`);
    }

    await ss(page, completed ? 'analysis-complete' : 'analysis-timeout');

    // Step 6: Post-analysis
    console.log('\nStep 6: Post-analysis...');
    const finalText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
    console.log(`  Content: ${finalText.substring(0, 500)}`);

    const finalBtns = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => ({ text: b.innerText.trim().substring(0, 40), disabled: b.disabled }))
    );
    console.log(`  Buttons: ${JSON.stringify(finalBtns)}`);
    await ss(page, 'final-state');

    // Step 7: Console
    console.log(`\nStep 7: Console errors: ${errs.length}`);
    errs.slice(0, 5).forEach((e, i) => console.log(`  ${i + 1}. ${e.substring(0, 150)}`));

    console.log('\n=== E2E Test Complete ===');

  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    await ss(page, 'fatal').catch(() => {});
  } finally {
    await browser.close();
  }
})();
