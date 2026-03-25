import { SchemaResolver } from './schema-resolver.js';
import { SpecValidator } from './validator.js';

/**
 * OpenAPI 3.0 spec parser compatible with @nestjs/swagger output.
 * Handles multi-document specs, tag-based filtering, and $ref resolution.
 */
export class OpenApiParser {
  #spec = null;
  #resolved = null;

  /**
   * Parse an OpenAPI spec from JSON string or object.
   * @param {string|object} input - JSON string or parsed object
   * @returns {OpenApiParser} parser instance
   */
  static parse(input) {
    const parser = new OpenApiParser();
    parser.#spec = typeof input === 'string' ? JSON.parse(input) : structuredClone(input);
    return parser;
  }

  /**
   * Parse from a URL (fetches the spec).
   * @param {string} url - URL to fetch the spec from
   * @returns {Promise<OpenApiParser>}
   */
  static async fromUrl(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch spec from ${url}: ${response.status} ${response.statusText}`);
    }
    const spec = await response.json();
    return OpenApiParser.parse(spec);
  }

  /** @returns {object} raw spec object */
  getRawSpec() {
    return this.#spec;
  }

  /** @returns {object} spec with all $ref resolved */
  getResolvedSpec() {
    if (!this.#resolved) {
      const resolver = new SchemaResolver(this.#spec);
      this.#resolved = resolver.resolveAll();
    }
    return this.#resolved;
  }

  /** @returns {{ valid: boolean, errors: string[] }} */
  validate() {
    return SpecValidator.validate(this.#spec);
  }

  /** @returns {object} info object (title, version, description) */
  getInfo() {
    return this.#spec.info || {};
  }

  /** @returns {Array<{ url: string, description?: string }>} */
  getServers() {
    return this.#spec.servers || [];
  }

  /** @returns {object} security schemes from components */
  getSecuritySchemes() {
    return this.#spec.components?.securitySchemes || {};
  }

  /** @returns {string[]} all unique tags */
  getTags() {
    const tagSet = new Set();
    if (this.#spec.tags) {
      for (const tag of this.#spec.tags) {
        tagSet.add(tag.name);
      }
    }
    for (const [, methods] of Object.entries(this.#spec.paths || {})) {
      for (const [, operation] of Object.entries(methods)) {
        if (operation.tags) {
          for (const tag of operation.tags) {
            tagSet.add(tag);
          }
        }
      }
    }
    return [...tagSet];
  }

  /**
   * Get all endpoints.
   * @returns {Array<Endpoint>}
   */
  getEndpoints() {
    const endpoints = [];
    for (const [path, methods] of Object.entries(this.#spec.paths || {})) {
      for (const [method, operation] of Object.entries(methods)) {
        if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method)) {
          endpoints.push(this.#buildEndpoint(path, method, operation));
        }
      }
    }
    return endpoints;
  }

  /**
   * Get endpoints filtered by tags.
   * Matches the NestJS/Swagger tag-based filtering pattern.
   * @param {string[]} tags
   * @returns {Array<Endpoint>}
   */
  getEndpointsByTags(tags) {
    const tagSet = new Set(tags);
    return this.getEndpoints().filter(
      (ep) => ep.tags.some((t) => tagSet.has(t)),
    );
  }

  /**
   * Get endpoints grouped by tag.
   * @returns {Map<string, Array<Endpoint>>}
   */
  getEndpointsGroupedByTag() {
    const groups = new Map();
    for (const endpoint of this.getEndpoints()) {
      const tags = endpoint.tags.length > 0 ? endpoint.tags : ['untagged'];
      for (const tag of tags) {
        if (!groups.has(tag)) groups.set(tag, []);
        groups.get(tag).push(endpoint);
      }
    }
    return groups;
  }

  /**
   * Get a single endpoint detail.
   * @param {string} path
   * @param {string} method
   * @returns {Endpoint|null}
   */
  getEndpoint(path, method) {
    const operation = this.#spec.paths?.[path]?.[method.toLowerCase()];
    if (!operation) return null;
    return this.#buildEndpoint(path, method.toLowerCase(), operation);
  }

  /**
   * Get all schemas from components.
   * @returns {object}
   */
  getSchemas() {
    return this.#spec.components?.schemas || {};
  }

  /**
   * Get a single schema by name.
   * @param {string} name
   * @returns {object|null}
   */
  getSchema(name) {
    return this.#spec.components?.schemas?.[name] || null;
  }

  #buildEndpoint(path, method, operation) {
    return {
      path,
      method: method.toUpperCase(),
      operationId: operation.operationId || null,
      summary: operation.summary || '',
      description: operation.description || '',
      tags: operation.tags || [],
      deprecated: operation.deprecated || false,
      parameters: this.#extractParameters(operation, path),
      requestBody: this.#extractRequestBody(operation),
      responses: this.#extractResponses(operation),
      security: operation.security || this.#spec.security || [],
    };
  }

  #extractParameters(operation, path) {
    const params = [];
    // Path-level parameters
    const pathItem = this.#spec.paths?.[path];
    if (pathItem?.parameters) {
      for (const p of pathItem.parameters) {
        params.push(this.#resolveRef(p));
      }
    }
    // Operation-level parameters
    if (operation.parameters) {
      for (const p of operation.parameters) {
        params.push(this.#resolveRef(p));
      }
    }
    return params;
  }

  #extractRequestBody(operation) {
    if (!operation.requestBody) return null;
    const body = this.#resolveRef(operation.requestBody);
    return {
      required: body.required || false,
      content: body.content || {},
    };
  }

  #extractResponses(operation) {
    const responses = {};
    for (const [status, response] of Object.entries(operation.responses || {})) {
      const resolved = this.#resolveRef(response);
      responses[status] = {
        description: resolved.description || '',
        content: resolved.content || {},
      };
    }
    return responses;
  }

  #resolveRef(obj) {
    if (!obj || !obj.$ref) return obj;
    const refPath = obj.$ref.replace('#/', '').split('/');
    let current = this.#spec;
    for (const segment of refPath) {
      current = current?.[segment];
    }
    return current || obj;
  }
}
