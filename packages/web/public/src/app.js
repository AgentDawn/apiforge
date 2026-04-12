// APIForge Web UI - Main Application
// Vanilla JS, no framework dependencies

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── State ────────────────────────────────────────────────
let bodyEditor;
let responseEditor;
let appState = {
  spec: null,
  specHash: null,
  collections: [],
  endpoints: [],
  environments: [],
  activeEnv: null,
  selectedEndpoint: null,
  viewMode: 'client',
  isSpecMode: false,
  bodyType: 'none',
  bodyValues: {
    json: '',
    'form-urlencoded': [],
    'form-data': [],
    raw: '',
    rawContentType: 'text/plain',
    xml: '',
  },
  tabs: [],
  activeTabId: null,
  serverHistory: [],
};

// ─── Simple Hash Utility ──────────────────────────────────
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

// ─── Tab Switching ────────────────────────────────────────
function initTabs() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      ['params', 'headers', 'body', 'auth'].forEach((id) => {
        const el = $(`#tab-${id}`);
        if (el) el.classList.toggle('hidden', id !== target);
      });
    });
  });
}

// ─── Body Type Switching ─────────────────────────────────
function initBodyTypes() {
  const selector = document.querySelector('[data-testid="body-type-selector"]');
  if (!selector) return;
  selector.addEventListener('click', (e) => {
    const btn = e.target.closest('.body-type-btn');
    if (!btn) return;
    const type = btn.dataset.type;
    switchBodyType(type);
  });

  // Form URL-Encoded add button
  const addUrlEncoded = document.querySelector('[data-testid="form-urlencoded-add"]');
  if (addUrlEncoded) {
    addUrlEncoded.addEventListener('click', () => addKvRow('form-urlencoded'));
  }

  // Form Data add button
  const addFormData = document.querySelector('[data-testid="form-data-add"]');
  if (addFormData) {
    addFormData.addEventListener('click', () => addKvRow('form-data'));
  }
}

function switchBodyType(type) {
  // Save current values before switching
  saveCurrentBodyValues();
  appState.bodyType = type;

  // Update button states
  $$('.body-type-btn').forEach((b) => b.classList.toggle('active', b.dataset.type === type));

  // Toggle visibility
  const noneWrap = $('#body-none');
  const jsonWrap = $('#body-editor-wrap');
  const formUrlEncoded = $('#body-form-urlencoded');
  const formData = $('#body-form-data');
  const rawWrap = $('#body-raw-wrap');
  const xmlWrap = $('#body-xml-wrap');

  if (noneWrap) noneWrap.classList.toggle('hidden', type !== 'none');
  if (jsonWrap) jsonWrap.classList.toggle('hidden', type !== 'json');
  if (formUrlEncoded) formUrlEncoded.classList.toggle('hidden', type !== 'form-urlencoded');
  if (formData) formData.classList.toggle('hidden', type !== 'form-data');
  if (rawWrap) rawWrap.classList.toggle('hidden', type !== 'raw');
  if (xmlWrap) xmlWrap.classList.toggle('hidden', type !== 'xml');

  // Restore values for the target type
  restoreBodyValues(type);

  // Auto-update Content-Type header based on body type
  if (type === 'none') {
    // Remove Content-Type header when no body
    const rows = document.querySelectorAll('[data-testid="header-row"]');
    for (const tr of rows) {
      const k = tr.querySelector('.header-key');
      if (k && k.value.trim().toLowerCase() === 'content-type') {
        tr.remove();
        break;
      }
    }
  } else {
    const ctMap = { json: 'application/json', 'form-urlencoded': 'application/x-www-form-urlencoded', xml: 'application/xml', raw: ($('#raw-content-type')?.value || 'text/plain') };
    if (ctMap[type]) {
      setHeaderValue('Content-Type', ctMap[type]);
    }
  }
}

function saveCurrentBodyValues() {
  const type = appState.bodyType;
  if (type === 'json') {
    appState.bodyValues.json = bodyEditor.getValue();
  } else if (type === 'form-urlencoded') {
    appState.bodyValues['form-urlencoded'] = readKvTable('form-urlencoded');
  } else if (type === 'form-data') {
    appState.bodyValues['form-data'] = readKvTable('form-data');
  } else if (type === 'raw') {
    const rawEditor = $('#body-raw-editor');
    const rawCt = $('#raw-content-type');
    if (rawEditor) appState.bodyValues.raw = rawEditor.value;
    if (rawCt) appState.bodyValues.rawContentType = rawCt.value;
  } else if (type === 'xml') {
    const xmlEditor = $('#body-xml-editor');
    if (xmlEditor) appState.bodyValues.xml = xmlEditor.value;
  }
}

function restoreBodyValues(type) {
  if (type === 'json') {
    // Already shown by JsonEditor
  } else if (type === 'form-urlencoded') {
    renderKvTable('form-urlencoded', appState.bodyValues['form-urlencoded']);
  } else if (type === 'form-data') {
    renderKvTable('form-data', appState.bodyValues['form-data']);
  } else if (type === 'raw') {
    const rawEditor = $('#body-raw-editor');
    const rawCt = $('#raw-content-type');
    if (rawEditor) rawEditor.value = appState.bodyValues.raw || '';
    if (rawCt) rawCt.value = appState.bodyValues.rawContentType || 'text/plain';
  } else if (type === 'xml') {
    const xmlEditor = $('#body-xml-editor');
    if (xmlEditor) xmlEditor.value = appState.bodyValues.xml || '';
  }
}

function readKvTable(type) {
  const tableId = type === 'form-urlencoded' ? 'form-urlencoded-table' : 'form-data-table';
  const tbody = document.querySelector('[data-testid="' + tableId + '"] tbody');
  if (!tbody) return [];
  const rows = [];
  tbody.querySelectorAll('tr').forEach((tr) => {
    const inputs = tr.querySelectorAll('.kv-input');
    const entry = { key: inputs[0]?.value || '', value: '' };
    if (type === 'form-data') {
      const typeToggle = tr.querySelector('.kv-type-toggle');
      entry.type = typeToggle?.value || 'text';
      if (entry.type === 'file') {
        const fileInput = tr.querySelector('input[type="file"]');
        entry.file = fileInput?.files?.[0] || null;
        entry.value = '';
      } else {
        entry.value = inputs[1]?.value || '';
      }
    } else {
      entry.value = inputs[1]?.value || '';
    }
    rows.push(entry);
  });
  return rows;
}

function renderKvTable(type, data) {
  const tableId = type === 'form-urlencoded' ? 'form-urlencoded-table' : 'form-data-table';
  const tbody = document.querySelector('[data-testid="' + tableId + '"] tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!data || data.length === 0) {
    addKvRow(type);
    return;
  }
  data.forEach((entry) => addKvRow(type, entry));
}

function addKvRow(type, entry) {
  const tableId = type === 'form-urlencoded' ? 'form-urlencoded-table' : 'form-data-table';
  const tbody = document.querySelector('[data-testid="' + tableId + '"] tbody');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.setAttribute('data-testid', 'kv-row');

  if (type === 'form-data') {
    const entryType = entry?.type || 'text';
    tr.innerHTML =
      '<td><input class="kv-input" data-testid="kv-key" placeholder="Key" value="' + escAttr(entry?.key || '') + '"></td>' +
      '<td><select class="kv-type-toggle" data-testid="kv-type-toggle"><option value="text"' + (entryType === 'text' ? ' selected' : '') + '>Text</option><option value="file"' + (entryType === 'file' ? ' selected' : '') + '>File</option></select></td>' +
      '<td class="kv-value-cell">' + (entryType === 'file'
        ? '<input type="file" class="kv-input" data-testid="kv-file">'
        : '<input class="kv-input" data-testid="kv-value" placeholder="Value" value="' + escAttr(entry?.value || '') + '">') +
      '</td>' +
      '<td><button class="kv-delete" data-testid="kv-delete">&times;</button></td>';

    // Type toggle handler
    const typeToggle = tr.querySelector('.kv-type-toggle');
    typeToggle.addEventListener('change', () => {
      const cell = tr.querySelector('.kv-value-cell');
      if (typeToggle.value === 'file') {
        cell.innerHTML = '<input type="file" class="kv-input" data-testid="kv-file">';
      } else {
        cell.innerHTML = '<input class="kv-input" data-testid="kv-value" placeholder="Value" value="">';
      }
    });
  } else {
    tr.innerHTML =
      '<td><input class="kv-input" data-testid="kv-key" placeholder="Key" value="' + escAttr(entry?.key || '') + '"></td>' +
      '<td><input class="kv-input" data-testid="kv-value" placeholder="Value" value="' + escAttr(entry?.value || '') + '"></td>' +
      '<td><button class="kv-delete" data-testid="kv-delete">&times;</button></td>';
  }

  // Delete handler
  tr.querySelector('.kv-delete').addEventListener('click', () => {
    tr.remove();
  });

  tbody.appendChild(tr);
}

function escAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function getBodyForSend() {
  const type = appState.bodyType;
  if (type === 'none') {
    return { body: undefined, contentType: null, isFormData: false };
  } else if (type === 'json') {
    return { body: bodyEditor.getValue().trim() || undefined, contentType: 'application/json', isFormData: false };
  } else if (type === 'form-urlencoded') {
    const rows = readKvTable('form-urlencoded');
    const pairs = rows.filter((r) => r.key).map((r) => encodeURIComponent(r.key) + '=' + encodeURIComponent(r.value));
    return { body: pairs.length ? pairs.join('&') : undefined, contentType: 'application/x-www-form-urlencoded', isFormData: false };
  } else if (type === 'form-data') {
    const rows = readKvTable('form-data');
    const fd = new FormData();
    let hasData = false;
    rows.forEach((r) => {
      if (!r.key) return;
      if (r.type === 'file' && r.file) {
        fd.append(r.key, r.file);
        hasData = true;
      } else if (r.type !== 'file' && r.value) {
        fd.append(r.key, r.value);
        hasData = true;
      }
    });
    return { body: hasData ? fd : undefined, contentType: null, isFormData: true };
  } else if (type === 'raw') {
    const rawEditor = $('#body-raw-editor');
    const rawCt = $('#raw-content-type');
    const text = rawEditor?.value?.trim() || '';
    return { body: text || undefined, contentType: rawCt?.value || 'text/plain', isFormData: false };
  } else if (type === 'xml') {
    const xmlEditor = $('#body-xml-editor');
    const text = xmlEditor?.value?.trim() || '';
    return { body: text || undefined, contentType: 'application/xml', isFormData: false };
  }
  return { body: undefined, contentType: 'application/json', isFormData: false };
}

function detectBodyTypeFromSpec(ep) {
  if (!ep?.requestBody?.content) return null;
  const contentTypes = Object.keys(ep.requestBody.content);
  if (contentTypes.includes('multipart/form-data')) return 'form-data';
  if (contentTypes.includes('application/x-www-form-urlencoded')) return 'form-urlencoded';
  if (contentTypes.includes('application/json')) return 'json';
  if (contentTypes.includes('application/xml') || contentTypes.includes('text/xml')) return 'xml';
  if (contentTypes.length > 0) return 'raw';
  return null;
}

function populateFormFieldsFromSchema(type, schema, spec) {
  if (!schema) return;
  const resolved = schema.$ref ? resolveRef(schema, spec) : schema;
  if (!resolved || resolved.type !== 'object' || !resolved.properties) return;
  const rows = Object.entries(resolved.properties).map(([key, prop]) => ({
    key,
    value: prop.example !== undefined ? String(prop.example) : '',
    type: (prop.type === 'string' && prop.format === 'binary') ? 'file' : 'text',
  }));
  renderKvTable(type, rows);
}

// ─── Spec Import ──────────────────────────────────────────
function initImport() {
  const fileInput = $('#spec-file-input');
  const importBtn = $('#import-file-btn');

  importBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (file.name.endsWith('.proto')) {
        loadProto(text);
      } else if (file.name.endsWith('.fbs')) {
        loadFbs(text, file.name);
      } else {
        const spec = JSON.parse(text);
        loadSpec(spec, { specMode: true });
      }
    } catch (err) {
      alert('Failed to parse spec: ' + err.message);
    }
  });
}

function loadSpec(spec, options) {
  const previousHash = appState.specHash;
  appState.spec = spec;
  // Compute and store spec hash for change detection
  appState.specHash = simpleHash(JSON.stringify(spec));
  // Default to spec mode (docs-first) unless explicitly set to false
  appState.isSpecMode = (options && options.specMode === false) ? false : true;
  appState._protoRaw = null;
  hideGrpcBar();
  const title = spec.info?.title || 'Untitled API';
  void spec.info?.version;

  // Extract endpoints
  const endpoints = [];
  const paths = spec.paths || {};
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(method)) {
        endpoints.push({
          method: method.toUpperCase(),
          path,
          summary: operation.summary || '',
          description: operation.description || '',
          tags: operation.tags || ['Default'],
          operationId: operation.operationId || '',
          parameters: operation.parameters || [],
          requestBody: operation.requestBody || null,
          responses: operation.responses || {},
          security: operation.security || [],
          deprecated: operation.deprecated || false,
          xApiforgeExamples: operation['x-apiforge-examples'] || null,
        });
      }
    }
  }
  appState.endpoints = endpoints;

  // Don't auto-create environments from spec servers
  // Environments should be managed by the user via CLI or UI
  appState.environments = [];

  renderCollectionTree(title, endpoints);
  renderEnvironments();
  renderSavedCollections();
  switchSidebarView('docs');
  updateSidebarCounts();

  // Reset docs view on new spec
  if ($('#docs-content')) { $('#docs-content').classList.add('hidden'); }
  if ($('#docs-empty')) { $('#docs-empty').classList.remove('hidden'); }

  // Enable collection buttons (1-3)
  const saveBtn = $('#save-collection-btn');
  const delBtn = $('#delete-collection-btn');
  if (saveBtn) saveBtn.disabled = false;
  if (delBtn) delBtn.disabled = false;

  // Spec change detection: mark stale/removed tabs on re-import of the SAME spec
  // Only check when the same spec title is re-loaded (not when switching collections)
  if (previousHash && previousHash !== appState.specHash) {
    const newEndpointKeys = new Set(endpoints.map((e) => e.method + ' ' + e.path));
    appState.tabs.forEach((tab) => {
      if (tab.source && tab.source.createdFromSpec) {
        if (!newEndpointKeys.has(tab.source.endpointKey)) {
          tab.source.stale = true;
          tab.source.removed = true;
        } else if (tab.source.specHash !== appState.specHash) {
          tab.source.stale = true;
          tab.source.removed = false;
        }
      }
    });
    renderTabBar();
  }
}

// ─── Proto / gRPC Support ─────────────────────────────────
function loadProto(protoText) {
  const parser = window.ProtoParser.parse(protoText);
  const spec = parser.toSpec();
  const endpoints = parser.toEndpoints();

  appState.spec = spec;
  appState.endpoints = endpoints;
  appState.environments = [];
  appState._protoRaw = protoText;
  appState.isSpecMode = true;

  const title = spec.info?.title || 'gRPC Service';
  renderCollectionTree(title, endpoints);
  renderEnvironments();

  // Reset docs view on new spec
  if ($('#docs-content')) { $('#docs-content').classList.add('hidden'); }
  if ($('#docs-empty')) { $('#docs-empty').classList.remove('hidden'); }

  // Show gRPC target bar
  const grpcBar = $('#grpc-target-bar');
  if (grpcBar) {
    grpcBar.classList.remove('hidden');
    grpcBar.style.display = 'flex';
  }

  // Restore saved gRPC target (2-2)
  const savedTarget = localStorage.getItem('apiforge-grpc-target');
  if (savedTarget) {
    const targetInput = $('#grpc-target');
    if (targetInput && !targetInput.value) targetInput.value = savedTarget;
  }

  // Enable collection buttons (1-3)
  const saveBtn = $('#save-collection-btn');
  const delBtn = $('#delete-collection-btn');
  if (saveBtn) saveBtn.disabled = false;
  if (delBtn) delBtn.disabled = false;
}

function hideGrpcBar() {
  const grpcBar = $('#grpc-target-bar');
  if (grpcBar) {
    grpcBar.classList.add('hidden');
    grpcBar.style.display = 'none';
  }
}

// ─── FlatBuffers (.fbs) Support ───────────────────────────
function loadFbs(fbsText, filename) {
  const parsed = window.FbsParser.parse(fbsText);

  // Build endpoints from tables (FBS has no RPCs, so tables are explorable items)
  const endpoints = [];
  for (const table of parsed.tables) {
    const isRoot = table.name === parsed.rootType;
    const example = window.FbsParser.generateExample(parsed, table.name);
    const schema = { type: 'object', properties: {} };
    for (const field of table.fields) {
      if (field.isArray) {
        schema.properties[field.name] = { type: 'array', items: { type: fbsTypeToJsonType(field.type) } };
      } else {
        schema.properties[field.name] = { type: fbsTypeToJsonType(field.type) };
      }
    }

    endpoints.push({
      method: 'FBS',
      path: (parsed.namespace ? parsed.namespace + '.' : '') + table.name,
      summary: table.name + (isRoot ? ' (root)' : ''),
      description: 'FlatBuffers table' + (isRoot ? ' — root_type' : ''),
      tags: ['Tables'],
      operationId: table.name,
      parameters: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema,
            example,
          },
        },
      },
      responses: {},
      security: [],
      deprecated: false,
      _fbs: {
        table: table.name,
        namespace: parsed.namespace,
        isRoot,
        fields: table.fields,
      },
    });
  }

  // Add enum entries as explorable items
  for (const enumDef of parsed.enums) {
    endpoints.push({
      method: 'FBS',
      path: (parsed.namespace ? parsed.namespace + '.' : '') + enumDef.name,
      summary: enumDef.name,
      description: 'FlatBuffers enum (' + enumDef.underlyingType + '): ' + enumDef.values.map((v) => v.name + '=' + v.value).join(', '),
      tags: ['Enums'],
      operationId: enumDef.name,
      parameters: [],
      requestBody: null,
      responses: {},
      security: [],
      deprecated: false,
      _fbs: {
        enum: enumDef.name,
        namespace: parsed.namespace,
        values: enumDef.values,
      },
    });
  }

  const schemaName = parsed.namespace
    ? parsed.namespace.split('.')[0]
    : (filename || 'FlatBuffers').replace(/\.fbs$/, '');

  const spec = {
    info: {
      title: schemaName,
      version: 'fbs',
      description: 'FlatBuffers schema' + (parsed.namespace ? ' — ' + parsed.namespace : ''),
    },
    openapi: 'FBS',
    _fbs: true,
    _fbsRaw: fbsText,
    _fbsParsed: parsed,
    paths: {},
    servers: [],
  };
  for (const ep of endpoints) {
    spec.paths[ep.path] = { fbs: ep };
  }

  appState.spec = spec;
  appState.endpoints = endpoints;
  appState.environments = [];
  appState._protoRaw = null;
  appState.isSpecMode = true;

  const title = 'FBS: ' + schemaName;
  renderCollectionTree(title, endpoints);
  renderEnvironments();

  // Reset docs view
  if ($('#docs-content')) { $('#docs-content').classList.add('hidden'); }
  if ($('#docs-empty')) { $('#docs-empty').classList.remove('hidden'); }

  hideGrpcBar();

  // Enable collection buttons
  const saveBtn = $('#save-collection-btn');
  const delBtn = $('#delete-collection-btn');
  if (saveBtn) saveBtn.disabled = false;
  if (delBtn) delBtn.disabled = false;
}

function fbsTypeToJsonType(fbsType) {
  const map = {
    'bool': 'boolean',
    'byte': 'integer', 'ubyte': 'integer',
    'short': 'integer', 'ushort': 'integer',
    'int': 'integer', 'uint': 'integer',
    'long': 'string', 'ulong': 'string',
    'int8': 'integer', 'uint8': 'integer',
    'int16': 'integer', 'uint16': 'integer',
    'int32': 'integer', 'uint32': 'integer',
    'int64': 'string', 'uint64': 'string',
    'float': 'number', 'float32': 'number',
    'double': 'number', 'float64': 'number',
    'string': 'string',
  };
  return map[fbsType] || 'object';
}

// ─── Request Body Examples ────────────────────────────────
const EXAMPLES_STORAGE_KEY = 'apiforge-examples';
const COLLECTIONS_STORAGE_KEY = 'apiforge-saved-collections';

// ─── Collections Auto-Save ───────────────────────────────
function generateCollectionId() {
  return 'col-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

function generateRequestId() {
  return 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

function saveCollections() {
  try {
    localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(appState.collections));
  } catch { /* ignore storage errors */ }
}

function loadCollections() {
  try {
    const saved = localStorage.getItem(COLLECTIONS_STORAGE_KEY);
    if (saved) appState.collections = JSON.parse(saved);
  } catch { appState.collections = []; }
}

function getOrCreateCollectionRequest(specTitle, endpoint, example) {
  // Find or create collection
  let collection = appState.collections.find((c) => c.sourceSpec === specTitle);
  if (!collection) {
    collection = { id: generateCollectionId(), name: specTitle, sourceSpec: specTitle, requests: [] };
    appState.collections.push(collection);
  }

  // Build request name
  const exName = (example && example.name) ? example.name : 'Default';
  const reqName = endpoint.method + ' ' + endpoint.path + ' (' + exName + ')';

  // Find or create request
  let request = collection.requests.find((r) => r.name === reqName);
  if (!request) {
    request = {
      id: generateRequestId(),
      name: reqName,
      method: endpoint.method,
      url: endpoint.path,
      headers: (example && example.headers) ? example.headers : [],
      body: (example && example.body) ? example.body : '',
      bodyType: (example && example.bodyType) ? example.bodyType : 'json',
      params: (example && example.params) ? example.params : {},
      auth: (example && example.auth) ? example.auth : {},
      endpointKey: endpoint.method + ' ' + endpoint.path,
      exampleName: exName,
      history: [],
      lastResponse: null,
      updatedAt: new Date().toISOString(),
    };
    collection.requests.push(request);
  } else {
    // Update existing request with latest example data
    if (example) {
      if (example.headers) request.headers = example.headers;
      if (example.body) request.body = example.body;
      if (example.bodyType) request.bodyType = example.bodyType;
      if (example.params) request.params = example.params;
      if (example.auth) request.auth = example.auth;
    }
    request.updatedAt = new Date().toISOString();
  }

  saveCollections();
  return { collection, request };
}

function updateCollectionRequestFromTab(tab) {
  if (!tab || !tab.collectionRequestId || !tab.collectionId) return;
  const collection = appState.collections.find((c) => c.id === tab.collectionId);
  if (!collection) return;
  const request = collection.requests.find((r) => r.id === tab.collectionRequestId);
  if (!request) return;

  request.method = tab.method || request.method;
  request.url = tab.url || request.url;
  request.headers = tab.headers || request.headers;
  request.body = tab.body || request.body;
  request.bodyType = tab.bodyType || request.bodyType;
  request.updatedAt = new Date().toISOString();

  saveCollections();
}

function saveResponseToCollection(tab, status, body, timing) {
  if (!tab || !tab.collectionRequestId || !tab.collectionId) return;
  const collection = appState.collections.find((c) => c.id === tab.collectionId);
  if (!collection) return;
  const request = collection.requests.find((r) => r.id === tab.collectionRequestId);
  if (!request) return;

  request.lastResponse = { status, body, timing };
  request.updatedAt = new Date().toISOString();

  // Add history entry
  if (!request.history) request.history = [];
  const historyEntry = {
    id: 'hist-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
    timestamp: new Date().toISOString(),
    request: {
      method: tab.method || $('#method-select')?.value || 'GET',
      url: tab.url || $('#url-input')?.value || '',
      headers: tab.headers || {},
      body: tab.body || null,
    },
    response: {
      status: status,
      statusText: status >= 200 && status < 300 ? 'OK' : status >= 400 && status < 500 ? 'Client Error' : status >= 500 ? 'Server Error' : 'Unknown',
      body: body,
      timing: timing,
      size: body ? new Blob([body]).size : 0,
    },
  };
  request.history.unshift(historyEntry);
  // Cap at 50 entries
  if (request.history.length > 50) {
    request.history = request.history.slice(0, 50);
  }

  saveCollections();
  renderSavedCollections();
  switchSidebarView('collections');
  updateHistoryCount();

  // Sync to server
  syncHistoryToServer(historyEntry);
}

async function syncHistoryToServer(entry) {
  if (!window.apiFetchGlobal) return;
  try {
    const envName = appState.activeEnv?.name || '';
    const authType = window.appAuthState?.token ? 'bearer' : (window._connectorToken ? 'connector' : 'none');
    await window.apiFetchGlobal('/api/history', {
      method: 'POST',
      body: JSON.stringify({
        id: entry.id,
        method: entry.request.method,
        url: entry.request.url,
        status: entry.response.status,
        timing_ms: entry.response.timing || 0,
        request_body: typeof entry.request.body === 'string' ? entry.request.body : JSON.stringify(entry.request.body || ''),
        response_body: typeof entry.response.body === 'string' ? entry.response.body.slice(0, 10000) : '',
        source: 'web',
        environment: envName,
        auth_type: authType,
      }),
    });
  } catch { /* server may be unavailable */ }
}

function renderSavedCollections() {
  const container = $('#saved-collections-tree');
  if (!container) return;
  container.innerHTML = '';

  if (!appState.collections || appState.collections.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'saved-collection-empty';
    empty.textContent = 'No saved requests yet. Click an example or "Try it" to start.';
    container.appendChild(empty);
    return;
  }

  for (const col of appState.collections) {
    const folder = document.createElement('div');
    folder.className = 'saved-collection-folder';
    folder.dataset.testid = 'saved-collection-' + col.id;

    const nameEl = document.createElement('div');
    nameEl.className = 'saved-collection-name';
    nameEl.innerHTML = '<span class="folder-icon">&#9660;</span> ' + escapeHtml(col.name) + ' <span class="badge">' + col.requests.length + '</span>';

    const itemsEl = document.createElement('div');
    itemsEl.className = 'saved-collection-items';

    let itemsVisible = true;
    nameEl.addEventListener('click', () => {
      itemsVisible = !itemsVisible;
      itemsEl.classList.toggle('hidden', !itemsVisible);
      nameEl.querySelector('.folder-icon').innerHTML = itemsVisible ? '&#9660;' : '&#9654;';
    });

    // Group requests by endpointKey
    const grouped = {};
    const groupOrder = [];
    col.requests.forEach((req) => {
      const key = req.endpointKey || (req.method + ' ' + req.url);
      if (!grouped[key]) {
        grouped[key] = [];
        groupOrder.push(key);
      }
      grouped[key].push(req);
    });

    groupOrder.forEach((endpointKey) => {
      const requests = grouped[endpointKey];
      const parts = endpointKey.match(/^([A-Z]+)\s+(.+)$/);
      const method = parts ? parts[1] : endpointKey;
      const path = parts ? parts[2] : '';

      const group = document.createElement('div');
      group.className = 'saved-endpoint-group';

      const header = document.createElement('div');
      header.className = 'saved-endpoint-header';
      header.dataset.endpoint = endpointKey;
      header.dataset.testid = 'saved-endpoint-header';
      header.innerHTML =
        '<span class="folder-icon">&#9654;</span>' +
        '<span class="method-badge method-' + method.toLowerCase() + '">' + escapeHtml(method) + '</span>' +
        '<span>' + escapeHtml(path) + '</span>' +
        '<span class="badge">' + requests.length + '</span>';

      const examplesDiv = document.createElement('div');
      examplesDiv.className = 'saved-endpoint-examples hidden';

      header.addEventListener('click', () => {
        examplesDiv.classList.toggle('hidden');
        header.querySelector('.folder-icon').innerHTML = examplesDiv.classList.contains('hidden') ? '&#9654;' : '&#9660;';
      });

      requests.forEach((req) => {
        const item = document.createElement('div');
        item.className = 'saved-request-item';
        item.dataset.testid = 'saved-request-item';
        item.dataset.collectionId = col.id;
        item.dataset.requestId = req.id;

        const exName = req.exampleName || req.name || 'Default';
        let html = '<span class="saved-request-name">&#128203; ' + escapeHtml(exName) + '</span>';
        if (req.lastResponse) {
          const statusClass = req.lastResponse.status < 300 ? 'status-ok' : req.lastResponse.status < 400 ? 'status-redirect' : 'status-error';
          html += '<span class="saved-request-status ' + statusClass + '">' + req.lastResponse.status + '</span>';
        }
        item.innerHTML = html;

        item.addEventListener('click', () => {
          openCollectionRequest(col, req);
        });

        examplesDiv.appendChild(item);
      });

      group.appendChild(header);
      group.appendChild(examplesDiv);
      itemsEl.appendChild(group);
    });

    folder.appendChild(nameEl);
    folder.appendChild(itemsEl);
    container.appendChild(folder);
  }
  updateSidebarCounts();
}

function openCollectionRequest(collection, request) {
  switchSidebarView('collections');
  // Check if a tab already exists for this collection request
  let targetTab = appState.tabs.find((t) => t.collectionRequestId === request.id);
  if (targetTab) {
    switchTab(targetTab.id);
    return;
  }

  // Create a new client tab linked to this collection request
  const ep = findEndpointByKey(request.endpointKey);

  targetTab = createTab({
    type: 'client',
    method: request.method,
    url: request.url,
    endpointKey: request.endpointKey,
    title: request.name,
    endpoint: ep || null,
  });

  targetTab.collectionRequestId = request.id;
  targetTab.collectionId = collection.id;

  // Load request data into tab
  const urlInput = $('#url-input');
  if (urlInput) urlInput.value = request.url || '';

  const methodSelect = $('#method-select');
  if (methodSelect) methodSelect.value = request.method;

  if (request.body && bodyEditor) {
    bodyEditor.setValue(request.body);
  }

  if (request.headers && Array.isArray(request.headers) && request.headers.length > 0) {
    renderHeaders(request.headers);
  }

  if (request.bodyType) {
    switchBodyType(request.bodyType);
  }

  if (request.auth && request.auth.type) {
    const authSelect = $('#auth-type-select');
    if (authSelect) {
      authSelect.value = request.auth.type;
      if (typeof window.showAuthSection === 'function') window.showAuthSection(request.auth.type);
    }
    if (request.auth.type === 'bearer' && request.auth.token) {
      const tokenEl = $('#auth-token');
      if (tokenEl) tokenEl.value = request.auth.token;
    }
  }

  if (request.params && Object.keys(request.params).length > 0) {
    setQueryParamsOnUrl(request.params);
  }

  // Restore last response if available
  if (request.lastResponse) {
    const tab = appState.tabs.find((t) => t.id === targetTab.id);
    if (tab) {
      tab.response = request.lastResponse;
      restoreTabResponse(request.lastResponse);
    }
  }

  renderSavedCollections();
}

function getExamplesKey(ep) {
  return ep.method + ' ' + ep.path;
}

function loadExamples(ep) {
  const examples = [];
  // Spec examples
  if (ep.requestBody && ep.requestBody.content) {
    const jsonContent = ep.requestBody.content['application/json'];
    if (jsonContent) {
      if (jsonContent.example) {
        examples.push({ name: 'Default Example', body: JSON.stringify(jsonContent.example, null, 2), source: 'spec' });
      }
      if (jsonContent.examples) {
        for (const [name, val] of Object.entries(jsonContent.examples)) {
          const body = val.value ? JSON.stringify(val.value, null, 2) : JSON.stringify(val, null, 2);
          examples.push({ name, body, source: 'spec' });
        }
      }
      // If no explicit example, generate from schema
      if (!jsonContent.example && !jsonContent.examples && jsonContent.schema) {
        const schema = jsonContent.schema.$ref ? resolveRef(jsonContent.schema, appState.spec) : jsonContent.schema;
        const generated = generateExample(schema, appState.spec);
        if (generated) {
          examples.push({ name: 'Default Example', body: JSON.stringify(generated, null, 2), source: 'spec' });
        }
      }
    }
  }
  // Extension examples (x-apiforge-examples)
  if (ep.xApiforgeExamples && Array.isArray(ep.xApiforgeExamples)) {
    ep.xApiforgeExamples.forEach((ext) => {
      const ex = { name: ext.name || 'Extension Example', source: 'extension' };
      if (ext.body) ex.body = JSON.stringify(ext.body, null, 2);
      if (ext.params) ex.params = ext.params;
      if (ext.expectedResponse) ex.expectedResponse = ext.expectedResponse;
      examples.push(ex);
    });
  }
  // User examples from localStorage
  try {
    const stored = JSON.parse(localStorage.getItem(EXAMPLES_STORAGE_KEY) || '{}');
    const key = getExamplesKey(ep);
    if (stored[key]) {
      stored[key].forEach((ex) => {
        examples.push({
          name: ex.name,
          body: ex.body,
          params: ex.params || null,
          headers: ex.headers || null,
          bodyType: ex.bodyType || null,
          auth: ex.auth || null,
          expectedResponse: ex.expectedResponse || null,
          source: 'user',
        });
      });
    }
  } catch (e) { console.debug('Failed to load saved examples from localStorage', e); }
  return examples;
}

function saveExample(ep, name, bodyOrFullState, params) {
  try {
    const stored = JSON.parse(localStorage.getItem(EXAMPLES_STORAGE_KEY) || '{}');
    const key = getExamplesKey(ep);
    if (!stored[key]) stored[key] = [];
    let entry;
    // Support both legacy (ep, name, body, params) and new (ep, name, fullState) signatures
    if (bodyOrFullState && typeof bodyOrFullState === 'object' && bodyOrFullState !== null && !Array.isArray(bodyOrFullState) && ('body' in bodyOrFullState || 'params' in bodyOrFullState || 'headers' in bodyOrFullState)) {
      // New full-state signature: saveExample(ep, name, { body, params, headers, bodyType, auth, expectedResponse })
      entry = { name };
      if (bodyOrFullState.body) entry.body = bodyOrFullState.body;
      if (bodyOrFullState.params && Object.keys(bodyOrFullState.params).length > 0) entry.params = bodyOrFullState.params;
      if (bodyOrFullState.headers) entry.headers = bodyOrFullState.headers;
      if (bodyOrFullState.bodyType) entry.bodyType = bodyOrFullState.bodyType;
      if (bodyOrFullState.auth) entry.auth = bodyOrFullState.auth;
      if (bodyOrFullState.expectedResponse) entry.expectedResponse = bodyOrFullState.expectedResponse;
    } else {
      // Legacy signature: saveExample(ep, name, body, params)
      entry = { name, body: bodyOrFullState };
      if (params && Object.keys(params).length > 0) entry.params = params;
    }
    // Attach source metadata from the current active tab
    const activeTab = appState.tabs.find((t) => t.id === appState.activeTabId);
    if (activeTab && activeTab.source) {
      entry.source = { specTitle: activeTab.source.specTitle, endpointKey: activeTab.source.endpointKey };
    }
    stored[key].push(entry);
    localStorage.setItem(EXAMPLES_STORAGE_KEY, JSON.stringify(stored));
  } catch (e) { console.warn('Failed to save example to localStorage', e); }
}

function getQueryParamsFromUrl() {
  const urlStr = $('#url-input').value || '';
  const qIndex = urlStr.indexOf('?');
  if (qIndex < 0) return {};
  const params = {};
  const searchStr = urlStr.substring(qIndex + 1);
  searchStr.split('&').forEach((pair) => {
    const [k, v] = pair.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || '');
  });
  return params;
}

function setQueryParamsOnUrl(params) {
  if (!params || Object.keys(params).length === 0) return;
  const urlStr = $('#url-input').value || '';
  const qIndex = urlStr.indexOf('?');
  const baseUrl = qIndex >= 0 ? urlStr.substring(0, qIndex) : urlStr;
  const queryString = Object.entries(params)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
  $('#url-input').value = baseUrl + '?' + queryString;
  syncUrlToParams();
}

function deleteExample(ep, name) {
  try {
    const stored = JSON.parse(localStorage.getItem(EXAMPLES_STORAGE_KEY) || '{}');
    const key = getExamplesKey(ep);
    if (stored[key]) {
      stored[key] = stored[key].filter((ex) => ex.name !== name);
      if (stored[key].length === 0) delete stored[key];
      localStorage.setItem(EXAMPLES_STORAGE_KEY, JSON.stringify(stored));
    }
  } catch (e) { console.warn('Failed to delete example from localStorage', e); }
}

function hasRequestBody(ep) {
  return ['POST', 'PUT', 'PATCH'].includes(ep.method) && ep.requestBody;
}

function hasExamples(ep) {
  return hasRequestBody(ep) || (ep.xApiforgeExamples && ep.xApiforgeExamples.length > 0);
}

// Track active example highlight
let activeExampleEl = null;

// ─── Collection Tree ──────────────────────────────────────
function renderCollectionTree(title, endpoints) {
  const tree = $('#collection-tree');
  tree.innerHTML = '';
  activeExampleEl = null;

  // Group by tag
  const groups = {};
  endpoints.forEach((ep) => {
    const tag = ep.tags[0] || 'Default';
    if (!groups[tag]) groups[tag] = [];
    groups[tag].push(ep);
  });

  // Collection header (clickable to collapse/expand all folders)
  const header = document.createElement('div');
  header.className = 'collection-name';
  header.style.cssText = 'cursor:pointer;display:flex;align-items:center;gap:6px;';
  const headerIcon = document.createElement('span');
  headerIcon.className = 'folder-icon';
  headerIcon.style.fontSize = '10px';
  headerIcon.innerHTML = '&#9660;';
  const headerText = document.createElement('span');
  headerText.dataset.testid = 'collection-name';
  headerText.textContent = title;
  header.appendChild(headerIcon);
  header.appendChild(headerText);
  tree.appendChild(header);

  const foldersContainer = document.createElement('div');
  foldersContainer.className = 'collection-folders';

  header.addEventListener('click', () => {
    const isHidden = foldersContainer.classList.contains('hidden');
    foldersContainer.classList.toggle('hidden');
    header.querySelector('.folder-icon').innerHTML = isHidden ? '&#9660;' : '&#9654;';
  });

  for (const [tag, eps] of Object.entries(groups)) {
    const folder = document.createElement('div');
    folder.className = 'folder';

    const folderHeader = document.createElement('div');
    folderHeader.className = 'folder-header';
    folderHeader.dataset.testid = 'folder-' + tag.toLowerCase().replace(/\s+/g, '-');
    folderHeader.innerHTML = '<span class="folder-icon">&#9654;</span> ' + escapeHtml(tag) + ' <span class="badge">' + eps.length + '</span>';

    const folderContent = document.createElement('div');
    folderContent.className = 'folder-content hidden';

    folderHeader.addEventListener('click', () => {
      folderContent.classList.toggle('hidden');
      const icon = folderHeader.querySelector('.folder-icon');
      if (icon) icon.innerHTML = folderContent.classList.contains('hidden') ? '&#9654;' : '&#9660;';
    });

    eps.forEach((ep) => {
      const endpointWrap = document.createElement('div');
      endpointWrap.className = 'endpoint-wrap';

      const item = document.createElement('div');
      item.className = 'endpoint-item';
      item.dataset.testid = 'endpoint-' + ep.method.toLowerCase() + '-' + ep.path.replace(/[^a-z0-9]/gi, '-');
      const displayName = (ep._grpc || ep._fbs) ? ep.summary || ep.path.split('/').pop() : ep.path;

      const showExamples = hasExamples(ep);

      let itemHtml = '';
      if (showExamples) {
        itemHtml += '<span class="example-toggle-arrow" data-testid="example-toggle-' + ep.method.toLowerCase() + '-' + ep.path.replace(/[^a-z0-9]/gi, '-') + '">&#9654;</span>';
      } else {
        itemHtml += '<span class="example-toggle-spacer"></span>';
      }
      if (appState.isSpecMode) {
        itemHtml += '<span class="endpoint-spec-icon" title="Docs-first (spec)">&#128214;</span> ';
      }
      itemHtml += '<span class="method-badge method-' + ep.method.toLowerCase() + '">' + ep.method + '</span> <span' + ((ep._grpc || ep._fbs) ? ' class="endpoint-path-short" title="' + escapeHtml(ep.path) + '"' : '') + '>' + escapeHtml(displayName) + '</span>';
      item.innerHTML = itemHtml;
      if (ep.deprecated) item.classList.add('deprecated');

      item.addEventListener('click', (e) => {
        // Don't select endpoint if clicking the toggle arrow
        if (e.target.classList.contains('example-toggle-arrow')) return;
        selectEndpointFromSidebar(ep);
      });

      endpointWrap.appendChild(item);

      if (showExamples) {
        const examplesContainer = document.createElement('div');
        examplesContainer.className = 'examples-container hidden';
        examplesContainer.dataset.testid = 'examples-' + ep.method.toLowerCase() + '-' + ep.path.replace(/[^a-z0-9]/gi, '-');

        renderExamplesList(examplesContainer, ep);

        // Toggle arrow click
        const arrow = item.querySelector('.example-toggle-arrow');
        arrow.addEventListener('click', (e) => {
          e.stopPropagation();
          examplesContainer.classList.toggle('hidden');
          arrow.innerHTML = examplesContainer.classList.contains('hidden') ? '&#9654;' : '&#9660;';
        });

        endpointWrap.appendChild(examplesContainer);
      }

      folderContent.appendChild(endpointWrap);
    });

    folder.appendChild(folderHeader);
    folder.appendChild(folderContent);
    foldersContainer.appendChild(folder);
  }
  tree.appendChild(foldersContainer);
}

function renderExamplesList(container, ep) {
  container.innerHTML = '';
  const examples = loadExamples(ep);

  examples.forEach((ex) => {
    const exItem = document.createElement('div');
    exItem.className = 'example-item';
    exItem.dataset.testid = 'example-item';
    exItem.dataset.exampleName = ex.name;
    exItem.dataset.source = ex.source;

    // Build display name with param hints
    let displayName = escapeHtml(ex.name);
    const paramHint = buildParamHint(ex.params);
    if (paramHint) {
      displayName += ' <span class="example-param-hint">(' + escapeHtml(paramHint) + ')</span>';
    }
    exItem.innerHTML = '<span class="example-icon">&#128203;</span> <span class="example-name">' + displayName + '</span>';

    if (ex.source === 'user') {
      const delBtn = document.createElement('span');
      delBtn.className = 'example-delete';
      delBtn.dataset.testid = 'example-delete';
      delBtn.innerHTML = '&times;';
      delBtn.title = 'Delete example';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteExample(ep, ex.name);
        renderExamplesList(container, ep);
      });
      exItem.appendChild(delBtn);
    }

    exItem.addEventListener('click', () => {
      // Open a client tab with the full example state loaded
      const endpointKey = ep.method + ' ' + ep.path;
      const exampleKey = endpointKey + ':' + ex.name;

      // Check if a client tab already exists for this example
      let targetTab = appState.tabs.find((t) => t.type === 'client' && t._exampleKey === exampleKey);
      if (targetTab) {
        switchTab(targetTab.id);
      } else {
        // Create a new client tab for this example
        // Temporarily disable isSpecMode so selectEndpoint creates a client tab
        const wasSpecMode = appState.isSpecMode;
        appState.isSpecMode = false;

        targetTab = createTab({
          type: 'client',
          method: ep.method,
          endpointKey: endpointKey,
          title: ep.method + ' ' + ep.path,
          endpoint: ep,
        });
        targetTab._exampleKey = exampleKey;

        // Select the endpoint to populate URL, params, headers, etc.
        selectEndpoint(ep);

        appState.isSpecMode = wasSpecMode;
      }

      // Load body into editor (if present)
      if (ex.body) {
        bodyEditor.setValue(ex.body);
      }
      // Load headers (if present)
      if (ex.headers) {
        // Support both old string format and new array format
        if (typeof ex.headers === 'string') {
          try { renderHeaders(JSON.parse(ex.headers)); } catch (e) { /* skip */ }
        } else {
          renderHeaders(ex.headers);
        }
      }
      // Load body type (if present)
      if (ex.bodyType) {
        switchBodyType(ex.bodyType);
      }
      // Load auth config (if present)
      if (ex.auth) {
        const authSelect = $('#auth-type-select');
        if (authSelect && ex.auth.type) {
          authSelect.value = ex.auth.type;
          if (typeof window.showAuthSection === 'function') window.showAuthSection(ex.auth.type);
        }
        if (ex.auth.type === 'bearer' && ex.auth.token) {
          const tokenEl = $('#auth-token');
          if (tokenEl) tokenEl.value = ex.auth.token;
        }
      }
      // Set query params on URL (if present)
      if (ex.params) {
        setQueryParamsOnUrl(ex.params);
      }
      // Show expected response (if present)
      if (ex.expectedResponse) {
        showExpectedResponse(ex.expectedResponse);
      }
      // Auto-save to collection
      const specTitle = appState.spec?.info?.title || 'Untitled API';
      const { collection: _col, request: _colReq } = getOrCreateCollectionRequest(specTitle, ep, ex);
      targetTab.collectionRequestId = _colReq.id;
      targetTab.collectionId = _col.id;
      renderSavedCollections();
      switchSidebarView('collections');
      updateSidebarCounts();

      // Highlight active example
      if (activeExampleEl) activeExampleEl.classList.remove('example-active');
      exItem.classList.add('example-active');
      activeExampleEl = exItem;
    });

    container.appendChild(exItem);
  });

  // Add Example button
  const addBtn = document.createElement('div');
  addBtn.className = 'example-add-btn';
  addBtn.dataset.testid = 'example-add-btn';
  addBtn.textContent = '+ Add Example';
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const name = window.prompt('Example name:');
    if (!name || !name.trim()) return;
    const fullState = {
      body: bodyEditor ? bodyEditor.getValue() : '',
      params: getQueryParamsFromUrl(),
      headers: readHeadersArray(),
      bodyType: appState.bodyType || 'json',
    };
    // Capture auth config
    const authType = $('#auth-type-select')?.value || 'none';
    if (authType !== 'none') {
      fullState.auth = { type: authType };
      if (authType === 'bearer') {
        fullState.auth.token = $('#auth-token')?.value || '';
      } else if (authType === 'basic') {
        fullState.auth.username = $('#auth-basic-username')?.value || '';
        fullState.auth.password = $('#auth-basic-password')?.value || '';
      } else if (authType === 'apikey') {
        fullState.auth.name = $('#auth-apikey-name')?.value || '';
        fullState.auth.value = $('#auth-apikey-value')?.value || '';
        fullState.auth.location = $('#auth-apikey-location')?.value || 'header';
      }
    }
    saveExample(ep, name.trim(), fullState);
    renderExamplesList(container, ep);
  });
  container.appendChild(addBtn);
}

function buildParamHint(params) {
  if (!params || Object.keys(params).length === 0) return '';
  return Object.entries(params).map(([k, v]) => k + '=' + v).join(', ');
}

function showExpectedResponse(expectedResponse) {
  const panel = $('#response-content');
  const empty = $('#response-empty');
  if (panel) panel.classList.remove('hidden');
  if (empty) empty.classList.add('hidden');

  const statusEl = $('#response-status');
  const timingEl = $('#response-timing');
  const sizeEl = $('#response-size');

  if (statusEl) {
    const status = expectedResponse.status || 200;
    statusEl.textContent = status + ' (Expected)';
    statusEl.className = 'status-badge ' + (status < 300 ? 'status-ok' : status < 400 ? 'status-redirect' : 'status-error');
  }
  if (timingEl) timingEl.textContent = 'Expected response';
  if (sizeEl) sizeEl.textContent = '';

  if (expectedResponse.body !== undefined && window.responseEditor) {
    window.responseEditor.setValue(JSON.stringify(expectedResponse.body, null, 2));
  }
}


// ─── Environment Selector ─────────────────────────────────
function renderEnvironments() {
  const selector = $('#env-selector');
  selector.innerHTML = '<option value="">No Environment</option>';
  appState.environments.forEach((env, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = env.name + ' (' + env.baseUrl + ')';
    selector.appendChild(opt);
  });
  selector.addEventListener('change', () => {
    const idx = selector.value;
    appState.activeEnv = idx !== '' ? appState.environments[idx] : null;
    if (appState.selectedEndpoint) {
      updateUrlFromEndpoint(appState.selectedEndpoint);
    }
    // Notify other modules about env change
    window.dispatchEvent(new CustomEvent('apiforge:env-changed', {
      detail: { env: appState.activeEnv },
    }));
    updateEnvVarBadge();
    // Reload connector config for the new environment
    if (typeof loadConnectorConfig === 'function') loadConnectorConfig();
    // Close variables panel when switching envs
    const varsPanel = $('#env-vars-panel');
    if (varsPanel && !varsPanel.classList.contains('hidden')) {
      renderEnvVarsEditor();
    }
  });

  // Load saved custom environments from localStorage
  loadCustomEnvironments();
  loadEnvVariablesFromStorage();
}

// ─── Custom Environment Management ──────────────────────
const ENV_STORAGE_KEY = 'apiforge-environments';

function loadCustomEnvironments() {
  // Load from localStorage cache first
  try {
    const saved = localStorage.getItem(ENV_STORAGE_KEY);
    if (saved) {
      const envs = JSON.parse(saved);
      envs.forEach((env) => {
        if (!appState.environments.find((e) => e.name === env.name)) {
          appState.environments.push(env);
        }
      });
      refreshEnvSelector();
    }
  } catch (e) { console.warn('Failed to load environments from localStorage', e); }

  // Then fetch from server (async, updates when ready)
  loadServerEnvironments();
}

window.loadServerEnvironments = loadServerEnvironments;
async function loadServerEnvironments() {
  if (typeof window.apiFetchGlobal !== 'function') { return; }
  try {
    const resp = await window.apiFetchGlobal('/api/environments');
    if (!resp.ok || !resp.data) return;
    const serverEnvs = resp.data;
    serverEnvs.forEach((env) => {
      let variables = {};
      try { variables = typeof env.variables === 'string' ? JSON.parse(env.variables) : (env.variables || {}); } catch {}

      const envObj = {
        name: env.name,
        baseUrl: variables.baseUrl || '',
        variables: variables,
        _serverId: env.id,
        _custom: true,
      };

      // Update or add
      const existingIdx = appState.environments.findIndex((e) => e.name === env.name);
      if (existingIdx >= 0) {
        appState.environments[existingIdx] = envObj;
      } else {
        appState.environments.push(envObj);
      }

      // Sync connector config (global) from environment variables if present
      if (variables.connectorSearchUrl || variables.connectorTokenUrl) {
        localStorage.setItem('apiforge-connector-config', JSON.stringify({
          searchUrl: variables.connectorSearchUrl || '',
          tokenUrl: variables.connectorTokenUrl || '',
        }));
      }
    });

    // Cache to localStorage
    const customEnvs = appState.environments.filter((e) => e._custom);
    localStorage.setItem(ENV_STORAGE_KEY, JSON.stringify(customEnvs));

    refreshEnvSelector();
    // Reload connector config for active env
    if (typeof window.loadConnectorConfig === 'function') window.loadConnectorConfig();
  } catch (e) { console.warn('Failed to load environments from server', e); }
}

function refreshEnvSelector() {
  const selector = $('#env-selector');
  if (!selector) return;
  const prevValue = selector.value;
  selector.innerHTML = '<option value="">No Environment</option>';
  appState.environments.forEach((env, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = env.name + (env.baseUrl ? ' (' + env.baseUrl + ')' : '');
    selector.appendChild(opt);
  });
  // Restore previous selection
  if (prevValue && selector.querySelector(`option[value="${prevValue}"]`)) {
    selector.value = prevValue;
  }
  // Re-attach change handler
  selector.onchange = () => {
    const idx = selector.value;
    appState.activeEnv = idx !== '' ? appState.environments[idx] : null;
    if (appState.selectedEndpoint) updateUrlFromEndpoint(appState.selectedEndpoint);
    window.dispatchEvent(new CustomEvent('apiforge:env-changed', { detail: { env: appState.activeEnv } }));
    updateEnvVarBadge();
    if (typeof window.loadConnectorConfig === 'function') window.loadConnectorConfig();
    const varsPanel = $('#env-vars-panel');
    if (varsPanel && !varsPanel.classList.contains('hidden')) renderEnvVarsEditor();
  };
}

function saveCustomEnvironments() {
  const custom = appState.environments.filter((e) => e._custom);
  localStorage.setItem(ENV_STORAGE_KEY, JSON.stringify(custom));
}

// ─── Environment Variables Editor ─────────────────────────
function renderEnvVarsEditor() {
  const tbody = $('#env-vars-tbody');
  if (!tbody) return;
  const env = appState.activeEnv;
  const vars = env?.variables || {};
  tbody.innerHTML = '';
  Object.entries(vars).forEach(([key, value]) => {
    addEnvVarRow(tbody, key, String(value));
  });
}

function addEnvVarRow(tbody, key, value) {
  const tr = document.createElement('tr');
  tr.innerHTML = '<td><input class="env-var-key" data-testid="env-var-key" value="' + escapeHtml(key || '') + '" placeholder="key"></td>'
    + '<td><input class="env-var-value" data-testid="env-var-value" value="' + escapeHtml(value || '') + '" placeholder="value"></td>'
    + '<td><button class="kv-remove-btn" data-testid="env-var-remove" title="Remove">&times;</button></td>';
  tr.querySelector('.kv-remove-btn').addEventListener('click', () => {
    tr.remove();
    saveEnvVarsFromEditor();
  });
  // Save on input change
  tr.querySelectorAll('input').forEach((inp) => {
    inp.addEventListener('input', () => saveEnvVarsFromEditor());
  });
  tbody.appendChild(tr);
}

function saveEnvVarsFromEditor() {
  const env = appState.activeEnv;
  if (!env) return;
  const rows = $$('#env-vars-tbody tr');
  const variables = {};
  rows.forEach((row) => {
    const key = row.querySelector('.env-var-key')?.value.trim();
    const value = row.querySelector('.env-var-value')?.value || '';
    if (key) variables[key] = value;
  });
  env.variables = variables;
  saveCustomEnvironments();
  // Also persist non-custom envs variables to localStorage
  try {
    localStorage.setItem('apiforge-env-variables', JSON.stringify(
      appState.environments.map((e) => ({ name: e.name, variables: e.variables || {} }))
    ));
  } catch (e) { /* ignore */ }
  updateEnvVarBadge();
}

function updateEnvVarBadge() {
  const badge = $('#env-var-badge');
  if (!badge) return;
  const env = appState.activeEnv;
  const count = env ? Object.keys(env.variables || {}).length : 0;
  badge.textContent = String(count);
  badge.classList.toggle('hidden', count === 0);
}

function loadEnvVariablesFromStorage() {
  try {
    const saved = localStorage.getItem('apiforge-env-variables');
    if (!saved) return;
    const list = JSON.parse(saved);
    list.forEach((item) => {
      const env = appState.environments.find((e) => e.name === item.name);
      if (env && item.variables) {
        env.variables = { ...item.variables, ...(env.variables || {}) };
      }
    });
  } catch (e) { /* ignore */ }
}

function initEnvVarsEditor() {
  const btn = $('#env-vars-btn');
  const panel = $('#env-vars-panel');
  const closeBtn = $('#env-vars-close');
  const addBtn = $('#env-vars-add');
  if (!btn || !panel) return;

  btn.addEventListener('click', () => {
    if (!appState.activeEnv) {
      alert('Please select an environment first.');
      return;
    }
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      renderEnvVarsEditor();
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', () => panel.classList.add('hidden'));
  if (addBtn) addBtn.addEventListener('click', () => {
    const tbody = $('#env-vars-tbody');
    if (tbody) addEnvVarRow(tbody, '', '');
  });
}

/**
 * Add or update an environment. Called by other modules.
 * @param {string} name
 * @param {object} variables - flat key-value pairs (e.g. { baseUrl, apiKey, ... })
 */
window.apiforgeEnv = {
  addOrUpdate(name, variables) {
    let env = appState.environments.find((e) => e.name === name);
    if (env) {
      env.variables = { ...env.variables, ...variables };
      if (variables.baseUrl) env.baseUrl = variables.baseUrl;
    } else {
      env = { name, baseUrl: variables.baseUrl || '', variables, _custom: true };
      appState.environments.push(env);
    }
    saveCustomEnvironments();
    // Re-render
    const selector = $('#env-selector');
    const idx = appState.environments.indexOf(env);
    if (!selector.querySelector(`option[value="${idx}"]`)) {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = env.name + ' (' + env.baseUrl + ')';
      selector.appendChild(opt);
    }
    return env;
  },
  getActive() {
    return appState.activeEnv;
  },
  setActiveByName(name) {
    const idx = appState.environments.findIndex((e) => e.name === name);
    if (idx >= 0) {
      appState.activeEnv = appState.environments[idx];
      $('#env-selector').value = idx;
      window.dispatchEvent(new CustomEvent('apiforge:env-changed', {
        detail: { env: appState.activeEnv },
      }));
    }
  },
};

// ─── Endpoint Selection ───────────────────────────────────
function updateBodyTypeButtons(ep) {
  const btns = $$('.body-type-btn');
  if (!ep || !ep.requestBody || !ep.requestBody.content) {
    // Show all buttons when no spec context
    btns.forEach((b) => { b.style.display = ''; });
    return;
  }
  const contentTypes = Object.keys(ep.requestBody.content);
  const typeMap = {
    'application/json': 'json',
    'application/x-www-form-urlencoded': 'form-urlencoded',
    'multipart/form-data': 'form-data',
  };
  const specTypes = new Set();
  contentTypes.forEach((ct) => {
    if (typeMap[ct]) specTypes.add(typeMap[ct]);
    else specTypes.add('raw');
  });
  // Always show all buttons but indicate which are spec-supported
  btns.forEach((b) => { b.style.display = ''; });
}

function selectEndpointFromSidebar(ep) {
  // Spec mode: open docs tab by default when clicking an endpoint in sidebar
  if (appState.isSpecMode) {
    const activeTab = appState.tabs.find((t) => t.id === appState.activeTabId);
    if (activeTab && activeTab.type === 'docs') {
      // Already in docs tab, update docs view via selectEndpoint
      selectEndpoint(ep);
    } else {
      // Check if a docs tab already exists for this endpoint
      const endpointKey = ep.method + ' ' + ep.path;
      const existingDocs = appState.tabs.find((t) => t.type === 'docs' && t.endpointKey === endpointKey);
      if (existingDocs) {
        appState.selectedEndpoint = ep;
        switchTab(existingDocs.id);
      } else {
        // Create a docs tab for this endpoint
        // Set selectedEndpoint AFTER createDocsTab so saveCurrentTabState
        // doesn't overwrite the blank client tab's endpointKey
        createDocsTab(ep);
        appState.selectedEndpoint = ep;
      }
      // Highlight active
      $$('.endpoint-item').forEach((el) => el.classList.remove('active'));
      const testId = 'endpoint-' + ep.method.toLowerCase() + '-' + ep.path.replace(/[^a-z0-9]/gi, '-');
      const item = document.querySelector('[data-testid="' + testId + '"]');
      if (item) item.classList.add('active');
    }
    return;
  }
  selectEndpoint(ep);
}

function buildSourceMetadata(ep) {
  if (!appState.spec) return null;
  return {
    specTitle: appState.spec.info?.title || 'Untitled API',
    specHash: appState.specHash || '',
    endpointKey: ep.method + ' ' + ep.path,
    operationId: ep.operationId || '',
    createdFromSpec: true,
  };
}

function selectEndpoint(ep) {
  const endpointKey = ep.method + ' ' + ep.path;

  // If active tab is a docs tab, update it with the new endpoint
  const activeTab = appState.tabs.find((t) => t.id === appState.activeTabId);
  if (activeTab && activeTab.type === 'docs') {
    activeTab.endpointKey = endpointKey;
    activeTab.method = ep.method;
    activeTab.endpoint = ep;
    activeTab.title = endpointKey;
    appState.selectedEndpoint = ep;
    renderDocsView(ep);
    renderTabBar();
    debouncedSaveWorkspace();
    // Highlight active
    $$('.endpoint-item').forEach((el) => el.classList.remove('active'));
    const testId = 'endpoint-' + ep.method.toLowerCase() + '-' + ep.path.replace(/[^a-z0-9]/gi, '-');
    const item = document.querySelector('[data-testid="' + testId + '"]');
    if (item) item.classList.add('active');
    return;
  }

  // Tab integration: check if a client tab already exists for this endpoint
  const existingTab = appState.tabs.find((t) => t.type === 'client' && t.endpointKey === endpointKey);
  if (existingTab && existingTab.id !== appState.activeTabId) {
    switchTab(existingTab.id);
    return;
  }

  // If no existing tab matches, update current tab or create new one
  if (!existingTab && appState.tabs.length > 0) {
    // If current tab is blank (no URL), reuse it; otherwise create new tab
    if (activeTab && activeTab.url && activeTab.url.trim() !== '') {
      saveCurrentTabState();
      const newTab = {
        id: generateTabId(),
        type: 'client',
        method: ep.method,
        url: '',
        headers: '',
        body: '',
        bodyType: 'json',
        params: [],
        authType: 'bearer',
        authConfig: {},
        endpointKey: endpointKey,
        title: endpointKey,
        isDirty: false,
        response: null,
        endpoint: null,
        source: buildSourceMetadata(ep),
      };
      appState.tabs.push(newTab);
      appState.activeTabId = newTab.id;
      showPanelForTab(newTab);
    } else if (activeTab) {
      activeTab.endpointKey = endpointKey;
    }
  }

  appState.selectedEndpoint = ep;

  // Highlight active
  $$('.endpoint-item').forEach((el) => el.classList.remove('active'));
  const testId = 'endpoint-' + ep.method.toLowerCase() + '-' + ep.path.replace(/[^a-z0-9]/gi, '-');
  const item = document.querySelector('[data-testid="' + testId + '"]');
  if (item) item.classList.add('active');

  // Set method
  $('#method-select').value = ep.method;
  $('#method-select').disabled = !!(ep._grpc || ep._fbs); // lock for gRPC/FBS

  if (ep._fbs) {
    // FlatBuffers table endpoint
    $('#url-input').value = ep.path;
    switchBodyType('json');

    if (ep.requestBody) {
      const content = ep.requestBody.content;
      if (content && content['application/json']) {
        const example = content['application/json'].example;
        if (example) {
          bodyEditor.setValue(JSON.stringify(example, null, 2));
        } else {
          bodyEditor.setValue('{}');
        }
      }
    } else {
      // Enum or non-table item — show description
      bodyEditor.setValue('// ' + (ep.description || ep.summary));
    }

    // Auto-switch to Body tab
    $$('.tab').forEach((t) => t.classList.remove('active'));
    const bodyTab = document.querySelector('[data-tab="body"]');
    if (bodyTab) bodyTab.classList.add('active');
    ['params', 'headers', 'body', 'auth'].forEach((id) => {
      const el = $(`#tab-${id}`);
      if (el) el.classList.toggle('hidden', id !== 'body');
    });

    renderHeaders({ 'Content-Type': 'application/json' });
    updateParamsDisplay(ep);
    if (appState.viewMode === 'docs') renderDocsView(ep);
    return;
  }

  if (ep._grpc) {
    // gRPC endpoint
    $('#url-input').value = ep.path;
    switchBodyType('json');

    // Always generate request body from input message schema
    if (ep.requestBody) {
      const content = ep.requestBody.content;
      if (content && content['application/json']) {
        const schema = content['application/json'].schema;
        const example = generateExample(schema, appState.spec);
        bodyEditor.setValue(JSON.stringify(example, null, 2));
      }
    } else {
      bodyEditor.setValue('{}');
    }

    // Auto-switch to Body tab for gRPC
    $$('.tab').forEach((t) => t.classList.remove('active'));
    const bodyTab = document.querySelector('[data-tab="body"]');
    if (bodyTab) bodyTab.classList.add('active');
    ['params', 'headers', 'body', 'auth'].forEach((id) => {
      const el = $(`#tab-${id}`);
      if (el) el.classList.toggle('hidden', id !== 'body');
    });

    renderHeaders({ 'Content-Type': 'application/json' });
    updateParamsDisplay(ep);
    if (appState.viewMode === 'docs') renderDocsView(ep);
    return;
  }

  // REST endpoint
  updateUrlFromEndpoint(ep);

  // Detect body type from spec and auto-switch
  if (['POST', 'PUT', 'PATCH'].includes(ep.method) && ep.requestBody) {
    const detectedType = detectBodyTypeFromSpec(ep) || 'json';
    const content = ep.requestBody.content;

    // Update available body type buttons based on spec
    updateBodyTypeButtons(ep);

    // Switch to detected type
    switchBodyType(detectedType);

    if (detectedType === 'json' && content && content['application/json']) {
      const schema = content['application/json'].schema;
      const example = content['application/json'].example || generateExample(schema, appState.spec);
      bodyEditor.setValue(JSON.stringify(example, null, 2));
    } else if (detectedType === 'form-urlencoded' && content && content['application/x-www-form-urlencoded']) {
      const schema = content['application/x-www-form-urlencoded'].schema;
      populateFormFieldsFromSchema('form-urlencoded', schema, appState.spec);
    } else if (detectedType === 'form-data' && content && content['multipart/form-data']) {
      const schema = content['multipart/form-data'].schema;
      populateFormFieldsFromSchema('form-data', schema, appState.spec);
    } else if (detectedType === 'xml') {
      const xmlEditor = $('#body-xml-editor');
      if (xmlEditor) xmlEditor.value = '';
    } else if (detectedType === 'json') {
      bodyEditor.setValue('{}');
    }
  } else {
    // Reset to None mode for non-body methods (GET, DELETE, HEAD)
    updateBodyTypeButtons(null);
    switchBodyType('none');
    bodyEditor.setValue('');
  }

  // Set headers
  const headers = {};
  if (['POST', 'PUT', 'PATCH'].includes(ep.method)) {
    if (appState.bodyType === 'json') headers['Content-Type'] = 'application/json';
    else if (appState.bodyType === 'form-urlencoded') headers['Content-Type'] = 'application/x-www-form-urlencoded';
    // form-data: don't set content-type, browser will set it with boundary
    else if (appState.bodyType === 'raw') headers['Content-Type'] = $('#raw-content-type')?.value || 'text/plain';
    else if (appState.bodyType === 'xml') headers['Content-Type'] = 'application/xml';
  }
  renderHeaders(Object.keys(headers).length ? headers : {});

  // Update params display
  updateParamsDisplay(ep);

  // OpenAPI security scheme detection
  detectSecurityScheme(ep);

  if (appState.viewMode === 'docs') renderDocsView(ep);

  // Update active tab state and tab bar
  const curTab = appState.tabs.find((t) => t.id === appState.activeTabId);
  if (curTab) {
    curTab.method = ep.method;
    curTab.url = $('#url-input')?.value || '';
    curTab.endpointKey = ep.method + ' ' + ep.path;
    if (!curTab.source) curTab.source = buildSourceMetadata(ep);
    updateTabTitle(curTab);
    renderTabBar();
    renderSourceBreadcrumb(curTab);
    updateSaveAsDocButton();
    debouncedSaveWorkspace();
  }
}

function detectSecurityScheme(ep) {
  const hintEl = $('#auth-scheme-hint');
  const hintText = $('#auth-scheme-hint-text');
  if (!hintEl || !hintText) return;

  const security = ep.security;
  const schemes = appState.spec?.components?.securitySchemes || appState.spec?.securityDefinitions || {};
  if (!security || security.length === 0 || Object.keys(schemes).length === 0) {
    hintEl.classList.add('hidden');
    return;
  }

  // Get the first security requirement's scheme name
  const firstReq = security[0];
  const schemeName = Object.keys(firstReq)[0];
  if (!schemeName) { hintEl.classList.add('hidden'); return; }

  const scheme = schemes[schemeName];
  if (!scheme) { hintEl.classList.add('hidden'); return; }

  // Map OpenAPI scheme type to our auth type
  let label = schemeName;
  let suggestedType = null;
  const schemeType = (scheme.type || '').toLowerCase();
  const schemeIn = (scheme.in || '').toLowerCase();
  const schemeBearerFormat = (scheme.bearerFormat || '').toLowerCase();

  if (schemeType === 'http' && (scheme.scheme || '').toLowerCase() === 'bearer') {
    label = 'Bearer Authentication (' + (schemeBearerFormat || 'JWT') + ')';
    suggestedType = 'bearer';
  } else if (schemeType === 'http' && (scheme.scheme || '').toLowerCase() === 'basic') {
    label = 'Basic Authentication';
    suggestedType = 'basic';
  } else if (schemeType === 'apikey') {
    label = 'API Key (' + schemeName + ' in ' + schemeIn + ')';
    suggestedType = 'apikey';
    // Pre-fill key name if empty
    const keyNameEl = $('#auth-apikey-name');
    if (keyNameEl && !keyNameEl.value) {
      keyNameEl.value = scheme.name || schemeName;
      if (schemeIn === 'query' || schemeIn === 'header' || schemeIn === 'cookie') {
        const locEl = $('#auth-apikey-location');
        if (locEl) locEl.value = schemeIn;
      }
    }
  } else if (schemeType === 'oauth2') {
    label = 'OAuth2';
    suggestedType = 'bearer';
  }

  hintText.textContent = 'This endpoint requires: ' + label;
  hintEl.classList.remove('hidden');

  // Only auto-switch auth type if user hasn't manually set one
  if (suggestedType) {
    const authSelect = $('#auth-type-select');
    const savedType = localStorage.getItem('apiforge-auth-type');
    // Auto-switch only if currently on 'none' or no saved type
    if (authSelect && (!savedType || savedType === 'none')) {
      authSelect.value = suggestedType;
      if (typeof window.showAuthSection === 'function') window.showAuthSection(suggestedType);
    }
  }
}

function updateUrlFromEndpoint(ep) {
  const baseUrl = appState.activeEnv ? appState.activeEnv.baseUrl : '';
  let url = baseUrl + ep.path;
  // Replace path params with placeholders
  (ep.parameters || []).filter((p) => p.in === 'path').forEach((p) => {
    const example = p.example || p.schema?.example || ':' + p.name;
    url = url.replace('{' + p.name + '}', example);
  });
  $('#url-input').value = url;
}

function updateParamsDisplay(ep) {
  const container = $('#tab-params');
  let html = '';

  // Query params from spec
  const queryParams = (ep.parameters || []).filter((p) => p.in === 'query');

  // Read current URL params to pre-fill values
  const urlParams = getQueryParamsFromUrl();

  // Unified params table (combines spec info + editable values)
  const hasNoParams = queryParams.length === 0 && Object.keys(urlParams).length === 0;
  if (hasNoParams) {
    html += '<p class="hint-text">No query parameters for this endpoint</p>';
  }

  html += '<div data-testid="params-editor"' + (hasNoParams ? ' style="display:none;"' : '') + '>';
  html += '<table class="params-table unified-params" data-testid="params-table"><thead><tr>';
  html += '<th style="width:30px;"></th>';
  html += '<th>Name</th>';
  html += '<th>Type</th>';
  html += '<th>Value</th>';
  html += '<th>Required</th>';
  html += '<th>Description</th>';
  html += '<th style="width:30px;">Default</th>';
  html += '</tr></thead><tbody>';

  // Add spec params as unified rows
  queryParams.forEach((p) => {
    const val = urlParams[p.name] !== undefined ? urlParams[p.name] : '';
    const checked = urlParams[p.name] !== undefined ? ' checked' : (p.required ? ' checked' : '');
    const defaultVal = p.schema?.default != null ? String(p.schema.default) : '-';
    html += '<tr class="param-row' + (checked ? '' : ' param-disabled') + '" data-spec="true">';
    html += '<td><input type="checkbox" class="param-enabled"' + checked + '></td>';
    html += '<td><code class="param-name">' + escapeHtml(p.name) + '</code><input class="kv-input param-key" value="' + escAttr(p.name) + '" readonly data-testid="param-key" style="display:none;"></td>';
    html += '<td><span class="param-type">' + escapeHtml(p.schema?.type || 'string') + '</span></td>';
    html += '<td><input class="kv-input param-value" value="' + escAttr(val) + '" placeholder="' + escAttr(defaultVal !== '-' ? defaultVal : p.schema?.type || '') + '" data-testid="param-value"></td>';
    html += '<td>' + (p.required ? '<span class="param-required">Required</span>' : '<span class="param-optional">Optional</span>') + '</td>';
    html += '<td class="param-desc">' + escapeHtml(p.description || '-') + '</td>';
    html += '<td><code class="param-default">' + escapeHtml(defaultVal) + '</code></td>';
    html += '</tr>';
  });

  // Add custom params from URL that are not in spec
  const specNames = new Set(queryParams.map((p) => p.name));
  Object.entries(urlParams).forEach(([key, val]) => {
    if (!specNames.has(key)) {
      html += '<tr class="param-row">';
      html += '<td><input type="checkbox" class="param-enabled" checked></td>';
      html += '<td><input class="kv-input param-key" value="' + escAttr(key) + '" data-testid="param-key"></td>';
      html += '<td></td>';
      html += '<td><input class="kv-input param-value" value="' + escAttr(val) + '" placeholder="Value" data-testid="param-value"></td>';
      html += '<td></td>';
      html += '<td><input class="kv-input param-desc" placeholder="Description"></td>';
      html += '<td><button class="kv-delete param-delete" data-testid="param-delete">&times;</button></td>';
      html += '</tr>';
    }
  });

  html += '</tbody></table>';
  html += '<button class="btn btn-secondary kv-add-btn" data-testid="add-param-btn" style="margin-top:8px;font-size:12px;padding:6px 12px;">+ Add Param</button>';
  html += '</div>';

  // Expected Responses section
  if (ep.responses && Object.keys(ep.responses).length > 0) {
    html += '<div class="expected-responses" data-testid="expected-responses">';
    html += '<h4 class="responses-title responses-toggle" onclick="var list=this.nextElementSibling;list.classList.toggle(\'hidden\');this.querySelector(\'.toggle-icon\').textContent=list.classList.contains(\'hidden\')?\'\\u25B6\':\'\\u25BC\'">Expected Responses <span class="toggle-icon">&#9660;</span></h4>';
    html += '<div class="responses-list">';
    const sorted = Object.entries(ep.responses).sort(([a], [b]) => Number(a) - Number(b));
    sorted.forEach(([code, resp]) => {
      const codeNum = Number(code);
      let cls = 'response-code-info';
      if (codeNum >= 200 && codeNum < 300) cls = 'response-code-success';
      else if (codeNum >= 400 && codeNum < 500) cls = 'response-code-client-error';
      else if (codeNum >= 500) cls = 'response-code-server-error';
      html += '<div class="response-code-item" data-testid="response-code-' + code + '">';
      html += '<span class="response-code-badge ' + cls + '">' + code + '</span>';
      html += '<span class="response-code-desc">' + escapeHtml(resp.description || '') + '</span>';
      // Response body example
      const respContent = resp.content && resp.content['application/json'];
      if (respContent) {
        const respSchema = respContent.schema ? (respContent.schema.$ref ? resolveRef(respContent.schema, appState.spec) : respContent.schema) : null;
        const respExample = respContent.example || (respSchema ? generateExample(respSchema, appState.spec) : null);
        if (respExample !== null && respExample !== undefined) {
          const jsonStr = JSON.stringify(respExample, null, 2);
          html += '<pre class="response-example" data-testid="response-example-' + code + '">' + colorizeJson(escapeHtml(jsonStr)) + '</pre>';
        }
      }
      html += '</div>';
    });
    html += '</div></div>';
  }

  container.innerHTML = html;

  // Attach event listeners for params editor
  initParamsEditorEvents();
}

function initParamsEditorEvents() {
  const editor = document.querySelector('[data-testid="params-editor"]');
  if (!editor) return;

  // Param input changes -> auto-enable checkbox and sync to URL
  editor.addEventListener('input', (e) => {
    if (e.target.classList.contains('param-key') || e.target.classList.contains('param-value')) {
      // Auto-check the checkbox when user types a value
      const row = e.target.closest('tr');
      if (row && e.target.classList.contains('param-value') && e.target.value) {
        const checkbox = row.querySelector('.param-enabled');
        if (checkbox && !checkbox.checked) {
          checkbox.checked = true;
          row.classList.remove('param-disabled');
        }
      }
      syncParamsToUrl();
    }
  });

  // Checkbox changes -> sync to URL and toggle row style
  editor.addEventListener('change', (e) => {
    if (e.target.classList.contains('param-enabled')) {
      const row = e.target.closest('tr');
      if (row) row.classList.toggle('param-disabled', !e.target.checked);
      syncParamsToUrl();
    }
  });

  // Delete buttons
  editor.querySelectorAll('.param-delete').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('tr').remove();
      syncParamsToUrl();
    });
  });

  // Add param button
  const addBtn = document.querySelector('[data-testid="add-param-btn"]');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      addParamRow();
    });
  }
}

function addParamRow(key, value) {
  const editor = document.querySelector('[data-testid="params-editor"]');
  if (!editor) return;
  const tbody = editor.querySelector('tbody');
  const tr = document.createElement('tr');
  tr.className = 'param-row';
  tr.innerHTML =
    '<td><input type="checkbox" class="param-enabled" checked></td>' +
    '<td><input class="kv-input param-key" value="' + escAttr(key || '') + '" placeholder="Key" data-testid="param-key"></td>' +
    '<td></td>' +
    '<td><input class="kv-input param-value" value="' + escAttr(value || '') + '" placeholder="Value" data-testid="param-value"></td>' +
    '<td></td>' +
    '<td><input class="kv-input param-desc" placeholder="Description"></td>' +
    '<td><button class="kv-delete param-delete" data-testid="param-delete">&times;</button></td>';

  // Delete handler
  tr.querySelector('.param-delete').addEventListener('click', () => {
    tr.remove();
    syncParamsToUrl();
  });

  // Input handlers
  tr.querySelectorAll('.param-key, .param-value').forEach((input) => {
    input.addEventListener('input', () => syncParamsToUrl());
  });

  // Checkbox handler
  tr.querySelector('.param-enabled').addEventListener('change', (e) => {
    tr.classList.toggle('param-disabled', !e.target.checked);
    syncParamsToUrl();
  });

  tbody.appendChild(tr);
}

// ─── Headers Key-Value Editor ─────────────────────────────
function addHeaderRow(key, value, enabled) {
  const table = document.querySelector('#headers-editor');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  const tr = document.createElement('tr');
  tr.dataset.testid = 'header-row';
  const isEnabled = enabled !== false;
  tr.innerHTML =
    '<td><input type="checkbox" class="header-enabled" ' + (isEnabled ? 'checked' : '') + '></td>' +
    '<td><input class="kv-input header-key" data-testid="header-key" placeholder="Header name" value="' + escAttr(key || '') + '"></td>' +
    '<td><input class="kv-input header-value" data-testid="header-value" placeholder="Value" value="' + escAttr(value || '') + '"></td>' +
    '<td><button class="kv-delete header-delete" data-testid="header-delete">&times;</button></td>';

  tr.querySelector('.header-delete').addEventListener('click', () => { tr.remove(); });
  tbody.appendChild(tr);
}

function readHeaders() {
  const headers = {};
  const rows = document.querySelectorAll('[data-testid="header-row"]');
  rows.forEach((tr) => {
    const enabled = tr.querySelector('.header-enabled');
    if (enabled && !enabled.checked) return;
    const key = tr.querySelector('.header-key')?.value?.trim();
    const val = tr.querySelector('.header-value')?.value || '';
    if (key) headers[key] = val;
  });
  return headers;
}

function readHeadersArray() {
  const arr = [];
  const rows = document.querySelectorAll('[data-testid="header-row"]');
  rows.forEach((tr) => {
    const key = tr.querySelector('.header-key')?.value || '';
    const val = tr.querySelector('.header-value')?.value || '';
    const enabled = tr.querySelector('.header-enabled')?.checked !== false;
    arr.push({ key, value: val, enabled });
  });
  return arr;
}

function renderHeaders(headers) {
  const table = document.querySelector('#headers-editor');
  if (!table) return;
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';
  if (!headers) return;
  // Support both object and array format
  if (Array.isArray(headers)) {
    headers.forEach((h) => addHeaderRow(h.key, h.value, h.enabled));
  } else {
    Object.entries(headers).forEach(([k, v]) => addHeaderRow(k, v, true));
  }
}

function setHeaderValue(key, value) {
  // Update existing header row or add new one (avoids duplicates)
  const rows = document.querySelectorAll('[data-testid="header-row"]');
  for (const tr of rows) {
    const k = tr.querySelector('.header-key');
    if (k && k.value.trim().toLowerCase() === key.toLowerCase()) {
      const v = tr.querySelector('.header-value');
      if (v) v.value = value;
      return;
    }
  }
  addHeaderRow(key, value, true);
}

function initHeadersEditor() {
  const addBtn = document.querySelector('[data-testid="add-header-btn"]');
  if (addBtn) {
    addBtn.addEventListener('click', () => { addHeaderRow('', '', true); });
  }
}

function syncParamsToUrl() {
  const editor = document.querySelector('[data-testid="params-editor"]');
  if (!editor) return;
  const urlInput = $('#url-input');
  if (!urlInput) return;

  const urlStr = urlInput.value || '';
  const qIndex = urlStr.indexOf('?');
  const baseUrl = qIndex >= 0 ? urlStr.substring(0, qIndex) : urlStr;

  const pairs = [];
  editor.querySelectorAll('tbody tr.param-row').forEach((tr) => {
    const enabled = tr.querySelector('.param-enabled')?.checked;
    const key = tr.querySelector('.param-key')?.value || '';
    const val = tr.querySelector('.param-value')?.value || '';
    if (enabled && key) {
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
    }
  });

  urlInput.value = pairs.length > 0 ? baseUrl + '?' + pairs.join('&') : baseUrl;
}

function syncUrlToParams() {
  const editor = document.querySelector('[data-testid="params-editor"]');
  if (!editor) return;

  const urlParams = getQueryParamsFromUrl();
  const tbody = editor.querySelector('tbody');
  if (!tbody) return;

  // Collect spec param names
  const specNames = new Set();
  tbody.querySelectorAll('tr[data-spec="true"]').forEach((tr) => {
    const key = tr.querySelector('.param-key')?.value || '';
    specNames.add(key);
  });

  // Update existing rows and track which URL params are accounted for
  const accountedKeys = new Set();
  tbody.querySelectorAll('tr.param-row').forEach((tr) => {
    const keyInput = tr.querySelector('.param-key');
    const valInput = tr.querySelector('.param-value');
    const checkbox = tr.querySelector('.param-enabled');
    const key = keyInput?.value || '';

    if (tr.dataset.spec === 'true') {
      // Spec param: update value if present in URL, uncheck if not
      if (urlParams[key] !== undefined) {
        if (valInput) valInput.value = urlParams[key];
        if (checkbox) checkbox.checked = true;
        tr.classList.remove('param-disabled');
      } else {
        if (valInput) valInput.value = '';
        if (checkbox) checkbox.checked = false;
        tr.classList.add('param-disabled');
      }
      accountedKeys.add(key);
    } else {
      // Custom param: update value if still in URL, remove if not
      if (urlParams[key] !== undefined) {
        if (valInput) valInput.value = urlParams[key];
        accountedKeys.add(key);
      } else {
        tr.remove();
      }
    }
  });

  // Add new custom params from URL not in spec or existing rows
  Object.entries(urlParams).forEach(([key, val]) => {
    if (!accountedKeys.has(key)) {
      addParamRow(key, val);
    }
  });
}

// ─── $ref Resolution ──────────────────────────────────────
/**
 * Resolve a $ref string (e.g. "#/components/schemas/Pet") against the provided
 * spec object.  Returns the referenced schema, or the original obj when the ref
 * cannot be found.  Follows chains of $refs up to 10 levels to handle aliases.
 */
function resolveRef(obj, spec) {
  if (!obj || !obj.$ref || !spec) return obj;
  if (!obj.$ref.startsWith('#/')) return obj;

  const parts = obj.$ref.slice(2).split('/');
  let node = spec;
  for (const p of parts) {
    if (node == null || typeof node !== 'object') return obj;
    node = node[p.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  if (!node || typeof node !== 'object') return obj;

  // Follow a chain of $refs so aliased schemas resolve correctly
  let depth = 0;
  while (node && typeof node === 'object' && node.$ref && depth < 10) {
    node = resolveRef(node, spec);
    depth++;
  }

  return node || obj;
}

// ─── Example Generator ────────────────────────────────────

/**
 * Format-to-example mapping, inspired by Scalar's get-example-from-schema.ts.
 * Provides realistic placeholder values for the most common OpenAPI string
 * formats so generated examples are immediately recognisable to API consumers.
 */
const FORMAT_EXAMPLES = {
  'date-time':  '2024-01-15T09:30:00Z',
  'date':       '2024-01-15',
  'time':       '09:30:00',
  'email':      'user@example.com',
  'idn-email':  'user@example.com',
  'hostname':   'api.example.com',
  'idn-hostname': 'api.example.com',
  'uri':        'https://example.com',
  'uri-reference': '../folder',
  'uri-template': 'https://example.com/{id}',
  'url':        'https://example.com',
  'uuid':       '550e8400-e29b-41d4-a716-446655440000',
  'ipv4':       '192.168.1.1',
  'ipv6':       '::1',
  'password':   '********',
  'byte':       'dGVzdA==',
  'binary':     '(binary)',
  'int32':      42,
  'int64':      9007199254740991,
  'float':      1.5,
  'double':     1.5,
  'phone':      '+1-555-0100',
  'regex':      '/[a-z]+/',
  'json-pointer': '/nested/property',
  'relative-json-pointer': '1/nested',
  'iri':        'https://example.com/entity/123',
  'iri-reference': '/entity/1',
  'object-id':  '6592008029c8c3e4dc76256c',
};

/**
 * Merge two example values produced by allOf sub-schemas.
 * Arrays are concatenated, plain objects are shallow-merged, primitives let
 * the newer value win.
 */
function _mergeExamples(base, next) {
  if (Array.isArray(base) && Array.isArray(next)) return [...base, ...next];
  if (base && typeof base === 'object' && next && typeof next === 'object') {
    return { ...base, ...next };
  }
  return next;
}

/**
 * Generate a realistic example value from an OpenAPI SchemaObject.
 *
 * Key behaviours (inspired by Scalar's get-example-from-schema.ts):
 *  - Highest priority: explicit `example`, `examples[0]`, `default`, `const`, `enum[0]`
 *  - Format-aware string values for 25+ common formats
 *  - Handles `oneOf` / `anyOf` (first non-null option) and `allOf` (deep merge)
 *  - Resolves `$ref` references via resolveRef()
 *  - Circular-reference and max-depth protection (depth > 10 returns {})
 *  - Respects `minimum`, `minItems`, and `additionalProperties`
 *
 * The second parameter accepts either the spec object (legacy callers) or an
 * options bag `{ spec, depth, visited }` so both call styles work.
 *
 * @param {object} schema         - OpenAPI schema object (may contain $ref)
 * @param {object} [specOrOpts]   - Spec object for $ref resolution, or options bag
 * @param {number} [legacyDepth]  - Recursion depth (legacy third-arg callers)
 */
function generateExample(schema, specOrOpts, legacyDepth) {
  // Normalise arguments: support both legacy (schema, spec, depth) and new
  // (schema, { spec, depth, visited }) call styles.
  let spec, depth, visited;
  if (specOrOpts && (specOrOpts.openapi || specOrOpts.swagger || specOrOpts.info || specOrOpts.paths || specOrOpts.components)) {
    // Looks like a spec document - legacy call style
    spec    = specOrOpts;
    depth   = legacyDepth || 0;
    visited = new Set();
  } else if (specOrOpts && typeof specOrOpts === 'object' && !specOrOpts.$ref) {
    // Options bag call style
    spec    = specOrOpts.spec || null;
    depth   = specOrOpts.depth || 0;
    visited = specOrOpts.visited || new Set();
  } else {
    spec    = null;
    depth   = legacyDepth || 0;
    visited = new Set();
  }

  const MAX_DEPTH = 10;

  // ── Resolve $ref ──────────────────────────────────────────────────────
  if (schema && schema.$ref) {
    if (visited.has(schema.$ref)) return {};
    const resolvedSpec = spec || appState.spec;
    const resolved = resolvedSpec ? resolveRef(schema, resolvedSpec) : null;
    if (!resolved || resolved === schema) return {};
    const nextVisited = new Set(visited);
    nextVisited.add(schema.$ref);
    return generateExample(resolved, { spec, depth, visited: nextVisited });
  }

  if (!schema || typeof schema !== 'object') return null;
  if (depth > MAX_DEPTH) return {};

  const next = { spec, depth: depth + 1, visited };

  // ── Explicit values take highest priority ────────────────────────────
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];

  // ── Schema combinators ────────────────────────────────────────────────
  // oneOf / anyOf: use the first non-null option
  const union = schema.oneOf || schema.anyOf;
  if (Array.isArray(union) && union.length > 0) {
    for (const sub of union) {
      const candidate = sub && sub.$ref && spec ? resolveRef(sub, spec) : sub;
      if (!candidate) continue;
      if (candidate.type === 'null') continue;
      return generateExample(candidate, next);
    }
    return null;
  }

  // allOf: merge all sub-schemas into one example object
  if (Array.isArray(schema.allOf) && schema.allOf.length > 0) {
    let merged = {};
    for (const sub of schema.allOf) {
      const candidate = sub && sub.$ref && spec ? resolveRef(sub, spec) : sub;
      if (!candidate) continue;
      const ex = generateExample(candidate, { spec, depth: depth + 1, visited: new Set(visited) });
      merged = _mergeExamples(merged, ex);
    }
    return merged;
  }

  const type = schema.type;

  // ── Object ────────────────────────────────────────────────────────────
  if (type === 'object' || schema.properties) {
    const obj = {};
    const props = schema.properties || {};
    for (const [key, prop] of Object.entries(props)) {
      const resolved = prop && prop.$ref && spec ? resolveRef(prop, spec) : prop;
      if (resolved) obj[key] = generateExample(resolved, next);
    }

    // additionalProperties: include one example entry so the shape is clear
    if (
      schema.additionalProperties &&
      schema.additionalProperties !== false &&
      typeof schema.additionalProperties === 'object' &&
      Object.keys(schema.additionalProperties).length > 0
    ) {
      const addl = schema.additionalProperties.$ref && spec
        ? resolveRef(schema.additionalProperties, spec)
        : schema.additionalProperties;
      if (addl) obj['additionalProperty'] = generateExample(addl, next);
    } else if (schema.additionalProperties === true) {
      obj['additionalProperty'] = 'anything';
    }

    return obj;
  }

  // ── Array ─────────────────────────────────────────────────────────────
  if (type === 'array' || schema.items) {
    const count = (schema.minItems && schema.minItems > 0) ? schema.minItems : 1;
    const itemSchema = schema.items || {};
    const resolvedItem = itemSchema.$ref && spec ? resolveRef(itemSchema, spec) : itemSchema;
    const itemExample = resolvedItem ? generateExample(resolvedItem, next) : null;
    return Array.from({ length: count }, () => itemExample);
  }

  // ── String ────────────────────────────────────────────────────────────
  if (type === 'string') {
    const fromFormat = schema.format ? FORMAT_EXAMPLES[schema.format] : undefined;
    if (fromFormat !== undefined) return fromFormat;
    if (schema.minLength && schema.minLength > 0) return 'a'.repeat(schema.minLength);
    return 'string';
  }

  // ── Numeric ───────────────────────────────────────────────────────────
  if (type === 'integer') {
    if (schema.format === 'int64') return FORMAT_EXAMPLES['int64'];
    return typeof schema.minimum === 'number' ? schema.minimum : 1;
  }

  if (type === 'number') {
    if (schema.format === 'float' || schema.format === 'double') return 1.5;
    return typeof schema.minimum === 'number' ? schema.minimum : 1;
  }

  // ── Boolean ───────────────────────────────────────────────────────────
  if (type === 'boolean') return true;

  // ── Nullable (no explicit type) ───────────────────────────────────────
  if (schema.nullable) return null;

  return null;
}

// ─── Send Request ─────────────────────────────────────────
function initSend() {
  $('#send-btn').addEventListener('click', sendRequest);

  // Allow Enter key in URL input
  $('#url-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendRequest();
  });
}

async function sendRequest() {
  const method = $('#method-select').value;
  let url = $('#url-input').value.trim();
  if (!url) {
    alert('Please enter a URL');
    return;
  }

  // Build headers
  let headers = readHeaders();

  // Auth (variable substitution applied to auth fields via _substAuth helper)
  const _preSubstVars = appState.activeEnv?.variables || {};
  const _substAuth = (v) => substituteVariables(v, _preSubstVars);
  const authType = $('#auth-type-select')?.value || 'bearer';
  if (authType === 'bearer') {
    const token = _substAuth($('#auth-token').value.trim());
    if (token) {
      const prefixEl = $('#auth-bearer-prefix');
      let prefix = prefixEl ? prefixEl.value : 'Bearer';
      if (prefix === 'custom') {
        prefix = _substAuth($('#auth-bearer-prefix-custom')?.value.trim() || 'Bearer');
      }
      headers['Authorization'] = prefix + ' ' + token;
    }
  } else if (authType === 'basic') {
    const user = _substAuth($('#auth-basic-username')?.value || '');
    const pass = _substAuth($('#auth-basic-password')?.value || '');
    if (user || pass) {
      headers['Authorization'] = 'Basic ' + utf8ToBase64(user + ':' + pass);
    }
  } else if (authType === 'apikey') {
    const keyName = _substAuth($('#auth-apikey-name')?.value.trim() || '');
    const keyValue = _substAuth($('#auth-apikey-value')?.value.trim() || '');
    const location = $('#auth-apikey-location')?.value || 'header';
    if (keyName && keyValue) {
      if (location === 'header') {
        headers[keyName] = keyValue;
      } else if (location === 'query') {
        const sep = url.includes('?') ? '&' : '?';
        // Append to URL before fetch - handled below
        url = url + sep + encodeURIComponent(keyName) + '=' + encodeURIComponent(keyValue);
      } else if (location === 'cookie') {
        headers['Cookie'] = (headers['Cookie'] ? headers['Cookie'] + '; ' : '') + keyName + '=' + keyValue;
      }
    }
  } else if (authType === 'connector') {
    const connectorToken = window._connectorToken;
    if (connectorToken) {
      headers['Authorization'] = 'Bearer ' + connectorToken;
    }
  }

  // Body
  let body = undefined;
  let isFormData = false;
  if (['POST', 'PUT', 'PATCH', 'GRPC'].includes(method)) {
    if (method === 'GRPC') {
      const bodyText = bodyEditor.getValue().trim();
      if (bodyText) {
        body = bodyText;
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }
    } else {
      const bodyInfo = getBodyForSend();
      body = bodyInfo.body;
      isFormData = bodyInfo.isFormData;
      if (body && !isFormData && bodyInfo.contentType && !headers['Content-Type']) {
        headers['Content-Type'] = bodyInfo.contentType;
      }
      // For FormData, remove Content-Type so browser sets boundary
      if (isFormData) {
        delete headers['Content-Type'];
      }
    }
  }

  // ─── Variable Substitution ────────────────────────────
  const envVars = appState.activeEnv?.variables || {};
  url = substituteVariables(url, envVars);
  // Substitute in header keys and values
  const substitutedHeaders = {};
  for (const [k, v] of Object.entries(headers)) {
    substitutedHeaders[substituteVariables(k, envVars)] = substituteVariables(v, envVars);
  }
  headers = substitutedHeaders;
  // Substitute in body (JSON, raw, XML — but not FormData)
  if (body && typeof body === 'string') {
    body = substituteVariables(body, envVars);
  }

  // Show loading state
  const sendBtn = $('#send-btn');
  sendBtn.innerHTML = '<span class="spinner"></span>';
  sendBtn.disabled = true;

  const startTime = performance.now();
  try {
    const ep = appState.selectedEndpoint;
    if (ep?._grpc) {
      // gRPC call via server proxy
      const target = $('#grpc-target')?.value?.trim();
      if (!target) {
        alert('Please enter the gRPC server address (e.g. localhost:50051)');
        sendBtn.textContent = 'Send';
        sendBtn.disabled = false;
        return;
      }
      const grpcBody = {
        target,
        service: ep._grpc.fullService,
        method: ep._grpc.method,
        body: body ? JSON.parse(body) : {},
        tls: $('#grpc-tls')?.checked || false,
        proto: appState._protoRaw || '',
      };

      const grpcHeaders = { 'Content-Type': 'application/json' };
      const token = window.appAuthState?.token;
      if (token) grpcHeaders['Authorization'] = 'Bearer ' + token;

      // Add gRPC metadata from headers editor
      const metaHeaders = readHeaders();
      if (Object.keys(metaHeaders).length) {
        grpcBody.metadata = metaHeaders;
      }

      // Use native gRPC endpoint when proto content is available (dynamic protobuf).
      // Falls back to /api/grpc (gRPC-Web proxy) only if proto is missing.
      const grpcEndpoint = grpcBody.proto ? '/api/grpc/native' : '/api/grpc';
      const resp = await fetch(grpcEndpoint, {
        method: 'POST',
        headers: grpcHeaders,
        body: JSON.stringify(grpcBody),
      });
      const elapsed = Math.round(performance.now() - startTime);
      const respText = await resp.text();
      const size = new Blob([respText]).size;
      // (3-2) Better gRPC error display
      let statusLabel = resp.ok ? 'OK' : 'gRPC Error';
      let displayBody = respText;
      if (!resp.ok) {
        try {
          const errData = JSON.parse(respText);
          if (errData.hint) {
            displayBody = JSON.stringify({ error: errData.error, target: errData.target, method: errData.method, hint: errData.hint }, null, 2);
          }
        } catch (e) { console.debug('Failed to parse gRPC error response JSON', e); }
      }
      showResponse(resp.status, statusLabel, elapsed, size, displayBody);
    } else {
      // REST call
      const resp = await fetch(url, {
        method,
        headers,
        body,
        mode: 'cors',
      });
      const elapsed = Math.round(performance.now() - startTime);
      const respText = await resp.text();
      const size = new Blob([respText]).size;
      showResponse(resp.status, resp.statusText, elapsed, size, respText);
    }
  } catch (err) {
    const elapsed = Math.round(performance.now() - startTime);
    showResponse(0, 'Error', elapsed, 0, err.message);
  } finally {
    sendBtn.textContent = 'Send';
    sendBtn.disabled = false;
  }
}

// ─── XML Pretty Print ─────────────────────────────────────
function formatXml(xml) {
  let formatted = '';
  let indent = 0;
  const lines = xml.replace(/>\s*</g, '>\n<').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('</')) {
      indent = Math.max(0, indent - 1);
    }
    formatted += '  '.repeat(indent) + trimmed + '\n';
    if (!trimmed.startsWith('<?') && !trimmed.startsWith('<!--') && !trimmed.endsWith('/>') && !trimmed.startsWith('</') && !trimmed.includes('</')) {
      indent++;
    }
  }
  return formatted.trimEnd();
}

// ─── Response Field Hide/Show ─────────────────────────────
let hiddenResponseFields = new Set();
let originalResponseText = '';
window._hiddenResponseFields = hiddenResponseFields;

function filterHiddenFields(obj, hiddenFields, prefix) {
  if (!prefix) prefix = '';
  if (Array.isArray(obj)) {
    return obj.map(function (item) { return filterHiddenFields(item, hiddenFields, prefix); });
  }
  if (obj && typeof obj === 'object') {
    var result = {};
    var entries = Object.entries(obj);
    for (var i = 0; i < entries.length; i++) {
      var key = entries[i][0];
      var value = entries[i][1];
      var path = prefix ? prefix + '.' + key : key;
      if (!hiddenFields.has(key) && !hiddenFields.has(path)) {
        result[key] = filterHiddenFields(value, hiddenFields, path);
      }
    }
    return result;
  }
  return obj;
}

function rerenderFilteredResponse() {
  var src = window._originalResponseJson || originalResponseText;
  if (!src) return;
  try {
    var original = JSON.parse(src);
    var filtered = filterHiddenFields(original, hiddenResponseFields);
    if (responseEditor) {
      responseEditor.setValue(JSON.stringify(filtered, null, 2));
    }
  } catch (e) { /* not JSON, ignore */ }
  // Re-inject hide buttons after re-render
  injectHideButtons();
}

function renderHiddenBadges() {
  var bar = $('#response-hidden-bar');
  if (!bar) return;
  // Remove old badges
  var old = bar.querySelectorAll('.response-hidden-badge');
  for (var i = 0; i < old.length; i++) old[i].remove();
  if (hiddenResponseFields.size === 0) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  hiddenResponseFields.forEach(function (field) {
    var badge = document.createElement('span');
    badge.className = 'response-hidden-badge';
    badge.setAttribute('data-field', field);
    badge.setAttribute('data-testid', 'hidden-badge-' + field);
    badge.innerHTML = field + ' <span class="response-hidden-remove" data-testid="hidden-remove-' + field + '">&times;</span>';
    badge.querySelector('.response-hidden-remove').addEventListener('click', function () {
      hiddenResponseFields.delete(field);
      renderHiddenBadges();
      rerenderFilteredResponse();
    });
    bar.appendChild(badge);
  });
}

function injectHideButtons() {
  var wrap = $('#response-body-wrap');
  if (!wrap) return;
  var lines = wrap.querySelectorAll('.je-line');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Remove existing hide buttons
    var existing = line.querySelector('.je-hide-btn');
    if (existing) existing.remove();
    var keyEl = line.querySelector('.je-key');
    if (!keyEl) continue;
    var btn = document.createElement('span');
    btn.className = 'je-hide-btn';
    btn.textContent = '\u2212';
    btn.setAttribute('data-testid', 'je-hide-btn');
    (function (keyElement) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var keyName = keyElement.textContent.replace(/"/g, '').replace(/:$/, '').trim();
        if (keyName) {
          hiddenResponseFields.add(keyName);
          renderHiddenBadges();
          rerenderFilteredResponse();
        }
      });
    })(keyEl);
    line.appendChild(btn);
  }
}

function initResponseFieldHiding() {
  // Use a MutationObserver to inject hide buttons whenever the response editor re-renders
  var wrap = $('#response-body-wrap');
  if (!wrap) return;
  var observer = new MutationObserver(function () {
    // Debounce slightly
    clearTimeout(initResponseFieldHiding._timer);
    initResponseFieldHiding._timer = setTimeout(function () {
      injectHideButtons();
    }, 50);
  });
  observer.observe(wrap, { childList: true, subtree: true });
}

// ─── Request History ──────────────────────────────────────
let _activeHistoryId = null;

function relativeTime(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  return days + 'd ago';
}

function updateHistoryCount() {
  const badge = document.querySelector('[data-testid="history-count"]');
  if (!badge) return;
  const tab = appState.tabs.find((t) => t.id === appState.activeTabId);
  if (!tab || !tab.collectionId || !tab.collectionRequestId) {
    badge.textContent = '';
    return;
  }
  const collection = appState.collections.find((c) => c.id === tab.collectionId);
  const request = collection?.requests.find((r) => r.id === tab.collectionRequestId);
  const count = request?.history?.length || 0;
  badge.textContent = count > 0 ? count : '';
}

function renderHistory() {
  const container = $('#response-tab-history');
  if (!container) return;
  const tab = appState.tabs.find((t) => t.id === appState.activeTabId);
  if (!tab || !tab.collectionId || !tab.collectionRequestId) {
    container.innerHTML = '<div class="history-empty" data-testid="history-empty"><p>No request history yet. Send a request to start recording.</p></div>';
    return;
  }
  const collection = appState.collections.find((c) => c.id === tab.collectionId);
  const request = collection?.requests.find((r) => r.id === tab.collectionRequestId);
  const history = request?.history || [];
  if (history.length === 0) {
    container.innerHTML = '<div class="history-empty" data-testid="history-empty"><p>No request history yet. Send a request to start recording.</p></div>';
    return;
  }
  let html = '<div class="history-list" data-testid="history-list">';
  history.forEach((entry) => {
    const statusClass = entry.response.status >= 200 && entry.response.status < 300 ? 'status-ok' : entry.response.status >= 400 ? 'status-error' : 'status-redirect';
    const activeClass = (_activeHistoryId === entry.id) ? ' active' : '';
    html += '<div class="history-item' + activeClass + '" data-history-id="' + entry.id + '" data-testid="history-item">';
    html += '<span class="history-status ' + statusClass + '">' + entry.response.status + '</span>';
    html += '<span class="history-method">' + escapeHtml(entry.request.method) + '</span>';
    html += '<span class="history-url">' + escapeHtml(entry.request.url) + '</span>';
    html += '<span class="history-timing">' + entry.response.timing + 'ms</span>';
    html += '<span class="history-time">' + relativeTime(entry.timestamp) + '</span>';
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;

  // Attach click handlers
  container.querySelectorAll('.history-item').forEach((item) => {
    item.addEventListener('click', () => {
      const histId = item.dataset.historyId;
      viewHistoryItem(histId);
    });
  });
}

function viewHistoryItem(historyId) {
  const tab = appState.tabs.find((t) => t.id === appState.activeTabId);
  if (!tab || !tab.collectionId || !tab.collectionRequestId) return;
  const collection = appState.collections.find((c) => c.id === tab.collectionId);
  const request = collection?.requests.find((r) => r.id === tab.collectionRequestId);
  if (!request || !request.history) return;
  const entry = request.history.find((h) => h.id === historyId);
  if (!entry) return;

  // Track active history item (persists across re-renders)
  _activeHistoryId = historyId;

  // Highlight active history item
  const container = $('#response-tab-history');
  if (container) {
    container.querySelectorAll('.history-item').forEach((el) => el.classList.remove('active'));
    const activeEl = container.querySelector('[data-history-id="' + historyId + '"]');
    if (activeEl) activeEl.classList.add('active');
  }

  // Switch to Response tab
  switchResponseTab('response');

  // Show that history entry's response
  showResponse(
    entry.response.status,
    entry.response.statusText || '',
    entry.response.timing,
    entry.response.size || 0,
    entry.response.body,
    true // fromHistory flag to skip adding another history entry
  );
}

function switchResponseTab(tabName) {
  const tabs = document.querySelectorAll('#response-tabs .response-tab');
  tabs.forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });
  const responsePanel = $('#response-tab-response');
  const historyPanel = $('#response-tab-history');
  if (responsePanel) responsePanel.classList.toggle('hidden', tabName !== 'response');
  if (historyPanel) historyPanel.classList.toggle('hidden', tabName !== 'history');
  if (tabName === 'history') {
    renderHistory();
  }
}

function initResponseTabs() {
  const tabsContainer = $('#response-tabs');
  if (!tabsContainer) return;
  tabsContainer.addEventListener('click', (e) => {
    const tabEl = e.target.closest('.response-tab');
    if (!tabEl) return;
    const tabName = tabEl.dataset.tab;
    switchResponseTab(tabName);
  });
}

// ─── Response Display ─────────────────────────────────────
function showResponse(status, statusText, timing, size, body, fromHistory) {
  $('#response-empty').classList.add('hidden');
  $('#response-content').classList.remove('hidden');

  const statusEl = $('#response-status');
  statusEl.textContent = status + ' ' + statusText;
  statusEl.className = 'status-badge';
  if (status >= 200 && status < 300) statusEl.classList.add('status-success');
  else if (status >= 400 && status < 500) statusEl.classList.add('status-client-error');
  else if (status >= 500) statusEl.classList.add('status-server-error');
  else statusEl.classList.add('status-other');

  $('#response-timing').textContent = timing + ' ms';
  $('#response-size').textContent = formatBytes(size);

  // Pretty-print JSON or XML with syntax coloring and folding via responseEditor
  let formatted = body;
  const isXml = body && (body.trimStart().startsWith('<?xml') || body.trimStart().startsWith('<'));
  if (isXml) {
    formatted = formatXml(body);
  } else {
    try {
      const parsed = JSON.parse(body);
      formatted = JSON.stringify(parsed, null, 2);
    } catch (e) {
      console.debug('Response body is not JSON, showing raw', e);
    }
  }

  // Store original response for field hiding feature
  originalResponseText = formatted;
  window._originalResponseJson = formatted;

  // Apply hidden field filter if any fields are hidden
  let displayText = formatted;
  if (hiddenResponseFields.size > 0) {
    try {
      const orig = JSON.parse(formatted);
      const filtered = filterHiddenFields(orig, hiddenResponseFields);
      displayText = JSON.stringify(filtered, null, 2);
    } catch (e) { /* not JSON */ }
  }

  if (responseEditor) {
    responseEditor.setValue(displayText);
  } else {
    $('#response-body-wrap').textContent = displayText;
  }

  // Run response insights analysis
  if (window.responseInsights) {
    window.responseInsights.runInsights(body, { timing, status, size, url: $('#url-input')?.value });
  }

  // Auto-save response to linked collection request (skip when viewing history)
  if (!fromHistory) {
    const activeTab = appState.tabs.find((t) => t.id === appState.activeTabId);
    if (activeTab) {
      activeTab.response = { status, body, timing };
      saveResponseToCollection(activeTab, status, body, timing);
    }
  }
}

function colorizeJson(text) {
  const e = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return e
    .replace(/"([^"\\]*(\\.[^"\\]*)*)"(\s*:)/g, '<span class="json-key">"$1"</span>$3')
    .replace(/:\s*"([^"\\]*(\\.[^"\\]*)*)"/g, ': <span class="json-str">"$1"</span>')
    .replace(/:\s*(-?\d+\.?\d*([eE][+-]?\d+)?)/g, ': <span class="json-num">$1</span>')
    .replace(/:\s*(true|false)/g, ': <span class="json-bool">$1</span>')
    .replace(/:\s*(null)/g, ': <span class="json-null">$1</span>');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

// ─── CSS Additions (injected) ─────────────────────────────
// All colors are now CSS variables defined in main.css per theme.
// This function only adds structural/layout styles for dynamically
// rendered elements that aren't in the static HTML.
function injectStyles() {
  const style = document.createElement('style');
  style.textContent = [
    '.collection-name { font-weight:700; font-size:14px; padding:8px 0; color:var(--text-primary); }',
    '.folder { margin-bottom:2px; }',
    '.folder-header { padding:6px 8px; cursor:pointer; border-radius:6px; font-size:13px; color:var(--text-secondary); display:flex; align-items:center; gap:6px; }',
    '.folder-header:hover { background:var(--bg-hover); }',
    '.folder-icon { font-size:10px; width:14px; display:inline-block; }',
    '.badge { background:var(--bg-tertiary); color:var(--text-muted); font-size:11px; padding:1px 6px; border-radius:10px; margin-left:auto; }',
    '.folder-content { padding-left:16px; }',
    '.endpoint-item { padding:5px 8px; cursor:pointer; border-radius:6px; font-size:12px; display:flex; align-items:center; gap:8px; color:var(--text-secondary); }',
    '.endpoint-item:hover { background:var(--bg-hover); }',
    '.endpoint-item.active { background:var(--accent-primary); color:#fff; }',
    '.endpoint-item.deprecated { opacity:0.5; text-decoration:line-through; }',
    '.method-badge { font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; min-width:44px; text-align:center; }',
    '.method-get    { background:var(--method-get-bg);    color:var(--method-get-fg); }',
    '.method-post   { background:var(--method-post-bg);   color:var(--method-post-fg); }',
    '.method-put    { background:var(--method-put-bg);    color:var(--method-put-fg); }',
    '.method-patch  { background:var(--method-patch-bg);  color:var(--method-patch-fg); }',
    '.method-delete { background:var(--method-delete-bg); color:var(--method-delete-fg); }',
    '.method-grpc   { background:var(--method-grpc-bg);   color:var(--method-grpc-fg); }',
    '.method-fbs    { background:var(--method-fbs-bg);    color:var(--method-fbs-fg); }',
    '.status-success      { background:var(--status-success-bg);      color:var(--status-success-fg); }',
    '.status-client-error { background:var(--status-client-error-bg); color:var(--status-client-error-fg); }',
    '.status-server-error { background:var(--status-server-error-bg); color:var(--status-server-error-fg); }',
    '.status-other        { background:var(--status-other-bg);        color:var(--status-other-fg); }',
  ].join('\n');
  document.head.appendChild(style);
}

// ─── Theme Switcher ───────────────────────────────────────
// Applies one of three presets by toggling a class on <html>.
// Preference is persisted to localStorage under 'apiforge-theme'.
const THEME_CLASSES = ['theme-light', 'theme-midnight'];

function applyTheme(theme) {
  const html = document.documentElement;
  // Remove all theme preset classes, then add the requested one.
  // Dark is the default (:root), so it needs no class at all.
  html.classList.remove(...THEME_CLASSES);
  if (theme === 'light')    html.classList.add('theme-light');
  if (theme === 'midnight') html.classList.add('theme-midnight');
}

function initTheme() {
  const saved = localStorage.getItem('apiforge-theme') || 'dark';
  applyTheme(saved);

  const select = $('#theme-select');
  if (select) {
    select.value = saved;
    select.addEventListener('change', () => {
      const chosen = select.value;
      applyTheme(chosen);
      localStorage.setItem('apiforge-theme', chosen);
    });
  }

}

// ─── Fuzzy Search ─────────────────────────────────────────
let searchSelectedIndex = -1;

function fuzzyScore(text, query) {
  if (!text || !query) return -1;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  // fuzzy: all chars of query appear in order in text
  let ti = 0, qi = 0;
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) qi++;
    ti++;
  }
  if (qi === q.length) return Math.max(1, 40 - (t.length - q.length));
  return -1;
}

function highlightMatches(text, query) {
  if (!text || !query) return escapeHtml(text || '');
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  // exact substring highlight
  const idx = t.indexOf(q);
  if (idx !== -1) {
    return escapeHtml(text.slice(0, idx)) +
      '<span class="search-highlight">' + escapeHtml(text.slice(idx, idx + q.length)) + '</span>' +
      escapeHtml(text.slice(idx + q.length));
  }
  // fuzzy highlight: mark matched chars
  const matched = new Array(text.length).fill(false);
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) { matched[ti] = true; qi++; }
  }
  let out = '', inHighlight = false;
  for (let i = 0; i < text.length; i++) {
    const ch = escapeHtml(text[i]);
    if (matched[i] && !inHighlight) { out += '<span class="search-highlight">'; inHighlight = true; }
    if (!matched[i] && inHighlight) { out += '</span>'; inHighlight = false; }
    out += ch;
  }
  if (inHighlight) out += '</span>';
  return out;
}

function searchEndpoints(query) {
  const eps = appState.endpoints;
  if (!query) return [];
  const results = [];
  eps.forEach((ep) => {
    const fields = [
      { text: ep.path, weight: 3 },
      { text: ep.method, weight: 2 },
      { text: ep.summary, weight: 2 },
      { text: ep.operationId, weight: 1 },
      { text: Array.isArray(ep.tags) ? ep.tags.join(' ') : ep.tags, weight: 1 },
    ];
    let best = -1;
    let bestField = null;
    fields.forEach(({ text, weight }) => {
      if (!text) return;
      const s = fuzzyScore(String(text), query);
      if (s * weight > best) { best = s * weight; bestField = text; }
    });
    if (best > 0) results.push({ ep, score: best, bestField });
  });
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 15);
}

function openSearchModal() {
  const modal = $('#search-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  const input = $('#search-input');
  if (input) { input.value = ''; input.focus(); }
  searchSelectedIndex = -1;
  renderSearchResults('');
}

function closeSearchModal() {
  const modal = $('#search-modal');
  if (modal) modal.classList.add('hidden');
  searchSelectedIndex = -1;
}

function renderSearchResults(query) {
  const container = $('#search-results');
  if (!container) return;

  if (!appState.endpoints || appState.endpoints.length === 0) {
    container.innerHTML = '<div class="search-hint">Import an API spec to search endpoints</div>';
    return;
  }
  if (!query.trim()) {
    container.innerHTML = '<div class="search-hint">Type to search endpoints...</div>';
    return;
  }
  const results = searchEndpoints(query.trim());
  if (results.length === 0) {
    container.innerHTML = '<div class="search-hint">No matching endpoints found</div>';
    return;
  }
  container.innerHTML = results.map((r, i) => {
    const ep = r.ep;
    const method = ep.method.toLowerCase();
    const pathHtml = highlightMatches(ep.path, query.trim());
    const summaryHtml = ep.summary ? highlightMatches(ep.summary, query.trim()) : '';
    return '<div class="search-result-item' + (i === searchSelectedIndex ? ' active' : '') + '" data-index="' + i + '" data-testid="search-result-item">' +
      '<div class="search-result-top">' +
      '<span class="method-badge method-' + method + '">' + escapeHtml(ep.method) + '</span>' +
      '<span class="search-result-path">' + pathHtml + '</span>' +
      '</div>' +
      (summaryHtml ? '<div class="search-result-summary">' + summaryHtml + '</div>' : '') +
      '</div>';
  }).join('');

  // Click handlers
  container.querySelectorAll('.search-result-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      selectSearchResult(results[i].ep);
    });
  });
}

function selectSearchResult(ep) {
  closeSearchModal();
  // If active tab is docs, switch to a client tab first
  const activeTab = appState.tabs.find((t) => t.id === appState.activeTabId);
  if (activeTab && activeTab.type === 'docs') {
    const endpointKey = ep.method + ' ' + ep.path;
    const existingClient = appState.tabs.find((t) => t.type === 'client' && t.endpointKey === endpointKey);
    if (existingClient) {
      switchTab(existingClient.id);
      return;
    }
    createTab({ type: 'client' });
  }
  selectEndpoint(ep);
}

function updateSearchSelection(container) {
  container.querySelectorAll('.search-result-item').forEach((el, i) => {
    el.classList.toggle('active', i === searchSelectedIndex);
    if (i === searchSelectedIndex) el.scrollIntoView({ block: 'nearest' });
  });
}

function initSearch() {
  const overlay = document.querySelector('.search-overlay');
  if (overlay) overlay.addEventListener('click', closeSearchModal);

  const searchIconBtn = $('#search-icon-btn');
  if (searchIconBtn) searchIconBtn.addEventListener('click', openSearchModal);

  const input = $('#search-input');
  if (!input) return;

  input.addEventListener('input', () => {
    searchSelectedIndex = -1;
    renderSearchResults(input.value);
  });

  input.addEventListener('keydown', (e) => {
    const container = $('#search-results');
    const items = container ? container.querySelectorAll('.search-result-item') : [];
    const count = items.length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (count === 0) return;
      searchSelectedIndex = (searchSelectedIndex + 1) % count;
      updateSearchSelection(container, items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (count === 0) return;
      searchSelectedIndex = (searchSelectedIndex - 1 + count) % count;
      updateSearchSelection(container, items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (searchSelectedIndex >= 0 && searchSelectedIndex < count) {
        items[searchSelectedIndex].click();
      } else if (count > 0) {
        items[0].click();
      }
    } else if (e.key === 'Escape') {
      closeSearchModal();
    }
  });
}

// ─── Keyboard Shortcuts (6-2) ────────────────────────────
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+K / Cmd+K: Open search modal
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const modal = $('#search-modal');
      if (modal && modal.classList.contains('hidden')) {
        openSearchModal();
      } else {
        closeSearchModal();
      }
    }
    // Escape: Close search modal if open
    if (e.key === 'Escape') {
      const modal = $('#search-modal');
      if (modal && !modal.classList.contains('hidden')) {
        closeSearchModal();
      }
    }
    // Ctrl+Enter: Send request
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      sendRequest();
    }
    // Ctrl+I: Import file
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      $('#spec-file-input')?.click();
    }
    // Ctrl+T: New tab
    if ((e.ctrlKey || e.metaKey) && e.key === 't') {
      e.preventDefault();
      createTab();
    }
    // Ctrl+W: Close current tab
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
      e.preventDefault();
      if (appState.activeTabId) closeTab(appState.activeTabId);
    }
    // Ctrl+Tab: Next tab
    if (e.ctrlKey && e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const idx = appState.tabs.findIndex((t) => t.id === appState.activeTabId);
      if (idx >= 0 && appState.tabs.length > 1) {
        const next = (idx + 1) % appState.tabs.length;
        switchTab(appState.tabs[next].id);
      }
    }
    // Ctrl+Shift+Tab: Previous tab
    if (e.ctrlKey && e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      const idx = appState.tabs.findIndex((t) => t.id === appState.activeTabId);
      if (idx >= 0 && appState.tabs.length > 1) {
        const prev = (idx - 1 + appState.tabs.length) % appState.tabs.length;
        switchTab(appState.tabs[prev].id);
      }
    }
  });
}


// ─── Mode Toggle (legacy - now handled by tab type) ──────
function initModeToggle() {
  // Mode toggle buttons removed from UI; kept for backward compatibility
  $$('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });
}

function initSidebarToggle() {
  $$('.sidebar-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchSidebarView(btn.dataset.view));
  });
}

function switchSidebarView(view) {
  const docsView = $('#api-docs-section');
  const docsHeader = $('#api-docs-header');
  const importSpecView = $('#import-spec-section');
  const collectionsView = $('#collections-section');
  const historyView = $('#history-section');
  const btns = $$('.sidebar-toggle-btn');

  btns.forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view);
  });

  if (view === 'docs') {
    if (docsView) docsView.classList.remove('hidden');
    if (docsHeader) docsHeader.classList.remove('hidden');
    if (importSpecView) importSpecView.classList.remove('hidden');
    if (collectionsView) collectionsView.classList.add('hidden');
    if (historyView) historyView.classList.add('hidden');
  } else if (view === 'history') {
    if (docsView) docsView.classList.add('hidden');
    if (docsHeader) docsHeader.classList.add('hidden');
    if (importSpecView) importSpecView.classList.add('hidden');
    if (collectionsView) collectionsView.classList.add('hidden');
    if (historyView) historyView.classList.remove('hidden');
    if (typeof renderGlobalHistory === 'function') renderGlobalHistory();
  } else {
    if (docsView) docsView.classList.add('hidden');
    if (docsHeader) docsHeader.classList.add('hidden');
    if (importSpecView) importSpecView.classList.add('hidden');
    if (collectionsView) collectionsView.classList.remove('hidden');
    if (historyView) historyView.classList.add('hidden');
  }
}

function updateSidebarCounts() {
  const docsCountEl = $('#docs-count');
  const collectionsCountEl = $('#collections-count');

  if (docsCountEl) {
    const endpointCount = appState.endpoints ? appState.endpoints.length : 0;
    docsCountEl.textContent = endpointCount;
  }

  if (collectionsCountEl) {
    let requestCount = 0;
    if (appState.collections) {
      appState.collections.forEach((col) => {
        requestCount += col.requests ? col.requests.length : 0;
      });
    }
    collectionsCountEl.textContent = requestCount;
  }
}

function switchMode(mode) {
  if (mode === 'client') {
    // "Try it" from docs: find or create a client tab for the current endpoint
    const ep = appState.selectedEndpoint;
    if (ep) {
      const endpointKey = ep.method + ' ' + ep.path;
      const existingClient = appState.tabs.find((t) => t.type === 'client' && t.endpointKey === endpointKey);
      if (existingClient) {
        switchTab(existingClient.id);
      } else {
        // Create a new client tab and select the endpoint into it
        createTab({ type: 'client', method: ep.method, endpointKey: endpointKey });
        selectEndpoint(ep);
      }
    } else {
      // No endpoint selected, just switch to or create a client tab
      const clientTab = appState.tabs.find((t) => t.type === 'client');
      if (clientTab) {
        switchTab(clientTab.id);
      } else {
        createTab({ type: 'client' });
      }
    }
  } else if (mode === 'docs') {
    const ep = appState.selectedEndpoint;
    if (ep) {
      createDocsTab(ep);
    } else {
      createTab({ type: 'docs', title: 'Docs' });
    }
  }
}

function tryItFromDocs() {
  const ep = appState.selectedEndpoint;
  if (!ep) return;
  const endpointKey = ep.method + ' ' + ep.path;
  // Check if a client tab already exists for this endpoint
  const existingClient = appState.tabs.find((t) => t.type === 'client' && t.endpointKey === endpointKey);
  if (existingClient) {
    switchTab(existingClient.id);
    // Ensure collection link exists
    if (!existingClient.collectionRequestId) {
      const specTitle = appState.spec?.info?.title || 'Untitled API';
      const { collection, request } = getOrCreateCollectionRequest(specTitle, ep, { name: 'Default' });
      existingClient.collectionRequestId = request.id;
      existingClient.collectionId = collection.id;
      renderSavedCollections();
    }
  } else {
    // Create a new client tab and select the endpoint
    const newTab = createTab({ type: 'client', method: ep.method, endpointKey: endpointKey });
    selectEndpoint(ep);
    // Auto-save to collection with Default example
    const specTitle = appState.spec?.info?.title || 'Untitled API';
    const { collection, request } = getOrCreateCollectionRequest(specTitle, ep, { name: 'Default' });
    newTab.collectionRequestId = request.id;
    newTab.collectionId = collection.id;
    renderSavedCollections();
  }
}

// ─── Docs View ─────────────────────────────────────────────────
function buildDocsLeftColumn(ep, spec) {
  let html = '';
  let reqBodyExample = null;
  let reqBodyContentType = '';

  // Header
  html += '<div class="docs-header">';
  html += '<div class="docs-method-path">';
  html += '<span class="method-badge docs-method-badge method-' + ep.method.toLowerCase() + '">' + ep.method + '</span>';
  html += '<span class="docs-path">' + escapeHtml(ep.path) + '</span>';
  if (ep.deprecated) html += '<span class="docs-deprecated-badge">Deprecated</span>';
  html += '<button class="btn btn-primary docs-try-btn" data-testid="docs-try-btn" onclick="tryItFromDocs()">Try it &#8594;</button>';
  html += '</div>';
  if (ep.summary) html += '<div class="docs-summary">' + escapeHtml(ep.summary) + '</div>';
  if (ep.description && ep.description !== ep.summary) html += '<div class="docs-description">' + escapeHtml(ep.description) + '</div>';
  html += '</div>';

  // Security
  if (ep.security && ep.security.length > 0) {
    html += '<div class="docs-section">';
    html += '<div class="docs-section-title">Security</div>';
    ep.security.forEach((sec) => {
      Object.keys(sec).forEach((s) => {
        html += '<div class="docs-security-item"><span class="docs-security-badge">AUTH</span> ' + escapeHtml(s);
        if (sec[s] && sec[s].length) html += ' (' + sec[s].map(escapeHtml).join(', ') + ')';
        html += '</div>';
      });
    });
    html += '</div>';
  }

  // Parameters
  const params = ep.parameters || [];
  if (params.length > 0) {
    html += '<div class="docs-section" id="docs-section-parameters">';
    html += '<div class="docs-section-title">Parameters</div>';
    html += '<table class="params-table"><thead><tr><th>Name</th><th>In</th><th>Type</th><th>Required</th><th>Description</th></tr></thead><tbody>';
    params.forEach((p) => {
      html += '<tr>';
      html += '<td><code class="param-name">' + escapeHtml(p.name) + '</code></td>';
      html += '<td><span class="docs-param-in">' + escapeHtml(p.in) + '</span></td>';
      html += '<td><span class="param-type">' + escapeHtml(p.schema?.type || 'string') + '</span></td>';
      html += '<td>' + (p.required ? '<span class="param-required">Required</span>' : '<span class="param-optional">Optional</span>') + '</td>';
      html += '<td class="param-desc">' + escapeHtml(p.description || '-') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    html += '</div>';
  }

  // Request Body
  if (ep.requestBody) {
    html += '<div class="docs-section" id="docs-section-request-body">';
    html += '<div class="docs-section-title">Request Body</div>';
    const bodyContent = ep.requestBody.content;
    if (bodyContent) {
      for (const [contentType, media] of Object.entries(bodyContent)) {
        reqBodyContentType = contentType;
        html += '<span class="docs-content-type">' + escapeHtml(contentType) + '</span>';
        if (media.schema) {
          const resolved = media.schema.$ref ? resolveRef(media.schema, spec) : media.schema;
          reqBodyExample = media.example || generateExample(resolved, spec);
          if (resolved && resolved.properties) {
            html += '<div class="docs-schema-label">Schema</div>';
            html += renderSchemaTree(resolved, spec, 0);
          }
        }
      }
    }
    html += '</div>';
  }

  // Responses
  const responseExamples = [];
  const responseCodes = ep.responses ? Object.keys(ep.responses) : [];
  if (responseCodes.length > 0) {
    html += '<div class="docs-section" id="docs-section-responses">';
    html += '<div class="docs-section-title">Responses</div>';
    const sorted = Object.entries(ep.responses).sort(([a], [b]) => Number(a) - Number(b));
    sorted.forEach(([code, resp]) => {
      const codeNum = Number(code);
      let cls = 'response-code-info';
      if (codeNum >= 200 && codeNum < 300) cls = 'response-code-success';
      else if (codeNum >= 400 && codeNum < 500) cls = 'response-code-client-error';
      else if (codeNum >= 500) cls = 'response-code-server-error';
      html += '<div class="docs-response-item" id="docs-response-' + code + '">';
      html += '<div class="docs-response-header">';
      html += '<span class="response-code-badge ' + cls + '">' + code + '</span>';
      html += '<span class="response-code-desc">' + escapeHtml(resp.description || '') + '</span>';
      html += '</div>';
      const respContent = resp.content && resp.content['application/json'];
      if (respContent) {
        const respSchema = respContent.schema ? (respContent.schema.$ref ? resolveRef(respContent.schema, spec) : respContent.schema) : null;
        const respExample = respContent.example || (respSchema ? generateExample(respSchema, spec) : null);
        if (respSchema && respSchema.properties) {
          html += renderSchemaTree(respSchema, spec, 0);
        }
        responseExamples.push({ code, cls, example: respExample });
      } else {
        responseExamples.push({ code, cls, example: null });
      }
      html += '</div>';
    });
    html += '</div>';
  }

  return { html, reqBodyExample, reqBodyContentType, responseExamples };
}

function buildDocsRightColumn(ep, _spec, responseExamples, reqBodyExample, reqBodyContentType) {
  let html = '<div class="docs-right-sticky" data-testid="docs-right-sticky">';

  // Request example block (POST/PUT/PATCH with a body schema)
  const isBodyMethod = ['POST', 'PUT', 'PATCH'].includes(ep.method);
  if (isBodyMethod && reqBodyExample !== null && reqBodyExample !== undefined) {
    html += '<div class="docs-right-block" data-testid="docs-request-example">';
    html += '<div class="docs-right-block-title">Request Body Example';
    if (reqBodyContentType) html += ' <span class="docs-content-type" style="margin-left:6px;">' + escapeHtml(reqBodyContentType) + '</span>';
    html += '</div>';
    html += '<pre class="docs-example-block docs-example-block-dark">' + colorizeJson(escapeHtml(JSON.stringify(reqBodyExample, null, 2))) + '</pre>';
    html += '</div>';
  }

  // Response example tabs
  if (responseExamples.length > 0) {
    html += '<div class="docs-right-block" data-testid="docs-response-examples">';
    html += '<div class="docs-right-block-title">Response Examples</div>';
    html += '<div class="docs-resp-tabs" data-testid="docs-resp-tabs">';
    responseExamples.forEach(({ code, cls }, i) => {
      const activeClass = i === 0 ? ' active' : '';
      html += '<button class="docs-resp-tab' + activeClass + ' ' + cls + '" data-tab-code="' + code + '" data-testid="docs-resp-tab-' + code + '">' + code + '</button>';
    });
    html += '</div>';
    responseExamples.forEach(({ code, example }, i) => {
      const hiddenClass = i === 0 ? '' : ' hidden';
      html += '<div class="docs-resp-panel' + hiddenClass + '" data-tab-panel="' + code + '" data-testid="docs-resp-panel-' + code + '">';
      if (example !== null && example !== undefined) {
        html += '<pre class="docs-example-block docs-example-block-dark">' + colorizeJson(escapeHtml(JSON.stringify(example, null, 2))) + '</pre>';
      } else {
        html += '<div class="docs-resp-empty">No example available</div>';
      }
      html += '</div>';
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function renderDocsView(ep) {
  const content = $('#docs-content');
  if (!content) return;

  const spec = appState.spec;
  const left = buildDocsLeftColumn(ep, spec);
  const rightHtml = buildDocsRightColumn(ep, spec, left.responseExamples, left.reqBodyExample, left.reqBodyContentType);

  content.innerHTML =
    '<div class="docs-two-col">' +
      '<div class="docs-left"><div class="docs-main">' + left.html + '</div></div>' +
      '<div class="docs-right">' + rightHtml + '</div>' +
    '</div>';

  $('#docs-empty')?.classList.add('hidden');
  content.classList.remove('hidden');

  initDocsRespTabs(content);
}

function initDocsRespTabs(content) {
  const tabBar = content.querySelector('.docs-resp-tabs');
  if (!tabBar) return;
  tabBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.docs-resp-tab');
    if (!btn) return;
    const code = btn.dataset.tabCode;
    // Deactivate all tabs and hide all panels
    tabBar.querySelectorAll('.docs-resp-tab').forEach((t) => t.classList.remove('active'));
    content.querySelectorAll('.docs-resp-panel').forEach((p) => p.classList.add('hidden'));
    // Activate selected tab and show its panel
    btn.classList.add('active');
    const panel = content.querySelector('[data-tab-panel="' + code + '"]');
    if (panel) panel.classList.remove('hidden');
  });
}

function renderSchemaTree(schema, spec, depth) {
  if (!schema || depth > 6) return '';
  if (schema.$ref) schema = resolveRef(schema, spec);
  const props = schema.properties || {};
  const required = schema.required || [];
  if (Object.keys(props).length === 0) return '';
  let html = '<div class="docs-schema-tree">';
  for (const [key, prop] of Object.entries(props)) {
    const resolved = prop.$ref ? resolveRef(prop, spec) : prop;
    const isReq = required.includes(key);
    const indent = depth * 20;
    let typeStr = resolved.type || 'object';
    if (typeStr === 'array' && resolved.items) {
      const items = resolved.items.$ref ? resolveRef(resolved.items, spec) : resolved.items;
      typeStr = (items.type || 'object') + '[]';
    }
    html += '<div class="schema-prop" style="padding-left:' + indent + 'px">';
    html += '<span class="schema-prop-name">' + escapeHtml(key) + '</span>';
    html += '<span class="schema-prop-type">' + escapeHtml(typeStr) + '</span>';
    if (isReq) html += '<span class="schema-prop-required">required</span>';
    if (resolved.description) html += '<span class="schema-prop-desc">' + escapeHtml(resolved.description) + '</span>';
    if (resolved.enum) html += '<span class="schema-prop-enum">enum: ' + resolved.enum.map(escapeHtml).join(', ') + '</span>';
    html += '</div>';
    if (resolved.type === 'object' && resolved.properties) {
      html += renderSchemaTree(resolved, spec, depth + 1);
    }
    if (resolved.type === 'array' && resolved.items) {
      const items = resolved.items.$ref ? resolveRef(resolved.items, spec) : resolved.items;
      if (items.properties) html += renderSchemaTree(items, spec, depth + 1);
    }
  }
  html += '</div>';
  return html;
}

// ─── Copy as cURL ─────────────────────────────────────────
function buildCurlCommand() {
  const method = $('#method-select').value;
  let url = $('#url-input').value.trim();
  if (!url) return '';

  // Apply environment variable substitution
  const envVars = appState.activeEnv?.variables || {};
  url = substituteVariables(url, envVars);

  const parts = ['curl'];

  // Method
  if (method !== 'GET') {
    parts.push('-X ' + method);
  }

  // URL
  parts.push("'" + url.replace(/'/g, "'\\''") + "'");

  // Headers from editor
  let headers = readHeaders();

  // Auth headers
  const _substAuth = (v) => substituteVariables(v, envVars);
  const authType = $('#auth-type-select')?.value || 'none';
  if (authType === 'bearer') {
    const token = _substAuth($('#auth-token').value.trim());
    if (token) {
      const prefixEl = $('#auth-bearer-prefix');
      let prefix = prefixEl ? prefixEl.value : 'Bearer';
      if (prefix === 'custom') {
        prefix = _substAuth($('#auth-bearer-prefix-custom')?.value.trim() || 'Bearer');
      }
      headers['Authorization'] = prefix + ' ' + token;
    }
  } else if (authType === 'basic') {
    const user = _substAuth($('#auth-basic-username')?.value || '');
    const pass = _substAuth($('#auth-basic-password')?.value || '');
    if (user || pass) {
      headers['Authorization'] = 'Basic ' + utf8ToBase64(user + ':' + pass);
    }
  } else if (authType === 'apikey') {
    const keyName = _substAuth($('#auth-apikey-name')?.value.trim() || '');
    const keyValue = _substAuth($('#auth-apikey-value')?.value.trim() || '');
    const location = $('#auth-apikey-location')?.value || 'header';
    if (keyName && keyValue && location === 'header') {
      headers[keyName] = keyValue;
    }
  } else if (authType === 'connector') {
    const connectorToken = window._connectorToken;
    if (connectorToken) {
      headers['Authorization'] = 'Bearer ' + connectorToken;
    }
  }

  // Add headers to curl command
  for (const [k, v] of Object.entries(headers)) {
    const hk = substituteVariables(k, envVars);
    const hv = substituteVariables(v, envVars);
    parts.push("-H '" + hk + ': ' + hv.replace(/'/g, "'\\''") + "'");
  }

  // Body
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const bodyType = appState.bodyType;
    if (bodyType === 'json') {
      const bodyText = bodyEditor.getValue().trim();
      if (bodyText) {
        const substituted = substituteVariables(bodyText, envVars);
        parts.push("-d '" + substituted.replace(/'/g, "'\\''") + "'");
      }
    } else if (bodyType === 'form-urlencoded') {
      const rows = readKvTable('form-urlencoded');
      rows.filter((r) => r.key).forEach((r) => {
        parts.push("--data-urlencode '" + r.key + '=' + r.value + "'");
      });
    } else if (bodyType === 'form-data') {
      const rows = readKvTable('form-data');
      rows.filter((r) => r.key).forEach((r) => {
        if (r.type === 'file' && r.file) {
          parts.push("-F '" + r.key + '=@' + r.file.name + "'");
        } else {
          parts.push("-F '" + r.key + '=' + (r.value || '') + "'");
        }
      });
    } else if (bodyType === 'raw') {
      const rawText = $('#body-raw-editor')?.value?.trim();
      if (rawText) {
        const substituted = substituteVariables(rawText, envVars);
        parts.push("-d '" + substituted.replace(/'/g, "'\\''") + "'");
      }
    } else if (bodyType === 'xml') {
      const xmlText = $('#body-xml-editor')?.value?.trim();
      if (xmlText) {
        const substituted = substituteVariables(xmlText, envVars);
        parts.push("-d '" + substituted.replace(/'/g, "'\\''") + "'");
      }
    }
  }

  return parts.join(' \\\n  ');
}

function showCopyFeedback(btn, text) {
  const feedback = document.createElement('span');
  feedback.className = 'copy-feedback';
  feedback.textContent = text;
  btn.style.position = 'relative';
  btn.appendChild(feedback);
  setTimeout(() => feedback.remove(), 1500);
}

function initCopyCurl() {
  const btn = $('#copy-curl-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const curl = buildCurlCommand();
    if (!curl) {
      alert('Please enter a URL first');
      return;
    }
    try {
      await navigator.clipboard.writeText(curl);
      showCopyFeedback(btn, 'Copied!');
    } catch (e) {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = curl;
      document.body.appendChild(ta);
      ta.select();
      navigator.clipboard.writeText(ta.value).catch(() => {});
      ta.remove();
      showCopyFeedback(btn, 'Copied!');
    }
  });
}

// ─── Import from cURL ─────────────────────────────────────
function parseCurlCommand(curlStr) {
  // Normalize: join line continuations, trim
  let str = curlStr.replace(/\\\s*\n/g, ' ').trim();

  // Remove leading 'curl' keyword
  if (str.toLowerCase().startsWith('curl')) {
    str = str.substring(4).trim();
  }

  const result = { method: null, url: '', headers: {}, body: null };

  // Tokenize respecting quotes
  const tokens = [];
  let i = 0;
  while (i < str.length) {
    // Skip whitespace
    while (i < str.length && /\s/.test(str[i])) i++;
    if (i >= str.length) break;

    let token = '';
    if (str[i] === "'" || str[i] === '"') {
      const quote = str[i];
      i++;
      while (i < str.length && str[i] !== quote) {
        if (str[i] === '\\' && i + 1 < str.length) {
          token += str[i + 1];
          i += 2;
        } else {
          token += str[i];
          i++;
        }
      }
      i++; // skip closing quote
    } else {
      while (i < str.length && !/\s/.test(str[i])) {
        token += str[i];
        i++;
      }
    }
    tokens.push(token);
  }

  // Parse tokens
  let idx = 0;
  while (idx < tokens.length) {
    const t = tokens[idx];
    if (t === '-X' || t === '--request') {
      idx++;
      if (idx < tokens.length) result.method = tokens[idx].toUpperCase();
    } else if (t === '-H' || t === '--header') {
      idx++;
      if (idx < tokens.length) {
        const colonPos = tokens[idx].indexOf(':');
        if (colonPos > 0) {
          const key = tokens[idx].substring(0, colonPos).trim();
          const value = tokens[idx].substring(colonPos + 1).trim();
          result.headers[key] = value;
        }
      }
    } else if (t === '-d' || t === '--data' || t === '--data-raw' || t === '--data-binary') {
      idx++;
      if (idx < tokens.length) result.body = tokens[idx];
    } else if (t === '-u' || t === '--user') {
      idx++;
      if (idx < tokens.length) {
        const [user, pass] = tokens[idx].split(':');
        result.headers['Authorization'] = 'Basic ' + utf8ToBase64((user || '') + ':' + (pass || ''));
      }
    } else if (t.startsWith('-')) {
      // Skip unknown flags and their values if they look like they take one
      // Common flags that take a value
      if (['-o', '--output', '-b', '--cookie', '-c', '--cookie-jar', '-e', '--referer', '-A', '--user-agent', '-T', '--upload-file'].includes(t)) {
        idx++; // skip value
      }
    } else {
      // Bare argument = URL
      if (!result.url) {
        result.url = t;
      }
    }
    idx++;
  }

  // Default method
  if (!result.method) {
    result.method = result.body ? 'POST' : 'GET';
  }

  return result;
}

function applyCurlImport(parsed) {
  // Method
  $('#method-select').value = parsed.method;

  // URL
  $('#url-input').value = parsed.url;

  // Headers - detect auth from headers
  const headersForEditor = {};
  let detectedAuth = null;
  for (const [k, v] of Object.entries(parsed.headers)) {
    if (k.toLowerCase() === 'authorization') {
      if (v.toLowerCase().startsWith('bearer ')) {
        detectedAuth = { type: 'bearer', token: v.substring(7) };
      } else if (v.toLowerCase().startsWith('basic ')) {
        detectedAuth = { type: 'basic', encoded: v.substring(6) };
      } else {
        headersForEditor[k] = v;
      }
    } else {
      headersForEditor[k] = v;
    }
  }

  renderHeaders(headersForEditor);

  // Auth
  if (detectedAuth) {
    const authSelect = $('#auth-type-select');
    if (detectedAuth.type === 'bearer' && authSelect) {
      authSelect.value = 'bearer';
      authSelect.dispatchEvent(new Event('change'));
      const tokenInput = $('#auth-token');
      if (tokenInput) tokenInput.value = detectedAuth.token;
    } else if (detectedAuth.type === 'basic' && authSelect) {
      authSelect.value = 'basic';
      authSelect.dispatchEvent(new Event('change'));
      // Decode base64
      try {
        const decoded = atob(detectedAuth.encoded);
        const colonIdx = decoded.indexOf(':');
        if (colonIdx >= 0) {
          const userInput = $('#auth-basic-username');
          const passInput = $('#auth-basic-password');
          if (userInput) userInput.value = decoded.substring(0, colonIdx);
          if (passInput) passInput.value = decoded.substring(colonIdx + 1);
        }
      } catch (e) { /* ignore decode errors */ }
    }
  }

  // Body
  if (parsed.body) {
    // Try to detect if it's JSON
    try {
      const parsed_json = JSON.parse(parsed.body);
      switchBodyType('json');
      bodyEditor.setValue(JSON.stringify(parsed_json, null, 2));
    } catch (e) {
      // Check if form-urlencoded
      if (parsed.body.includes('=') && !parsed.body.includes('{')) {
        switchBodyType('form-urlencoded');
        const pairs = parsed.body.split('&').map((p) => {
          const [k, ...rest] = p.split('=');
          return { key: decodeURIComponent(k || ''), value: decodeURIComponent(rest.join('=') || '') };
        });
        renderKvTable('form-urlencoded', pairs);
      } else {
        switchBodyType('json');
        bodyEditor.setValue(parsed.body);
      }
    }
  }
}

function initCurlImport() {
  const importBtn = $('#import-curl-btn');
  const modal = $('#curl-import-modal');
  const overlay = modal?.querySelector('.curl-import-overlay');
  const cancelBtn = $('#curl-import-cancel');
  const submitBtn = $('#curl-import-submit');
  const input = $('#curl-import-input');

  if (!importBtn || !modal) return;

  importBtn.addEventListener('click', () => {
    modal.classList.remove('hidden');
    if (input) { input.value = ''; input.focus(); }
  });

  const closeModal = () => modal.classList.add('hidden');
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
  if (overlay) overlay.addEventListener('click', closeModal);

  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const curlStr = input?.value?.trim();
      if (!curlStr) return;
      const parsed = parseCurlCommand(curlStr);
      applyCurlImport(parsed);
      closeModal();
    });
  }
}

// ─── Share Link ───────────────────────────────────────────
function buildShareData() {
  const method = $('#method-select').value;
  const url = $('#url-input').value.trim();
  if (!url) return null;

  const data = { method, url };

  // Headers
  const shareHeaders = readHeaders();
  if (Object.keys(shareHeaders).length) {
    data.headers = shareHeaders;
  }

  // Body
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const bodyType = appState.bodyType;
    data.bodyType = bodyType;
    if (bodyType === 'json') {
      data.body = bodyEditor.getValue().trim();
    } else if (bodyType === 'raw') {
      data.body = $('#body-raw-editor')?.value?.trim() || '';
    } else if (bodyType === 'xml') {
      data.body = $('#body-xml-editor')?.value?.trim() || '';
    }
  }

  // Auth type
  const authType = $('#auth-type-select')?.value || 'none';
  if (authType !== 'none') {
    data.authType = authType;
  }

  return data;
}

function initShareLink() {
  const btn = $('#share-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const data = buildShareData();
    if (!data) {
      alert('Please enter a URL first');
      return;
    }
    try {
      const json = JSON.stringify(data);
      const encoded = btoa(new TextEncoder().encode(json).reduce((s, b) => s + String.fromCharCode(b), ''));
      const shareUrl = window.location.origin + window.location.pathname + '#/share/' + encoded;
      await navigator.clipboard.writeText(shareUrl);
      showCopyFeedback(btn, 'Link copied!');
    } catch (e) {
      alert('Failed to copy share link');
    }
  });
}

function initSaveExampleBtn() {
  const btn = $('#save-example-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const ep = appState.selectedEndpoint;
    if (!ep) {
      alert('Please select an endpoint first');
      return;
    }
    const name = window.prompt('Example name:');
    if (!name || !name.trim()) return;
    const fullState = {
      body: bodyEditor ? bodyEditor.getValue() : '',
      params: getQueryParamsFromUrl(),
      headers: readHeadersArray(),
      bodyType: appState.bodyType || 'json',
    };
    // Capture auth config
    const authType = $('#auth-type-select')?.value || 'none';
    if (authType !== 'none') {
      fullState.auth = { type: authType };
      if (authType === 'bearer') {
        fullState.auth.token = $('#auth-token')?.value || '';
      } else if (authType === 'basic') {
        fullState.auth.username = $('#auth-basic-username')?.value || '';
        fullState.auth.password = $('#auth-basic-password')?.value || '';
      } else if (authType === 'apikey') {
        fullState.auth.name = $('#auth-apikey-name')?.value || '';
        fullState.auth.value = $('#auth-apikey-value')?.value || '';
        fullState.auth.location = $('#auth-apikey-location')?.value || 'header';
      }
    }
    saveExample(ep, name.trim(), fullState);
    // Refresh the examples list in the sidebar
    const testId = 'examples-' + ep.method.toLowerCase() + '-' + ep.path.replace(/[^a-z0-9]/gi, '-');
    const container = document.querySelector('[data-testid="' + testId + '"]');
    if (container) renderExamplesList(container, ep);
    // Show feedback
    const origText = btn.textContent;
    btn.textContent = 'Saved!';
    setTimeout(() => { btn.textContent = origText; }, 1500);
  });
}

function loadSharedRequest() {
  const hash = window.location.hash;
  if (!hash.startsWith('#/share/')) return;

  const encoded = hash.substring(8); // after '#/share/'
  try {
    const json = new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)));
    const data = JSON.parse(json);

    // Populate fields
    if (data.method) $('#method-select').value = data.method;
    if (data.url) $('#url-input').value = data.url;

    if (data.headers) {
      renderHeaders(data.headers);
    }

    if (data.body) {
      if (data.bodyType) switchBodyType(data.bodyType);
      if (data.bodyType === 'json' || !data.bodyType) {
        bodyEditor.setValue(data.body);
      } else if (data.bodyType === 'raw') {
        const rawEditor = $('#body-raw-editor');
        if (rawEditor) rawEditor.value = data.body;
      } else if (data.bodyType === 'xml') {
        const xmlEditor = $('#body-xml-editor');
        if (xmlEditor) xmlEditor.value = data.body;
      }
    }

    // Show banner
    const banner = $('#share-banner');
    if (banner) {
      banner.classList.remove('hidden');
      setTimeout(() => banner.classList.add('hidden'), 4000);
    }

    // Clear hash
    history.replaceState(null, '', window.location.pathname);
  } catch (e) {
    console.warn('Failed to load shared request', e);
  }
}

// ─── Request Tabs ─────────────────────────────────────────
function generateTabId() {
  return 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
}

function createTab(options = {}) {
  const tab = {
    id: generateTabId(),
    type: options.type || 'client',
    method: options.method || 'GET',
    url: options.url || '',
    headers: options.headers || '',
    body: options.body || '',
    bodyType: options.bodyType || 'json',
    params: options.params || [],
    authType: options.authType || 'bearer',
    authConfig: options.authConfig || {},
    endpointKey: options.endpointKey || '',
    title: options.title || 'New Request',
    isDirty: false,
    response: null,
    endpoint: options.endpoint || null,
    source: options.source || null,
  };
  appState.tabs.push(tab);
  switchTab(tab.id);
  renderTabBar();
  debouncedSaveWorkspace();
  return tab;
}

function createDocsTab(ep) {
  if (!ep) return null;
  const endpointKey = ep.method + ' ' + ep.path;
  // Check if a docs tab already exists for this endpoint
  const existing = appState.tabs.find((t) => t.type === 'docs' && t.endpointKey === endpointKey);
  if (existing) {
    switchTab(existing.id);
    return existing;
  }
  return createTab({
    type: 'docs',
    method: ep.method,
    endpointKey: endpointKey,
    title: ep.method + ' ' + ep.path,
    endpoint: ep,
    source: buildSourceMetadata(ep),
  });
}

function switchTab(tabId) {
  if (appState.activeTabId && appState.activeTabId !== tabId) {
    saveCurrentTabState();
  }
  appState.activeTabId = tabId;
  const tab = appState.tabs.find((t) => t.id === tabId);
  if (tab) {
    loadTabState(tab);
    showPanelForTab(tab);
  }
  renderTabBar();
  debouncedSaveWorkspace();
}

function showPanelForTab(tab) {
  const requestPanel = $('.request-panel');
  const responsePanel = $('.response-panel');
  const docsPanel = $('#docs-panel');
  const tabBar = $('#request-tab-bar');

  // Tab bar always visible
  if (tabBar) tabBar.classList.remove('hidden');

  if (tab.type === 'docs') {
    if (requestPanel) requestPanel.classList.add('hidden');
    if (responsePanel) responsePanel.classList.add('hidden');
    if (docsPanel) docsPanel.classList.remove('hidden');
    appState.viewMode = 'docs';
    // Render docs for the endpoint
    const ep = tab.endpoint || findEndpointByKey(tab.endpointKey);
    if (ep) renderDocsView(ep);
  } else {
    if (requestPanel) requestPanel.classList.remove('hidden');
    if (responsePanel) responsePanel.classList.remove('hidden');
    if (docsPanel) docsPanel.classList.add('hidden');
    appState.viewMode = 'client';
  }
}

function findEndpointByKey(endpointKey) {
  if (!endpointKey) return null;
  const parts = endpointKey.split(' ');
  const method = parts[0];
  const path = parts.slice(1).join(' ');
  return appState.endpoints.find((e) => e.method === method && e.path === path) || null;
}

function saveCurrentTabState() {
  const tab = appState.tabs.find((t) => t.id === appState.activeTabId);
  if (!tab) return;

  // Docs tabs have minimal state to save
  if (tab.type === 'docs') {
    tab.endpointKey = appState.selectedEndpoint ? (appState.selectedEndpoint.method + ' ' + appState.selectedEndpoint.path) : tab.endpointKey;
    return;
  }

  tab.method = $('#method-select')?.value || 'GET';
  tab.url = $('#url-input')?.value || '';
  tab.headers = readHeadersArray();
  tab.body = bodyEditor ? bodyEditor.getValue() : '';
  tab.bodyType = appState.bodyType || 'json';
  tab.endpointKey = appState.selectedEndpoint ? (appState.selectedEndpoint.method + ' ' + appState.selectedEndpoint.path) : '';
  tab.title = tab.method + ' ' + (tab.url ? extractPathFromUrl(tab.url) : '/');

  // Save auth state
  tab.authType = $('#auth-type-select')?.value || 'bearer';
  tab.authConfig = {};
  if (tab.authType === 'bearer') {
    tab.authConfig.token = $('#auth-token')?.value || '';
    tab.authConfig.prefix = $('#auth-bearer-prefix')?.value || 'Bearer';
    tab.authConfig.customPrefix = $('#auth-bearer-prefix-custom')?.value || '';
  } else if (tab.authType === 'basic') {
    tab.authConfig.username = $('#auth-basic-username')?.value || '';
    tab.authConfig.password = $('#auth-basic-password')?.value || '';
  } else if (tab.authType === 'apikey') {
    tab.authConfig.name = $('#auth-apikey-name')?.value || '';
    tab.authConfig.value = $('#auth-apikey-value')?.value || '';
    tab.authConfig.location = $('#auth-apikey-location')?.value || 'header';
  }

  // Save params
  tab.params = readParamsFromTable();

  // Auto-save to linked collection request
  updateCollectionRequestFromTab(tab);
}

function readParamsFromTable() {
  const rows = [];
  $$('.param-row').forEach((tr) => {
    const keyInput = tr.querySelector('.param-key');
    const valInput = tr.querySelector('.param-value');
    const enabledInput = tr.querySelector('.param-enabled');
    if (keyInput) {
      rows.push({
        key: keyInput.value || '',
        value: valInput?.value || '',
        enabled: enabledInput ? enabledInput.checked : true,
      });
    }
  });
  return rows;
}

function extractPathFromUrl(url) {
  try {
    // Handle relative URLs
    if (url.startsWith('/')) return url.split('?')[0];
    const u = new URL(url);
    return u.pathname || '/';
  } catch {
    return url.split('?')[0] || '/';
  }
}

function loadTabState(tab) {
  // For docs tabs, just update the endpoint reference and sidebar highlight
  if (tab.type === 'docs') {
    // Update sidebar highlight
    highlightEndpointInSidebar(tab.endpointKey);
    // Update selectedEndpoint
    const ep = tab.endpoint || findEndpointByKey(tab.endpointKey);
    if (ep) {
      appState.selectedEndpoint = ep;
      tab.endpoint = ep;
    }
    return;
  }

  // Client tab: restore full state
  const methodSelect = $('#method-select');
  if (methodSelect) methodSelect.value = tab.method;
  const urlInput = $('#url-input');
  if (urlInput) urlInput.value = tab.url;
  // Restore headers (support both old string and new array format)
  if (tab.headers) {
    if (typeof tab.headers === 'string') {
      try { renderHeaders(JSON.parse(tab.headers)); } catch (e) { renderHeaders({}); }
    } else {
      renderHeaders(tab.headers);
    }
  } else {
    renderHeaders({});
  }
  if (bodyEditor) bodyEditor.setValue(tab.body || '');

  // Restore body type
  if (tab.bodyType) {
    switchBodyType(tab.bodyType);
  }

  // Restore auth
  const authSelect = $('#auth-type-select');
  if (authSelect && tab.authType) {
    authSelect.value = tab.authType;
    if (typeof window.showAuthSection === 'function') window.showAuthSection(tab.authType);
  }
  if (tab.authConfig) {
    if (tab.authType === 'bearer') {
      const tokenEl = $('#auth-token');
      if (tokenEl) tokenEl.value = tab.authConfig.token || '';
      const prefixEl = $('#auth-bearer-prefix');
      if (prefixEl) prefixEl.value = tab.authConfig.prefix || 'Bearer';
      const customPrefixEl = $('#auth-bearer-prefix-custom');
      if (customPrefixEl) customPrefixEl.value = tab.authConfig.customPrefix || '';
    } else if (tab.authType === 'basic') {
      const userEl = $('#auth-basic-username');
      if (userEl) userEl.value = tab.authConfig.username || '';
      const passEl = $('#auth-basic-password');
      if (passEl) passEl.value = tab.authConfig.password || '';
    } else if (tab.authType === 'apikey') {
      const nameEl = $('#auth-apikey-name');
      if (nameEl) nameEl.value = tab.authConfig.name || '';
      const valEl = $('#auth-apikey-value');
      if (valEl) valEl.value = tab.authConfig.value || '';
      const locEl = $('#auth-apikey-location');
      if (locEl) locEl.value = tab.authConfig.location || 'header';
    }
  }

  // Restore response if cached
  if (tab.response) {
    restoreTabResponse(tab.response);
  } else {
    // Clear response panel
    const responseContent = $('#response-content');
    const responseEmpty = $('#response-empty');
    if (responseContent) responseContent.classList.add('hidden');
    if (responseEmpty) responseEmpty.classList.remove('hidden');
  }

  // Update sidebar highlight
  highlightEndpointInSidebar(tab.endpointKey);

  // Update selectedEndpoint
  if (tab.endpointKey) {
    const ep = findEndpointByKey(tab.endpointKey);
    if (ep) {
      appState.selectedEndpoint = ep;
    }
  } else {
    appState.selectedEndpoint = null;
  }

  // Render source breadcrumb
  renderSourceBreadcrumb(tab);

  // Show/hide Save as Doc button
  updateSaveAsDocButton();
}

function restoreTabResponse(response) {
  const responseContent = $('#response-content');
  const responseEmpty = $('#response-empty');
  if (responseContent) responseContent.classList.remove('hidden');
  if (responseEmpty) responseEmpty.classList.add('hidden');
  const statusEl = $('#response-status');
  if (statusEl) {
    statusEl.textContent = response.status;
    statusEl.className = 'status-badge ' + (response.status >= 200 && response.status < 300 ? 'status-ok' : response.status >= 400 ? 'status-error' : 'status-redirect');
  }
  const timingEl = $('#response-timing');
  if (timingEl) timingEl.textContent = response.timing + 'ms';
  if (responseEditor && response.body) {
    try {
      const parsed = JSON.parse(response.body);
      responseEditor.setValue(JSON.stringify(parsed, null, 2));
    } catch {
      responseEditor.setValue(response.body);
    }
  }
}

function highlightEndpointInSidebar(endpointKey) {
  $$('.endpoint-item').forEach((el) => el.classList.remove('active'));
  if (!endpointKey) return;
  const parts = endpointKey.split(' ');
  const method = parts[0]?.toLowerCase();
  const path = parts.slice(1).join(' ');
  if (method && path) {
    const testId = 'endpoint-' + method + '-' + path.replace(/[^a-z0-9]/gi, '-');
    const item = document.querySelector('[data-testid="' + testId + '"]');
    if (item) item.classList.add('active');
  }
}

function renderSourceBreadcrumb(tab) {
  let breadcrumb = $('#source-breadcrumb');
  if (!breadcrumb) return;
  if (!tab || !tab.source || !tab.source.createdFromSpec || tab.type === 'docs') {
    breadcrumb.classList.add('hidden');
    return;
  }
  const s = tab.source;
  const opId = s.operationId ? ' (' + escapeHtml(s.operationId) + ')' : '';
  const staleMsg = s.removed
    ? '<span class="source-stale-msg" data-testid="source-stale-msg" style="color:var(--warning);margin-left:8px;">&#9888; This endpoint no longer exists in the current spec</span>'
    : s.stale
      ? '<span class="source-stale-msg" data-testid="source-stale-msg" style="color:var(--warning);margin-left:8px;">&#9888; Spec has been updated since this request was created</span>' +
        '<button class="source-refresh-btn" data-testid="source-refresh-btn" title="Reload this endpoint from the latest spec">Refresh from Spec</button>'
      : '';
  breadcrumb.innerHTML =
    '&#128214; ' + escapeHtml(s.specTitle) + ' &gt; ' + escapeHtml(s.endpointKey) + opId +
    '<button class="source-open-docs" data-testid="source-open-docs" title="Open docs">View Docs</button>' +
    staleMsg;
  breadcrumb.classList.remove('hidden');

  // Attach click handler for Refresh from Spec
  const refreshBtn = breadcrumb.querySelector('.source-refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshTabFromSpec(tab);
    });
  }

  // Attach click handler for View Docs
  const docsBtn = breadcrumb.querySelector('.source-open-docs');
  if (docsBtn) {
    docsBtn.addEventListener('click', () => {
      const ep = findEndpointByKey(s.endpointKey);
      if (ep) {
        createDocsTab(ep);
      }
    });
  }
}

function refreshTabFromSpec(tab) {
  if (!tab || !tab.source) return;
  const ep = findEndpointByKey(tab.source.endpointKey);
  if (!ep) return;

  // Clear stale flags
  tab.source.stale = false;
  tab.source.removed = false;
  tab.source.specHash = appState.specHash;

  // Update tab metadata
  tab.method = ep.method;
  tab.endpoint = ep;
  tab.endpointKey = ep.method + ' ' + ep.path;

  if (tab.type === 'docs') {
    renderDocsView(ep);
  } else {
    // Re-run selectEndpoint to repopulate all fields from spec
    selectEndpoint(ep);
  }

  renderTabBar();
  renderSourceBreadcrumb(tab);
  debouncedSaveWorkspace();
}

function closeTab(tabId) {
  const idx = appState.tabs.findIndex((t) => t.id === tabId);
  if (idx === -1) return;

  // If only 1 tab, create a new blank one first
  if (appState.tabs.length <= 1) {
    createTab();
  }

  appState.tabs.splice(idx, 1);

  // If closing the active tab, switch to adjacent
  if (appState.activeTabId === tabId) {
    const newIdx = Math.min(idx, appState.tabs.length - 1);
    switchTab(appState.tabs[newIdx].id);
  }

  renderTabBar();
  debouncedSaveWorkspace();
}

function updateTabTitle(tab) {
  if (tab.type === 'docs') {
    tab.title = tab.endpointKey || 'Docs';
    return;
  }
  const path = tab.url ? extractPathFromUrl(tab.url) : '/';
  tab.title = tab.method + ' ' + path;
}

let _tabBarRafId = null;
function renderTabBar() {
  if (_tabBarRafId) cancelAnimationFrame(_tabBarRafId);
  _tabBarRafId = requestAnimationFrame(_renderTabBarNow);
}
function _renderTabBarNow() {
  _tabBarRafId = null;
  const bar = $('#request-tab-bar');
  if (!bar) return;
  bar.innerHTML = '';

  appState.tabs.forEach((tab) => {
    const el = document.createElement('div');
    const tabTypeClass = tab.type === 'docs' ? ' request-tab-docs' : '';
    el.className = 'request-tab' + tabTypeClass + (tab.id === appState.activeTabId ? ' active' : '');
    el.dataset.tabId = tab.id;
    el.dataset.testid = 'request-tab';
    el.dataset.tabType = tab.type || 'client';

    const typeIcon = tab.type === 'docs' ? '<span class="request-tab-type-icon" title="Docs tab">&#128214;</span>' : '<span class="request-tab-type-icon" title="Client tab">&#128295;</span>';
    const methodClass = 'method-' + (tab.method || 'get').toLowerCase();
    const pathDisplay = tab.type === 'docs'
      ? escapeHtml(tab.endpointKey ? tab.endpointKey.split(' ').slice(1).join(' ') : '/')
      : escapeHtml(tab.url ? extractPathFromUrl(tab.url) : '/');
    const sourceIcon = (tab.source && tab.source.createdFromSpec) ? '<span class="source-link-icon" data-testid="source-link-icon" title="Linked to spec: ' + escAttr(tab.source.specTitle || '') + '">&#128206;</span>' : '';
    // Stale indicator
    let staleIcon = '';
    if (tab.source && tab.source.stale) {
      el.classList.add('stale');
      const staleTitle = tab.source.removed
        ? 'This endpoint no longer exists in the current spec'
        : 'The API spec has been updated. This request may be outdated.';
      staleIcon = '<span class="tab-stale-icon" data-testid="tab-stale-icon" title="' + escAttr(staleTitle) + '">&#9888;</span>';
    }
    el.innerHTML =
      typeIcon +
      '<span class="request-tab-method ' + methodClass + '">' + escapeHtml(tab.method || 'GET') + '</span>' +
      '<span class="request-tab-path">' + pathDisplay + '</span>' +
      sourceIcon +
      staleIcon +
      '<span class="request-tab-close" data-testid="tab-close">&times;</span>';

    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('request-tab-close')) {
        closeTab(tab.id);
        return;
      }
      switchTab(tab.id);
    });

    bar.appendChild(el);
  });

  // New client tab button
  const newBtn = document.createElement('button');
  newBtn.className = 'request-tab-new';
  newBtn.dataset.testid = 'tab-new';
  newBtn.title = 'New client tab (Ctrl+T)';
  newBtn.textContent = '+';
  newBtn.addEventListener('click', () => { createTab(); switchSidebarView('docs'); });
  bar.appendChild(newBtn);

  // New docs tab button
  const docsBtn = document.createElement('button');
  docsBtn.className = 'request-tab-new request-tab-new-docs';
  docsBtn.dataset.testid = 'tab-new-docs';
  docsBtn.title = 'New docs tab';
  docsBtn.innerHTML = '&#128214;';
  docsBtn.addEventListener('click', () => {
    const ep = appState.selectedEndpoint;
    if (ep) {
      createDocsTab(ep);
    } else {
      // Create a docs tab with no endpoint (shows empty docs state)
      createTab({ type: 'docs', title: 'Docs' });
    }
  });
  bar.appendChild(docsBtn);
}

function createDefaultTab() {
  const tab = {
    id: generateTabId(),
    type: 'client',
    method: 'GET',
    url: '',
    headers: '',
    body: '',
    bodyType: 'json',
    params: [],
    authType: 'bearer',
    authConfig: {},
    endpointKey: '',
    title: 'New Request',
    isDirty: false,
    response: null,
    endpoint: null,
    source: null,
  };
  appState.tabs.push(tab);
  appState.activeTabId = tab.id;
}

function showTabBarSkeleton() {
  const bar = $('#request-tab-bar');
  if (!bar) return;
  bar.innerHTML = '<div class="tab-skeleton"><div class="tab-skeleton-item"></div><div class="tab-skeleton-item"></div></div>';
}

function hideTabBarSkeleton() {
  const skeleton = document.querySelector('.tab-skeleton');
  if (skeleton) skeleton.remove();
}

async function restoreWorkspaceFromServer() {
  try {
    const token = window.appAuthState?.token;
    const resp = await fetch('/api/workspace', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.tabs && data.tabs.length > 0) {
        applyWorkspaceData(data);
        hideTabBarSkeleton();
        return;
      }
    }
  } catch { /* fall through to localStorage */ }

  // Fallback to localStorage
  try {
    const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (data && data.tabs && data.tabs.length > 0) {
        applyWorkspaceData(data);
        hideTabBarSkeleton();
        return;
      }
    }
  } catch { /* ignore */ }

  // Nothing restored - show default tab
  hideTabBarSkeleton();
  if (appState.tabs.length === 0) {
    createDefaultTab();
  }
  renderTabBar();
  const activeTab = appState.tabs.find((t) => t.id === appState.activeTabId);
  if (activeTab) {
    showPanelForTab(activeTab);
    loadTabState(activeTab);
  }
}

function initRequestTabs() {
  const authData = localStorage.getItem('apiforge-app-auth');
  let isLoggedIn = false;
  try {
    isLoggedIn = authData && JSON.parse(authData).token;
  } catch { /* ignore */ }

  if (!isLoggedIn) {
    // Sync restore from localStorage - no flash
    const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data && data.tabs && data.tabs.length > 0) {
          applyWorkspaceData(data);
          _tabsInitialized = true;
          return;
        }
      } catch (e) { console.warn('Failed to restore workspace', e); }
    }
    // Create default tab only if nothing was restored
    if (appState.tabs.length === 0) {
      createDefaultTab();
    }
    renderTabBar();
    const activeTab = appState.tabs.find((t) => t.id === appState.activeTabId);
    if (activeTab) showPanelForTab(activeTab);
    _tabsInitialized = true;
    return;
  }

  // Logged in: show skeleton, then fetch from server
  showTabBarSkeleton();
  _tabsInitialized = true;
  restoreWorkspaceFromServer();
}

// ─── Workspace Persistence ────────────────────────────────
const WORKSPACE_STORAGE_KEY = 'apiforge-workspace';
let saveTimeout;

function debouncedSaveWorkspace() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => saveWorkspace(), 2000);
}

function saveWorkspace() {
  // Save current tab state first
  saveCurrentTabState();

  const workspace = {
    tabs: appState.tabs.map((t) => ({
      id: t.id,
      type: t.type || 'client',
      method: t.method,
      url: t.url,
      headers: t.headers,
      body: t.body,
      bodyType: t.bodyType,
      params: t.params,
      authType: t.authType,
      authConfig: t.authConfig,
      endpointKey: t.endpointKey,
      title: t.title,
    })),
    activeTabId: appState.activeTabId,
  };

  // Save to localStorage as fallback
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  } catch { /* ignore storage errors */ }

  // Save to server if logged in
  saveWorkspaceToServer(workspace);
}

async function saveWorkspaceToServer(workspace) {
  const token = window.appAuthState?.token;
  if (!token) return;
  try {
    await fetch('/api/workspace', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify(workspace),
    });
  } catch { /* ignore network errors */ }
}

async function restoreWorkspace() {
  const token = window.appAuthState?.token;

  // Try server first
  if (token) {
    try {
      const resp = await fetch('/api/workspace', {
        headers: { 'Authorization': 'Bearer ' + token },
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.tabs && data.tabs.length > 0) {
          applyWorkspaceData(data);
          return;
        }
      }
    } catch { /* fall through to localStorage */ }
  }

  // Fallback to localStorage
  try {
    const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (data && data.tabs && data.tabs.length > 0) {
        applyWorkspaceData(data);
        return;
      }
    }
  } catch { /* ignore */ }
}

function applyWorkspaceData(data) {
  appState.tabs = data.tabs.map((t) => ({
    id: t.id || generateTabId(),
    type: t.type || 'client',
    method: t.method || 'GET',
    url: t.url || '',
    headers: t.headers || '',
    body: t.body || '',
    bodyType: t.bodyType || 'json',
    params: t.params || [],
    authType: t.authType || 'bearer',
    authConfig: t.authConfig || {},
    endpointKey: t.endpointKey || '',
    title: t.title || 'New Request',
    isDirty: false,
    response: null,
    endpoint: null,
  }));

  const activeId = data.activeTabId;
  if (activeId && appState.tabs.find((t) => t.id === activeId)) {
    appState.activeTabId = activeId;
  } else {
    appState.activeTabId = appState.tabs[0].id;
  }

  const activeTab = appState.tabs.find((t) => t.id === appState.activeTabId);
  if (activeTab) loadTabState(activeTab);
  renderTabBar();
}

// Listen for auth changes to sync workspace
let _tabsInitialized = false;
window.addEventListener('apiforge:auth-changed', (e) => {
  // Guard: don't save/restore until tabs have been initialized
  if (!_tabsInitialized) return;
  if (e.detail?.token) {
    // User logged in - try to restore from server
    restoreWorkspace();
  } else {
    // User logged out - save current state to server first, then clear
    saveWorkspace();
  }
});

// ─── Init ─────────────────────────────────────────────────
// ─── Auth Section Toggle ─────────────────────────────────────
function showAuthSection(type) {
  const sections = ['none', 'bearer', 'basic', 'apikey', 'connector'];
  sections.forEach((s) => {
    const el = $(`#auth-${s}-section`);
    if (el) el.classList.toggle('hidden', s !== type);
  });
  localStorage.setItem('apiforge-auth-type', type);
}
window.showAuthSection = showAuthSection;

document.addEventListener('DOMContentLoaded', () => {
  injectStyles();
  bodyEditor = new JsonEditor($('#body-editor-wrap'), { testId: 'body-editor' });
  window.bodyEditor = bodyEditor;
  responseEditor = new JsonEditor($('#response-body-wrap'), { readOnly: true });
  window.responseEditor = responseEditor;
  initResponseFieldHiding();
  initTabs();
  initImport();
  initSend();
  initBodyTypes();
  initTheme();
  initKeyboardShortcuts();
  initSearch();
  initModeToggle();
  initSidebarToggle();
  initParamsEditorEvents();
  initHeadersEditor();
  initEnvVarsEditor();
  initCopyCurl();
  initCurlImport();
  initShareLink();
  initSaveExampleBtn();
  initSaveAsDoc();
  // Load custom environments from localStorage (even without a spec loaded)
  loadCustomEnvironments();
  loadEnvVariablesFromStorage();
  // Load shared request from URL hash (must be after bodyEditor init)
  loadSharedRequest();
  // Load saved collections from localStorage
  loadCollections();
  renderSavedCollections();
  // Initialize request tabs
  initRequestTabs();
  // Initialize response panel tabs (Response / History)
  initResponseTabs();
  // Update Save as Doc button visibility for initial tab
  updateSaveAsDocButton();
  // Initialize auth type selector
  const authSelect = $('#auth-type-select');
  if (authSelect) {
    const savedAuthType = localStorage.getItem('apiforge-auth-type');
    if (savedAuthType) {
      authSelect.value = savedAuthType;
      showAuthSection(savedAuthType);
    }
    authSelect.addEventListener('change', () => {
      showAuthSection(authSelect.value);
      saveAuthConfig();
    });
  }
  // Basic Auth: Base64 preview + persist
  const basicUser = $('#auth-basic-username');
  const basicPass = $('#auth-basic-password');
  const basicPreview = $('#auth-basic-preview');
  const basicPreviewVal = $('#auth-basic-preview-value');
  function updateBasicPreview() {
    const u = basicUser?.value || '';
    const p = basicPass?.value || '';
    if (u || p) {
      const encoded = typeof utf8ToBase64 === 'function' ? utf8ToBase64(u + ':' + p) : btoa(u + ':' + p);
      if (basicPreviewVal) basicPreviewVal.textContent = encoded;
      if (basicPreview) basicPreview.style.display = '';
    } else {
      if (basicPreview) basicPreview.style.display = 'none';
    }
    saveAuthConfig();
  }
  if (basicUser) basicUser.addEventListener('input', updateBasicPreview);
  if (basicPass) basicPass.addEventListener('input', updateBasicPreview);

  // Bearer prefix: show custom input
  const prefixSelect = $('#auth-bearer-prefix');
  const prefixCustom = $('#auth-bearer-prefix-custom');
  if (prefixSelect) {
    prefixSelect.addEventListener('change', () => {
      if (prefixCustom) prefixCustom.style.display = prefixSelect.value === 'custom' ? '' : 'none';
      saveAuthConfig();
    });
  }
  if (prefixCustom) prefixCustom.addEventListener('input', () => saveAuthConfig());

  // Bearer token input persist
  const bearerToken = $('#auth-token');
  if (bearerToken) bearerToken.addEventListener('input', () => saveAuthConfig());

  // API Key inputs persist
  ['#auth-apikey-name', '#auth-apikey-value', '#auth-apikey-location'].forEach((sel) => {
    const el = $(sel);
    if (el) el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => saveAuthConfig());
  });

  // Save auth config to localStorage
  function saveAuthConfig() {
    const type = $('#auth-type-select')?.value || 'bearer';
    const config = { type };
    if (type === 'bearer') {
      config.token = $('#auth-token')?.value || '';
      config.prefix = $('#auth-bearer-prefix')?.value || 'Bearer';
      config.customPrefix = $('#auth-bearer-prefix-custom')?.value || '';
    } else if (type === 'basic') {
      config.username = $('#auth-basic-username')?.value || '';
      config.password = $('#auth-basic-password')?.value || '';
    } else if (type === 'apikey') {
      config.name = $('#auth-apikey-name')?.value || '';
      config.value = $('#auth-apikey-value')?.value || '';
      config.location = $('#auth-apikey-location')?.value || 'header';
    }
    localStorage.setItem('apiforge-auth-config', JSON.stringify(config));
  }

  // Restore auth config on load
  try {
    const saved = JSON.parse(localStorage.getItem('apiforge-auth-config') || '{}');
    if (saved.type === 'bearer') {
      if (saved.token) { const el = $('#auth-token'); if (el) el.value = saved.token; }
      if (saved.prefix) { const el = $('#auth-bearer-prefix'); if (el) el.value = saved.prefix; }
      if (saved.prefix === 'custom' && prefixCustom) { prefixCustom.style.display = ''; prefixCustom.value = saved.customPrefix || ''; }
    } else if (saved.type === 'basic') {
      if (saved.username) { const el = $('#auth-basic-username'); if (el) el.value = saved.username; }
      if (saved.password) { const el = $('#auth-basic-password'); if (el) el.value = saved.password; }
      updateBasicPreview();
    } else if (saved.type === 'apikey') {
      if (saved.name) { const el = $('#auth-apikey-name'); if (el) el.value = saved.name; }
      if (saved.value) { const el = $('#auth-apikey-value'); if (el) el.value = saved.value; }
      if (saved.location) { const el = $('#auth-apikey-location'); if (el) el.value = saved.location; }
    }
  } catch (e) { /* ignore */ }

  // --- Auth Connector ---

  // Restore connector config on load (per-environment)
  window.loadConnectorConfig = loadConnectorConfig;
  function loadConnectorConfig() {
    try {
      const connectorKey = 'apiforge-connector-config';
      const savedConnectorConfig = localStorage.getItem(connectorKey);
      const searchUrlEl = $('#connector-search-url');
      const tokenUrlEl = $('#connector-token-url');
      if (savedConnectorConfig) {
        const connectorConfig = JSON.parse(savedConnectorConfig);
        if (searchUrlEl && connectorConfig.searchUrl) searchUrlEl.value = connectorConfig.searchUrl;
        if (tokenUrlEl && connectorConfig.tokenUrl) tokenUrlEl.value = connectorConfig.tokenUrl;
      } else {
        if (searchUrlEl) searchUrlEl.value = '';
        if (tokenUrlEl) tokenUrlEl.value = '';
      }
    } catch (e) { /* ignore */ }
  }
  loadConnectorConfig();

  // Save connector config
  const connectorSaveBtn = $('#connector-save-config');
  if (connectorSaveBtn) {
    connectorSaveBtn.addEventListener('click', () => {
      const connectorKey = 'apiforge-connector-config';
      const searchUrl = ($('#connector-search-url') || {}).value || '';
      const tokenUrl = ($('#connector-token-url') || {}).value || '';
      localStorage.setItem(connectorKey, JSON.stringify({ searchUrl, tokenUrl }));
    });
  }

  // Search users
  const connectorSearchBtn = $('#connector-search-btn');
  if (connectorSearchBtn) {
    connectorSearchBtn.addEventListener('click', async () => {
      const resultsEl = $('#connector-results');
      if (!resultsEl) return;
      let config = {};
      try { const connectorKey = 'apiforge-connector-config'; config = JSON.parse(localStorage.getItem(connectorKey) || '{}'); } catch (e) { /* ignore */ }
      const searchUrl = config.searchUrl || '';
      const query = ($('#connector-search-input') || {}).value || '';
      if (!searchUrl) return;
      try {
        const res = await fetch(searchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        const data = await res.json();
        const userList = data.users || [];
        resultsEl.innerHTML = userList.map((u) =>
          `<div data-testid="connector-user-row" data-id="${u.uid || u.id}" data-email="${u.email}" data-name="${u.nickname || u.name || u.email}" style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;border-bottom:1px solid var(--border);font-size:13px;">
            <span>${u.email}${u.nickname ? ' — ' + u.nickname : (u.name ? ' — ' + u.name : '')}</span>
            <button class="btn btn-secondary" data-testid="connector-get-token-btn" data-id="${u.uid || u.id}" data-name="${u.nickname || u.name || u.email}" data-email="${u.email}" style="font-size:11px;padding:4px 10px;">Get Token</button>
          </div>`
        ).join('');
        if (userList.length === 0) resultsEl.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">No users found</div>';
      } catch (e) { if (resultsEl) resultsEl.innerHTML = '<div style="color:red;font-size:12px;">Search failed: ' + e.message + '</div>'; }
    });
  }

  // Get token (delegated via event delegation on results container)
  const connectorResultsEl = $('#connector-results');
  if (connectorResultsEl) {
    connectorResultsEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-testid="connector-get-token-btn"]');
      if (!btn) return;
      const userId = btn.dataset.id;
      const userName = btn.dataset.name || btn.dataset.email;
      const userEmail = btn.dataset.email;
      let config = {};
      try { const connectorKey = 'apiforge-connector-config'; config = JSON.parse(localStorage.getItem(connectorKey) || '{}'); } catch (err) { /* ignore */ }
      const tokenUrl = (config.tokenUrl || '').replace('{id}', userId);
      if (!tokenUrl) return;
      try {
        const res = await fetch(tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        const data = await res.json();
        if (data.token) {
          window._connectorToken = data.token;
          localStorage.setItem('apiforge-connector-token', data.token);
          const activeSection = $('#connector-active-token');
          const activeUser = $('#connector-active-user');
          if (activeSection) activeSection.classList.remove('hidden');
          if (activeUser) activeUser.textContent = userEmail || userName;
        }
      } catch (err) { /* ignore */ }
    });
  }

  // Clear connector token
  const connectorClearBtn = $('#connector-clear-token');
  if (connectorClearBtn) {
    connectorClearBtn.addEventListener('click', () => {
      window._connectorToken = null;
      localStorage.removeItem('apiforge-connector-token');
      const activeSection = $('#connector-active-token');
      const activeUser = $('#connector-active-user');
      if (activeSection) activeSection.classList.add('hidden');
      if (activeUser) activeUser.textContent = '';
    });
  }

  // URL input -> sync to params editor
  const urlInput = $('#url-input');
  if (urlInput) {
    urlInput.addEventListener('input', () => {
      syncUrlToParams();
    });
  }

  // Save gRPC target on input (2-2)
  const grpcTarget = $('#grpc-target');
  if (grpcTarget) {
    grpcTarget.addEventListener('input', () => {
      localStorage.setItem('apiforge-grpc-target', grpcTarget.value);
    });
  }
});

// ─── Save as Doc Feature ──────────────────────────────────
function getUserDocs() {
  try {
    return JSON.parse(localStorage.getItem('apiforge-user-docs') || '[]');
  } catch { return []; }
}

function saveUserDocs(docs) {
  localStorage.setItem('apiforge-user-docs', JSON.stringify(docs));
}

function extractBaseUrl(fullUrl) {
  try {
    const url = new URL(fullUrl);
    return url.origin;
  } catch {
    return '';
  }
}

function extractEndpointFromTab(tab) {
  let urlStr = tab.url || '';
  if (!urlStr) return null;
  let parsedUrl;
  try {
    parsedUrl = new URL(urlStr.startsWith('http') ? urlStr : 'http://localhost' + urlStr);
  } catch {
    return { method: tab.method, path: urlStr, summary: tab.method + ' ' + urlStr, parameters: [], responses: {} };
  }
  const params = [];
  parsedUrl.searchParams.forEach((v, k) => {
    params.push({ name: k, in: 'query', schema: { type: 'string' }, example: v });
  });
  let requestBody;
  if (tab.body) {
    try {
      requestBody = { content: { 'application/json': { example: JSON.parse(tab.body) } } };
    } catch {
      requestBody = { content: { 'text/plain': { example: tab.body } } };
    }
  }
  const responses = {};
  if (tab.response) {
    responses[String(tab.response.status || 200)] = {
      description: 'Response',
      content: { 'application/json': { example: tab.response.body } },
    };
  }
  return {
    method: tab.method,
    path: parsedUrl.pathname,
    summary: tab.method + ' ' + parsedUrl.pathname,
    parameters: params,
    requestBody: requestBody || undefined,
    responses: responses,
  };
}

function userDocToOpenApiSpec(doc) {
  const paths = {};
  (doc.endpoints || []).forEach((ep) => {
    if (!paths[ep.path]) paths[ep.path] = {};
    const op = { summary: ep.summary || '', parameters: ep.parameters || [], responses: ep.responses || {} };
    if (ep.requestBody) op.requestBody = ep.requestBody;
    paths[ep.path][ep.method.toLowerCase()] = op;
  });
  return {
    openapi: '3.0.0',
    info: { title: doc.title, version: doc.version || '1.0.0' },
    servers: [{ url: doc.baseUrl }],
    paths: paths,
  };
}

function findMatchingUserDoc(baseUrl) {
  if (!baseUrl) return null;
  const docs = getUserDocs();
  return docs.find((d) => d.baseUrl === baseUrl) || null;
}

function updateSaveAsDocButton() {
  const btn = $('#save-as-doc-btn');
  if (!btn) return;
  const tab = appState.tabs.find((t) => t.id === appState.activeTabId);
  if (!tab || tab.type === 'docs') {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = (tab.source && tab.source.createdFromSpec) ? 'none' : '';
}

function getActiveTabLive() {
  const tab = appState.tabs.find((t) => t.id === appState.activeTabId);
  if (!tab || tab.type === 'docs') return tab;
  // Read live values from DOM
  return Object.assign({}, tab, {
    method: $('#method-select')?.value || tab.method,
    url: $('#url-input')?.value || tab.url,
    body: (typeof bodyEditor !== 'undefined' && bodyEditor) ? bodyEditor.getValue() : tab.body,
    response: tab.response,
  });
}

function openSaveDocModal(mode, existingDoc) {
  const modal = $('#save-doc-modal');
  if (!modal) return;

  const tab = getActiveTabLive();
  if (!tab) return;

  const baseUrl = extractBaseUrl(tab.url || '');
  const ep = extractEndpointFromTab(tab);

  if (mode === 'existing' && existingDoc) {
    // Show "add to existing" mode
    $('#save-doc-title').textContent = 'Add to Existing Doc';
    $('#save-doc-form').classList.add('hidden');
    $('#save-doc-existing').classList.remove('hidden');
    $('#save-doc-existing-name').textContent = existingDoc.title;
    $('#save-doc-endpoint-name').textContent = (ep ? ep.method + ' ' + ep.path : '');
    $('#save-doc-submit').textContent = 'Add';
    $('#save-doc-create-new').classList.remove('hidden');
    modal._mode = 'existing';
    modal._existingDoc = existingDoc;
  } else {
    // Show "create new" mode
    $('#save-doc-title').textContent = 'Create New API Doc';
    $('#save-doc-form').classList.remove('hidden');
    $('#save-doc-existing').classList.add('hidden');
    $('#save-doc-name').value = '';
    $('#save-doc-baseurl').value = baseUrl;
    $('#save-doc-version').value = '1.0.0';
    $('#save-doc-submit').textContent = 'Create';
    $('#save-doc-create-new').classList.add('hidden');
    modal._mode = 'create';
    modal._existingDoc = null;
  }

  modal.classList.remove('hidden');
}

function closeSaveDocModal() {
  const modal = $('#save-doc-modal');
  if (modal) modal.classList.add('hidden');
}

function handleSaveDocSubmit() {
  const modal = $('#save-doc-modal');
  if (!modal) return;

  const tab = appState.tabs.find((t) => t.id === appState.activeTabId);
  if (!tab) return;

  const liveTab = getActiveTabLive();
  const ep = extractEndpointFromTab(liveTab);
  if (!ep) return;

  let docs = getUserDocs();

  if (modal._mode === 'existing' && modal._existingDoc) {
    // Add endpoint to existing doc
    const doc = docs.find((d) => d.id === modal._existingDoc.id);
    if (!doc) return;
    // Avoid duplicates
    const exists = doc.endpoints.find((e) => e.method === ep.method && e.path === ep.path);
    if (!exists) {
      doc.endpoints.push(ep);
    } else {
      Object.assign(exists, ep);
    }
    doc.updatedAt = new Date().toISOString();
    saveUserDocs(docs);

    // Reload spec from this doc
    const spec = userDocToOpenApiSpec(doc);
    loadSpec(spec, { specMode: false });

    // Update tab source
    tab.source = {
      specTitle: doc.title,
      specHash: simpleHash(JSON.stringify(doc)),
      endpointKey: ep.method + ' ' + ep.path,
      createdFromSpec: true,
    };
    renderSourceBreadcrumb(tab);
    updateSaveAsDocButton();
    renderTabBar();
  } else {
    // Create new doc
    const name = ($('#save-doc-name')?.value || '').trim();
    const baseUrl = ($('#save-doc-baseurl')?.value || '').trim();
    const version = ($('#save-doc-version')?.value || '1.0.0').trim();

    if (!name) {
      $('#save-doc-name')?.focus();
      return;
    }

    const doc = {
      id: 'doc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      title: name,
      baseUrl: baseUrl,
      version: version,
      endpoints: [ep],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    docs.push(doc);
    saveUserDocs(docs);

    // Load as spec
    const spec = userDocToOpenApiSpec(doc);
    loadSpec(spec, { specMode: false });

    // Update tab source
    tab.source = {
      specTitle: doc.title,
      specHash: simpleHash(JSON.stringify(doc)),
      endpointKey: ep.method + ' ' + ep.path,
      createdFromSpec: true,
    };
    renderSourceBreadcrumb(tab);
    updateSaveAsDocButton();
    renderTabBar();
  }

  closeSaveDocModal();
  debouncedSaveWorkspace();
}

function initSaveAsDoc() {
  const btn = $('#save-as-doc-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const tab = getActiveTabLive();
    if (!tab) return;

    const baseUrl = extractBaseUrl(tab.url || '');

    // Check existing docs for matching base URL
    let matchingDoc = findMatchingUserDoc(baseUrl);

    // Also check current loaded spec
    if (!matchingDoc && appState.spec && appState.spec.servers) {
      const specBaseUrls = appState.spec.servers.map((s) => s.url);
      if (baseUrl && specBaseUrls.includes(baseUrl)) {
        // Current spec matches but is not a user doc - treat as no match
        matchingDoc = null;
      }
    }

    if (matchingDoc) {
      openSaveDocModal('existing', matchingDoc);
    } else {
      openSaveDocModal('create');
    }
  });

  // Modal buttons
  const cancelBtn = $('#save-doc-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', closeSaveDocModal);

  const overlay = document.querySelector('.save-doc-overlay');
  if (overlay) overlay.addEventListener('click', closeSaveDocModal);

  const submitBtn = $('#save-doc-submit');
  if (submitBtn) submitBtn.addEventListener('click', handleSaveDocSubmit);

  const createNewBtn = $('#save-doc-create-new');
  if (createNewBtn) {
    createNewBtn.addEventListener('click', () => {
      openSaveDocModal('create');
    });
  }
}

// Expose for e2e testing and other modules
window.loadSpec = loadSpec;
window.loadProto = loadProto;
window.loadFbs = loadFbs;
window.selectEndpoint = selectEndpoint;
window.selectEndpointFromSidebar = selectEndpointFromSidebar;
window.switchMode = switchMode;
window.tryItFromDocs = tryItFromDocs;
window.createDocsTab = createDocsTab;
window.createTab = createTab;
window.showPanelForTab = showPanelForTab;
window.appState = appState;
window.loadExamples = loadExamples;
window.saveExample = saveExample;
window.deleteExample = deleteExample;
window.hasExamples = hasExamples;
window.generateExample = generateExample;
window.resolveRef = resolveRef;
window.getQueryParamsFromUrl = getQueryParamsFromUrl;
window.setQueryParamsOnUrl = setQueryParamsOnUrl;
window.syncParamsToUrl = syncParamsToUrl;
window.syncUrlToParams = syncUrlToParams;
window.addParamRow = addParamRow;
window.addHeaderRow = addHeaderRow;
window.readHeaders = readHeaders;
window.readHeadersArray = readHeadersArray;
window.renderHeaders = renderHeaders;
window.setHeaderValue = setHeaderValue;
window.renderEnvVarsEditor = renderEnvVarsEditor;
window.renderEnvironments = renderEnvironments;
window.updateEnvVarBadge = updateEnvVarBadge;
window.switchBodyType = switchBodyType;
window.getBodyForSend = getBodyForSend;
window.buildCurlCommand = buildCurlCommand;
window.parseCurlCommand = parseCurlCommand;
window.applyCurlImport = applyCurlImport;
window.buildShareData = buildShareData;
window.loadSharedRequest = loadSharedRequest;
window.createTab = createTab;
window.switchTab = switchTab;
window.closeTab = closeTab;
window.saveCurrentTabState = saveCurrentTabState;
window.renderTabBar = renderTabBar;
window.refreshTabFromSpec = refreshTabFromSpec;
window.renderExamplesList = renderExamplesList;
window.getUserDocs = getUserDocs;
window.saveUserDocs = saveUserDocs;
window.extractBaseUrl = extractBaseUrl;
window.extractEndpointFromTab = extractEndpointFromTab;
window.userDocToOpenApiSpec = userDocToOpenApiSpec;
window.updateSaveAsDocButton = updateSaveAsDocButton;
window.getOrCreateCollectionRequest = getOrCreateCollectionRequest;
window.renderSavedCollections = renderSavedCollections;
window.openCollectionRequest = openCollectionRequest;
window.switchSidebarView = switchSidebarView;
window.updateSidebarCounts = updateSidebarCounts;
window.saveCollections = saveCollections;
window.loadCollections = loadCollections;
window.updateCollectionRequestFromTab = updateCollectionRequestFromTab;
window.saveResponseToCollection = saveResponseToCollection;
window.renderHistory = renderHistory;
window.updateHistoryCount = updateHistoryCount;
window.switchResponseTab = switchResponseTab;
window.viewHistoryItem = viewHistoryItem;
window.relativeTime = relativeTime;

// ─── Server Collections (real-time via SSE) ──────────────
let serverCollectionsCache = [];

function renderServerCollections(collections) {
  serverCollectionsCache = collections || [];
  const container = document.getElementById('saved-collections-list');
  if (!container) return;
  container.innerHTML = '';

  if (!collections || collections.length === 0) return;

  for (const col of collections) {
    const wrapper = document.createElement('div');
    wrapper.className = 'server-collection-item';
    wrapper.dataset.colId = col.id;

    const header = document.createElement('div');
    header.style.cssText = 'padding:6px 8px;cursor:pointer;border-radius:4px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:6px;';
    header.onmouseover = () => header.style.background = 'var(--bg-hover, rgba(255,255,255,0.05))';
    header.onmouseout = () => { if (!wrapper.classList.contains('expanded')) header.style.background = ''; };

    const arrow = document.createElement('span');
    arrow.className = 'folder-icon';
    arrow.innerHTML = '&#9654;';
    arrow.style.cssText = 'font-size:10px;';
    header.appendChild(arrow);

    const name = document.createElement('span');
    name.textContent = col.name || col.id;
    header.appendChild(name);

    const content = document.createElement('div');
    content.className = 'server-collection-content hidden';
    content.style.cssText = 'padding-left:8px;';

    header.addEventListener('click', async () => {
      const isExpanding = !wrapper.classList.contains('expanded');

      // Accordion: close all
      container.querySelectorAll('.server-collection-item').forEach((item) => {
        item.classList.remove('expanded');
        const c = item.querySelector('.server-collection-content');
        if (c) c.classList.add('hidden');
        const ic = item.querySelector('.folder-icon');
        if (ic) ic.innerHTML = '&#9654;';
        const hdr = item.querySelector('div');
        if (hdr) hdr.style.background = '';
      });

      if (isExpanding) {
        wrapper.classList.add('expanded');
        arrow.innerHTML = '&#9660;';
        header.style.background = 'var(--bg-hover, rgba(255,255,255,0.05))';
        content.classList.remove('hidden');

        // Fetch spec and render inline
        if (typeof window.apiFetchGlobal === 'function') {
          content.innerHTML = '<div style="padding:8px;font-size:11px;color:var(--text-muted);">Loading...</div>';
          const resp = await window.apiFetchGlobal('/api/collections/' + col.id);
          content.innerHTML = '';
          if (resp && resp.ok && resp.data && resp.data.spec) {
            try {
              const spec = JSON.parse(resp.data.spec);
              if (typeof window.loadSpec === 'function') window.loadSpec(spec);
            } catch (e) { content.innerHTML = '<div style="padding:8px;color:var(--error);font-size:11px;">Failed to load</div>'; }
          }
        }
      }
    });

    wrapper.appendChild(header);
    wrapper.appendChild(content);
    container.appendChild(wrapper);
  }
}

window.renderServerCollections = renderServerCollections;

async function refreshServerCollections() {
  if (typeof window.apiFetchGlobal !== 'function') {
    return;
  }
  try {
    const resp = await window.apiFetchGlobal('/api/collections');
    if (resp.ok && resp.data) {
      renderServerCollections(resp.data);
    }
  } catch (e) {
    console.error('[SSE] Failed to refresh collections:', e);
  }
}

// ─── Global History (Sidebar View) ───────────────────────
function renderGlobalHistory() {
  const container = $('#global-history-list');
  if (!container) return;
  const serverHist = appState.serverHistory || [];
  if (serverHist.length === 0) {
    container.innerHTML = '<div style="padding:16px;color:var(--text-secondary);font-size:12px;">No history yet. Request activity will appear here automatically.</div>';
    return;
  }
  let html = '';
  serverHist.forEach((entry) => {
    const st = Number(entry.status) || 0;
    const statusClass = st >= 200 && st < 300 ? 'status-ok' : st >= 400 ? 'status-error' : 'status-redirect';
    const source = entry.source || 'web';
    const sourceBadge = source === 'cli' ? '<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:var(--accent);color:#fff;">CLI</span>' : '<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:var(--text-muted);color:#fff;">WEB</span>';
    const env = entry.environment || '';
    const authT = entry.auth_type || '';
    const envBadge = env ? '<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:#2a6;color:#fff;">' + escapeHtml(env) + '</span>' : '';
    const authBadge = authT && authT !== 'none' ? '<span style="font-size:9px;padding:1px 4px;border-radius:3px;background:#c80;color:#fff;">' + escapeHtml(authT) + '</span>' : '';
    const timing = entry.timing_ms || 0;
    const ts = entry.created_at || '';
    const method = (entry.method || 'GET').toUpperCase();
    html += '<div class="history-item sidebar-item" data-global-history-id="' + (entry.id || '') + '" style="padding:6px 8px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">';
    html += '<span class="history-status ' + statusClass + '" style="font-size:10px;font-weight:700;min-width:28px;">' + st + '</span>';
    html += '<span style="font-size:10px;font-weight:600;color:var(--method-color,var(--text-secondary));min-width:36px;">' + escapeHtml(method) + '</span>';
    html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-primary);">' + escapeHtml(entry.url || '') + '</span>';
    html += '<span style="display:flex;gap:2px;">' + sourceBadge + envBadge + authBadge + '</span>';
    html += '<span style="font-size:10px;color:var(--text-muted);white-space:nowrap;">' + timing + 'ms</span>';
    html += '<span style="font-size:10px;color:var(--text-muted);white-space:nowrap;">' + (ts ? relativeTime(ts) : '') + '</span>';
    html += '</div>';
  });
  container.innerHTML = html;

  // Click to view details
  container.querySelectorAll('[data-global-history-id]').forEach((item) => {
    item.addEventListener('click', () => {
      viewServerHistoryItem(item.dataset.globalHistoryId);
    });
  });
}

// ─── Server History (Global — CLI + Web) ─────────────────
async function loadServerHistory() {
  if (!window.apiFetchGlobal) return;
  try {
    const { ok, data } = await window.apiFetchGlobal('/api/history?limit=100');
    if (ok && Array.isArray(data)) {
      appState.serverHistory = data;
    }
  } catch { /* server unavailable */ }
}

async function refreshServerHistory() {
  await loadServerHistory();
  // Re-render if history tab is active
  const historyPanel = $('#response-tab-history');
  if (historyPanel && !historyPanel.classList.contains('hidden')) {
    renderHistory();
  }
  // Re-render sidebar history if visible
  const historySection = $('#history-section');
  if (historySection && !historySection.classList.contains('hidden')) {
    renderGlobalHistory();
  }
}

function viewServerHistoryItem(serverId) {
  const entry = (appState.serverHistory || []).find((h) => h.id === serverId);
  if (!entry) return;

  // Populate URL and method inputs
  const methodSelect = $('#method-select');
  const urlInput = $('#url-input');
  if (methodSelect) methodSelect.value = (entry.method || 'GET').toUpperCase();
  if (urlInput) urlInput.value = entry.url || '';

  // Switch environment if specified
  const envName = entry.environment || '';
  if (envName) {
    const envSelector = $('#env-selector');
    if (envSelector) {
      const idx = appState.environments.findIndex((e) => e.name === envName);
      if (idx >= 0) {
        envSelector.value = idx;
        appState.activeEnv = appState.environments[idx];
        envSelector.dispatchEvent(new Event('change'));
      }
    }
  }
}

window.loadServerHistory = loadServerHistory;
window.refreshServerHistory = refreshServerHistory;
window.renderGlobalHistory = renderGlobalHistory;
window.refreshServerCollections = refreshServerCollections;
