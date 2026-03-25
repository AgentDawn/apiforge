use anyhow::Result;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use crate::http_client::ApiRequest;

/// Encode an API request as a base64 URL hash for sharing.
pub fn create_share_link(request: &ApiRequest) -> String {
    let json = serde_json::to_string(request).unwrap_or_default();
    let encoded = URL_SAFE_NO_PAD.encode(json.as_bytes());
    format!("https://apiforge.dev/share#{}", encoded)
}

/// Decode a share link back to an API request.
pub fn decode_share_link(link: &str) -> Result<ApiRequest> {
    let hash = link
        .rsplit_once('#')
        .map(|(_, h)| h)
        .unwrap_or(link);

    let bytes = URL_SAFE_NO_PAD.decode(hash)?;
    let json = String::from_utf8(bytes)?;
    let request: ApiRequest = serde_json::from_str(&json)?;
    Ok(request)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_roundtrip() {
        let request = ApiRequest {
            method: "GET".to_string(),
            url: "https://api.example.com/users".to_string(),
            headers: HashMap::new(),
            body: None,
            body_type: "raw".to_string(),
        };

        let link = create_share_link(&request);
        assert!(link.starts_with("https://apiforge.dev/share#"));

        let decoded = decode_share_link(&link).unwrap();
        assert_eq!(decoded.method, "GET");
        assert_eq!(decoded.url, "https://api.example.com/users");
    }
}
