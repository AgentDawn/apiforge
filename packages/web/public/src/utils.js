// APIForge - Shared utility functions

// UTF-8 safe Base64 encoding (btoa crashes on non-ASCII)
function utf8ToBase64(str) {
  return btoa(Array.from(new TextEncoder().encode(str), b => String.fromCharCode(b)).join(''));
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Environment Variable Substitution ───────────────────
/**
 * Replace {{variableName}} patterns with values from the active environment.
 * Built-in variables (prefixed with $) are resolved dynamically.
 * Undefined variables are left as-is.
 */
function substituteVariables(text, variables) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/\{\{([a-zA-Z0-9_.$-]+)\}\}/g, (match, varName) => {
    // Built-in dynamic variables
    if (varName === '$timestamp') return String(Math.floor(Date.now() / 1000));
    if (varName === '$isoDate') return new Date().toISOString();
    if (varName === '$randomUUID') return crypto.randomUUID();
    if (varName === '$randomInt') return String(Math.floor(Math.random() * 1000) + 1);
    // User-defined variables
    if (variables && varName in variables) return String(variables[varName]);
    return match; // leave as-is if undefined
  });
}
