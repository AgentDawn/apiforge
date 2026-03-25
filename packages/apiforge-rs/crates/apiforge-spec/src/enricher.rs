use crate::models::ThrowInfo;
use regex::Regex;
use std::sync::LazyLock;

/// Map of NestJS exception class names to HTTP status codes
pub fn exception_status(name: &str) -> Option<u16> {
    match name {
        "BadRequestException" => Some(400),
        "UnauthorizedException" => Some(401),
        "ForbiddenException" => Some(403),
        "NotFoundException" => Some(404),
        "MethodNotAllowedException" => Some(405),
        "NotAcceptableException" => Some(406),
        "RequestTimeoutException" => Some(408),
        "ConflictException" => Some(409),
        "GoneException" => Some(410),
        "PreconditionFailedException" => Some(412),
        "PayloadTooLargeException" => Some(413),
        "UnsupportedMediaTypeException" => Some(415),
        "UnprocessableEntityException" => Some(422),
        "InternalServerErrorException" => Some(500),
        "NotImplementedException" => Some(501),
        "BadGatewayException" => Some(502),
        "ServiceUnavailableException" => Some(503),
        "GatewayTimeoutException" => Some(504),
        _ => None,
    }
}

pub fn exception_default_desc(status: u16) -> &'static str {
    match status {
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        406 => "Not Acceptable",
        408 => "Request Timeout",
        409 => "Conflict",
        410 => "Gone",
        412 => "Precondition Failed",
        413 => "Payload Too Large",
        415 => "Unsupported Media Type",
        422 => "Unprocessable Entity",
        500 => "Internal Server Error",
        501 => "Not Implemented",
        502 => "Bad Gateway",
        503 => "Service Unavailable",
        504 => "Gateway Timeout",
        _ => "Error",
    }
}

static RE_THROW: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(
        r#"throw\s+new\s+(BadRequestException|UnauthorizedException|ForbiddenException|NotFoundException|MethodNotAllowedException|NotAcceptableException|RequestTimeoutException|ConflictException|GoneException|PreconditionFailedException|PayloadTooLargeException|UnsupportedMediaTypeException|UnprocessableEntityException|InternalServerErrorException|NotImplementedException|BadGatewayException|ServiceUnavailableException|GatewayTimeoutException)\s*\("#,
    )
    .unwrap()
});

static RE_STRING_ARG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"^(?:'([^']*)'|"([^"]*)"|`([^`]*)`)"#).unwrap()
});

static RE_OBJ_MESSAGE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"message\s*:\s*(?:'([^']*)'|"([^"]*)")"#).unwrap()
});

/// Find all throw statements in a region of content
pub fn find_throws(content: &str, start: usize, end: usize) -> Vec<ThrowInfo> {
    let region = &content[start..end.min(content.len())];
    let mut results = Vec::new();

    for caps in RE_THROW.captures_iter(region) {
        let exception_name = caps[1].to_string();
        let status_code = match exception_status(&exception_name) {
            Some(s) => s,
            None => continue,
        };

        let match_end = caps.get(0).unwrap().end();
        // Extract the argument after the opening paren
        let after_paren = &region[match_end..];

        let message = extract_throw_message(after_paren, status_code);

        let abs_pos = start + caps.get(0).unwrap().start();
        let line = content[..abs_pos].matches('\n').count() + 1;

        results.push(ThrowInfo {
            exception_name,
            status_code,
            message,
            line,
        });
    }

    results
}

fn extract_throw_message(after_paren: &str, status_code: u16) -> String {
    let trimmed = after_paren.trim();

    // Try string literal
    if let Some(caps) = RE_STRING_ARG.captures(trimmed) {
        if let Some(m) = caps.get(1).or_else(|| caps.get(2)).or_else(|| caps.get(3)) {
            return m.as_str().to_string();
        }
    }

    // Try object literal with message field
    if trimmed.starts_with('{') {
        if let Some(caps) = RE_OBJ_MESSAGE.captures(trimmed) {
            if let Some(m) = caps.get(1).or_else(|| caps.get(2)) {
                return m.as_str().to_string();
            }
        }
    }

    // Fallback to default description
    exception_default_desc(status_code).to_string()
}
