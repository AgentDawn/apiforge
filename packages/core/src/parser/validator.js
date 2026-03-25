/**
 * Validates OpenAPI 3.0 specs for structural correctness.
 */
export class SpecValidator {
  /**
   * Validate an OpenAPI spec.
   * @param {object} spec
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validate(spec) {
    const errors = [];

    if (!spec || typeof spec !== 'object') {
      return { valid: false, errors: ['Spec must be a non-null object'] };
    }

    // Check OpenAPI version
    if (!spec.openapi) {
      errors.push('Missing required field: openapi');
    } else if (!spec.openapi.startsWith('3.')) {
      errors.push(`Unsupported OpenAPI version: ${spec.openapi}. Only 3.x is supported.`);
    }

    // Check info
    if (!spec.info) {
      errors.push('Missing required field: info');
    } else {
      if (!spec.info.title) errors.push('Missing required field: info.title');
      if (!spec.info.version) errors.push('Missing required field: info.version');
    }

    // Check paths
    if (!spec.paths) {
      errors.push('Missing required field: paths');
    } else {
      for (const [path, methods] of Object.entries(spec.paths)) {
        if (!path.startsWith('/')) {
          errors.push(`Path must start with /: ${path}`);
        }
        SpecValidator.#validatePathItem(path, methods, errors);
      }
    }

    // Validate components schemas if present
    if (spec.components?.schemas) {
      for (const [name, schema] of Object.entries(spec.components.schemas)) {
        if (!schema || typeof schema !== 'object') {
          errors.push(`Invalid schema: components/schemas/${name}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  static #validatePathItem(path, pathItem, errors) {
    const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
    for (const [key, value] of Object.entries(pathItem)) {
      if (key === 'parameters' || key === 'summary' || key === 'description') continue;
      if (key === '$ref') continue;
      if (!httpMethods.includes(key)) continue;

      // Validate operation
      if (!value.responses || Object.keys(value.responses).length === 0) {
        errors.push(`Operation ${key.toUpperCase()} ${path} must have at least one response`);
      }
    }
  }
}
