use crossterm::style::{Color, Stylize};

pub fn method_color(method: &str) -> Color {
    match method.to_uppercase().as_str() {
        "GET" => Color::Green,
        "POST" => Color::Yellow,
        "PUT" => Color::Blue,
        "PATCH" => Color::Magenta,
        "DELETE" => Color::Red,
        "HEAD" => Color::Cyan,
        "OPTIONS" => Color::DarkCyan,
        _ => Color::White,
    }
}

pub fn status_color(status: u16) -> Color {
    match status {
        200..=299 => Color::Green,
        300..=399 => Color::Cyan,
        400..=499 => Color::Yellow,
        500..=599 => Color::Red,
        _ => Color::White,
    }
}

pub fn print_method(method: &str) {
    let color = method_color(method);
    print!("{}", method.with(color).bold());
}

pub fn print_status(status: u16, text: &str) {
    let color = status_color(status);
    print!("{} {}", status.to_string().with(color).bold(), text.with(color));
}

pub fn print_timing(ms: u64) {
    let color = if ms < 200 { Color::Green } else if ms < 1000 { Color::Yellow } else { Color::Red };
    print!("{}", format!("{}ms", ms).with(color));
}

pub fn print_size(bytes: usize) {
    let display = if bytes < 1024 {
        format!("{}B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1}KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1}MB", bytes as f64 / (1024.0 * 1024.0))
    };
    print!("{}", display.with(Color::DarkGrey));
}

pub fn pretty_json(json_str: &str) -> String {
    match serde_json::from_str::<serde_json::Value>(json_str) {
        Ok(val) => serde_json::to_string_pretty(&val).unwrap_or_else(|_| json_str.to_string()),
        Err(_) => json_str.to_string(),
    }
}
