#!/usr/bin/env python3
"""Geocode unique slaughterhouses in boetes.json via PDOK Locatieserver.

Idempotent: only fetches lat/lon for slaughterhouses not already in geocoded.json.
Run from project root: python3 scripts/geocode.py
"""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOETES = ROOT / "data" / "boetes.json"
GEOCODED = ROOT / "data" / "geocoded.json"
API = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free"


def dedupe_key(slh: dict) -> str:
    """Case-insensitive on postcode_plaats so 'De Hoef' and 'de Hoef' map to one key."""
    return f"{slh.get('naam', '')}|{(slh.get('postcode_plaats') or '').lower()}"


def build_query(slh: dict) -> str:
    parts = [slh.get("adres"), slh.get("postcode_plaats")]
    q = ", ".join(p for p in parts if p)
    return q or slh.get("naam", "")


def geocode(query: str) -> dict | None:
    params = {
        "q": query,
        "fl": "id,weergavenaam,centroide_ll,type",
        "fq": "type:adres",
        "rows": 1,
    }
    url = f"{API}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=15) as r:
        data = json.load(r)
    docs = data.get("response", {}).get("docs", [])
    if not docs:
        return None
    m = re.match(r"POINT\(([\d.\-]+) ([\d.\-]+)\)", docs[0].get("centroide_ll", ""))
    if not m:
        return None
    lon, lat = float(m.group(1)), float(m.group(2))
    return {"lat": lat, "lon": lon, "matched": docs[0].get("weergavenaam")}


def main() -> None:
    cases = json.loads(BOETES.read_text(encoding="utf-8"))
    unique: dict[str, dict] = {}
    for c in cases:
        unique.setdefault(dedupe_key(c["slachthuis"]), c["slachthuis"])

    existing: dict[str, dict] = {}
    if GEOCODED.exists():
        existing = json.loads(GEOCODED.read_text(encoding="utf-8"))

    fetched = 0
    for key, slh in unique.items():
        if key in existing and existing[key].get("lat") is not None:
            continue
        query = build_query(slh)
        print(f"Geocoding: {slh['naam']!r} ({query!r})", file=sys.stderr)
        try:
            result = geocode(query)
        except Exception as e:
            print(f"  ERROR: {e}", file=sys.stderr)
            result = None
        record = {
            "naam": slh["naam"],
            "adres": slh.get("adres"),
            "postcode_plaats": slh.get("postcode_plaats"),
            "lat": None,
            "lon": None,
            "matched": None,
        }
        if result:
            record.update(result)
            print(f"  -> {result['lat']:.5f}, {result['lon']:.5f}", file=sys.stderr)
        else:
            print("  NOT FOUND", file=sys.stderr)
        existing[key] = record
        fetched += 1
        time.sleep(0.3)

    GEOCODED.write_text(
        json.dumps(existing, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Done. {fetched} new/refreshed entries. Total: {len(existing)}", file=sys.stderr)


if __name__ == "__main__":
    main()
