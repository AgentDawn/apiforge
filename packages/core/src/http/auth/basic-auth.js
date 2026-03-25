/**
 * HTTP Basic authentication.
 */
export class BasicAuth {
  #username;
  #password;

  constructor(username, password) {
    this.#username = username;
    this.#password = password;
  }

  toAuthConfig() {
    return { type: 'basic', username: this.#username, password: this.#password };
  }

  applyToHeaders(headers = {}) {
    const encoded = btoa(`${this.#username}:${this.#password}`);
    return { ...headers, Authorization: `Basic ${encoded}` };
  }
}
