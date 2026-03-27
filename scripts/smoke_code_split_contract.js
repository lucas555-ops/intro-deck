import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const createBotPath = path.join(repoRoot, 'src', 'bot', 'createBot.js');
const createBotSource = fs.readFileSync(createBotPath, 'utf8');
const lineCount = createBotSource.trim().split('\n').length;

if (lineCount > 120) {
  throw new Error(`createBot.js should stay slim after STEP018; got ${lineCount} lines`);
}

const requiredImports = [
  './composers/homeComposer.js',
  './composers/profileComposer.js',
  './composers/directoryComposer.js',
  './composers/introComposer.js',
  './composers/textComposer.js',
  './surfaces/appSurfaces.js'
];

for (const expected of requiredImports) {
  if (!createBotSource.includes(expected)) {
    throw new Error(`createBot.js missing split import: ${expected}`);
  }
}

const requiredFiles = [
  'src/bot/composers/homeComposer.js',
  'src/bot/composers/profileComposer.js',
  'src/bot/composers/directoryComposer.js',
  'src/bot/composers/introComposer.js',
  'src/bot/composers/textComposer.js',
  'src/bot/surfaces/appSurfaces.js',
  'src/bot/utils/notices.js',
  'src/bot/utils/pendingInputs.js'
];

for (const relative of requiredFiles) {
  const full = path.join(repoRoot, relative);
  if (!fs.existsSync(full)) {
    throw new Error(`missing split runtime file: ${relative}`);
  }
}

console.log('OK: code split refactor baseline');
