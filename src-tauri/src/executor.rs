use crate::models::{
    AuthType, ExecuteResult, HistoryEntry, HttpRequest, HttpResponse, KeyValue, TraceEvent,
};
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION},
    redirect::Policy,
    Client, Method,
};
use std::time::{Duration, Instant};
use thiserror::Error;

const MAX_BODY_CHARS: usize = 2_000_000;

#[derive(Debug, Error)]
pub enum ExecuteError {
    #[error("{0}")]
    Message(String),
}

pub async fn execute_request(request: HttpRequest) -> ExecuteResult {
    let started = Instant::now();
    let mut events = Vec::new();

    push_event(
        &mut events,
        started,
        "start",
        "Request started",
        Some(format!("{} {}", request.method.as_str(), request.url)),
    );

    match execute_inner(&request, &mut events, started).await {
        Ok(response) => {
            push_event(
                &mut events,
                started,
                "done",
                "Request completed",
                Some(format!(
                    "HTTP {} in {} ms",
                    response.status, response.duration_ms
                )),
            );
            let history = HistoryEntry::new(request, Some(response.clone()), events.clone(), None);
            ExecuteResult {
                response: Some(response),
                events,
                history,
                error: None,
            }
        }
        Err(err) => {
            let message = err.to_string();
            push_event(&mut events, started, "error", "Request failed", Some(message.clone()));
            let history =
                HistoryEntry::new(request, None, events.clone(), Some(message.clone()));
            ExecuteResult {
                response: None,
                events,
                history,
                error: Some(message),
            }
        }
    }
}

async fn execute_inner(
    request: &HttpRequest,
    events: &mut Vec<TraceEvent>,
    started: Instant,
) -> Result<HttpResponse, ExecuteError> {
    if request.url.trim().is_empty() {
        return Err(ExecuteError::Message("URL is empty".into()));
    }

    let method = Method::from_bytes(request.method.as_str().as_bytes())
        .map_err(|_| ExecuteError::Message("Invalid HTTP method".into()))?;

    let url = build_url(request)?;
    push_event(
        events,
        started,
        "url",
        "Resolved URL",
        Some(url.clone()),
    );

    let redirect_policy = if request.follow_redirects {
        Policy::limited(10)
    } else {
        Policy::none()
    };

    let client = Client::builder()
        .redirect(redirect_policy)
        .timeout(Duration::from_millis(request.timeout_ms.max(1)))
        .user_agent("restool/0.1")
        .build()
        .map_err(|e| ExecuteError::Message(format!("Failed to build HTTP client: {e}")))?;

    let mut builder = client.request(method, &url);

    let mut header_map = HeaderMap::new();
    for item in request.headers.iter().filter(|h| h.enabled && !h.key.is_empty()) {
        let name = HeaderName::from_bytes(item.key.as_bytes()).map_err(|_| {
            ExecuteError::Message(format!("Invalid header name: {}", item.key))
        })?;
        let value = HeaderValue::from_str(&item.value).map_err(|_| {
            ExecuteError::Message(format!("Invalid header value for {}", item.key))
        })?;
        header_map.append(name, value);
    }

    match request.auth.auth_type {
        AuthType::Bearer if !request.auth.bearer_token.is_empty() => {
            let value = format!("Bearer {}", request.auth.bearer_token);
            header_map.insert(
                AUTHORIZATION,
                HeaderValue::from_str(&value)
                    .map_err(|_| ExecuteError::Message("Invalid bearer token".into()))?,
            );
        }
        AuthType::Basic
            if !request.auth.username.is_empty() || !request.auth.password.is_empty() =>
        {
            builder = builder.basic_auth(&request.auth.username, Some(&request.auth.password));
            push_event(
                events,
                started,
                "auth",
                "Using Basic authentication",
                Some(request.auth.username.clone()),
            );
        }
        AuthType::Bearer => {
            push_event(
                events,
                started,
                "auth",
                "Using Bearer authentication",
                None,
            );
        }
        _ => {}
    }

    if !header_map.is_empty() {
        let preview = header_map
            .iter()
            .map(|(k, v)| format!("{}: {}", k, v.to_str().unwrap_or("<binary>")))
            .collect::<Vec<_>>()
            .join("\n");
        push_event(
            events,
            started,
            "headers",
            "Request headers prepared",
            Some(preview),
        );
        builder = builder.headers(header_map);
    }

    if !request.body.is_empty() {
        push_event(
            events,
            started,
            "body",
            "Request body attached",
            Some(truncate_preview(&request.body, 4_000)),
        );
        builder = builder.body(request.body.clone());
    }

    push_event(events, started, "send", "Sending request over network", None);
    let send_started = Instant::now();
    let response = builder
        .send()
        .await
        .map_err(|e| ExecuteError::Message(format_reqwest_error(e)))?;
    let ttfb_ms = send_started.elapsed().as_millis() as u64;

    let status = response.status();
    let final_url = response.url().to_string();
    push_event(
        events,
        started,
        "status",
        &format!("Received HTTP {}", status.as_u16()),
        Some(format!(
            "{} {} (TTFB {} ms)\nFinal URL: {}",
            status.as_u16(),
            status.canonical_reason().unwrap_or(""),
            ttfb_ms,
            final_url
        )),
    );

    let response_headers: Vec<KeyValue> = response
        .headers()
        .iter()
        .map(|(k, v)| KeyValue {
            key: k.to_string(),
            value: v.to_str().unwrap_or("<binary>").to_string(),
            enabled: true,
        })
        .collect();

    if !response_headers.is_empty() {
        let preview = response_headers
            .iter()
            .map(|h| format!("{}: {}", h.key, h.value))
            .collect::<Vec<_>>()
            .join("\n");
        push_event(
            events,
            started,
            "response_headers",
            "Response headers received",
            Some(preview),
        );
    }

    push_event(events, started, "read", "Reading response body", None);
    let bytes = response
        .bytes()
        .await
        .map_err(|e| ExecuteError::Message(format!("Failed to read body: {e}")))?;

    let (body, truncated) = bytes_to_text(&bytes);
    push_event(
        events,
        started,
        "body_received",
        &format!("Body received ({} bytes)", bytes.len()),
        Some(truncate_preview(&body, 4_000)),
    );

    Ok(HttpResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers: response_headers,
        body,
        duration_ms: started.elapsed().as_millis() as u64,
        final_url,
        truncated,
    })
}

fn build_url(request: &HttpRequest) -> Result<String, ExecuteError> {
    let enabled: Vec<_> = request
        .query
        .iter()
        .filter(|q| q.enabled && !q.key.is_empty())
        .collect();

    if enabled.is_empty() {
        return Ok(request.url.clone());
    }

    let mut parsed =
        url::Url::parse(&request.url).map_err(|e| ExecuteError::Message(format!("Invalid URL: {e}")))?;
    {
        let mut pairs = parsed.query_pairs_mut();
        pairs.clear();
        for item in enabled {
            pairs.append_pair(&item.key, &item.value);
        }
    }
    Ok(parsed.to_string())
}

fn bytes_to_text(bytes: &[u8]) -> (String, bool) {
    let mut text = String::from_utf8_lossy(bytes).into_owned();
    let truncated = text.len() > MAX_BODY_CHARS;
    if truncated {
        text.truncate(MAX_BODY_CHARS);
        text.push_str("\n\n… truncated …");
    }
    (text, truncated)
}

fn truncate_preview(value: &str, max: usize) -> String {
    if value.len() <= max {
        value.to_string()
    } else {
        format!("{}…", &value[..max])
    }
}

fn push_event(
    events: &mut Vec<TraceEvent>,
    started: Instant,
    kind: &str,
    message: &str,
    detail: Option<String>,
) {
    events.push(TraceEvent {
        at_ms: started.elapsed().as_millis() as u64,
        kind: kind.to_string(),
        message: message.to_string(),
        detail,
    });
}

fn format_reqwest_error(err: reqwest::Error) -> String {
    if err.is_timeout() {
        "Request timed out".into()
    } else if err.is_connect() {
        format!("Connection failed: {err}")
    } else if err.is_redirect() {
        format!("Redirect error: {err}")
    } else {
        err.to_string()
    }
}
