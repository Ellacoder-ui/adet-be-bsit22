import test from 'node:test';
import assert from 'node:assert/strict';

try {
  await import('../src/index.ts');
  assert.ok(true, 'backend entrypoint loaded');
} catch (error) {
  assert.fail(`backend entrypoint is missing or not runnable: ${error.message}`);
}

test('backend entrypoint should be available', () => {
  assert.ok(true);
});
