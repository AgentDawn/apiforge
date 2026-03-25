use crate::models::*;
use regex::Regex;
use std::collections::BTreeMap;
use std::sync::LazyLock;

// ─── Regex patterns ─────────────────────────────────────────

static RE_CONTROLLER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@Controller\s*\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)\s*\)"#).unwrap()
});

static RE_CONTROLLER_OBJ: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@Controller\s*\(\s*\{[^}]*path\s*:\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)"#)
        .unwrap()
});

static RE_CONTROLLER_EMPTY: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"@Controller\s*\(\s*\)"#).unwrap());

static RE_HTTP_METHOD: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@(Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)?\s*\)"#).unwrap()
});

static RE_API_TAGS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@ApiTags\s*\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)\s*\)"#).unwrap()
});

static RE_API_OPERATION: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@ApiOperation\s*\(\s*\{"#).unwrap()
});

static RE_API_EXCLUDE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"@ApiExcludeEndpoint\s*\("#).unwrap());

static RE_API_BEARER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@ApiBearerAuth\s*\(\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)?\s*\)"#).unwrap()
});

static RE_HTTP_CODE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@HttpCode\s*\(\s*(\d+)\s*\)"#).unwrap()
});

static RE_CLASS_DECL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+[\w,\s<>]+)?\s*\{"#).unwrap()
});

static RE_API_PROPERTY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@ApiProperty(?:Optional)?\s*\(\s*\{"#).unwrap()
});

static RE_API_PROPERTY_EMPTY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@ApiProperty(?:Optional)?\s*\(\s*\)"#).unwrap()
});

static RE_API_PROPERTY_OPTIONAL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@ApiPropertyOptional"#).unwrap()
});

static RE_FIELD_DECL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"^\s*(?:readonly\s+)?(\w+)(\??)\s*:\s*(.+?)\s*;?\s*$"#).unwrap()
});

static RE_RESPONSE_DECORATOR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@Api(Ok|Created|Accepted|NoContent|MovedPermanently|Found|BadRequest|Unauthorized|Forbidden|NotFound|MethodNotAllowed|NotAcceptable|RequestTimeout|Conflict|PreconditionFailed|PayloadTooLarge|UnprocessableEntity|TooManyRequests|InternalServerError|ServiceUnavailable|GatewayTimeout|Default)Response\s*\("#).unwrap()
});

static RE_API_PARAM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@ApiParam\s*\(\s*\{"#).unwrap()
});

static RE_API_QUERY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@ApiQuery\s*\(\s*\{"#).unwrap()
});

static RE_API_BODY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@ApiBody\s*\(\s*\{"#).unwrap()
});

static RE_PARAM_DECORATOR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@Param\s*\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)"#).unwrap()
});

static RE_QUERY_DECORATOR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@Query\s*\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)"#).unwrap()
});

// RE_BODY_DECORATOR kept for potential future use with method param parsing
#[allow(dead_code)]
static RE_BODY_DECORATOR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@Body\s*\(\s*(?:'([^']*)'|"([^"]*)")?\s*\)"#).unwrap()
});

static RE_ENUM_DECL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:export\s+)?enum\s+(\w+)\s*\{"#).unwrap()
});

static RE_STRING_VAL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?:'([^']*)'|"([^"]*)")"#).unwrap()
});

static RE_PATH_PARAM: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\{(\w+)\}").unwrap()
});

static RE_RETURN_TYPE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"\)\s*:\s*([\w<>\[\]|,\s]+?)\s*\{"#).unwrap()
});

static RE_BODY_INFER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"@Body\s*\(\s*\)\s*\w+\s*:\s*([\w\[\]<>]+)"#).unwrap()
});

static RE_PARAM_TYPE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"^\s*\w+\??\s*:\s*(\w+)"#).unwrap()
});

// ─── Utility functions ──────────────────────────────────────

/// Find matching closing brace starting from an opening brace position
pub fn find_closing_brace(content: &str, open_pos: usize) -> usize {
    let bytes = content.as_bytes();
    let mut depth = 0i32;
    let mut in_string = false;
    let mut string_char = 0u8;
    let mut i = open_pos;
    while i < bytes.len() {
        let ch = bytes[i];
        if in_string {
            if ch == b'\\' {
                i += 1; // skip escaped char
            } else if ch == string_char {
                in_string = false;
            }
        } else {
            match ch {
                b'\'' | b'"' | b'`' => {
                    in_string = true;
                    string_char = ch;
                }
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        return i;
                    }
                }
                b'/' if i + 1 < bytes.len() => {
                    if bytes[i + 1] == b'/' {
                        // line comment - skip to end of line
                        while i < bytes.len() && bytes[i] != b'\n' {
                            i += 1;
                        }
                        continue;
                    } else if bytes[i + 1] == b'*' {
                        // block comment - skip to */
                        i += 2;
                        while i + 1 < bytes.len() {
                            if bytes[i] == b'*' && bytes[i + 1] == b'/' {
                                i += 1;
                                break;
                            }
                            i += 1;
                        }
                    }
                }
                _ => {}
            }
        }
        i += 1;
    }
    content.len()
}

/// Find matching closing paren
fn find_closing_paren(content: &str, open_pos: usize) -> usize {
    let bytes = content.as_bytes();
    let mut depth = 0i32;
    let mut in_string = false;
    let mut string_char = 0u8;
    let mut i = open_pos;
    while i < bytes.len() {
        let ch = bytes[i];
        if in_string {
            if ch == b'\\' {
                i += 1;
            } else if ch == string_char {
                in_string = false;
            }
        } else {
            match ch {
                b'\'' | b'"' | b'`' => {
                    in_string = true;
                    string_char = ch;
                }
                b'(' => depth += 1,
                b')' => {
                    depth -= 1;
                    if depth == 0 {
                        return i;
                    }
                }
                _ => {}
            }
        }
        i += 1;
    }
    content.len()
}

/// Find the value after `key:` or `key :` in object literal text, returning the position after colon
fn find_key_value_start(obj_text: &str, key: &str) -> Option<usize> {
    let mut search_from = 0;
    while let Some(pos) = obj_text[search_from..].find(key) {
        let abs_pos = search_from + pos;
        // Check that the character before is a boundary (start, comma, whitespace, brace)
        if abs_pos > 0 {
            let before = obj_text.as_bytes()[abs_pos - 1];
            if before.is_ascii_alphanumeric() || before == b'_' {
                search_from = abs_pos + 1;
                continue;
            }
        }
        // Find colon after key
        let after_key = abs_pos + key.len();
        let rest = &obj_text[after_key..];
        let trimmed = rest.trim_start();
        if trimmed.starts_with(':') {
            let colon_offset = after_key + (rest.len() - trimmed.len());
            return Some(colon_offset + 1); // position after the colon
        }
        search_from = abs_pos + 1;
    }
    None
}

/// Extract a quoted string value after a colon position
fn extract_string_at(text: &str, start: usize) -> Option<String> {
    let rest = text[start..].trim_start();
    let first = rest.as_bytes().first()?;
    match first {
        b'\'' => {
            let end = rest[1..].find('\'')?;
            Some(rest[1..1 + end].to_string())
        }
        b'"' => {
            let end = rest[1..].find('"')?;
            Some(rest[1..1 + end].to_string())
        }
        b'`' => {
            let end = rest[1..].find('`')?;
            Some(rest[1..1 + end].to_string())
        }
        _ => None,
    }
}

/// Extract a string value from a key in an object literal text
fn extract_obj_string(obj_text: &str, key: &str) -> Option<String> {
    let start = find_key_value_start(obj_text, key)?;
    extract_string_at(obj_text, start)
}

/// Extract a type name from `type: TypeName` or `type: () => TypeName`
fn extract_obj_type(obj_text: &str) -> Option<String> {
    let start = find_key_value_start(obj_text, "type")?;
    let rest = obj_text[start..].trim_start();

    // type: () => TypeName
    if rest.starts_with('(') {
        if let Some(arrow_pos) = rest.find("=>") {
            let after_arrow = rest[arrow_pos + 2..].trim_start();
            let end = after_arrow
                .find(|c: char| !c.is_alphanumeric() && c != '_')
                .unwrap_or(after_arrow.len());
            if end > 0 {
                return Some(after_arrow[..end].to_string());
            }
        }
        return None;
    }

    // type: [TypeName]
    if rest.starts_with('[') {
        let inner = &rest[1..];
        let inner_trimmed = inner.trim_start();
        let end = inner_trimmed
            .find(|c: char| !c.is_alphanumeric() && c != '_')
            .unwrap_or(inner_trimmed.len());
        if end > 0 {
            return Some(inner_trimmed[..end].to_string());
        }
        return None;
    }

    // type: TypeName (identifier)
    let end = rest
        .find(|c: char| !c.is_alphanumeric() && c != '_')
        .unwrap_or(rest.len());
    if end > 0 {
        let t = &rest[..end];
        if t != "true" && t != "false" {
            return Some(t.to_string());
        }
    }

    None
}

/// Extract bool value from object text
fn extract_obj_bool(obj_text: &str, key: &str) -> Option<bool> {
    let start = find_key_value_start(obj_text, key)?;
    let rest = obj_text[start..].trim_start();
    if rest.starts_with("true") {
        Some(true)
    } else if rest.starts_with("false") {
        Some(false)
    } else {
        None
    }
}

/// Extract a numeric value
fn extract_obj_number(obj_text: &str, key: &str) -> Option<serde_json::Value> {
    let start = find_key_value_start(obj_text, key)?;
    let rest = obj_text[start..].trim_start();
    let end = rest
        .find(|c: char| !c.is_ascii_digit() && c != '.' && c != '-')
        .unwrap_or(rest.len());
    if end == 0 {
        return None;
    }
    let num_str = &rest[..end];
    if num_str.contains('.') {
        num_str.parse::<f64>().ok().map(|n| serde_json::json!(n))
    } else {
        num_str.parse::<i64>().ok().map(|n| serde_json::json!(n))
    }
}

/// Extract enum values from object text (enum: [val1, val2])
fn extract_obj_enum(obj_text: &str) -> Option<Vec<serde_json::Value>> {
    let start = find_key_value_start(obj_text, "enum")?;
    let rest = obj_text[start..].trim_start();
    if !rest.starts_with('[') {
        return None;
    }
    let bracket_end = rest.find(']')?;
    let inner = &rest[1..bracket_end];
    let vals: Vec<serde_json::Value> = RE_STRING_VAL
        .captures_iter(inner)
        .map(|c| {
            let v = c.get(1).or_else(|| c.get(2)).unwrap().as_str();
            serde_json::Value::String(v.to_string())
        })
        .collect();
    if vals.is_empty() {
        None
    } else {
        Some(vals)
    }
}

/// Extract a value after `key:` - handles strings, numbers, booleans
fn extract_value_at(text: &str, start: usize) -> Option<serde_json::Value> {
    let rest = text[start..].trim_start();
    let first = *rest.as_bytes().first()?;
    match first {
        b'\'' | b'"' | b'`' => {
            let delim = first as char;
            let end = rest[1..].find(delim)?;
            Some(serde_json::Value::String(rest[1..1 + end].to_string()))
        }
        b't' if rest.starts_with("true") => Some(serde_json::Value::Bool(true)),
        b'f' if rest.starts_with("false") => Some(serde_json::Value::Bool(false)),
        b'-' | b'0'..=b'9' => {
            let end = rest
                .find(|c: char| !c.is_ascii_digit() && c != '.' && c != '-')
                .unwrap_or(rest.len());
            let num_str = &rest[..end];
            if num_str.contains('.') {
                num_str.parse::<f64>().ok().map(|n| serde_json::json!(n))
            } else {
                num_str.parse::<i64>().ok().map(|n| serde_json::json!(n))
            }
        }
        _ => None,
    }
}

/// Extract an example value from object text
fn extract_obj_example(obj_text: &str) -> Option<serde_json::Value> {
    let start = find_key_value_start(obj_text, "example")?;
    extract_value_at(obj_text, start)
}


/// Map TypeScript type string to OpenAPI schema type
fn ts_type_to_schema_type(ts_type: &str) -> (Option<String>, Option<String>, Option<String>) {
    let trimmed = ts_type.trim();
    match trimmed {
        "string" => (Some("string".into()), None, None),
        "number" | "int" | "integer" | "float" => (Some("number".into()), None, None),
        "boolean" | "bool" => (Some("boolean".into()), None, None),
        "Date" => (Some("string".into()), Some("date-time".into()), None),
        "any" | "object" | "Record<string, any>" => (Some("object".into()), None, None),
        "void" | "undefined" | "null" | "never" => (None, None, None),
        _ => {
            // Array types: string[], number[], SomeDto[]
            if let Some(inner) = trimmed.strip_suffix("[]") {
                let inner = inner.trim();
                let (inner_type, inner_fmt, inner_ref) = ts_type_to_schema_type(inner);
                // Return array marker with inner info
                return (
                    Some("array".into()),
                    inner_fmt,
                    inner_ref.or_else(|| inner_type.map(|t| format!("__primitive:{}", t))),
                );
            }
            // Array<T>
            if trimmed.starts_with("Array<") && trimmed.ends_with('>') {
                let inner = &trimmed[6..trimmed.len() - 1];
                let (inner_type, inner_fmt, inner_ref) = ts_type_to_schema_type(inner.trim());
                return (
                    Some("array".into()),
                    inner_fmt,
                    inner_ref.or_else(|| inner_type.map(|t| format!("__primitive:{}", t))),
                );
            }
            // Promise<T>, Observable<T> - unwrap
            for wrapper in &["Promise<", "Observable<"] {
                if trimmed.starts_with(wrapper) && trimmed.ends_with('>') {
                    let inner = &trimmed[wrapper.len()..trimmed.len() - 1];
                    return ts_type_to_schema_type(inner.trim());
                }
            }
            // Union type - take first non-null type
            if trimmed.contains('|') {
                let parts: Vec<&str> = trimmed.split('|').map(|s| s.trim()).collect();
                let non_null: Vec<&str> = parts
                    .iter()
                    .filter(|p| !matches!(**p, "null" | "undefined"))
                    .copied()
                    .collect();
                // Check if all are string literals
                let all_string_literals = non_null
                    .iter()
                    .all(|p| (p.starts_with('\'') && p.ends_with('\'')) || (p.starts_with('"') && p.ends_with('"')));
                if all_string_literals {
                    return (Some("string".into()), None, None);
                }
                if let Some(first) = non_null.first() {
                    return ts_type_to_schema_type(first);
                }
            }
            // DTO reference
            (None, None, Some(trimmed.to_string()))
        }
    }
}

pub fn type_name_to_schema(name: &str) -> MediaTypeSchema {
    let lower = name.to_lowercase();
    match lower.as_str() {
        "string" => MediaTypeSchema::Inline {
            schema_type: "string".into(),
            items: None,
        },
        "number" | "int" | "integer" | "float" => MediaTypeSchema::Inline {
            schema_type: "number".into(),
            items: None,
        },
        "boolean" | "bool" => MediaTypeSchema::Inline {
            schema_type: "boolean".into(),
            items: None,
        },
        _ => MediaTypeSchema::Ref {
            ref_path: format!("#/components/schemas/{}", name),
        },
    }
}

pub fn type_name_to_param_schema(name: &str) -> ParamSchema {
    let lower = name.to_lowercase();
    let t = match lower.as_str() {
        "string" => "string",
        "number" | "int" | "integer" | "float" => "number",
        "boolean" | "bool" => "boolean",
        _ => "string",
    };
    ParamSchema {
        schema_type: Some(t.to_string()),
        format: None,
        enum_values: None,
        example: None,
        ref_path: None,
    }
}

fn response_decorator_to_status(name: &str) -> Option<&'static str> {
    match name {
        "Ok" => Some("200"),
        "Created" => Some("201"),
        "Accepted" => Some("202"),
        "NoContent" => Some("204"),
        "MovedPermanently" => Some("301"),
        "Found" => Some("302"),
        "BadRequest" => Some("400"),
        "Unauthorized" => Some("401"),
        "Forbidden" => Some("403"),
        "NotFound" => Some("404"),
        "MethodNotAllowed" => Some("405"),
        "NotAcceptable" => Some("406"),
        "RequestTimeout" => Some("408"),
        "Conflict" => Some("409"),
        "PreconditionFailed" => Some("412"),
        "PayloadTooLarge" => Some("413"),
        "UnprocessableEntity" => Some("422"),
        "TooManyRequests" => Some("429"),
        "InternalServerError" => Some("500"),
        "ServiceUnavailable" => Some("503"),
        "GatewayTimeout" => Some("504"),
        "Default" => Some("default"),
        _ => None,
    }
}

fn default_success_code(method: &str) -> &'static str {
    match method {
        "post" => "201",
        "delete" => "204",
        _ => "200",
    }
}

pub fn normalize_path(p: &str) -> String {
    let joined = format!("/{}", p);
    let mut result = String::with_capacity(joined.len());
    let mut last_was_slash = false;
    for ch in joined.chars() {
        if ch == '/' {
            if !last_was_slash {
                result.push('/');
            }
            last_was_slash = true;
        } else {
            result.push(ch);
            last_was_slash = false;
        }
    }
    // Remove trailing slash
    if result.len() > 1 && result.ends_with('/') {
        result.pop();
    }
    if result.is_empty() {
        "/".to_string()
    } else {
        result
    }
}

// ─── DTO / Enum parsing ─────────────────────────────────────

/// Parse all DTO classes and enums from file content
pub fn parse_dtos_and_enums(
    content: &str,
) -> (Vec<DtoInfo>, Vec<EnumInfo>) {
    let mut dtos = Vec::new();
    let mut enums = Vec::new();

    // Parse enums
    for caps in RE_ENUM_DECL.captures_iter(content) {
        let name = caps[1].to_string();
        let open_brace = caps.get(0).unwrap().end() - 1;
        let close_brace = find_closing_brace(content, open_brace);
        let body = &content[open_brace + 1..close_brace];

        let mut values = Vec::new();
        for line in body.lines() {
            let trimmed = line.trim().trim_end_matches(',');
            if trimmed.is_empty() {
                continue;
            }
            // EnumMember = 'value' or EnumMember = "value" or EnumMember = 123
            if let Some(eq_pos) = trimmed.find('=') {
                let val_str = trimmed[eq_pos + 1..].trim();
                if let Some(s) = val_str
                    .strip_prefix('\'')
                    .and_then(|s| s.strip_suffix('\''))
                {
                    values.push(serde_json::Value::String(s.to_string()));
                } else if let Some(s) = val_str
                    .strip_prefix('"')
                    .and_then(|s| s.strip_suffix('"'))
                {
                    values.push(serde_json::Value::String(s.to_string()));
                } else if let Ok(n) = val_str.parse::<i64>() {
                    values.push(serde_json::json!(n));
                } else {
                    // identifier reference - use the key name
                    let key = trimmed[..eq_pos].trim();
                    values.push(serde_json::Value::String(key.to_string()));
                }
            } else {
                // No value, use the member name
                let member_name = trimmed.split_whitespace().next().unwrap_or(trimmed);
                if !member_name.is_empty() && member_name != "//" {
                    values.push(serde_json::Value::String(member_name.to_string()));
                }
            }
        }

        enums.push(EnumInfo { name, values });
    }

    // Parse classes
    for caps in RE_CLASS_DECL.captures_iter(content) {
        let class_name = caps[1].to_string();
        let extends = caps.get(2).map(|m| m.as_str().to_string());
        let open_brace = caps.get(0).unwrap().end() - 1;
        let close_brace = find_closing_brace(content, open_brace);
        let class_body = &content[open_brace + 1..close_brace];

        // Only process classes that have @ApiProperty decorators
        if !class_body.contains("@ApiProperty") {
            continue;
        }

        let mut properties = BTreeMap::new();
        let mut required = Vec::new();

        let lines: Vec<&str> = class_body.lines().collect();
        let mut i = 0;
        while i < lines.len() {
            let line = lines[i].trim();

            // Check for @ApiProperty or @ApiPropertyOptional
            let is_api_prop = RE_API_PROPERTY.is_match(line) || RE_API_PROPERTY_EMPTY.is_match(line);
            let is_optional_decorator = RE_API_PROPERTY_OPTIONAL.is_match(line);

            if !is_api_prop {
                i += 1;
                continue;
            }

            // Extract object literal content from decorator if present
            let decorator_text = if RE_API_PROPERTY.is_match(line) {
                // Find the object content - may span multiple lines
                let combined_start = i;
                let mut combined = String::new();
                let mut j = i;
                let mut found_close = false;
                while j < lines.len() {
                    combined.push_str(lines[j]);
                    combined.push('\n');
                    // Check if we have balanced parens
                    let open_count = combined.matches('(').count();
                    let close_count = combined.matches(')').count();
                    if open_count > 0 && open_count <= close_count {
                        found_close = true;
                        i = j;
                        break;
                    }
                    j += 1;
                }
                if !found_close {
                    i = combined_start + 1;
                    continue;
                }
                combined
            } else {
                line.to_string()
            };

            // Find the field declaration on the next non-empty, non-decorator line
            i += 1;
            let mut field_line = "";
            while i < lines.len() {
                let candidate = lines[i].trim();
                if !candidate.is_empty()
                    && !candidate.starts_with('@')
                    && !candidate.starts_with("//")
                    && !candidate.starts_with("/*")
                {
                    field_line = candidate;
                    break;
                }
                i += 1;
            }

            if let Some(field_caps) = RE_FIELD_DECL.captures(field_line) {
                let field_name = field_caps[1].to_string();
                let is_question = &field_caps[2] == "?";
                let ts_type = field_caps[3].trim().to_string();

                let is_optional = is_optional_decorator
                    || is_question
                    || extract_obj_bool(&decorator_text, "required") == Some(false);

                let mut prop = SchemaProperty {
                    prop_type: None,
                    format: None,
                    description: None,
                    example: None,
                    default_value: None,
                    nullable: None,
                    enum_values: None,
                    items: None,
                    ref_path: None,
                    minimum: None,
                    maximum: None,
                    min_length: None,
                    max_length: None,
                };

                // Get type from TS annotation
                let (schema_type, format, ref_name) = ts_type_to_schema_type(&ts_type);

                // Check decorator for type override
                let dec_type = extract_obj_type(&decorator_text);
                let is_array = extract_obj_bool(&decorator_text, "isArray") == Some(true);

                if let Some(ref dt) = dec_type {
                    let (dt_type, dt_fmt, dt_ref) = ts_type_to_schema_type(dt);
                    if is_array {
                        prop.prop_type = Some("array".into());
                        if let Some(r) = dt_ref {
                            if r.starts_with("__primitive:") {
                                prop.items = Some(Box::new(SchemaOrRef::Inline {
                                    schema_type: Some(r.strip_prefix("__primitive:").unwrap().to_string()),
                                    format: dt_fmt,
                                }));
                            } else {
                                prop.items = Some(Box::new(SchemaOrRef::Ref {
                                    ref_path: format!("#/components/schemas/{}", r),
                                }));
                            }
                        } else if let Some(t) = dt_type {
                            prop.items = Some(Box::new(SchemaOrRef::Inline {
                                schema_type: Some(t),
                                format: dt_fmt,
                            }));
                        }
                    } else if let Some(r) = dt_ref {
                        if !r.starts_with("__primitive:") {
                            prop.ref_path = Some(format!("#/components/schemas/{}", r));
                        } else {
                            prop.prop_type = Some(r.strip_prefix("__primitive:").unwrap().to_string());
                        }
                    } else {
                        prop.prop_type = dt_type;
                        prop.format = dt_fmt;
                    }
                } else if is_array {
                    prop.prop_type = Some("array".into());
                    // Use TS type info for items
                    if let Some(r) = &ref_name {
                        if r.starts_with("__primitive:") {
                            prop.items = Some(Box::new(SchemaOrRef::Inline {
                                schema_type: Some(r.strip_prefix("__primitive:").unwrap().to_string()),
                                format: format.clone(),
                            }));
                        } else {
                            prop.items = Some(Box::new(SchemaOrRef::Ref {
                                ref_path: format!("#/components/schemas/{}", r),
                            }));
                        }
                    }
                } else if schema_type.as_deref() == Some("array") {
                    prop.prop_type = Some("array".into());
                    if let Some(r) = &ref_name {
                        if r.starts_with("__primitive:") {
                            prop.items = Some(Box::new(SchemaOrRef::Inline {
                                schema_type: Some(r.strip_prefix("__primitive:").unwrap().to_string()),
                                format: format.clone(),
                            }));
                        } else {
                            prop.items = Some(Box::new(SchemaOrRef::Ref {
                                ref_path: format!("#/components/schemas/{}", r),
                            }));
                        }
                    }
                } else if let Some(r) = &ref_name {
                    if !r.starts_with("__primitive:") {
                        prop.ref_path = Some(format!("#/components/schemas/{}", r));
                    } else {
                        prop.prop_type = Some(r.strip_prefix("__primitive:").unwrap().to_string());
                        prop.format = format.clone();
                    }
                } else {
                    prop.prop_type = schema_type;
                    prop.format = format;
                }

                // Extract decorator metadata
                prop.description = extract_obj_string(&decorator_text, "description");
                prop.example = extract_obj_example(&decorator_text);
                if let Some(v) = extract_obj_number(&decorator_text, "minimum") {
                    prop.minimum = Some(v);
                }
                if let Some(v) = extract_obj_number(&decorator_text, "maximum") {
                    prop.maximum = Some(v);
                }
                if let Some(v) = extract_obj_number(&decorator_text, "minLength") {
                    prop.min_length = Some(v);
                }
                if let Some(v) = extract_obj_number(&decorator_text, "maxLength") {
                    prop.max_length = Some(v);
                }
                if extract_obj_bool(&decorator_text, "nullable") == Some(true) {
                    prop.nullable = Some(true);
                }
                if let Some(v) = extract_obj_example(&decorator_text.replace("example", "__x__").replace("default", "example").replace("__x__", "example_orig")) {
                    // Hack: we need a separate extractor for default
                    let _ = v; // just ignore, use dedicated extractor below
                }
                // Extract default value properly
                if let Some(def_val) = extract_default_value(&decorator_text) {
                    prop.default_value = Some(def_val);
                }
                if let Some(enum_vals) = extract_obj_enum(&decorator_text) {
                    prop.enum_values = Some(enum_vals);
                    if prop.prop_type.is_none() {
                        prop.prop_type = Some("string".into());
                    }
                }

                properties.insert(field_name.clone(), prop);

                if !is_optional {
                    required.push(field_name);
                }
            }

            i += 1;
        }

        if !properties.is_empty() {
            dtos.push(DtoInfo {
                name: class_name,
                properties,
                required,
                extends,
            });
        }
    }

    (dtos, enums)
}

fn extract_default_value(text: &str) -> Option<serde_json::Value> {
    let start = find_key_value_start(text, "default")?;
    extract_value_at(text, start)
}

// ─── Controller parsing ─────────────────────────────────────

/// Parse a single file for controllers and their endpoints
pub fn parse_controllers(content: &str) -> Vec<ControllerInfo> {
    let mut controllers = Vec::new();

    // Quick check
    if !content.contains("@Controller") {
        return controllers;
    }

    // Find controller decorator
    let controller_path = if let Some(caps) = RE_CONTROLLER.captures(content) {
        caps.get(1)
            .or_else(|| caps.get(2))
            .or_else(|| caps.get(3))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default()
    } else if let Some(caps) = RE_CONTROLLER_OBJ.captures(content) {
        caps.get(1)
            .or_else(|| caps.get(2))
            .or_else(|| caps.get(3))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default()
    } else if RE_CONTROLLER_EMPTY.is_match(content) {
        String::new()
    } else {
        return controllers;
    };

    let base_path = normalize_path(&controller_path);

    // Find class-level @ApiTags
    let class_tags: Vec<String> = RE_API_TAGS
        .captures_iter(content)
        .filter_map(|caps| {
            // Only take tags that appear before the class body starts
            caps.get(1)
                .or_else(|| caps.get(2))
                .or_else(|| caps.get(3))
                .map(|m| m.as_str().to_string())
        })
        .collect();

    // Find class-level @ApiBearerAuth
    let class_security = RE_API_BEARER.captures(content).map(|caps| {
        let name = caps
            .get(1)
            .or_else(|| caps.get(2))
            .or_else(|| caps.get(3))
            .map(|m| m.as_str().to_string())
            .unwrap_or_else(|| "bearer".to_string());
        let mut map = BTreeMap::new();
        map.insert(name, Vec::new());
        vec![map]
    });

    // Find HTTP method decorators and parse endpoints
    let mut endpoints = Vec::new();

    for http_caps in RE_HTTP_METHOD.captures_iter(content) {
        let method_match = http_caps.get(0).unwrap();
        let decorator_start = method_match.start();

        let http_method = http_caps[1].to_lowercase();
        let route_path = http_caps
            .get(2)
            .or_else(|| http_caps.get(3))
            .or_else(|| http_caps.get(4))
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();

        // Look backwards from the HTTP decorator to find method-level decorators
        // Find the area between previous method's end and this decorator
        let decorator_area_start = find_decorator_area_start(content, decorator_start);
        let decorator_area = &content[decorator_area_start..decorator_start + method_match.len()];

        // Check for @ApiExcludeEndpoint before the HTTP method decorator
        if RE_API_EXCLUDE.is_match(decorator_area) {
            continue;
        }

        // Build full path with :param -> {param} conversion
        let raw_path = format!("{}/{}", base_path, route_path);
        let full_path = normalize_path(&raw_path)
            .replace("*", "")
            .split('/')
            .map(|seg| {
                if let Some(param) = seg.strip_prefix(':') {
                    format!("{{{}}}", param)
                } else {
                    seg.to_string()
                }
            })
            .collect::<Vec<_>>()
            .join("/");
        let full_path = normalize_path(&full_path);

        // Find the method body
        let after_decorator = &content[method_match.end()..];
        let body_start = find_method_body_start(after_decorator);
        if body_start.is_none() {
            continue;
        }

        // Also check for @ApiExcludeEndpoint between the HTTP method decorator and the method body
        let after_http_area = &content[method_match.end()..method_match.end() + body_start.unwrap()];
        if RE_API_EXCLUDE.is_match(after_http_area) {
            continue;
        }
        let abs_body_start = method_match.end() + body_start.unwrap();
        let abs_body_end = find_closing_brace(content, abs_body_start);

        // Parse method-level @ApiTags
        let method_tags: Vec<String> = RE_API_TAGS
            .captures_iter(decorator_area)
            .filter_map(|caps| {
                caps.get(1)
                    .or_else(|| caps.get(2))
                    .or_else(|| caps.get(3))
                    .map(|m| m.as_str().to_string())
            })
            .collect();

        let tags = if !method_tags.is_empty() {
            method_tags
        } else if !class_tags.is_empty() {
            class_tags.clone()
        } else {
            vec![base_path
                .trim_start_matches('/')
                .split('/')
                .next()
                .unwrap_or("default")
                .to_string()]
        };

        // Parse @ApiOperation
        let mut summary = None;
        let mut description = None;
        let mut operation_id = None;
        let mut deprecated = false;

        if RE_API_OPERATION.is_match(decorator_area) {
            if let Some(op_match) = RE_API_OPERATION.find(decorator_area) {
                let op_start = decorator_area_start + op_match.start();
                // Find opening brace of the object
                if let Some(brace_pos) = content[op_start..].find('{') {
                    let abs_brace = op_start + brace_pos;
                    let close = find_closing_brace(content, abs_brace);
                    let obj_text = &content[abs_brace..=close];
                    summary = extract_obj_string(obj_text, "summary");
                    description = extract_obj_string(obj_text, "description");
                    operation_id = extract_obj_string(obj_text, "operationId");
                    deprecated = extract_obj_bool(obj_text, "deprecated") == Some(true);
                }
            }
        }

        if summary.is_none() {
            summary = Some(format!("{} {}", http_method.to_uppercase(), full_path));
        }

        // Parse method-level @ApiBearerAuth
        let method_security = if let Some(caps) = RE_API_BEARER.captures(decorator_area) {
            let name = caps
                .get(1)
                .or_else(|| caps.get(2))
                .or_else(|| caps.get(3))
                .map(|m| m.as_str().to_string())
                .unwrap_or_else(|| "bearer".to_string());
            let mut map = BTreeMap::new();
            map.insert(name, Vec::new());
            Some(vec![map])
        } else {
            class_security.clone()
        };

        // Parse @HttpCode
        let custom_status = RE_HTTP_CODE
            .captures(decorator_area)
            .and_then(|caps| caps[1].parse::<u16>().ok());

        // Parse response decorators
        let mut responses = BTreeMap::new();
        let mut has_success_response = false;

        for resp_caps in RE_RESPONSE_DECORATOR.captures_iter(decorator_area) {
            let resp_name = &resp_caps[1];
            let status = match response_decorator_to_status(resp_name) {
                Some(s) => s.to_string(),
                None => continue,
            };

            let resp_match = resp_caps.get(0).unwrap();
            let paren_start = decorator_area_start + resp_match.end() - 1;
            let paren_end = find_closing_paren(content, paren_start);
            let args_text = &content[paren_start + 1..paren_end];

            let mut resp_description = None;
            let mut resp_content = None;

            // Try to parse as object
            if let Some(brace_pos) = args_text.find('{') {
                let abs_brace = paren_start + 1 + brace_pos;
                let close = find_closing_brace(content, abs_brace);
                let obj_text = &content[abs_brace..=close];

                resp_description = extract_obj_string(obj_text, "description");

                let type_ref = extract_obj_type(obj_text);
                let is_array = extract_obj_bool(obj_text, "isArray") == Some(true);

                if let Some(type_name) = type_ref {
                    let schema = type_name_to_schema(&type_name);
                    let final_schema = if is_array {
                        MediaTypeSchema::Inline {
                            schema_type: "array".into(),
                            items: Some(Box::new(schema)),
                        }
                    } else {
                        schema
                    };

                    let mut content_map = BTreeMap::new();
                    content_map.insert(
                        "application/json".to_string(),
                        MediaType {
                            schema: final_schema,
                        },
                    );
                    resp_content = Some(content_map);
                }
            } else {
                // Might be a plain string argument
                if let Some(s_caps) = RE_STRING_VAL.captures(args_text) {
                    resp_description =
                        Some(s_caps.get(1).or_else(|| s_caps.get(2)).unwrap().as_str().to_string());
                }
            }

            let status_num: i32 = status.parse().unwrap_or(0);
            if (200..300).contains(&status_num) {
                has_success_response = true;
            }

            responses.insert(
                status.to_string(),
                Response {
                    description: resp_description
                        .unwrap_or_else(|| {
                            if status_num >= 400 {
                                "Error".to_string()
                            } else {
                                "Success".to_string()
                            }
                        }),
                    content: resp_content,
                },
            );
        }

        // Add default success response if none declared
        if !has_success_response {
            let default_code = custom_status
                .map(|c| c.to_string())
                .unwrap_or_else(|| default_success_code(&http_method).to_string());

            if !responses.contains_key(&default_code) {
                // Try to infer return type from method signature
                let method_sig_area = &content[method_match.end()..abs_body_start];
                let return_type_schema = extract_return_type_schema(method_sig_area);

                responses.insert(
                    default_code,
                    Response {
                        description: "Success".to_string(),
                        content: return_type_schema,
                    },
                );
            }
        }

        // Parse @ApiParam decorators
        let mut parameters = Vec::new();

        for param_match in RE_API_PARAM.find_iter(decorator_area) {
            let abs_start = decorator_area_start + param_match.start();
            if let Some(brace_pos) = content[abs_start..].find('{') {
                let abs_brace = abs_start + brace_pos;
                let close = find_closing_brace(content, abs_brace);
                let obj_text = &content[abs_brace..=close];

                if let Some(name) = extract_obj_string(obj_text, "name") {
                    let type_name = extract_obj_type(obj_text);
                    let schema = type_name
                        .as_deref()
                        .map(type_name_to_param_schema)
                        .unwrap_or(ParamSchema {
                            schema_type: Some("string".into()),
                            format: None,
                            enum_values: extract_obj_enum(obj_text),
                            example: extract_obj_example(obj_text),
                            ref_path: None,
                        });

                    parameters.push(Parameter {
                        name,
                        location: "path".to_string(),
                        required: Some(extract_obj_bool(obj_text, "required").unwrap_or(true)),
                        schema: Some(schema),
                        description: extract_obj_string(obj_text, "description"),
                        example: None,
                    });
                }
            }
        }

        // Parse @ApiQuery decorators
        for query_match in RE_API_QUERY.find_iter(decorator_area) {
            let abs_start = decorator_area_start + query_match.start();
            if let Some(brace_pos) = content[abs_start..].find('{') {
                let abs_brace = abs_start + brace_pos;
                let close = find_closing_brace(content, abs_brace);
                let obj_text = &content[abs_brace..=close];

                if let Some(name) = extract_obj_string(obj_text, "name") {
                    let type_name = extract_obj_type(obj_text);
                    let mut schema = type_name
                        .as_deref()
                        .map(type_name_to_param_schema)
                        .unwrap_or(ParamSchema {
                            schema_type: Some("string".into()),
                            format: None,
                            enum_values: None,
                            example: None,
                            ref_path: None,
                        });
                    schema.enum_values = extract_obj_enum(obj_text);

                    parameters.push(Parameter {
                        name,
                        location: "query".to_string(),
                        required: Some(extract_obj_bool(obj_text, "required").unwrap_or(true)),
                        schema: Some(schema),
                        description: extract_obj_string(obj_text, "description"),
                        example: extract_obj_example(obj_text),
                    });
                }
            }
        }

        // Extract path params from route pattern that aren't already declared
        let declared_path_params: Vec<String> = parameters
            .iter()
            .filter(|p| p.location == "path")
            .map(|p| p.name.clone())
            .collect();

        for caps in RE_PATH_PARAM.captures_iter(&full_path) {
            let param_name = caps[1].to_string();
            if !declared_path_params.contains(&param_name) {
                parameters.push(Parameter {
                    name: param_name,
                    location: "path".to_string(),
                    required: Some(true),
                    schema: Some(ParamSchema {
                        schema_type: Some("string".into()),
                        format: None,
                        enum_values: None,
                        example: None,
                        ref_path: None,
                    }),
                    description: None,
                    example: None,
                });
            }
        }

        // Parse method parameters for @Body, @Query, @Param decorators
        let method_sig = &content[method_match.end()..abs_body_start];
        parse_method_params(method_sig, &http_method, &mut parameters, &mut None);

        // Parse @ApiBody
        let mut request_body = None;
        if let Some(body_match) = RE_API_BODY.find(decorator_area) {
            let abs_start = decorator_area_start + body_match.start();
            if let Some(brace_pos) = content[abs_start..].find('{') {
                let abs_brace = abs_start + brace_pos;
                let close = find_closing_brace(content, abs_brace);
                let obj_text = &content[abs_brace..=close];

                let type_ref = extract_obj_type(obj_text);
                let is_array = extract_obj_bool(obj_text, "isArray") == Some(true);
                let desc = extract_obj_string(obj_text, "description");

                let schema = if let Some(tn) = type_ref {
                    let base = type_name_to_schema(&tn);
                    if is_array {
                        MediaTypeSchema::Inline {
                            schema_type: "array".into(),
                            items: Some(Box::new(base)),
                        }
                    } else {
                        base
                    }
                } else {
                    MediaTypeSchema::Inline {
                        schema_type: "object".into(),
                        items: None,
                    }
                };

                let mut content_map = BTreeMap::new();
                content_map.insert("application/json".to_string(), MediaType { schema });

                request_body = Some(RequestBody {
                    required: true,
                    content: content_map,
                    description: desc,
                });
            }
        }

        // Infer request body from @Body() parameter if no @ApiBody
        if request_body.is_none()
            && matches!(http_method.as_str(), "post" | "put" | "patch")
        {
            request_body = infer_request_body(method_sig);

            // Fallback: generic body for POST/PUT/PATCH
            if request_body.is_none() {
                let mut content_map = BTreeMap::new();
                content_map.insert(
                    "application/json".to_string(),
                    MediaType {
                        schema: MediaTypeSchema::Inline {
                            schema_type: "object".into(),
                            items: None,
                        },
                    },
                );
                request_body = Some(RequestBody {
                    required: true,
                    content: content_map,
                    description: None,
                });
            }
        }

        endpoints.push(EndpointInfo {
            http_method,
            route_path,
            full_path,
            summary,
            description,
            operation_id,
            deprecated,
            tags,
            parameters,
            request_body,
            responses,
            security: method_security,
            method_body_start: abs_body_start,
            method_body_end: abs_body_end,
        });
    }

    controllers.push(ControllerInfo {
        base_path,
        tags: class_tags,
        security: class_security,
        endpoints,
    });

    controllers
}

/// Find where the decorator area starts (look backwards for blank line or class opening)
fn find_decorator_area_start(content: &str, decorator_pos: usize) -> usize {
    let before = &content[..decorator_pos];
    // Go backwards to find a blank line, class opening brace, or another method's closing brace
    let mut pos = before.len();
    let mut consecutive_newlines = 0;

    for (i, ch) in before.char_indices().rev() {
        if ch == '\n' {
            consecutive_newlines += 1;
            if consecutive_newlines >= 2 {
                return i + 1;
            }
        } else if ch != '\r' && ch != ' ' && ch != '\t' {
            // Check if this is a closing brace (end of previous method)
            if ch == '}' || ch == '{' {
                return i + 1;
            }
            consecutive_newlines = 0;
        }
        pos = i;
    }
    pos
}

/// Find the start of a method body (the opening brace after method signature)
fn find_method_body_start(after_decorator: &str) -> Option<usize> {
    let mut paren_depth = 0i32;
    let bytes = after_decorator.as_bytes();
    let mut i = 0;
    let mut in_string = false;
    let mut string_char = 0u8;

    while i < bytes.len() {
        let ch = bytes[i];
        if in_string {
            if ch == b'\\' {
                i += 1;
            } else if ch == string_char {
                in_string = false;
            }
        } else {
            match ch {
                b'\'' | b'"' | b'`' => {
                    in_string = true;
                    string_char = ch;
                }
                b'(' => paren_depth += 1,
                b')' => paren_depth -= 1,
                b'{' if paren_depth == 0 => return Some(i),
                _ => {}
            }
        }
        i += 1;
    }
    None
}

/// Extract return type schema from method signature
fn extract_return_type_schema(
    method_sig: &str,
) -> Option<BTreeMap<String, MediaType>> {
    // Look for ): ReturnType { or ): Promise<ReturnType> {
    let caps = RE_RETURN_TYPE.captures(method_sig)?;
    let return_type = caps[1].trim();

    let (schema_type, _fmt, ref_name) = ts_type_to_schema_type(return_type);

    // Only add content for non-trivial types
    if let Some(ref_n) = ref_name {
        if ref_n.starts_with("__primitive:") {
            return None;
        }
        let schema = if schema_type.as_deref() == Some("array") {
            MediaTypeSchema::Inline {
                schema_type: "array".into(),
                items: Some(Box::new(MediaTypeSchema::Ref {
                    ref_path: format!("#/components/schemas/{}", ref_n),
                })),
            }
        } else {
            MediaTypeSchema::Ref {
                ref_path: format!("#/components/schemas/{}", ref_n),
            }
        };
        let mut content_map = BTreeMap::new();
        content_map.insert("application/json".to_string(), MediaType { schema });
        return Some(content_map);
    }

    if schema_type.as_deref() == Some("array") {
        // Array of primitives - still add schema
        return None; // Skip primitive arrays for now
    }

    None
}

/// Infer request body from @Body() parameter in method signature
fn infer_request_body(method_sig: &str) -> Option<RequestBody> {
    // Look for @Body() paramName: TypeName
    let caps = RE_BODY_INFER.captures(method_sig)?;
    let type_name = caps[1].trim();

    let schema = if type_name.ends_with("[]") {
        let inner = &type_name[..type_name.len() - 2];
        MediaTypeSchema::Inline {
            schema_type: "array".into(),
            items: Some(Box::new(type_name_to_schema(inner))),
        }
    } else {
        type_name_to_schema(type_name)
    };

    let mut content_map = BTreeMap::new();
    content_map.insert("application/json".to_string(), MediaType { schema });

    Some(RequestBody {
        required: true,
        content: content_map,
        description: None,
    })
}

/// Parse method parameters (@Query, @Param decorators in the method signature)
fn parse_method_params(
    method_sig: &str,
    _http_method: &str,
    parameters: &mut Vec<Parameter>,
    _request_body: &mut Option<RequestBody>,
) {
    // Extract @Param('name') paramName: Type from method signature
    let existing_path: Vec<String> = parameters
        .iter()
        .filter(|p| p.location == "path")
        .map(|p| p.name.clone())
        .collect();

    for caps in RE_PARAM_DECORATOR.captures_iter(method_sig) {
        let param_name = caps
            .get(1)
            .or_else(|| caps.get(2))
            .map(|m| m.as_str().to_string());
        if let Some(name) = param_name {
            if !existing_path.contains(&name) {
                // Try to get type from the parameter
                let after = &method_sig[caps.get(0).unwrap().end()..];
                let type_str = extract_param_type(after);
                let schema = type_str
                    .as_deref()
                    .map(type_name_to_param_schema)
                    .unwrap_or(ParamSchema {
                        schema_type: Some("string".into()),
                        format: None,
                        enum_values: None,
                        example: None,
                        ref_path: None,
                    });

                parameters.push(Parameter {
                    name,
                    location: "path".to_string(),
                    required: Some(true),
                    schema: Some(schema),
                    description: None,
                    example: None,
                });
            }
        }
    }

    // Extract @Query('name') from method signature
    let existing_query: Vec<String> = parameters
        .iter()
        .filter(|p| p.location == "query")
        .map(|p| p.name.clone())
        .collect();

    for caps in RE_QUERY_DECORATOR.captures_iter(method_sig) {
        let query_name = caps
            .get(1)
            .or_else(|| caps.get(2))
            .map(|m| m.as_str().to_string());

        if let Some(name) = query_name {
            if !existing_query.contains(&name) {
                let after = &method_sig[caps.get(0).unwrap().end()..];
                let type_str = extract_param_type(after);
                let schema = type_str
                    .as_deref()
                    .map(type_name_to_param_schema)
                    .unwrap_or(ParamSchema {
                        schema_type: Some("string".into()),
                        format: None,
                        enum_values: None,
                        example: None,
                        ref_path: None,
                    });

                let is_optional = after.trim_start().starts_with('?')
                    || after
                        .trim_start()
                        .strip_prefix(|c: char| c.is_alphanumeric() || c == '_')
                        .map(|s| s.trim_start().starts_with('?'))
                        .unwrap_or(false);

                parameters.push(Parameter {
                    name,
                    location: "query".to_string(),
                    required: Some(!is_optional),
                    schema: Some(schema),
                    description: None,
                    example: None,
                });
            }
        }
    }
}

/// Extract type annotation from parameter text like `paramName: string`
fn extract_param_type(text: &str) -> Option<String> {
    let caps = RE_PARAM_TYPE.captures(text)?;
    Some(caps[1].to_string())
}
