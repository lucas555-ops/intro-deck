import { strict as assert } from 'node:assert';
import {
  buildContactUnlockInvoicePayload,
  parseContactUnlockInvoicePayload
} from '../src/lib/storage/contactUnlockStore.js';

const payload = buildContactUnlockInvoicePayload(123);
assert.equal(payload, 'cu:123');
assert.deepEqual(parseContactUnlockInvoicePayload(payload), { requestId: 123 });
assert.equal(parseContactUnlockInvoicePayload('other:1'), null);
assert.equal(parseContactUnlockInvoicePayload('cu:nope'), null);

console.log('OK: contact unlock payment payload contract');
