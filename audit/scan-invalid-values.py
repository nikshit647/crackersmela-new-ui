#!/usr/bin/env python3
"""Find values the server validator would reject, so editor saves fail."""
import json, sys, glob, os

LIMITS = {
    "position.x": (-1000, 1000), "position.y": (-1000, 1000), "position.scale": (0.1, 5),
    "gradient.angle": (0, 360), "animation.duration": (0, 10000), "animation.delay": (0, 10000),
    "content.limit": (1, 100), "content.columns": (1, 12),
}

def check_effects(eff, where, bad):
    if not isinstance(eff, dict):
        return
    pos = eff.get("position")
    if isinstance(pos, dict):
        for axis in ("x", "y", "scale"):
            v = pos.get(axis)
            if isinstance(v, (int, float)):
                lo, hi = LIMITS["position." + axis]
                if v < lo or v > hi:
                    bad.append((where, "position." + axis, v, f"allowed {lo}..{hi}"))
    g = eff.get("gradient")
    if isinstance(g, dict) and isinstance(g.get("angle"), (int, float)):
        lo, hi = LIMITS["gradient.angle"]
        if g["angle"] < lo or g["angle"] > hi:
            bad.append((where, "gradient.angle", g["angle"], f"allowed {lo}..{hi}"))

def walk(doc, label, bad):
    for sec in doc.get("sections", []):
        sid = sec.get("id")
        check_effects(sec.get("effects"), f"{label}/{sid}(section)", bad)
        for dev, ov in (sec.get("overrides") or {}).items():
            check_effects(ov.get("effects"), f"{label}/{sid}(section).{dev}", bad)
        content = sec.get("content") or {}
        for key, (lo, hi) in (("limit", LIMITS["content.limit"]), ("columns", LIMITS["content.columns"])):
            v = content.get(key)
            if isinstance(v, (int, float)) and (v < lo or v > hi):
                bad.append((f"{label}/{sid}(section)", "content." + key, v, f"allowed {lo}..{hi}"))
        for k, el in (sec.get("elements") or {}).items():
            w = f"{label}/{sid}/{k}"
            check_effects(el.get("effects"), w, bad)
            for dev, ov in (el.get("overrides") or {}).items():
                check_effects(ov.get("effects"), f"{w}[{dev}]", bad)
            for dev, an in (el.get("animation") or {}).items():
                if isinstance(an, dict):
                    for key in ("duration", "delay"):
                        v = an.get(key)
                        if isinstance(v, (int, float)) and (v < 0 or v > 10000):
                            bad.append((w, f"animation.{dev}.{key}", v, "allowed 0..10000"))

total = 0
for path in sorted(glob.glob(r"C:\Users\NIKSHI~1\AppData\Local\Temp\opencode\prod\*.json")):
    name = os.path.basename(path)
    raw = json.load(open(path, encoding="utf-8"))
    docs = []
    if "sections" in raw:
        docs.append(("root", raw))
    else:
        for k in ("draft", "published"):
            if isinstance(raw.get(k), dict) and "sections" in raw[k]:
                docs.append((k, raw[k]))
    bad = []
    for state, doc in docs:
        walk(doc, f"{name}:{state}", bad)
    if bad:
        total += len(bad)
        print(f"=== {name} — {len(bad)} REJECTED value(s) ===")
        for w, p, v, why in bad[:20]:
            print(f"   {p:26} = {str(v):<14} ({why})   @ {w}")
print("TOTAL values the server would reject:", total)