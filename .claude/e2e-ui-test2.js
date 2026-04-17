const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let stepNum = 0;
async function screenshot(page, name) {
  stepNum++;
  const fname = `${String(stepNum).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, fname), fullPage: true });
  console.log(`  [screenshot] ${fname}`);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  console.log('=== PatentForgeLocal Windows E2E UI Test (Run 2) ===\n');
  const consoleErrors = [];

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  try {
    // Step 1: Homepage — should show project list now (wizard bypassed)
    console.log('Step 1: Navigate to homepage...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 15000 });
    console.log(`  Title: ${await page.title()}`);
    await sleep(1000);

    // Accept disclaimer if shown
    const hasDisclaimer = await page.evaluate(() => document.body.innerText.includes('Terms of Use'));
    if (hasDisclaimer) {
      console.log('  Accepting Terms of Use...');
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => /understand|agree|accept/i.test(b.innerText));
        if (btn) btn.click();
      });
      await sleep(1500);
    }
    await screenshot(page, 'homepage');

    // Step 2: Check for project list
    console.log('\nStep 2: Check project list...');
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log(`  Page text (300 chars): ${pageText.substring(0, 300)}`);

    const hasProject = pageText.includes('Irrigation');
    console.log(`  Project visible: ${hasProject}`);

    if (!hasProject) {
      console.log('  Project not in list — checking if list is empty or wizard still showing');
      const allButtons = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim())
      );
      console.log(`  Buttons: ${JSON.stringify(allButtons)}`);
      await screenshot(page, 'no-project-visible');

      // If New Project button exists, the list page is showing but empty for some reason
      if (allButtons.some(b => /new|create/i.test(b))) {
        console.log('  Project list page is showing. Project may not be visible in UI.');
      }
    }

    // Step 3: Click on project
    if (hasProject) {
      console.log('\nStep 3: Click on project...');
      await page.evaluate(() => {
        const els = document.querySelectorAll('a, tr, div, [role="button"], [class*="card"], [class*="row"]');
        for (const el of els) {
          if (el.innerText && el.innerText.includes('Irrigation')) {
            el.click();
            return;
          }
        }
      });
      await sleep(2000);
      console.log(`  URL: ${page.url()}`);
      await screenshot(page, 'project-detail');

      // Step 4: Project detail — find Run button
      console.log('\nStep 4: Project detail page...');
      const detailText = await page.evaluate(() => document.body.innerText.substring(0, 600));
      console.log(`  Content: ${detailText.substring(0, 400)}`);
      const detailButtons = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).map(b => ({ text: b.innerText.trim(), disabled: b.disabled }))
      );
      console.log(`  Buttons: ${JSON.stringify(detailButtons)}`);
      await screenshot(page, 'project-buttons');

      // Step 5: Click Run Analysis
      console.log('\nStep 5: Run Analysis...');
      const runClicked = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => /run|start|analyze|feasibility/i.test(b.innerText) && !b.disabled);
        if (btn) { btn.click(); return btn.innerText.trim(); }
        return null;
      });

      if (runClicked) {
        console.log(`  Clicked: "${runClicked}"`);
        await sleep(3000);
        await screenshot(page, 'analysis-running');

        // Step 6: Monitor progress (up to 8 minutes for gemma4:e4b)
        console.log('\nStep 6: Monitoring analysis progress...');
        let completed = false;
        for (let i = 0; i < 48; i++) { // 48 x 10s = 8 minutes
          await sleep(10000);
          const text = await page.evaluate(() => document.body.innerText);
          const elapsed = (i + 1) * 10;

          // Check for completion signals
          if (/all\s*(stages?\s*)?complete|analysis\s*complete|feasibility\s*complete/i.test(text)) {
            console.log(`  [${elapsed}s] ANALYSIS COMPLETE`);
            completed = true;
            await screenshot(page, 'analysis-complete');
            break;
          }

          // Check for stage progress
          const stageMatch = text.match(/stage\s*(\d)\s*(?:of\s*(\d))?/i) || text.match(/(\d)\s*\/\s*(\d)/);
          const hasError = /error|failed/i.test(text) && !/no error/i.test(text);
          const status = stageMatch ? `Stage ${stageMatch[1]}${stageMatch[2] ? '/' + stageMatch[2] : ''}` : 'running';
          console.log(`  [${elapsed}s] ${status}${hasError ? ' (ERROR detected)' : ''}`);

          if (hasError && i > 2) {
            const errorCtx = text.match(/.{0,80}(error|fail).{0,80}/i);
            console.log(`  Error context: ${errorCtx ? errorCtx[0].substring(0, 150) : 'unknown'}`);
          }

          // Take periodic screenshots
          if (elapsed % 30 === 0) {
            await screenshot(page, `progress-${elapsed}s`);
          }
        }

        if (!completed) {
          console.log('  Analysis did not complete within 8 minutes');
          await screenshot(page, 'analysis-timeout');
        }

        // Step 7: Post-analysis state
        console.log('\nStep 7: Post-analysis state...');
        const finalText = await page.evaluate(() => document.body.innerText.substring(0, 800));
        console.log(`  Content: ${finalText.substring(0, 500)}`);
        await screenshot(page, 'post-analysis');

        // Check for claim drafting / compliance / export buttons
        const postButtons = await page.evaluate(() =>
          Array.from(document.querySelectorAll('button')).map(b => ({ text: b.innerText.trim(), disabled: b.disabled }))
        );
        console.log(`  Available buttons: ${JSON.stringify(postButtons)}`);

      } else {
        console.log('  No Run button found');
        await screenshot(page, 'no-run-button');
      }
    }

    // Step 8: Console errors
    console.log('\nStep 8: Console errors...');
    if (consoleErrors.length === 0) {
      console.log('  No console errors');
    } else {
      console.log(`  ${consoleErrors.length} error(s):`);
      consoleErrors.slice(0, 10).forEach((e, i) => console.log(`    ${i + 1}. ${e.substring(0, 200)}`));
    }

    console.log('\n=== E2E UI Test Complete ===');

  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    await screenshot(page, 'fatal-error').catch(() => {});
  } finally {
    await browser.close();
  }
})();
