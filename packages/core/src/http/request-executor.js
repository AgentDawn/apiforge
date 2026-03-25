/**
 * Executes HTTP requests using the Fetch API.
 * Works in both browser and Node.js (18+).
 */
export class RequestExecutor {
  /**
   * Execute a built request.
   * @param {RequestConfig} request - from RequestBuilder.build()
   * @returns {Promise<ResponseResult>}
   */
  async execute(request) {
    const startTime = performance.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeout || 30000);

    try {
      const fetchOptions = {
        method: request.method,
        headers: request.headers,
        signal: controller.signal,
      };

      if (request.body != null && !['GET', 'HEAD'].includes(request.method)) {
        fetchOptions.body = request.body;
      }

      const response = await fetch(request.url, fetchOptions);
      const endTime = performance.now();

      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const contentType = response.headers.get('content-type') || '';
      let body;
      if (contentType.includes('application/json')) {
        try {
          body = await response.json();
        } catch {
          body = await response.text();
        }
      } else {
        body = await response.text();
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body,
        timing: {
          total: Math.round(endTime - startTime),
        },
        size: typeof body === 'string' ? new TextEncoder().encode(body).length : JSON.stringify(body).length,
        ok: response.ok,
      };
    } catch (error) {
      const endTime = performance.now();

      if (error.name === 'AbortError') {
        return {
          status: 0,
          statusText: 'Timeout',
          headers: {},
          body: null,
          timing: { total: Math.round(endTime - startTime) },
          size: 0,
          ok: false,
          error: `Request timed out after ${request.timeout || 30000}ms`,
        };
      }

      return {
        status: 0,
        statusText: 'Error',
        headers: {},
        body: null,
        timing: { total: Math.round(endTime - startTime) },
        size: 0,
        ok: false,
        error: error.message,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
