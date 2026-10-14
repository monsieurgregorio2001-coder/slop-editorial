"""Thin HTTP layer so providers can be tested with a fake.

POST is never retried here: a repeated POST can be a second chargeable job.
GET is retried on transport errors and 5xx with backoff.
"""
import time

import requests

from .errors import AmbiguousSubmit, ProviderError


class Http:
    def __init__(self, session=None, timeout=60, get_retries=3, sleep=time.sleep):
        self.session = session or requests.Session()
        self.timeout = timeout
        self.get_retries = get_retries
        self.sleep = sleep

    def post_json(self, url, headers, body):
        try:
            r = self.session.post(url, headers=headers, json=body, timeout=self.timeout)
        except (requests.ConnectionError, requests.Timeout) as e:
            raise AmbiguousSubmit(f"POST {url} failed in transit ({type(e).__name__}); not retrying, a job may exist") from e
        return self._check(r, url)

    def post_raw(self, url, headers, body):
        """POST JSON, return the raw response (for endpoints that answer with image bytes)."""
        try:
            r = self.session.post(url, headers=headers, json=body, timeout=self.timeout)
        except (requests.ConnectionError, requests.Timeout) as e:
            raise AmbiguousSubmit(f"POST {url} failed in transit ({type(e).__name__}); not retrying, a job may exist") from e
        if r.status_code >= 400:
            raise ProviderError(f"POST {url} -> {r.status_code}: {_snippet(r)}")
        return r

    def get_json(self, url, headers=None):
        return self._check(self._get(url, headers), url)

    def get_bytes(self, url, headers=None):
        r = self._get(url, headers)
        if r.status_code >= 400:
            raise ProviderError(f"GET {url} -> {r.status_code}")
        return r.content

    def _get(self, url, headers):
        last = None
        for attempt in range(self.get_retries + 1):
            try:
                r = self.session.get(url, headers=headers or {}, timeout=self.timeout)
                if r.status_code < 500 and r.status_code != 429:
                    return r
                last = ProviderError(f"GET {url} -> {r.status_code}")
            except (requests.ConnectionError, requests.Timeout) as e:
                last = ProviderError(f"GET {url} failed ({type(e).__name__})")
            if attempt < self.get_retries:
                self.sleep(min(2 ** attempt * 2, 20))
        raise last

    @staticmethod
    def _check(r, url):
        if r.status_code >= 400:
            raise ProviderError(f"{url} -> {r.status_code}: {_snippet(r)}")
        try:
            return r.json()
        except ValueError as e:
            raise ProviderError(f"{url} returned non-JSON") from e


def _snippet(r, n=300):
    try:
        return r.text[:n].replace("\n", " ")
    except Exception:
        return "<unreadable>"
