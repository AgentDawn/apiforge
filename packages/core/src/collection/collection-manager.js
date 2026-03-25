import { randomUUID } from './utils.js';

/**
 * Manages API collections (groups of requests organized by tag/folder).
 */
export class CollectionManager {
  #storage;

  constructor(storage) {
    this.#storage = storage;
  }

  /**
   * Create a new empty collection.
   * @param {string} name
   * @param {string} [description]
   * @returns {Promise<object>}
   */
  async create(name, description = '') {
    const collection = {
      id: randomUUID(),
      name,
      description,
      version: '1.0.0',
      source: null,
      auth: null,
      items: [],
      variables: [],
      preRequestScript: '',
      testScript: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.#storage.set(`col:${collection.id}`, collection);
    await this.#updateIndex(collection.id, collection.name);
    return collection;
  }

  /**
   * Import collection from a parsed OpenAPI spec.
   * Groups endpoints by tags into folders.
   * @param {import('../parser/openapi-parser.js').OpenApiParser} parser
   * @param {string} [name]
   * @returns {Promise<object>}
   */
  async importFromSpec(parser, name) {
    const info = parser.getInfo();
    const servers = parser.getServers();
    const securitySchemes = parser.getSecuritySchemes();
    const grouped = parser.getEndpointsGroupedByTag();

    const collection = await this.create(
      name || info.title || 'Imported API',
      info.description || '',
    );

    collection.source = {
      type: 'openapi',
      specVersion: parser.getRawSpec().openapi,
    };
    collection.version = info.version || '1.0.0';

    // Set default auth from security schemes (NestJS Bearer JWT pattern)
    for (const [, scheme] of Object.entries(securitySchemes)) {
      if (scheme.type === 'http' && scheme.scheme === 'bearer') {
        collection.auth = { type: 'bearer', bearer: { token: '{{jwt_token}}' } };
        break;
      }
    }

    // Set server as base URL variable
    if (servers.length > 0) {
      collection.variables.push({
        key: 'baseUrl',
        value: servers[0].url,
        enabled: true,
      });
    }

    // Create folders from tags, with requests inside
    for (const [tag, endpoints] of grouped) {
      const folder = {
        id: randomUUID(),
        type: 'folder',
        name: tag,
        items: [],
      };

      for (const endpoint of endpoints) {
        const request = this.#endpointToRequest(endpoint, servers);
        folder.items.push({
          id: randomUUID(),
          type: 'request',
          request,
        });
      }

      collection.items.push(folder);
    }

    collection.updatedAt = new Date().toISOString();
    await this.#storage.set(`col:${collection.id}`, collection);
    return collection;
  }

  async list() {
    return (await this.#storage.get('col:index')) || [];
  }

  async get(id) {
    return this.#storage.get(`col:${id}`);
  }

  async getByName(name) {
    const index = await this.list();
    const entry = index.find((e) => e.name === name);
    if (!entry) return null;
    return this.get(entry.id);
  }

  async delete(id) {
    await this.#storage.delete(`col:${id}`);
    const index = await this.list();
    const filtered = index.filter((e) => e.id !== id);
    await this.#storage.set('col:index', filtered);
  }

  /**
   * Find a request in a collection by path (e.g., "folder/request name").
   * @param {string} collectionId
   * @param {string} requestPath - "folderName/requestName" or "requestName"
   * @returns {Promise<object|null>}
   */
  async findRequest(collectionId, requestPath) {
    const col = await this.get(collectionId);
    if (!col) return null;

    const parts = requestPath.split('/').map((s) => s.trim());
    if (parts.length === 1) {
      return this.#findInItems(col.items, parts[0]);
    }

    const [folderName, ...rest] = parts;
    const folder = col.items.find(
      (item) => item.type === 'folder' && item.name === folderName,
    );
    if (!folder) return null;
    return this.#findInItems(folder.items, rest.join('/'));
  }

  #findInItems(items, name) {
    for (const item of items) {
      if (item.type === 'request') {
        const reqName = item.request?.name || '';
        if (reqName === name || reqName.includes(name)) return item.request;
      }
      if (item.type === 'folder' && item.items) {
        const found = this.#findInItems(item.items, name);
        if (found) return found;
      }
    }
    return null;
  }

  #endpointToRequest(endpoint, servers) {
    const baseUrl = servers.length > 0 ? '{{baseUrl}}' : '';
    return {
      id: randomUUID(),
      name: endpoint.summary || `${endpoint.method} ${endpoint.path}`,
      description: endpoint.description || '',
      method: endpoint.method,
      url: `${baseUrl}${endpoint.path}`,
      headers: [],
      params: {
        query: (endpoint.parameters || [])
          .filter((p) => p.in === 'query')
          .map((p) => ({
            key: p.name,
            value: p.schema?.default !== undefined ? String(p.schema.default) : '',
            description: p.description || '',
            required: p.required || false,
            enabled: p.required || false,
          })),
        path: (endpoint.parameters || [])
          .filter((p) => p.in === 'path')
          .map((p) => ({
            key: p.name,
            value: '',
            description: p.description || '',
            required: true,
            enabled: true,
          })),
      },
      body: this.#extractBody(endpoint),
      auth: { type: 'inherit' },
      openapi: {
        operationId: endpoint.operationId,
        tags: endpoint.tags,
        deprecated: endpoint.deprecated,
      },
      preRequestScript: '',
      testScript: '',
    };
  }

  #extractBody(endpoint) {
    if (!endpoint.requestBody) {
      return { mode: 'none', json: null, raw: '' };
    }
    const jsonContent = endpoint.requestBody.content?.['application/json'];
    if (jsonContent) {
      return { mode: 'json', json: null, raw: '' };
    }
    return { mode: 'raw', json: null, raw: '' };
  }

  async #updateIndex(id, name) {
    const index = (await this.#storage.get('col:index')) || [];
    const existing = index.findIndex((e) => e.id === id);
    if (existing >= 0) {
      index[existing].name = name;
    } else {
      index.push({ id, name });
    }
    await this.#storage.set('col:index', index);
  }
}
