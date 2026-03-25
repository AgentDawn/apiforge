/**
 * API Key authentication (header or query parameter).
 */
export class ApiKeyAuth {
  #name;
  #value;
  #in;

  constructor(name, value, location = 'header') {
    this.#name = name;
    this.#value = value;
    this.#in = location;
  }

  toAuthConfig() {
    return { type: 'api-key', name: this.#name, value: this.#value, in: this.#in };
  }

  applyToHeaders(headers = {}) {
    if (this.#in === 'header') {
      return { ...headers, [this.#name]: this.#value };
    }
    return headers;
  }

  applyToQuery(params = {}) {
    if (this.#in === 'query') {
      return { ...params, [this.#name]: this.#value };
    }
    return params;
  }
}
