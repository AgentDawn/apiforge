use anyhow::Result;
use apiforge_core::{curl_parser, http_client, output, history::{self, HistoryStore}};
use crossterm::style::Stylize;

pub async fn execute(command: String, dry_run: bool) -> Result<()> {
    let request = curl_parser::parse_curl(&command)?;

    println!("  Parsed: {} {}", request.method.clone().bold(), request.url);
    for (k, v) in &request.headers {
        println!("  > {}: {}", k.clone().dark_grey(), v);
    }
    if let Some(body) = &request.body {
        println!("  > Body: {} bytes", body.len());
    }

    if dry_run {
        println!();
        println!("{}", "  Dry run - request not sent.".yellow());
        return Ok(());
    }

    println!();
    let response = http_client::send_request(&request).await?;

    print!("  ");
    output::print_status(response.status, &response.status_text);
    print!("  ");
    output::print_timing(response.timing_ms);
    print!("  ");
    output::print_size(response.size_bytes);
    println!();
    println!();
    println!("{}", output::pretty_json(&response.body));

    // Save to history
    let store = HistoryStore::new()?;
    let entry = history::create_entry(
        &request.method, &request.url, response.status, response.timing_ms,
        request.body.as_deref(), Some(&response.body),
    );
    store.save(&entry)?;

    Ok(())
}
