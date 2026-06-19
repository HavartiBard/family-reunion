#!/usr/bin/env python3
import json
import os
import secrets
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import error, parse, request


PB_INTERNAL = os.environ.get("PB_INTERNAL_URL", "http://127.0.0.1:8091")
PUBLIC_API = os.environ.get("PUBLIC_API_URL", "https://reunion-api.klsll.com")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "https://reunion.klsll.com/")
LISTEN_HOST = os.environ.get("APPLE_BRIDGE_HOST", "127.0.0.1")
LISTEN_PORT = int(os.environ.get("APPLE_BRIDGE_PORT", "8092"))
FLOW_TTL_SECONDS = int(os.environ.get("APPLE_FLOW_TTL_SECONDS", "600"))
HANDOFF_TTL_SECONDS = int(os.environ.get("APPLE_HANDOFF_TTL_SECONDS", "120"))

_lock = threading.Lock()
_flows = {}
_handoffs = {}


def _now():
    return int(time.time())


def _callback_url():
    return PUBLIC_API.rstrip("/") + "/auth/apple/callback"


def _cleanup():
    now = _now()
    with _lock:
        for state, flow in list(_flows.items()):
            if flow["expires_at"] <= now:
                del _flows[state]
        for code, handoff in list(_handoffs.items()):
            if handoff["expires_at"] <= now:
                del _handoffs[code]


def _json_request(path, method="GET", payload=None):
    url = PB_INTERNAL.rstrip("/") + path
    body = None
    headers = {}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(url, data=body, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=15) as res:
            return res.getcode(), json.loads(res.read().decode("utf-8"))
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8") or "{}"
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = {"message": raw}
        return exc.code, data


def _cors_origin():
    parsed = parse.urlparse(FRONTEND_URL)
    return f"{parsed.scheme}://{parsed.netloc}"


def _normalize_frontend_url(value):
    allowed = parse.urlparse(FRONTEND_URL)
    target = value or FRONTEND_URL
    parsed = parse.urlparse(target)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return FRONTEND_URL
    if parsed.scheme != allowed.scheme or parsed.netloc != allowed.netloc:
        return FRONTEND_URL
    return f"{allowed.scheme}://{allowed.netloc}{parsed.path or '/'}"


def _pb_apple_provider():
    status, data = _json_request("/api/collections/users/auth-methods")
    if status != 200:
        raise RuntimeError(data.get("message") or "Could not load auth providers")
    provider = next((p for p in data.get("authProviders", []) if p.get("name") == "apple"), None)
    if not provider:
        raise RuntimeError("Apple sign-in is not configured.")
    return provider


def _build_apple_url(provider):
    nonce = secrets.token_urlsafe(24)
    state = provider["state"]
    auth_url = provider["authUrl"] + parse.quote(_callback_url(), safe="")
    parsed = parse.urlparse(auth_url)
    query = parse.parse_qsl(parsed.query, keep_blank_values=True)
    clean = []
    for key, value in query:
        if key in ("code_challenge", "code_challenge_method"):
            continue
        if key == "redirect_uri":
            value = _callback_url()
        clean.append((key, value))
    clean.append(("nonce", nonce))
    rebuilt = parsed._replace(query=parse.urlencode(clean, doseq=True))
    return state, nonce, parse.urlunparse(rebuilt)


def _store_flow(state, nonce, frontend_url):
    with _lock:
        _flows[state] = {
            "nonce": nonce,
            "frontend_url": frontend_url,
            "expires_at": _now() + FLOW_TTL_SECONDS,
        }


def _consume_flow(state):
    with _lock:
        flow = _flows.pop(state, None)
    if not flow or flow["expires_at"] <= _now():
        return None
    return flow


def _store_handoff(frontend_url, auth_payload):
    handoff = secrets.token_urlsafe(24)
    with _lock:
        _handoffs[handoff] = {
            "frontend_url": frontend_url,
            "payload": auth_payload,
            "expires_at": _now() + HANDOFF_TTL_SECONDS,
        }
    return handoff


def _consume_handoff(code):
    with _lock:
        handoff = _handoffs.pop(code, None)
    if not handoff or handoff["expires_at"] <= _now():
        return None
    return handoff


def _error_redirect(frontend_url, message):
    query = parse.urlencode({"apple_oauth_error": message})
    separator = "&" if parse.urlparse(frontend_url).query else "?"
    return frontend_url + separator + query


class AppleBridgeHandler(BaseHTTPRequestHandler):
    server_version = "AppleBridge/1.0"

    def do_OPTIONS(self):
        if self.path.startswith("/auth/apple/finalize"):
            self.send_response(HTTPStatus.NO_CONTENT)
            self._send_cors_headers()
            self.end_headers()
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_GET(self):
        _cleanup()
        parsed = parse.urlparse(self.path)
        if parsed.path == "/auth/apple/start":
            self._handle_start(parsed)
            return
        if parsed.path == "/auth/apple/finalize":
            self._handle_finalize(parsed)
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self):
        _cleanup()
        parsed = parse.urlparse(self.path)
        if parsed.path == "/auth/apple/callback":
            self._handle_callback()
            return
        self.send_error(HTTPStatus.NOT_FOUND)

    def _handle_start(self, parsed):
        frontend_url = _normalize_frontend_url(parse.parse_qs(parsed.query).get("redirect", [FRONTEND_URL])[0])
        try:
            provider = _pb_apple_provider()
            state, nonce, apple_url = _build_apple_url(provider)
            _store_flow(state, nonce, frontend_url)
            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", apple_url)
            self.end_headers()
        except Exception as exc:
            self._send_json(HTTPStatus.BAD_GATEWAY, {"message": str(exc)})

    def _handle_callback(self):
        length = int(self.headers.get("Content-Length", "0"))
        form = parse.parse_qs(self.rfile.read(length).decode("utf-8"), keep_blank_values=True)
        state = form.get("state", [""])[0]
        code = form.get("code", [""])[0]
        error_message = form.get("error", [""])[0] or form.get("error_description", [""])[0]

        flow = _consume_flow(state)
        frontend_url = flow["frontend_url"] if flow else FRONTEND_URL
        if error_message:
            self.send_response(HTTPStatus.SEE_OTHER)
            self.send_header("Location", _error_redirect(frontend_url, error_message))
            self.end_headers()
            return
        if not flow or not code:
            self.send_response(HTTPStatus.SEE_OTHER)
            self.send_header("Location", _error_redirect(frontend_url, "Invalid or expired Apple login session."))
            self.end_headers()
            return

        try:
            # PocketBase completes the Apple code exchange and provider token validation.
            # This bridge owns state, callback handling, and one-time session handoff.
            status, data = _json_request(
                "/api/collections/users/auth-with-oauth2",
                method="POST",
                payload={
                    "provider": "apple",
                    "code": code,
                    "codeVerifier": "",
                    "redirectUrl": _callback_url(),
                },
            )
        except Exception:
            self.send_response(HTTPStatus.SEE_OTHER)
            self.send_header("Location", _error_redirect(frontend_url, "Apple sign-in is temporarily unavailable."))
            self.end_headers()
            return
        if status != 200:
            message = data.get("message") or "Apple sign-in failed."
            self.send_response(HTTPStatus.SEE_OTHER)
            self.send_header("Location", _error_redirect(frontend_url, message))
            self.end_headers()
            return

        handoff = _store_handoff(frontend_url, {"token": data["token"], "record": data["record"]})
        query = parse.urlencode({"apple_oauth_done": "1", "handoff": handoff})
        separator = "&" if parse.urlparse(frontend_url).query else "?"
        self.send_response(HTTPStatus.SEE_OTHER)
        self.send_header("Location", frontend_url + separator + query)
        self.end_headers()

    def _handle_finalize(self, parsed):
        params = parse.parse_qs(parsed.query)
        handoff_code = params.get("handoff", [""])[0]
        handoff = _consume_handoff(handoff_code)
        if not handoff:
            self._send_json(HTTPStatus.GONE, {"message": "Apple sign-in handoff expired."}, cors=True)
            return
        self._send_json(HTTPStatus.OK, handoff["payload"], cors=True)

    def _send_json(self, status, payload, cors=False):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        if cors:
            self._send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", _cors_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer((LISTEN_HOST, LISTEN_PORT), AppleBridgeHandler)
    server.serve_forever()
