import { StorageInterface } from './storage-interface.js';
import { readFile, writeFile, unlink, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * File-based JSON storage for CLI and Desktop.
 * Each key is stored as a separate JSON file.
 */
export class FileStorage extends StorageInterface {
  #dir;

  /**
   * @param {string} dir - Directory to store files in
   */
  constructor(dir) {
    super();
    this.#dir = dir;
  }

  async #ensureDir() {
    if (!existsSync(this.#dir)) {
      await mkdir(this.#dir, { recursive: true });
    }
  }

  #keyToPath(key) {
    // Sanitize key for filename
    const safe = key.replace(/[^a-zA-Z0-9_:-]/g, '_');
    return join(this.#dir, `${safe}.json`);
  }

  async get(key) {
    const path = this.#keyToPath(key);
    try {
      const data = await readFile(path, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  async set(key, value) {
    await this.#ensureDir();
    const path = this.#keyToPath(key);
    await writeFile(path, JSON.stringify(value, null, 2), 'utf-8');
  }

  async delete(key) {
    const path = this.#keyToPath(key);
    try {
      await unlink(path);
    } catch {
      // File doesn't exist, ignore
    }
  }

  async list(prefix = '') {
    await this.#ensureDir();
    const files = await readdir(this.#dir);
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', '').replace(/_/g, ':'))
      .filter((key) => key.startsWith(prefix));
  }

  async clear() {
    await this.#ensureDir();
    const files = await readdir(this.#dir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        await unlink(join(this.#dir, file));
      }
    }
  }

  async has(key) {
    const path = this.#keyToPath(key);
    return existsSync(path);
  }
}
