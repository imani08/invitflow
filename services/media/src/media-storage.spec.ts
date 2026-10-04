import assert from 'node:assert/strict';
import test from 'node:test';
import { parseListObjectsPage } from './media-storage.js';

test('parses real S3 ListObjectsV2 page sizes and escaped object keys', () => {
  const page = parseListObjectsPage('<ListBucketResult><Contents><Key>assets/one&amp;two</Key><Size>17</Size></Contents><Contents><Key>pdf/invitation.pdf</Key><Size>0</Size></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>opaque&amp;token</NextContinuationToken></ListBucketResult>');
  assert.deepEqual(page.objects, [{ key: 'assets/one&two', sizeBytes: 17 }, { key: 'pdf/invitation.pdf', sizeBytes: 0 }]);
  assert.equal(page.isTruncated, true);
  assert.equal(page.nextContinuationToken, 'opaque&token');
});

test('rejects malformed ListObjectsV2 object sizes instead of reporting partial totals as exact', () => {
  assert.throws(() => parseListObjectsPage('<ListBucketResult><Contents><Key>broken</Key><Size>-1</Size></Contents></ListBucketResult>'));
  assert.throws(() => parseListObjectsPage('<Error>AccessDenied</Error>'));
});
