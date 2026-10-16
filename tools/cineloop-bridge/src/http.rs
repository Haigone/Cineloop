use serde_json::Value;
use std::io::Read;
use tiny_http::{Header, Method, Request, Response, Server};

pub const ADDR: &str = "127.0.0.1:32145";

/// Solo l'estensione CineLoop (Chromium o Firefox) può scrivere.
pub fn origin_allowed(origin: &str) -> bool {
    origin.starts_with("chrome-extension://") || origin.starts_with("moz-extension://")
}

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).unwrap()
}

fn reply(req: Request, status: u16, body: &str, origin: &str) {
    let mut r = Response::from_string(body)
        .with_status_code(status)
        .with_header(header("Content-Type", "application/json; charset=utf-8"));
    if origin_allowed(origin) {
        r = r
            .with_header(header("Access-Control-Allow-Origin", origin))
            .with_header(header("Access-Control-Allow-Methods", "POST, OPTIONS"))
            .with_header(header("Access-Control-Allow-Headers", "Content-Type"));
    }
    let _ = req.respond(r);
}

/// Ascolta solo su localhost; per ogni POST /presence valido chiama `on_payload`.
pub fn serve(server: Server, on_payload: impl Fn(Value)) {
    for mut req in server.incoming_requests() {
        let origin = req
            .headers()
            .iter()
            .find(|h| h.field.equiv("Origin"))
            .map(|h| h.value.to_string())
            .unwrap_or_default();
        if *req.method() == Method::Options {
            let _ = req.respond(Response::empty(204).with_header(header("Access-Control-Allow-Origin", &origin))
                .with_header(header("Access-Control-Allow-Methods", "POST, OPTIONS"))
                .with_header(header("Access-Control-Allow-Headers", "Content-Type")));
            continue;
        }
        if req.url() != "/presence" || *req.method() != Method::Post {
            reply(req, 404, r#"{"ok":false}"#, &origin);
            continue;
        }
        if !origin_allowed(&origin) {
            reply(req, 403, r#"{"ok":false,"error":"extension_only"}"#, &origin);
            continue;
        }
        let mut body = String::new();
        if req.as_reader().take(32768).read_to_string(&mut body).is_err() {
            reply(req, 400, r#"{"ok":false,"error":"invalid_json"}"#, &origin);
            continue;
        }
        match serde_json::from_str::<Value>(&body) {
            Ok(v) => {
                on_payload(v);
                reply(req, 200, r#"{"ok":true}"#, &origin);
            }
            Err(_) => reply(req, 400, r#"{"ok":false,"error":"invalid_json"}"#, &origin),
        }
    }
}

pub fn bind() -> Option<Server> {
    Server::http(ADDR).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_extension_origins() {
        assert!(origin_allowed("chrome-extension://abc"));
        assert!(origin_allowed("moz-extension://abc"));
        assert!(!origin_allowed("https://evil.example"));
        assert!(!origin_allowed(""));
    }
}
