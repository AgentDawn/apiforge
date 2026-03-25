/**
 * Bearer token (JWT) authentication.
 * Compatible with NestJS addBearerAuth({ scheme: 'bearer', bearerFormat: 'JWT', type: 'http' }, 'JWT')
 */
export class BearerAuth {
  #token;

  constructor(token) {
    this.#token = token;
  }

  /** @returns {{ type: string, token: string }} */
  toAuthConfig() {
    return { type: 'bearer', token: this.#token };
  }

  /**
   * Apply auth to request headers.
   * @param {object} headers
   * @returns {object} headers with Authorization added
   */
  applyToHeaders(headers = {}) {
    return { ...headers, Authorization: `Bearer ${this.#token}` };
  }

  /** Create from OpenAPI security scheme */
  static fromSecurityScheme(scheme) {
    if (scheme.type === 'http' && scheme.scheme === 'bearer') {
      return new BearerAuth('');
    }
    return null;
  }
}
