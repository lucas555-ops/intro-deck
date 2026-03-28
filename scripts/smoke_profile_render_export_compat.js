import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const renderSource = readFileSync(new URL('../src/lib/telegram/render.js', import.meta.url), 'utf8');
const profileComposerSource = readFileSync(new URL('../src/bot/composers/profileComposer.js', import.meta.url), 'utf8');
const textComposerSource = readFileSync(new URL('../src/bot/composers/textComposer.js', import.meta.url), 'utf8');

assert.ok(renderSource.includes('export function renderProfilePreviewKeyboard('), 'renderProfilePreviewKeyboard export must exist');
assert.ok(profileComposerSource.includes('renderProfilePreviewKeyboard'), 'profileComposer must import preview keyboard for compatibility');
assert.ok(textComposerSource.includes('renderProfilePreviewKeyboard'), 'textComposer must import preview keyboard for compatibility');
assert.ok(!profileComposerSource.includes('renderProfileSavedKeyboard'), 'profileComposer must not depend on renderProfileSavedKeyboard');
assert.ok(!textComposerSource.includes('renderProfileSavedKeyboard'), 'textComposer must not depend on renderProfileSavedKeyboard');
console.log('OK: profile render export compatibility holds');
