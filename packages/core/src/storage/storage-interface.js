/**
 * Abstract storage interface. All storage adapters must implement these methods.
 */
export class StorageInterface {
  async get(key) { throw new Error('Not implemented'); }
  async set(key, value) { throw new Error('Not implemented'); }
  async delete(key) { throw new Error('Not implemented'); }
  async list(prefix) { throw new Error('Not implemented'); }
  async clear() { throw new Error('Not implemented'); }
  async has(key) { throw new Error('Not implemented'); }
}
