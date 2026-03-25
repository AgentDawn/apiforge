import { VariableResolver } from '../collection/variable-resolver.js';

/**
 * Builds HTTP requests with variable resolution and auth support.
 */
export class RequestBuilder {
  #method = 'GET';
  #url = '';
  #headers = {};
  #queryParams = {};
  #pathParams = {};
  #body = null;
  #contentType = null;
  #auth = null;
  #timeout = 30000;

  setMethod(method) {
    this.#method = method.toUpperCase();
    return this;
  }

  setUrl(url) {
    this.#url = url;
    return this;
  }

  setHeaders(headers) {
    this.#headers = { ...this.#headers, ...headers };
    return this;
  }

  setHeader(key, value) {
    this.#headers[key] = value;
    return this;
  }

  setQueryParams(params) {
    this.#queryParams = { ...this.#queryParams, ...params };
    return this;
  }

  setPathParams(params) {
    this.#pathParams = { ...this.#pathParams, ...params };
    return this;
  }

  setBody(body, contentType = 'application/json') {
    this.#body = body;
    this.#contentType = contentType;
    return this;
  }

  setAuth(auth) {
    this.#auth = auth;
    return this;
  }

  setTimeout(ms) {
    this.#timeout = ms;
    return this;
  }

  /**
   * Resolve all {{variable}} placeholders using an environment.
   * @param {object} variables - key-value pairs
   * @returns {RequestBuilder}
   */
  resolveVariables(variables) {
    const resolver = new VariableResolver(variables);
    this.#url = resolver.resolve(this.#url);
    for (const [key, value] of Object.entries(this.#headers)) {
      this.#headers[key] = resolver.resolve(value);
    }
    for (const [key, value] of Object.entries(this.#queryParams)) {
      this.#queryParams[key] = resolver.resolve(value);
    }
    if (typeof this.#body === 'string') {
      this.#body = resolver.resolve(this.#body);
    }
    if (this.#auth?.token) {
      this.#auth = { ...this.#auth, token: resolver.resolve(this.#auth.token) };
    }
    return this;
  }

  /**
   * Build the final request object.
   * @returns {RequestConfig}
   */
  build() {
    let url = this.#url;

    // Replace path params: /users/{id} or /users/:id
    for (const [key, value] of Object.entries(this.#pathParams)) {
      url = url.replace(`{${key}}`, encodeURIComponent(value));
      url = url.replace(`:${key}`, encodeURIComponent(value));
    }

    // Append query params
    const queryEntries = Object.entries(this.#queryParams).filter(([, v]) => v !== '' && v != null);
    if (queryEntries.length > 0) {
      const search = new URLSearchParams(queryEntries).toString();
      url += (url.includes('?') ? '&' : '?') + search;
    }

    // Apply auth
    const headers = { ...this.#headers };
    if (this.#auth) {
      switch (this.#auth.type) {
        case 'bearer':
          headers['Authorization'] = `Bearer ${this.#auth.token}`;
          break;
        case 'basic': {
          const encoded = btoa(`${this.#auth.username}:${this.#auth.password}`);
          headers['Authorization'] = `Basic ${encoded}`;
          break;
        }
        case 'api-key':
          if (this.#auth.in === 'header') {
            headers[this.#auth.name] = this.#auth.value;
          }
          break;
      }
    }

    // Set content-type
    if (this.#body != null && this.#contentType && !headers['Content-Type']) {
      headers['Content-Type'] = this.#contentType;
    }

    // Serialize body
    let body = this.#body;
    if (body != null && typeof body === 'object' && this.#contentType === 'application/json') {
      body = JSON.stringify(body);
    }

    return {
      method: this.#method,
      url,
      headers,
      body,
      timeout: this.#timeout,
    };
  }

  /**
   * Create a RequestBuilder from an OpenAPI endpoint + spec.
   * @param {object} endpoint - parsed endpoint from OpenApiParser
   * @param {object} securitySchemes - from spec.components.securitySchemes
   * @returns {RequestBuilder}
   */
  static fromEndpoint(endpoint, securitySchemes = {}) {
    const builder = new RequestBuilder();
    builder.setMethod(endpoint.method);
    builder.setUrl(endpoint.path);

    // Set up parameters
    for (const param of endpoint.parameters || []) {
      if (param.in === 'query' && param.schema?.default !== undefined) {
        builder.#queryParams[param.name] = String(param.schema.default);
      }
    }

    // Set up auth from security schemes
    if (endpoint.security?.length > 0) {
      for (const secReq of endpoint.security) {
        for (const schemeName of Object.keys(secReq)) {
          const scheme = securitySchemes[schemeName];
          if (scheme?.type === 'http' && scheme?.scheme === 'bearer') {
            builder.setAuth({ type: 'bearer', token: '{{jwt_token}}' });
          } else if (scheme?.type === 'apiKey') {
            builder.setAuth({
              type: 'api-key',
              name: scheme.name,
              in: scheme.in,
              value: `{{${scheme.name}}}`,
            });
          }
        }
      }
    }

    return builder;
  }
}
