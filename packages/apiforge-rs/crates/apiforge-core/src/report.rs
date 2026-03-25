use crate::history::HistoryEntry;

/// Generate a Markdown report from history entries.
pub fn generate_markdown(entries: &[HistoryEntry]) -> String {
    let mut out = String::new();
    out.push_str("# APIForge Request Report\n\n");
    out.push_str(&format!("Generated: {}\n\n", chrono::Utc::now().to_rfc3339()));
    out.push_str(&format!("Total requests: {}\n\n", entries.len()));
    out.push_str("---\n\n");

    for (i, entry) in entries.iter().enumerate() {
        out.push_str(&format!("## Request {}\n\n", i + 1));
        out.push_str(&format!("- **Method:** {}\n", entry.method));
        out.push_str(&format!("- **URL:** {}\n", entry.url));
        out.push_str(&format!("- **Status:** {}\n", entry.status));
        out.push_str(&format!("- **Time:** {}ms\n", entry.timing_ms));
        out.push_str(&format!("- **Timestamp:** {}\n", entry.timestamp));

        if let Some(body) = &entry.request_body {
            out.push_str("\n### Request Body\n\n");
            out.push_str("```json\n");
            out.push_str(body);
            out.push_str("\n```\n");
        }

        if let Some(body) = &entry.response_body {
            out.push_str("\n### Response Body\n\n");
            out.push_str("```json\n");
            // Truncate very long response bodies
            if body.len() > 2000 {
                out.push_str(&body[..2000]);
                out.push_str("\n... (truncated)");
            } else {
                out.push_str(body);
            }
            out.push_str("\n```\n");
        }

        out.push_str("\n---\n\n");
    }

    out
}

/// Generate a JSON report from history entries.
pub fn generate_json(entries: &[HistoryEntry]) -> String {
    let report = serde_json::json!({
        "title": "APIForge Request Report",
        "generated": chrono::Utc::now().to_rfc3339(),
        "total": entries.len(),
        "entries": entries,
    });
    serde_json::to_string_pretty(&report).unwrap_or_default()
}

/// Generate an HTML report from history entries with basic styling.
pub fn generate_html(entries: &[HistoryEntry]) -> String {
    let mut out = String::new();
    out.push_str("<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n");
    out.push_str("<meta charset=\"UTF-8\">\n");
    out.push_str("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n");
    out.push_str("<title>APIForge Request Report</title>\n");
    out.push_str("<style>\n");
    out.push_str("body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 960px; margin: 0 auto; padding: 20px; background: #f5f5f5; }\n");
    out.push_str("h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }\n");
    out.push_str(".entry { background: #fff; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }\n");
    out.push_str(".method { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; color: #fff; }\n");
    out.push_str(".GET { background: #28a745; } .POST { background: #007bff; } .PUT { background: #fd7e14; } .PATCH { background: #ffc107; color: #333; } .DELETE { background: #dc3545; }\n");
    out.push_str(".status { font-weight: bold; } .status.ok { color: #28a745; } .status.err { color: #dc3545; }\n");
    out.push_str("pre { background: #f8f9fa; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 13px; }\n");
    out.push_str(".meta { color: #666; font-size: 0.9em; }\n");
    out.push_str("</style>\n</head>\n<body>\n");
    out.push_str("<h1>APIForge Request Report</h1>\n");
    out.push_str(&format!("<p class=\"meta\">Generated: {} | Total requests: {}</p>\n",
        chrono::Utc::now().to_rfc3339(), entries.len()));

    for entry in entries {
        let status_class = if entry.status < 400 { "ok" } else { "err" };
        out.push_str("<div class=\"entry\">\n");
        out.push_str(&format!(
            "<p><span class=\"method {}\">{}</span> <code>{}</code></p>\n",
            entry.method, entry.method, html_escape(&entry.url)
        ));
        out.push_str(&format!(
            "<p><span class=\"status {}\">Status: {}</span> | Time: {}ms | {}</p>\n",
            status_class, entry.status, entry.timing_ms, html_escape(&entry.timestamp)
        ));

        if let Some(body) = &entry.request_body {
            out.push_str("<details><summary>Request Body</summary>\n");
            out.push_str(&format!("<pre>{}</pre>\n", html_escape(body)));
            out.push_str("</details>\n");
        }

        if let Some(body) = &entry.response_body {
            out.push_str("<details><summary>Response Body</summary>\n");
            let display = if body.len() > 2000 {
                format!("{}... (truncated)", &body[..2000])
            } else {
                body.clone()
            };
            out.push_str(&format!("<pre>{}</pre>\n", html_escape(&display)));
            out.push_str("</details>\n");
        }

        out.push_str("</div>\n");
    }

    out.push_str("</body>\n</html>\n");
    out
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}
