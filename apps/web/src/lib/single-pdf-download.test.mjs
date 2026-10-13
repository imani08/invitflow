import assert from 'node:assert/strict';
import test from 'node:test';
import { singlePdfItem } from './invitation-confirmation.mjs';
test('a single funded result has a direct PDF; pending, unpaid and grouped results do not',()=>{
  const batch={status:'COMPLETED',settledAt:'2026-10-13T10:00:00Z',settlementCredits:1,totalItems:1,completedItems:1,items:[{id:'test-item',status:'GENERATED',objectKey:'private.pdf'}]};
  assert.deepEqual(singlePdfItem(batch),{id:'test-item',status:'GENERATED',objectKey:'private.pdf'});
  for(const patch of [{status:'FINALIZING'},{settledAt:null},{settlementCredits:0},{totalItems:2},{completedItems:0},{items:[]}])assert.equal(singlePdfItem({...batch,...patch}),null);
  assert.equal(singlePdfItem(null),null);
});
