import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFilename, validateMime, validateOrigin } from './index.js';

describe('sanitizeFilename', () => {
  it('strips path separators', () => {
    assert.equal(sanitizeFilename('../../../etc/passwd'), '......etcpasswd');
  });
  it('replaces spaces with dashes', () => {
    assert.equal(sanitizeFilename('my photo.jpg'), 'my-photo.jpg');
  });
  it('strips non-ASCII characters', () => {
    assert.equal(sanitizeFilename('fête.jpg'), 'fte.jpg');
  });
  it('truncates to 128 chars', () => {
    const long = 'a'.repeat(200) + '.jpg';
    assert.equal(sanitizeFilename(long).length, 128);
  });
  it('leaves normal filenames unchanged', () => {
    assert.equal(sanitizeFilename('IMG_0001.jpg'), 'IMG_0001.jpg');
  });
});

describe('validateMime', () => {
  it('allows jpeg', () => assert.equal(validateMime('image/jpeg'), true));
  it('allows png',  () => assert.equal(validateMime('image/png'),  true));
  it('allows webp', () => assert.equal(validateMime('image/webp'), true));
  it('allows gif',  () => assert.equal(validateMime('image/gif'),  true));
  it('allows heic', () => assert.equal(validateMime('image/heic'), true));
  it('rejects pdf',  () => assert.equal(validateMime('application/pdf'), false));
  it('rejects text', () => assert.equal(validateMime('text/plain'), false));
  it('rejects empty', () => assert.equal(validateMime(''), false));
});

describe('validateOrigin', () => {
  it('allows reunion.klsll.com', () =>
    assert.equal(validateOrigin('https://reunion.klsll.com'), true));
  it('rejects other origins', () =>
    assert.equal(validateOrigin('https://evil.com'), false));
  it('rejects null origin', () =>
    assert.equal(validateOrigin(null), false));
});
