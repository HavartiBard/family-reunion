#!/usr/bin/env python3
import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import error, request


API_URL = os.environ.get("DEV_AUTH_API_URL", "https://reunion-api.klsll.com").rstrip("/")
EMAIL = os.environ.get("DEV_LOGIN_EMAIL", "")
PASSWORD = os.environ.get("DEV_LOGIN_PASSWORD", "")
HOST = os.environ.get("DEV_AUTH_HOST", "0.0.0.0")
PORT = int(os.environ.get("DEV_AUTH_PORT", "4174"))
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.environ.get(
        "DEV_FRONTEND_ORIGINS",
        "http://localhost:4173,http://192.168.20.60:4173,http://localhost:8080,http://192.168.20.60:8080,http://dev.klsll.com:8080",
    ).split(",")
    if origin.strip()
}


def _read_json(handler):
    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length).decode("utf-8") if length else "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _cors_origin(origin):
    return origin if origin in ALLOWED_ORIGINS else ""


def _pb_auth():
    body = json.dumps({"identity": EMAIL, "password": PASSWORD}).encode("utf-8")
    req = request.Request(
        f"{API_URL}/api/collections/users/auth-with-password",
        data=body,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=15) as res:
            return res.getcode(), json.loads(res.read().decode("utf-8"))
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8") or "{}"
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"message": raw}


class DevAuthHandler(BaseHTTPRequestHandler):
    server_version = "DevAuthProxy/1.0"

    def do_OPTIONS(self):
        if self.path != "/dev-login":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        self.send_response(HTTPStatus.NO_CONTENT)
        self._send_cors_headers()
        self.end_headers()

    def do_POST(self):
        if self.path != "/dev-login":
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        origin = self.headers.get("Origin", "")
        if origin not in ALLOWED_ORIGINS:
            self._send_json(HTTPStatus.FORBIDDEN, {"message": "Origin is not allowed."})
            return
        _read_json(self)
        if not EMAIL or not PASSWORD:
            self._send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"message": "Dev auth proxy is not configured."})
            return
        status, data = _pb_auth()
        if status != 200:
            self._send_json(HTTPStatus.BAD_GATEWAY, {"message": data.get("message") or "Dev login failed."})
            return
        self._send_json(HTTPStatus.OK, {"token": data["token"], "record": data["record"]})

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_cors_headers(self):
        origin = _cors_origin(self.headers.get("Origin", ""))
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Vary", "Origin")
        self.send_header("Cache-Control", "no-store")

    def log_message(self, fmt, *args):
        return


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), DevAuthHandler).serve_forever()
