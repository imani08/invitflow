import assert from 'node:assert/strict';
import test from 'node:test';
import { canEventTransition, eventLifecycleAction } from './event-lifecycle.js';

test('only explicit lifecycle actions can complete, archive, or restore an event', () => {
  assert.equal(eventLifecycleAction('PUBLISHED', 'complete'), 'COMPLETED');
  assert.equal(eventLifecycleAction('COMPLETED', 'archive'), 'ARCHIVED');
  assert.equal(eventLifecycleAction('ARCHIVED', 'restore'), 'COMPLETED');
  assert.equal(eventLifecycleAction('DRAFT', 'archive'), null);
  assert.equal(canEventTransition('PUBLISHED', 'ARCHIVED'), false);
});
