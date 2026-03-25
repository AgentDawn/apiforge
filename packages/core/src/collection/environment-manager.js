import { randomUUID } from './utils.js';

/**
 * Manages environments (sets of key-value variables).
 */
export class EnvironmentManager {
  #storage;
  #activeId = null;

  constructor(storage) {
    this.#storage = storage;
  }

  /**
   * Create a new environment.
   * @param {string} name
   * @param {object} variables - key-value pairs
   * @returns {Promise<object>}
   */
  async create(name, variables = {}) {
    const env = {
      id: randomUUID(),
      name,
      variables: Object.entries(variables).map(([key, value]) => ({
        key,
        value: String(value),
        type: 'default',
        enabled: true,
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.#storage.set(`env:${env.id}`, env);

    // Update index
    const index = (await this.#storage.get('env:index')) || [];
    index.push({ id: env.id, name: env.name });
    await this.#storage.set('env:index', index);

    return env;
  }

  /**
   * Create environments from OpenAPI spec servers.
   * @param {Array<{url: string, description?: string}>} servers
   * @returns {Promise<object[]>}
   */
  async createFromServers(servers) {
    const envs = [];
    for (const server of servers) {
      const name = server.description || new URL(server.url).hostname;
      const env = await this.create(name, { baseUrl: server.url });
      envs.push(env);
    }
    return envs;
  }

  async list() {
    return (await this.#storage.get('env:index')) || [];
  }

  async get(id) {
    return this.#storage.get(`env:${id}`);
  }

  async getByName(name) {
    const index = await this.list();
    const entry = index.find((e) => e.name === name);
    if (!entry) return null;
    return this.get(entry.id);
  }

  async setVariable(envId, key, value, type = 'default') {
    const env = await this.get(envId);
    if (!env) throw new Error(`Environment not found: ${envId}`);

    const existing = env.variables.find((v) => v.key === key);
    if (existing) {
      existing.value = String(value);
      existing.type = type;
    } else {
      env.variables.push({ key, value: String(value), type, enabled: true });
    }
    env.updatedAt = new Date().toISOString();
    await this.#storage.set(`env:${envId}`, env);
    return env;
  }

  async setActive(id) {
    this.#activeId = id;
    await this.#storage.set('env:active', id);
  }

  async getActive() {
    if (!this.#activeId) {
      this.#activeId = await this.#storage.get('env:active');
    }
    if (!this.#activeId) return null;
    return this.get(this.#activeId);
  }

  /**
   * Get active environment as flat key-value object.
   * @returns {Promise<object>}
   */
  async getActiveVariables() {
    const env = await this.getActive();
    if (!env) return {};
    const vars = {};
    for (const v of env.variables) {
      if (v.enabled) vars[v.key] = v.value;
    }
    return vars;
  }

  async delete(id) {
    await this.#storage.delete(`env:${id}`);
    const index = await this.list();
    const filtered = index.filter((e) => e.id !== id);
    await this.#storage.set('env:index', filtered);
    if (this.#activeId === id) {
      this.#activeId = null;
      await this.#storage.delete('env:active');
    }
  }
}
