#!/usr/bin/env python3
"""Find saved CMS elements whose styling would render as a stretched/smeared box."""
import json, re, sys, os

def num(v):
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        m = re.match(r"^\s*(-?[\d.]+)\s*(px|%|rem|em|vw|vh)?\s*$", v)
        if m:
            return float(m.group(1))
    return None

def suspicious(style_map):
    out = []
    for key, val in (style_map or {}).items():
        n = num(val)
        if n is None:
            continue
        if key in ("width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight"):
            if abs(n) > 4000:
                out.append((key, val, "absurd dimension"))
        elif key in ("fontSize", "lineHeight", "letterSpacing"):
            if abs(n) > 400:
                out.append((key, val, "absurd type metric"))
        elif key in ("borderRadius", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight",
                     "marginTop", "marginBottom", "marginLeft", "marginRight", "gap", "opacity"):
            if abs(n) > 4000:
                out.append((key, val, "absurd spacing"))
    return out

def scan_effects(effects, where, findings):
    if not isinstance(effects, dict):
        return
    pos = effects.get("position")
    if isinstance(pos, dict):
        for axis in ("x", "y"):
            n = num(pos.get(axis))
            if n is not None and abs(n) > 6000:
                findings.append((where, f"position.{axis}", pos.get(axis), "offscreen offset"))
        s = num(pos.get("scale"))
        if s is not None and (abs(s) > 12 or s == 0):
            findings.append((where, "position.scale", pos.get("scale"), "absurd/zero scale"))
    g = effects.get("gradient")
    if isinstance(g, dict) and g.get("enabled"):
        ang = num(g.get("angle"))
        if ang is not None and abs(ang) > 720:
            findings.append((where, "gradient.angle", g.get("angle"), "absurd angle"))

def walk(doc, label):
    findings = []
    for sec in doc.get("sections", []):
        sid = sec.get("id")
        sname = sec.get("name") or sec.get("type")
        for ekey, el in (sec.get("elements") or {}).items():
            where = f"{label}:{sname}:{ekey}:{el.get('kind')}"
            for dev, sm in (el.get("styles") or {}).items():
                for k, v, why in suspicious(sm):
                    findings.append((where, f"styles.{dev}.{k}", v, why))
            for dev, ov in (el.get("overrides") or {}).items():
                for k, v, why in suspicious(ov.get("styles") or {}):
                    findings.append((where, f"override[{dev}].{k}", v, why))
                scan_effects(ov.get("effects"), where + " " + dev, findings)
            scan_effects(el.get("effects"), where, findings)
            if el.get("locked"):
                findings.append((where, "locked", True, "element is locked in the editor"))
            if el.get("hidden"):
                findings.append((where, "hidden", True, "element is deleted/hidden"))
    return findings

for path, label in [(sys.argv[1], "home"), (sys.argv[2] if len(sys.argv) > 2 else None, "globals")]:
    if not path:
        continue
    doc = json.load(open(path, encoding="utf-8"))
    f = walk(doc, label)
    print(f"=== {label} ({os.path.basename(path)}) — {len(f)} finding(s) ===")
    for w, k, v, why in f:
        print(f"  {why:22} {w}\n      {k} = {v}")
    print()

# Also: what page/section does the editor open first?
home = json.load(open(sys.argv[1], encoding="utf-8"))
print("=== home sections ===")
for s in home.get("sections", []):
    print(f"  {s.get('id')}  {s.get('name') or s.get('type')}  region={s.get('region')}  elements={len(s.get('elements') or {})}")