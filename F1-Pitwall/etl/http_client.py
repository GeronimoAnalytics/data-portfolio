"""Small cached + throttled JSON client shared by the Jolpica and OpenF1 extractors.

* Every successful response is cached on disk (keyed by URL), so re-runs are free
  and an interrupted run resumes where it stopped.
* Requests are spaced by a minimum interval per host and retried with exponential
  back-off on 429 / 5xx.
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from pathlib import Path
from urllib.parse import urlencode

import requests

from . import config

log = logging.getLogger(__name__)


class CachedJsonClient:
    def __init__(self, base_url: str, min_interval_s: float, cache_subdir: str):
        self.base_url = base_url.rstrip("/")
        self.min_interval_s = min_interval_s
        self.cache_dir = config.CACHE_DIR / cache_subdir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._last_call = 0.0
        self._session = requests.Session()
        self._session.headers["User-Agent"] = "f1-pitwall-etl/1.0"

    # ------------------------------------------------------------------ helpers
    def _url(self, path: str, params: dict | None) -> str:
        url = f"{self.base_url}/{path.lstrip('/')}"
        return f"{url}?{urlencode(params)}" if params else url

    def _cache_file(self, url: str) -> Path:
        return self.cache_dir / (hashlib.sha1(url.encode()).hexdigest() + ".json")

    def _throttle(self) -> None:
        wait = self.min_interval_s - (time.monotonic() - self._last_call)
        if wait > 0:
            time.sleep(wait)
        self._last_call = time.monotonic()

    # --------------------------------------------------------------------- API
    def get(self, path: str, params: dict | None = None, use_cache: bool = True):
        url = self._url(path, params)
        cache_file = self._cache_file(url)
        if use_cache and cache_file.exists():
            return json.loads(cache_file.read_text(encoding="utf-8"))

        for attempt in range(config.HTTP_MAX_RETRIES):
            self._throttle()
            resp = self._session.get(url, timeout=120)
            if resp.status_code == 404:          # OpenF1 answers 404 for "no rows"
                payload = []
                break
            if resp.status_code in (429, 500, 502, 503, 504):
                backoff = min(60, 2 ** attempt * 2)
                log.warning("HTTP %s on %s - retry in %ss", resp.status_code, url, backoff)
                time.sleep(backoff)
                continue
            resp.raise_for_status()
            payload = resp.json()
            break
        else:
            raise RuntimeError(f"Giving up after {config.HTTP_MAX_RETRIES} attempts: {url}")

        cache_file.write_text(json.dumps(payload), encoding="utf-8")
        return payload


jolpica = CachedJsonClient(config.JOLPICA_BASE, config.JOLPICA_MIN_INTERVAL_S, "jolpica")
openf1 = CachedJsonClient(config.OPENF1_BASE, config.OPENF1_MIN_INTERVAL_S, "openf1")
