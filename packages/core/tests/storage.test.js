import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorage } from '../src/storage/memory-storage.js';

describe('MemoryStorage', () => {
  let storage;
  beforeEach(() => { storage = new MemoryStorage(); });

  it('should set and get a value', async () => {
    await storage.set('key1', { data: 'test' });
    const result = await storage.get('key1');
    assert.deepEqual(result, { data: 'test' });
  });

  it('should return null for missing key', async () => {
    assert.equal(await storage.get('nonexistent'), null);
  });

  it('should delete a key', async () => {
    await storage.set('key1', 'value');
    await storage.delete('key1');
    assert.equal(await storage.get('key1'), null);
  });

  it('should list keys by prefix', async () => {
    await storage.set('env:1', 'a');
    await storage.set('env:2', 'b');
    await storage.set('col:1', 'c');
    const envKeys = await storage.list('env:');
    assert.equal(envKeys.length, 2);
  });

  it('should clear all keys', async () => {
    await storage.set('a', 1);
    await storage.set('b', 2);
    await storage.clear();
    assert.equal(await storage.get('a'), null);
  });

  it('should return deep clones', async () => {
    const obj = { nested: { value: 1 } };
    await storage.set('obj', obj);
    const result = await storage.get('obj');
    result.nested.value = 999;
    const result2 = await storage.get('obj');
    assert.equal(result2.nested.value, 1);
  });
});
