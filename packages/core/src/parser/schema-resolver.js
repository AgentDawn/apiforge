/**
 * Resolves $ref pointers in an OpenAPI spec, handling circular references.
 */
export class SchemaResolver {
  #spec;
  #resolved = new Map();
  #resolving = new Set();

  constructor(spec) {
    this.#spec = spec;
  }

  /**
   * Resolve all $ref in the spec.
   * @returns {object} fully resolved spec
   */
  resolveAll() {
    return this.#deepResolve(structuredClone(this.#spec));
  }

  /**
   * Resolve a single $ref string.
   * @param {string} ref - e.g. "#/components/schemas/UserDto"
   * @returns {object}
   */
  resolve(ref) {
    if (this.#resolved.has(ref)) return this.#resolved.get(ref);
    if (this.#resolving.has(ref)) {
      // Circular reference - return a placeholder
      return { $circular: ref };
    }

    this.#resolving.add(ref);
    const path = ref.replace('#/', '').split('/');
    let current = this.#spec;
    for (const segment of path) {
      current = current?.[decodeURIComponent(segment)];
      if (current === undefined) {
        this.#resolving.delete(ref);
        return null;
      }
    }

    const resolved = this.#deepResolve(structuredClone(current));
    this.#resolved.set(ref, resolved);
    this.#resolving.delete(ref);
    return resolved;
  }

  #deepResolve(obj) {
    if (obj === null || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map((item) => this.#deepResolve(item));
    }

    if (obj.$ref) {
      return this.resolve(obj.$ref);
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = this.#deepResolve(value);
    }
    return result;
  }
}
