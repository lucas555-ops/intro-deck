import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const files = [
  path.join(root, 'index.html'),
  path.join(root, 'privacy', 'index.html'),
  path.join(root, 'terms', 'index.html'),
  path.join(root, 'site.css')
];

for (const file of files) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing public surface file: ${path.relative(root, file)}`);
  }
}

const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const privacy = fs.readFileSync(path.join(root, 'privacy', 'index.html'), 'utf8');
const terms = fs.readFileSync(path.join(root, 'terms', 'index.html'), 'utf8');

const homeChecks = [
  'Intro Deck',
  'Private people directory and intro requests inside Telegram.',
  'https://t.me/introdeckbot',
  '/privacy',
  '/terms'
];

for (const needle of homeChecks) {
  if (!home.includes(needle)) {
    throw new Error(`Home surface is missing required text: ${needle}`);
  }
}

const privacyChecks = [
  'Privacy Policy',
  'LinkedIn sign-in',
  'Telegram identifiers',
  'notification receipts',
  '@introdeckbot'
];

for (const needle of privacyChecks) {
  if (!privacy.includes(needle)) {
    throw new Error(`Privacy surface is missing required text: ${needle}`);
  }
}

const termsChecks = [
  'Terms of Use',
  'private people directory',
  'spam, scraping, fraud, harassment, or unlawful activity',
  '@introdeckbot'
];

for (const needle of termsChecks) {
  if (!terms.includes(needle)) {
    throw new Error(`Terms surface is missing required text: ${needle}`);
  }
}

console.log('OK: public legal surfaces contract');
