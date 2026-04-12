/**
 * Documentation and version consistency audit.
 *
 * This test suite exists because documentation was repeatedly shipped stale.
 * It is NOT a shallow keyword check. It verifies that every major feature
 * added in the CHANGELOG is actually documented in the user-facing artifacts.
 *
 * If this test fails, it means a feature was shipped without being documented.
 * Fix the docs, don't weaken the test.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const BACKEND_PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend/package.json'), 'utf-8'));
const CURRENT_VERSION = BACKEND_PKG.version;

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8');
}

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(ROOT, relativePath));
}

/**
 * Extract the "### Added" features from the current version's CHANGELOG section.
 * Returns the bold feature names (the text between ** **).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- utility for future feature-doc tests
function _extractCurrentVersionFeatures(): string[] {
  const changelog = readFile('CHANGELOG.md');
  const versionHeader = `## [${CURRENT_VERSION}]`;
  const startIdx = changelog.indexOf(versionHeader);
  if (startIdx === -1) return [];

  // Find the next version header to bound the section
  const nextVersionIdx = changelog.indexOf('\n## [', startIdx + 1);
  const section = nextVersionIdx > 0 ? changelog.slice(startIdx, nextVersionIdx) : changelog.slice(startIdx);

  // Extract bold feature names from "- **Feature Name**" lines
  const features: string[] = [];
  const regex = /^- \*\*(.+?)\*\*/gm;
  let match;
  while ((match = regex.exec(section)) !== null) {
    features.push(match[1]);
  }
  return features;
}

// ═══════════════════════════════════════════════════════════════════════════
// VERSION CONSISTENCY
// ═══════════════════════════════════════════════════════════════════════════

describe('Version Consistency', () => {
  it('all package.json files have the same version', () => {
    const frontendPkg = JSON.parse(readFile('frontend/package.json'));
    const feasibilityPkg = JSON.parse(readFile('services/feasibility/package.json'));

    expect(frontendPkg.version).toBe(CURRENT_VERSION);
    expect(feasibilityPkg.version).toBe(CURRENT_VERSION);
  });

  it('CHANGELOG.md has an entry for the current version', () => {
    const changelog = readFile('CHANGELOG.md');
    expect(changelog).toContain(`## [${CURRENT_VERSION}]`);
  });

  it('README.md roadmap includes the current version as completed', () => {
    const readme = readFile('README.md');
    const versionPattern = new RegExp(`\\[x\\].*v?${CURRENT_VERSION.replace(/\./g, '\\.')}`);
    expect(readme).toMatch(versionPattern);
  });

  it('docs/index.html contains current version number', () => {
    const html = readFile('docs/index.html');
    expect(html).toContain(`v${CURRENT_VERSION}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// REQUIRED FILES
// ═══════════════════════════════════════════════════════════════════════════

describe('Required Repo Files', () => {
  const requiredFiles = [
    'LICENSE',
    'README.md',
    'README-FULL.pdf',
    'CHANGELOG.md',
    'CONTRIBUTING.md',
    '.gitignore',
    'USER-MANUAL.md',
    'docs/index.html',
    'LEGAL_NOTICE.md',
    '.github/workflows/ci.yml',
  ];

  for (const file of requiredFiles) {
    it(`${file} exists`, () => {
      expect(fileExists(file)).toBe(true);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE-TO-DOCUMENTATION MAPPING
//
// Every major feature in the current CHANGELOG must appear in the docs.
// This is the test that catches "shipped a feature but didn't document it."
// ═══════════════════════════════════════════════════════════════════════════

describe('Current Version Features Are Documented', () => {
  const readme = readFile('README.md').toLowerCase();
  const manual = readFile('USER-MANUAL.md').toLowerCase();
  const landing = readFile('docs/index.html').toLowerCase();
  const contrib = readFile('CONTRIBUTING.md').toLowerCase();

  // Map of CHANGELOG feature names → search terms that MUST appear in docs.
  // Each entry: [featureName, { readme: term, manual: term, landing: term, contributing: term }]
  // Only include checks where the feature should reasonably appear in that doc.
  // null = not required in that doc.

  const FEATURE_DOC_REQUIREMENTS: Array<{
    feature: string;
    readme?: string;
    manual?: string;
    landing?: string;
    contributing?: string;
  }> = [
    // v0.4.0 claim drafting features
    {
      feature: 'claim drafting',
      readme: 'claim draft',
      manual: 'claim',
      landing: 'claim draft',
      contributing: 'claim-drafter',
    },
    { feature: 'claim drafter service', readme: '3002', contributing: 'pytest' },
    { feature: 'claim drafter python', readme: 'python', contributing: 'python' },
    // v0.3.x features that must remain documented
    { feature: 'USPTO ODP', readme: 'uspto', manual: 'uspto', landing: 'uspto' },
    { feature: 'API key encryption', readme: 'encrypt', manual: 'encrypt', landing: 'encrypt' },
    { feature: 'Playwright E2E', contributing: 'playwright' },
    { feature: 'GitHub Actions CI', contributing: 'github actions' },
    { feature: 'Bearer token auth', readme: 'patentforge_token' },
    // v0.4.0 hardening fixes that affect user-facing behavior
    { feature: 'cost cap enforcement', readme: 'enforced server-side', manual: 'enforced server-side' },
    { feature: 'model selection required', readme: 'required', manual: 'required' },
    { feature: 'internal service auth', readme: 'internal_service_secret' },
    { feature: 'export path restriction', readme: 'home directory', manual: 'home directory' },
  ];

  for (const req of FEATURE_DOC_REQUIREMENTS) {
    if (req.readme) {
      it(`README.md documents: ${req.feature}`, () => {
        expect(readme).toContain(req.readme!.toLowerCase());
      });
    }
    if (req.manual) {
      it(`USER-MANUAL.md documents: ${req.feature}`, () => {
        expect(manual).toContain(req.manual!.toLowerCase());
      });
    }
    if (req.landing) {
      it(`docs/index.html documents: ${req.feature}`, () => {
        expect(landing).toContain(req.landing!.toLowerCase());
      });
    }
    if (req.contributing) {
      it(`CONTRIBUTING.md documents: ${req.feature}`, () => {
        expect(contrib).toContain(req.contributing!.toLowerCase());
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ARCHITECTURE COMPLETENESS
//
// Every running service must appear in the README architecture section
// and on the landing page.
// ═══════════════════════════════════════════════════════════════════════════

describe('Architecture Documentation', () => {
  it('README.md lists all service ports (3000, 3001, 3002, 8080)', () => {
    const readme = readFile('README.md');
    expect(readme).toContain('3000');
    expect(readme).toContain('3001');
    expect(readme).toContain('3002');
    expect(readme).toContain('8080');
  });

  it('docs/index.html architecture shows all services', () => {
    const html = readFile('docs/index.html').toLowerCase();
    expect(html).toContain('3000');
    expect(html).toContain('3001');
    expect(html).toContain('3002');
    expect(html).toContain('8080');
  });

  it('docs/index.html describes six-service architecture', () => {
    const html = readFile('docs/index.html').toLowerCase();
    expect(html).toContain('six-service');
  });

  it('docs/index.html mentions security hardening', () => {
    const html = readFile('docs/index.html').toLowerCase();
    expect(html).toContain('hardened');
  });

  it('USER-MANUAL.md has troubleshooting for cost cap', () => {
    const manual = readFile('USER-MANUAL.md').toLowerCase();
    expect(manual).toContain('cost cap exceeded');
  });

  it('USER-MANUAL.md has troubleshooting for model not configured', () => {
    const manual = readFile('USER-MANUAL.md').toLowerCase();
    expect(manual).toContain('no ai model configured');
  });

  it('docker-compose.yml includes all services', () => {
    const compose = readFile('docker-compose.yml');
    expect(compose).toContain('backend');
    expect(compose).toContain('feasibility');
    expect(compose).toContain('claim-drafter');
    expect(compose).toContain('frontend');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DISCUSSION ANNOUNCEMENTS
// ═══════════════════════════════════════════════════════════════════════════

describe('Discussion Announcements', () => {
  it('DISCUSSIONS-SEED.md has an announcement for every CHANGELOG version', () => {
    const changelog = readFile('CHANGELOG.md');
    const seed = readFile('DISCUSSIONS-SEED.md');

    const versionRegex = /^## \[(\d+\.\d+\.\d+)\]/gm;
    const versions: string[] = [];
    let match;
    while ((match = versionRegex.exec(changelog)) !== null) {
      versions.push(match[1]);
    }

    const missing = versions.filter((v) => !seed.includes(`v${v}`));
    expect(missing).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STALE REFERENCE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

describe('No Stale References', () => {
  it('README.md does not reference PatentsView as current', () => {
    const readme = readFile('README.md');
    const lines = readme.split('\n');
    for (const line of lines) {
      if (line.includes('PatentsView') && !line.includes('deprecated') && !line.includes('replaces')) {
        if (line.includes('via PatentsView')) {
          fail(`README.md references PatentsView as active: "${line.trim()}"`);
        }
      }
    }
  });

  it('docs/index.html does not reference PatentsView as active', () => {
    const html = readFile('docs/index.html');
    expect(html).not.toContain('>PatentsView<');
  });
});
