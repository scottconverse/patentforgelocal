const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let stepNum = 0;
async function screenshot(page, name) {
  stepNum++;
  const fname = `${String(stepNum).padStart(2, '0')}-${name}.png`;
  const fpath = path.join(SCREENSHOTS_DIR, fname);
  await page.screenshot({ path: fpath, fullPage: true });
  console.log(`  [screenshot] ${fname}`);
  return fpath;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  console.log('=== PatentForgeLocal Windows E2E UI Test ===\n');
  const errors = [];

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  try {
    // === Step 1: Navigate to homepage ===
    console.log('Step 1: Navigate to homepage...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 15000 });
    console.log(`  Title: ${await page.title()}`);
    await screenshot(page, 'homepage');

    // === Step 2: Accept Terms of Use ===
    console.log('\nStep 2: Accept Terms of Use...');
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('Terms of Use')) {
      console.log('  ToU modal detected, looking for accept button...');
      // Find all buttons and look for accept/agree
      const btnTexts = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim())
      );
      console.log(`  Buttons: ${JSON.stringify(btnTexts)}`);

      // Click the accept button
      const accepted = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const acceptBtn = buttons.find(b =>
          /accept|agree|continue|acknowledge|understand/i.test(b.innerText)
        );
        if (acceptBtn) { acceptBtn.click(); return true; }
        return false;
      });
      if (accepted) {
        console.log('  Clicked accept button');
        await sleep(2000);
        await screenshot(page, 'after-tou');
      } else {
        // Maybe it's a checkbox + button combo
        console.log('  No accept button found, trying checkbox...');
        const checkedAndClicked = await page.evaluate(() => {
          const checkboxes = document.querySelectorAll('input[type="checkbox"]');
          checkboxes.forEach(cb => { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); });
          // Now try buttons again
          const buttons = Array.from(document.querySelectorAll('button'));
          const btn = buttons.find(b => !b.disabled);
          if (btn) { btn.click(); return true; }
          return false;
        });
        console.log(`  Checkbox approach: ${checkedAndClicked}`);
        await sleep(2000);
        await screenshot(page, 'after-tou-checkbox');
      }
    } else {
      console.log('  No ToU modal detected');
    }

    // === Step 3: Check project list ===
    console.log('\nStep 3: Check project list...');
    await sleep(1000);
    const pageContent = await page.evaluate(() => document.body.innerText.substring(0, 1000));
    console.log(`  Page content: ${pageContent.substring(0, 300)}`);
    await screenshot(page, 'project-list');

    // Look for the project
    const projectFound = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('AI-Powered Garden Irrigation') || text.includes('Irrigation');
    });
    console.log(`  Project "AI-Powered Garden Irrigation Controller" visible: ${projectFound}`);

    if (projectFound) {
      // Click on the project
      console.log('  Clicking on project...');
      const clicked = await page.evaluate(() => {
        // Try finding a link or clickable element with the project name
        const allElements = document.querySelectorAll('a, tr, div, button, [role="button"], [class*="card"], [class*="row"], [class*="item"]');
        for (const el of allElements) {
          if (el.innerText && el.innerText.includes('Irrigation')) {
            el.click();
            return el.tagName + ': ' + el.innerText.substring(0, 50);
          }
        }
        return null;
      });
      console.log(`  Clicked: ${clicked}`);
      await sleep(2000);
      console.log(`  URL after click: ${page.url()}`);
      await screenshot(page, 'project-detail');
    } else {
      console.log('  Project not found in list. Current page content:');
      const fullText = await page.evaluate(() => document.body.innerText);
      console.log(fullText.substring(0, 500));
    }

    // === Step 4: Project detail page ===
    console.log('\nStep 4: Project detail page...');
    const detailContent = await page.evaluate(() => document.body.innerText.substring(0, 800));
    console.log(`  Detail content: ${detailContent.substring(0, 400)}`);
    await screenshot(page, 'project-detail-full');

    // Find buttons on project page
    const detailButtons = await page.evaluate(() =>
      Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.innerText.trim(),
        disabled: b.disabled
      }))
    );
    console.log(`  Buttons: ${JSON.stringify(detailButtons)}`);

    // === Step 5: Run Feasibility Analysis ===
    console.log('\nStep 5: Run Feasibility Analysis...');
    const runClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const runBtn = buttons.find(b =>
        /run|start|analyze|feasibility/i.test(b.innerText) && !b.disabled
      );
      if (runBtn) { runBtn.click(); return runBtn.innerText.trim(); }
      return null;
    });

    if (runClicked) {
      console.log(`  Clicked: "${runClicked}"`);
      await sleep(3000);
      await screenshot(page, 'analysis-started');

      // === Step 6: Monitor progress ===
      console.log('\nStep 6: Monitoring analysis progress (up to 5 minutes)...');
      let completed = false;
      for (let i = 0; i < 30; i++) {
        await sleep(10000);
        const progressText = await page.evaluate(() => document.body.innerText);
        const stageMatches = progressText.match(/stage|step|phase|running|complete|done|error|fail/gi) || [];
        const elapsed = (i + 1) * 10;
        console.log(`  [${elapsed}s] Signals: ${stageMatches.slice(0, 5).join(', ') || 'none'}`);
        await screenshot(page, `progress-${String(elapsed).padStart(3, '0')}s`);

        if (/all.*complete|analysis.*complete|feasibility.*complete|all.*done/i.test(progressText)) {
          console.log('  Analysis complete!');
          completed = true;
          break;
        }
        if (/error|failed/i.test(progressText) && !/no errors/i.test(progressText)) {
          console.log('  Error detected in progress text');
          const errorSnippet = progressText.match(/.{0,100}(error|fail).{0,100}/i);
          if (errorSnippet) console.log(`  Error context: ${errorSnippet[0]}`);
        }
      }

      if (!completed) {
        console.log('  Analysis did not complete within 5 minutes');
      }
      await screenshot(page, 'analysis-final');
    } else {
      console.log('  No Run/Analyze button found');
      await screenshot(page, 'no-run-button');
    }

    // === Step 7: Check for claim drafting ===
    console.log('\nStep 7: Check for claim drafting...');
    const claimBtn = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find(b => /claim|draft/i.test(b.innerText) && !b.disabled);
      return btn ? btn.innerText.trim() : null;
    });
    if (claimBtn) {
      console.log(`  Found claim button: "${claimBtn}"`);
    } else {
      console.log('  No claim drafting button available yet');
    }

    // === Step 8: Final state ===
    console.log('\nStep 8: Final state...');
    const finalText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
    console.log(`  Final content: ${finalText.substring(0, 400)}`);
    await screenshot(page, 'final-state');

    // === Step 9: Console errors ===
    console.log('\nStep 9: Console errors...');
    if (errors.length === 0) {
      console.log('  No console errors');
    } else {
      console.log(`  ${errors.length} console error(s):`);
      errors.forEach((e, i) => console.log(`    ${i + 1}. ${e.substring(0, 200)}`));
    }

    console.log('\n=== E2E UI Test Complete ===');

  } catch (err) {
    console.error(`\nFATAL ERROR: ${err.message}`);
    await screenshot(page, 'fatal-error').catch(() => {});
  } finally {
    await browser.close();
  }
})();
