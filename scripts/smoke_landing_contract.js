import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(process.cwd());
const indexHtml = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
const siteCss = fs.readFileSync(path.join(repoRoot, 'site.css'), 'utf8');
const privacyHtml = fs.readFileSync(path.join(repoRoot, 'privacy', 'index.html'), 'utf8');
const termsHtml = fs.readFileSync(path.join(repoRoot, 'terms', 'index.html'), 'utf8');

const requiredIndexSnippets = [
  'Trusted intros and direct contact',
  'id="how-it-works"',
  'A simple path from identity to conversation.',
  'Five moments that define the product.',
  'A more deliberate system for professional access.',
  'What people usually want to know.',
  'Open @introdeckbot'
];

for (const snippet of requiredIndexSnippets) {
  if (!indexHtml.includes(snippet)) {
    throw new Error(`Landing missing required snippet: ${snippet}`);
  }
}

const requiredCssSnippets = [
  '.hero-grid',
  '.bridge-grid',
  '.steps-grid-five',
  '.workflow-grid',
  '.cta-panel'
];

for (const snippet of requiredCssSnippets) {
  if (!siteCss.includes(snippet)) {
    throw new Error(`site.css missing required selector: ${snippet}`);
  }
}

for (const html of [privacyHtml, termsHtml]) {
  if (!html.includes('Open @introdeckbot')) {
    throw new Error('Legal surface missing bot CTA');
  }
  if (!html.includes('footer')) {
    throw new Error('Legal surface missing footer');
  }
}

console.log('landing contract smoke passed');


const orderChecks = [
  'id="how-it-works"',
  'id="workflow"',
  'id="why-better"',
  'id="for-whom"',
  'id="faq"'
].map((snippet) => indexHtml.indexOf(snippet));

for (let i = 1; i < orderChecks.length; i += 1) {
  if (orderChecks[i - 1] === -1 || orderChecks[i] === -1 || orderChecks[i - 1] >= orderChecks[i]) {
    throw new Error('Landing section order drifted from STEP050F canon');
  }
}
