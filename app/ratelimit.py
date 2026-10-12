import threading
import time
from collections import defaultdict, deque
from functools import wraps

from flask import jsonify, request

_lock = threading.Lock()
_hits = defaultdict(deque)  # (bucket, ip) -> request timestamps


def get_client_ip():
    # Render appends "<client>, <Cloudflare edge>, <Render proxy>" to any client-sent
    # X-Forwarded-For, so the real client is 3rd from the right (leftmost is spoofable).
    parts = [p.strip() for p in request.headers.get("X-Forwarded-For", "").split(",") if p.strip()]
    if len(parts) >= 3:
        return parts[-3]
    return request.remote_addr or "unknown"


def rate_limit(max_requests=10, window=60):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            now = time.monotonic()
            key = (fn.__name__, get_client_ip())
            with _lock:
                q = _hits[key]
                while q and now - q[0] >= window:
                    q.popleft()
                if len(q) >= max_requests:
                    return jsonify({"error": "too many requests, try again later"}), 429
                q.append(now)
            return fn(*args, **kwargs)
        return wrapper
    return decorator
