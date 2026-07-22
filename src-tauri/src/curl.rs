use crate::models::{AuthConfig, AuthType, HttpMethod, HttpRequest, KeyValue};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CurlError {
    #[error("{0}")]
    Message(String),
}

pub fn parse_curl(input: &str) -> Result<HttpRequest, CurlError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(CurlError::Message("Empty curl command".into()));
    }

    let tokens = tokenize(trimmed);
    if tokens.is_empty() {
        return Err(CurlError::Message("Could not parse curl command".into()));
    }

    let mut idx = 0;
    if tokens[0].eq_ignore_ascii_case("curl") {
        idx = 1;
    }

    let mut method: Option<HttpMethod> = None;
    let mut url = String::new();
    let mut headers: Vec<KeyValue> = Vec::new();
    let mut body = String::new();
    let mut auth = AuthConfig::default();
    let mut follow_redirects = true;
    let mut data_as_query = false;
    let mut user_agent: Option<String> = None;

    while idx < tokens.len() {
        let token = &tokens[idx];
        idx += 1;

        if token == "--" {
            continue;
        }

        match token.as_str() {
            "-X" | "--request" => {
                let value = next_arg(&tokens, &mut idx, token)?;
                method = Some(
                    HttpMethod::parse(&value)
                        .ok_or_else(|| CurlError::Message(format!("Unknown method: {value}")))?,
                );
            }
            "-H" | "--header" => {
                let value = next_arg(&tokens, &mut idx, token)?;
                if let Some((k, v)) = split_header(&value) {
                    headers.push(KeyValue {
                        key: k,
                        value: v,
                        enabled: true,
                    });
                }
            }
            "-d" | "--data" | "--data-raw" | "--data-binary" | "--data-ascii" => {
                body = next_arg(&tokens, &mut idx, token)?;
                if method.is_none() {
                    method = Some(HttpMethod::Post);
                }
            }
            "--json" => {
                body = next_arg(&tokens, &mut idx, token)?;
                ensure_header(&mut headers, "Content-Type", "application/json");
                ensure_header(&mut headers, "Accept", "application/json");
                if method.is_none() {
                    method = Some(HttpMethod::Post);
                }
            }
            "-u" | "--user" => {
                let value = next_arg(&tokens, &mut idx, token)?;
                let (username, password) = split_once_or_empty(&value, ':');
                auth = AuthConfig {
                    auth_type: AuthType::Basic,
                    bearer_token: String::new(),
                    username,
                    password,
                };
            }
            "-A" | "--user-agent" => {
                user_agent = Some(next_arg(&tokens, &mut idx, token)?);
            }
            "-b" | "--cookie" => {
                let value = next_arg(&tokens, &mut idx, token)?;
                ensure_header(&mut headers, "Cookie", &value);
            }
            "-e" | "--referer" => {
                let value = next_arg(&tokens, &mut idx, token)?;
                ensure_header(&mut headers, "Referer", &value);
            }
            "--url" => {
                url = next_arg(&tokens, &mut idx, token)?;
            }
            "-G" | "--get" => {
                data_as_query = true;
                method = Some(HttpMethod::Get);
            }
            "-L" | "--location" => follow_redirects = true,
            "--no-location" => follow_redirects = false,
            "-k" | "--insecure" | "-s" | "--silent" | "-S" | "--show-error" | "-i"
            | "--include" | "-v" | "--verbose" | "-#" | "--progress-bar" | "-compressed"
            | "--compressed" => {}
            other if other.starts_with('-') => {
                // Skip unknown short/long flags with optional value.
                if looks_like_flag_with_value(other) && idx < tokens.len() && !tokens[idx].starts_with('-')
                {
                    idx += 1;
                }
            }
            other => {
                if url.is_empty() {
                    url = other.to_string();
                }
            }
        }
    }

    if url.is_empty() {
        return Err(CurlError::Message("URL is missing in curl command".into()));
    }

    if let Some(ua) = user_agent {
        ensure_header(&mut headers, "User-Agent", &ua);
    }

    // Extract bearer from Authorization header if present.
    if auth.auth_type == AuthType::None {
        if let Some(header) = headers
            .iter()
            .find(|h| h.key.eq_ignore_ascii_case("Authorization"))
        {
            let value = header.value.trim();
            if let Some(token) = value
                .strip_prefix("Bearer ")
                .or_else(|| value.strip_prefix("bearer "))
            {
                auth = AuthConfig {
                    auth_type: AuthType::Bearer,
                    bearer_token: token.trim().to_string(),
                    username: String::new(),
                    password: String::new(),
                };
            }
        }
    }

    let mut query = Vec::new();
    if let Ok(parsed) = url::Url::parse(&url) {
        for (k, v) in parsed.query_pairs() {
            query.push(KeyValue {
                key: k.to_string(),
                value: v.to_string(),
                enabled: true,
            });
        }
        let mut cleaned = parsed;
        cleaned.set_query(None);
        url = cleaned.to_string();
    }

    if data_as_query && !body.is_empty() {
        for pair in body.split('&') {
            if pair.is_empty() {
                continue;
            }
            let (k, v) = split_once_or_empty(pair, '=');
            query.push(KeyValue {
                key: urlencoding::decode(&k).unwrap_or_default().into_owned(),
                value: urlencoding::decode(&v).unwrap_or_default().into_owned(),
                enabled: true,
            });
        }
        body.clear();
    }

    Ok(HttpRequest {
        method: method.unwrap_or_default(),
        url,
        headers,
        query,
        body,
        auth,
        follow_redirects,
        timeout_ms: 30_000,
    })
}

pub fn export_curl(request: &HttpRequest) -> Result<String, CurlError> {
    if request.url.trim().is_empty() {
        return Err(CurlError::Message("URL is empty".into()));
    }

    let mut parts: Vec<String> = vec!["curl".into()];
    parts.push("-X".into());
    parts.push(request.method.as_str().into());

    let final_url = build_url_with_query(&request.url, &request.query)
        .map_err(|e| CurlError::Message(e))?;
    parts.push(shell_quote(&final_url));

    if request.follow_redirects {
        parts.push("-L".into());
    }

    for header in request.headers.iter().filter(|h| h.enabled && !h.key.is_empty()) {
        if header.key.eq_ignore_ascii_case("Authorization")
            && request.auth.auth_type != AuthType::None
        {
            continue;
        }
        parts.push("-H".into());
        parts.push(shell_quote(&format!("{}: {}", header.key, header.value)));
    }

    match request.auth.auth_type {
        AuthType::Bearer if !request.auth.bearer_token.is_empty() => {
            parts.push("-H".into());
            parts.push(shell_quote(&format!(
                "Authorization: Bearer {}",
                request.auth.bearer_token
            )));
        }
        AuthType::Basic
            if !request.auth.username.is_empty() || !request.auth.password.is_empty() =>
        {
            parts.push("-u".into());
            parts.push(shell_quote(&format!(
                "{}:{}",
                request.auth.username, request.auth.password
            )));
        }
        _ => {}
    }

    if !request.body.is_empty() {
        parts.push("--data-raw".into());
        parts.push(shell_quote(&request.body));
    }

    Ok(parts.join(" "))
}

fn build_url_with_query(url: &str, query: &[KeyValue]) -> Result<String, String> {
    let enabled: Vec<_> = query
        .iter()
        .filter(|q| q.enabled && !q.key.is_empty())
        .collect();
    if enabled.is_empty() {
        return Ok(url.to_string());
    }

    let mut parsed = url::Url::parse(url).map_err(|e| format!("Invalid URL: {e}"))?;
    {
        let mut pairs = parsed.query_pairs_mut();
        pairs.clear();
        for item in enabled {
            pairs.append_pair(&item.key, &item.value);
        }
    }
    Ok(parsed.to_string())
}

fn tokenize(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut chars = input.chars().peekable();
    let mut in_single = false;
    let mut in_double = false;

    while let Some(ch) = chars.next() {
        match ch {
            '\\' if in_double || (!in_single && !in_double) => {
                if let Some(next) = chars.next() {
                    if in_double && !matches!(next, '"' | '\\' | '$' | '`') {
                        current.push('\\');
                    }
                    current.push(next);
                }
            }
            '\'' if !in_double => {
                in_single = !in_single;
            }
            '"' if !in_single => {
                in_double = !in_double;
            }
            c if c.is_whitespace() && !in_single && !in_double => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            c => current.push(c),
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

fn next_arg(tokens: &[String], idx: &mut usize, flag: &str) -> Result<String, CurlError> {
    if *idx >= tokens.len() {
        return Err(CurlError::Message(format!("Missing value for {flag}")));
    }
    let value = tokens[*idx].clone();
    *idx += 1;
    Ok(value)
}

fn split_header(value: &str) -> Option<(String, String)> {
    let (k, v) = value.split_once(':')?;
    Some((k.trim().to_string(), v.trim().to_string()))
}

fn split_once_or_empty(value: &str, sep: char) -> (String, String) {
    match value.split_once(sep) {
        Some((a, b)) => (a.to_string(), b.to_string()),
        None => (value.to_string(), String::new()),
    }
}

fn ensure_header(headers: &mut Vec<KeyValue>, key: &str, value: &str) {
    if let Some(existing) = headers
        .iter_mut()
        .find(|h| h.key.eq_ignore_ascii_case(key))
    {
        existing.value = value.to_string();
        existing.enabled = true;
    } else {
        headers.push(KeyValue {
            key: key.to_string(),
            value: value.to_string(),
            enabled: true,
        });
    }
}

fn looks_like_flag_with_value(flag: &str) -> bool {
    matches!(
        flag,
        "-o" | "--output"
            | "-w"
            | "--write-out"
            | "-x"
            | "--proxy"
            | "--connect-timeout"
            | "--max-time"
            | "-m"
            | "--max-redirs"
            | "--cacert"
            | "--cert"
            | "--key"
    ) || (flag.starts_with("--") && !flag.contains('=') && flag.len() > 2)
}

fn shell_quote(value: &str) -> String {
    if value.is_empty() {
        return "''".into();
    }
    if value
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || "-._~/:?&=%+".contains(c))
    {
        return value.to_string();
    }
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_basic_post_json() {
        let req = parse_curl(
            r#"curl -X POST 'https://api.example.com/v1/items?q=1' -H 'Content-Type: application/json' --data-raw '{"a":1}'"#,
        )
        .unwrap();
        assert_eq!(req.method, HttpMethod::Post);
        assert!(req.url.starts_with("https://api.example.com/v1/items"));
        assert_eq!(req.body, r#"{"a":1}"#);
        assert!(req
            .headers
            .iter()
            .any(|h| h.key == "Content-Type" && h.value == "application/json"));
    }

    #[test]
    fn roundtrip_export_import() {
        let original = HttpRequest {
            method: HttpMethod::Put,
            url: "https://example.com/x".into(),
            headers: vec![KeyValue {
                key: "X-Test".into(),
                value: "1".into(),
                enabled: true,
            }],
            query: vec![KeyValue {
                key: "page".into(),
                value: "2".into(),
                enabled: true,
            }],
            body: r#"{"ok":true}"#.into(),
            auth: AuthConfig {
                auth_type: AuthType::Bearer,
                bearer_token: "tok".into(),
                ..Default::default()
            },
            follow_redirects: true,
            timeout_ms: 30_000,
        };
        let curl = export_curl(&original).unwrap();
        let parsed = parse_curl(&curl).unwrap();
        assert_eq!(parsed.method, HttpMethod::Put);
        assert!(parsed.url.contains("example.com/x"));
        assert_eq!(parsed.body, original.body);
        assert_eq!(parsed.auth.auth_type, AuthType::Bearer);
        assert_eq!(parsed.auth.bearer_token, "tok");
    }
}
