/**
 * Resolves {{variable}} placeholders in strings.
 * Supports nested resolution and default values: {{var:default}}.
 */
export class VariableResolver {
  #variables;

  /**
   * @param {object} variables - key-value pairs
   */
  constructor(variables = {}) {
    this.#variables = variables;
  }

  /**
   * Resolve all {{variable}} placeholders in a string.
   * Supports {{var:defaultValue}} syntax.
   * @param {string} template
   * @returns {string}
   */
  resolve(template) {
    if (typeof template !== 'string') return template;
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const [varName, defaultValue] = key.split(':').map((s) => s.trim());
      if (varName in this.#variables) {
        return String(this.#variables[varName]);
      }
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      return match; // Leave unresolved
    });
  }

  /**
   * Check if a string contains unresolved variables.
   * @param {string} template
   * @returns {string[]} list of unresolved variable names
   */
  getUnresolved(template) {
    if (typeof template !== 'string') return [];
    const unresolved = [];
    template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const varName = key.split(':')[0].trim();
      if (!(varName in this.#variables)) {
        unresolved.push(varName);
      }
      return match;
    });
    return unresolved;
  }

  /**
   * Update or add variables.
   * @param {object} variables
   */
  setVariables(variables) {
    this.#variables = { ...this.#variables, ...variables };
  }

  getVariables() {
    return { ...this.#variables };
  }
}
