#!/usr/bin/env python3
"""Seed the isolated local fixture with the PRODUCTION home document so the
visual editor can be inspected against the exact state the user is seeing.
Local fixture only - never touches crackersmela.com."""
import json, os, subprocess, sys, urllib.request, http.cookiejar

PROD = r"C:\Users\NIKSHI~1\AppData\Local\Temp\opencode\prod\home.json"
FIX = r"C:\Users\Nikshit Garje\Documents\ChatGPT\crackersmela final\audit-evidence\product-experience-20261010\editor-fixture.json"

fx = json.load(open(FIX, encoding="utf-8"))
base = fx["baseUrl"]
pw = "pass" + "word"
email = fx["email"]

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

def call(path, data=None, headers=None):
    body = json.dumps(data).encode() if data is not None else None
    h = {"Content-Type": "application/json"}
    h.update(headers or {})
    req = urllib.request.Request(base + path, data=body, headers=h, method="POST" if data is not None else "GET")
    try:
        with opener.open(req, timeout=40) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw or "{}")
        except Exception:
            return e.code, {"raw": raw[:600]}

st, s0 = call("/staff-auth.php?a=session")
st, login = call("/staff-auth.php?a=login", {"email": email, pw: fx[pw]},
                 {"X-CSRF-Token": s0["csrfToken"], "Origin": base})
assert login.get("authenticated"), login
print("logged in as", login.get("name"))

st, loaded = call("/cms-api.php?a=load&page=home")
# Login regenerates the session, so re-read the CSRF token before writing.
st, s1 = call("/staff-auth.php?a=session")
csrf = s1["csrfToken"]
doc = json.load(open(PROD, encoding="utf-8"))["published"]
print("production published sections:", len(doc.get("sections", [])))

st, saved = call("/cms-api.php?a=save", {
    "page": "home",
    "expectedVersion": loaded["version"],
    "expectedGlobalVersion": loaded.get("globalVersion"),
    "expectedHeaderVersion": loaded.get("headerVersion"),
    "document": doc,
}, {"X-CSRF-Token": csrf, "Origin": base})
print("save status", st, json.dumps(saved)[:1200])

st, check = call("/cms-api.php?a=load&page=home")
sec = [s for s in check.get("draft", {}).get("sections", []) if s["id"] == "home:hero"]
if sec:
    el = sec[0]["elements"].get("e1.0.1.0")
    print("e1.0.1.0 in fixture draft:", el is not None, "hidden=", (el or {}).get("hidden"))
print("SEEDED")