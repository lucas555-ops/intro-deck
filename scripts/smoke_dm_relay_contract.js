import fs from 'node:fs';

const renderSource = fs.readFileSync(new URL('../src/lib/telegram/render.js', import.meta.url), 'utf8');
const composerSource = fs.readFileSync(new URL('../src/bot/composers/dmComposer.js', import.meta.url), 'utf8');
const textComposerSource = fs.readFileSync(new URL('../src/bot/composers/textComposer.js', import.meta.url), 'utf8');

for (const fragment of [
  'renderDmInboxText',
  'renderDmInboxKeyboard',
  'renderDmThreadText',
  'renderDmThreadKeyboard',
  'dir:dm:',
  'dm:send:',
  'dm:pay:',
  'dm:acc:',
  'dm:dec:',
  'dm:blk:',
  'dm:rpt:'
]) {
  if (!renderSource.includes(fragment) && !composerSource.includes(fragment)) {
    throw new Error(`DM relay contract missing ${fragment}`);
  }
}

if (!textComposerSource.includes('applyDmComposeInput')) {
  throw new Error('Text composer must consume DM compose input sessions');
}

console.log('OK: dm relay contract');
