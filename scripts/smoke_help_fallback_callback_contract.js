import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/bot/surfaces/appSurfaces.js', import.meta.url), 'utf8');

const required = [
  "callback_data: 'p:menu'",
  "callback_data: 'dir:list:0'",
  "callback_data: 'intro:inbox'",
  "callback_data: 'home:root'"
];

for (const token of required) {
  if (!source.includes(token)) {
    throw new Error(`Missing fallback help callback contract token: ${token}`);
  }
}

const forbidden = [
  "callback_data: 'nav:profile'",
  "callback_data: 'dir:open'",
  "callback_data: 'nav:home'"
];

for (const token of forbidden) {
  if (source.includes(token)) {
    throw new Error(`Found stale fallback help callback token: ${token}`);
  }
}

console.log('OK: help fallback callback contract');
