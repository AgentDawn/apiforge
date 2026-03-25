// APIForge Response Insights - Lightweight client-side response analysis
// Detects common API issues: unsorted data, missing pagination, etc.

const $ = (sel) => document.querySelector(sel);

const insightRules = [
  {
    id: 'unsorted-ids',
    check(parsed) {
      const arr = findArray(parsed);
      if (!arr || arr.length < 3) return null;
      const ids = arr.map(item => item.id ?? item.ID ?? item._id).filter(v => v != null);
      if (ids.length < 3) return null;

      const allNumbers = ids.every(v => typeof v === 'number');
      if (!allNumbers) return null;

      const isAsc = ids.every((v, i) => i === 0 || v >= ids[i - 1]);
      const isDesc = ids.every((v, i) => i === 0 || v <= ids[i - 1]);
      if (!isAsc && !isDesc) {
        return {
          type: 'warning',
          message: `IDs are not sorted (${ids.length} items). Ask your backend team to return sorted results, or add a sort parameter (e.g. ?sort=id&order=asc) to your request.`,
        };
      }
      return null;
    },
  },
  {
    id: 'no-pagination',
    check(parsed) {
      const arr = findArray(parsed);
      if (!arr || arr.length < 20) return null;

      // Check if response has pagination metadata
      const hasPage = parsed.page != null || parsed.pageSize != null ||
        parsed.per_page != null || parsed.total != null ||
        parsed.totalPages != null || parsed.total_pages != null ||
        parsed.nextCursor != null || parsed.next_cursor != null ||
        parsed.next != null || parsed.offset != null || parsed.limit != null;
      if (hasPage) return null;

      return {
        type: 'info',
        message: `Large response (${arr.length} items) without pagination. Ask your backend team to implement pagination (e.g. ?page=1&limit=20), or check if the API already supports pagination parameters you're not using.`,
      };
    },
  },
  {
    id: 'null-fields',
    check(parsed) {
      const arr = findArray(parsed);
      if (!arr || arr.length < 2) return null;

      const nullCounts = {};
      for (const item of arr) {
        if (typeof item !== 'object' || !item) continue;
        for (const [key, val] of Object.entries(item)) {
          if (val === null || val === undefined) {
            nullCounts[key] = (nullCounts[key] || 0) + 1;
          }
        }
      }

      const alwaysNull = Object.entries(nullCounts)
        .filter(([, count]) => count === arr.length)
        .map(([key]) => key);

      if (alwaysNull.length === 0) return null;
      return {
        type: 'info',
        message: `Fields always null: ${alwaysNull.join(', ')}. Check with your backend team if these fields require additional query parameters or permissions to populate.`,
      };
    },
  },
  {
    id: 'duplicate-ids',
    check(parsed) {
      const arr = findArray(parsed);
      if (!arr || arr.length < 2) return null;
      const ids = arr.map(item => item.id ?? item.ID ?? item._id).filter(v => v != null);
      if (ids.length < 2) return null;

      const seen = new Set();
      const dupes = [];
      for (const id of ids) {
        if (seen.has(id)) dupes.push(id);
        seen.add(id);
      }
      if (dupes.length === 0) return null;
      return {
        type: 'error',
        message: `Duplicate IDs found: ${[...new Set(dupes)].slice(0, 5).join(', ')}. Report this to your backend team — this likely indicates a data integrity or query issue on the server side.`,
      };
    },
  },
  {
    id: 'slow-response',
    check(parsed, meta) {
      if (!meta.timing || meta.timing < 2000) return null;
      return {
        type: 'warning',
        message: `Slow response (${(meta.timing / 1000).toFixed(1)}s). Ask your backend team to optimize this endpoint — consider adding indexes, pagination, caching, or reducing the response payload.`,
      };
    },
  },
  {
    id: 'limit-mismatch',
    check(parsed, meta) {
      const arr = findArray(parsed);
      if (!arr || arr.length === 0) return null;

      // Extract limit/size/count from URL query params
      let requestedLimit = null;
      try {
        const url = meta.url || '';
        const search = url.includes('?') ? url.slice(url.indexOf('?')) : '';
        const params = new URLSearchParams(search);
        for (const key of ['limit', 'size', 'count', 'per_page', 'pageSize', 'page_size']) {
          const val = params.get(key);
          if (val && !isNaN(Number(val))) {
            requestedLimit = Number(val);
            break;
          }
        }
      } catch { /* ignore */ }

      if (requestedLimit == null) return null;
      if (arr.length > requestedLimit) {
        return {
          type: 'warning',
          message: `Requested limit=${requestedLimit} but received ${arr.length} items. The backend may not be respecting the limit parameter — report this to your backend team.`,
        };
      }
      return null;
    },
  },
  {
    id: 'empty-array',
    check(parsed) {
      const arr = findArray(parsed);
      if (arr && arr.length === 0) {
        return {
          type: 'info',
          message: 'Response returned an empty array. Double-check your query parameters and filters, or verify with your backend team that the requested data exists.',
        };
      }
      return null;
    },
  },
];

/** Find the primary array in a response (top-level or nested under data/items/results) */
function findArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed !== 'object' || !parsed) return null;
  for (const key of ['data', 'items', 'results', 'records', 'rows', 'list', 'entries', 'content']) {
    if (Array.isArray(parsed[key])) return parsed[key];
  }
  return null;
}

function analyzeResponse(bodyText, meta = {}) {
  let parsed;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return []; // Not JSON, skip analysis
  }

  const insights = [];
  for (const rule of insightRules) {
    const result = rule.check(parsed, meta);
    if (result) {
      insights.push({ ...result, id: rule.id });
    }
  }
  return insights;
}

function renderInsights(insights) {
  let container = $('#response-insights');
  if (!container) {
    container = document.createElement('div');
    container.id = 'response-insights';
    container.dataset.testid = 'response-insights';
    // Insert after response-header, before response-body
    const responseBody = $('#response-body-wrap');
    responseBody.parentNode.insertBefore(container, responseBody);
  }

  if (insights.length === 0) {
    container.innerHTML = '';
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = insights.map(insight => {
    const icon = insight.type === 'error' ? '!' : insight.type === 'warning' ? '!' : 'i';
    return `<div class="response-insight response-insight-${insight.type}" data-testid="insight-${insight.id}">
      <span class="insight-icon insight-icon-${insight.type}">${icon}</span>
      <span class="insight-text">${insight.message}</span>
    </div>`;
  }).join('');

}

/** Hook into showResponse - called from app.js after rendering */
function runInsights(bodyText, meta) {
  const insights = analyzeResponse(bodyText, meta);
  renderInsights(insights);
}

// Expose globally so app.js can call it
window.responseInsights = { runInsights, analyzeResponse };

// Inject styles for insights
function injectInsightStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #response-insights { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
    .response-insight { display:flex; align-items:flex-start; gap:8px; padding:8px 12px; border-radius:var(--radius); font-size:12px; line-height:1.5; }
    .response-insight-warning { background:rgba(251,191,36,0.1); border:1px solid rgba(251,191,36,0.3); }
    .response-insight-error { background:rgba(248,113,113,0.1); border:1px solid rgba(248,113,113,0.3); }
    .response-insight-info { background:rgba(96,165,250,0.1); border:1px solid rgba(96,165,250,0.3); }
    .insight-icon { width:18px; height:18px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; }
    .insight-icon-warning { background:var(--warning); color:#000; }
    .insight-icon-error { background:var(--error); color:#fff; }
    .insight-icon-info { background:#60a5fa; color:#fff; }
    .insight-text { color:var(--text-primary); }
    .insight-analyze-btn { margin-top:4px; font-size:11px; padding:5px 12px; align-self:flex-start; }
  `;
  document.head.appendChild(style);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectInsightStyles);
} else {
  injectInsightStyles();
}
