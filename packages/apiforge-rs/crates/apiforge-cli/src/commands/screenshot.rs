use anyhow::Result;
use crossterm::style::Stylize;

pub fn execute(url: String, output: String, viewport: String, highlights: Vec<String>) -> Result<()> {
    println!("{}", "  Screenshot capture".bold());
    println!("  URL: {}", url);
    println!("  Output: {}", output);
    println!("  Viewport: {}", viewport);
    if !highlights.is_empty() {
        println!("  Highlights: {}", highlights.join(", "));
    }
    println!();

    // Check if npx/playwright is available
    let status = std::process::Command::new("npx")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();

    match status {
        Ok(s) if s.success() => {
            println!("{}", "  Taking screenshot via Playwright...".dark_grey());

            let mut cmd = std::process::Command::new("npx");
            cmd.arg("playwright")
                .arg("screenshot")
                .arg("--viewport-size")
                .arg(&viewport)
                .arg(&url)
                .arg(&output);

            let result = cmd.status()?;
            if result.success() {
                println!("{}", format!("  Screenshot saved to {}", output).green());
            } else {
                println!("{}", "  Playwright screenshot failed. You may need to install it:".yellow());
                println!("  npx playwright install chromium");
            }
        }
        _ => {
            println!("{}", "  Screenshot requires Chrome/Chromium.".yellow());
            println!("  Install with: npx playwright install chromium");
            println!();
            println!("  Or install Playwright globally:");
            println!("    npm install -g playwright");
            println!("    playwright install chromium");
        }
    }

    Ok(())
}
