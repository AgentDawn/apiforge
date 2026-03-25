import { StorageInterface } from './storage-interface.js';

/**
 * In-memory storage. Useful for testing and temporary sessions.
 */
export class MemoryStorage extends StorageInterface {
  #data = new Map();

  async get(key) {
    const value = this.#data.get(key);
    return value !== undefined ? structuredClone(value) : null;
  }

  async set(key, value) {
    this.#data.set(key, structuredClone(value));
  }

  async delete(key) {
    this.#data.delete(key);
  }

  async list(prefix = '') {
    const keys = [];
    for (const key of this.#data.keys()) {
      if (key.startsWith(prefix)) keys.push(key);
    }
    return keys;
  }

  async clear() {
    this.#data.clear();
  }

  async has(key) {
    return this.#data.has(key);
  }
}
