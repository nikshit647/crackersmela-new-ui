"""Start/refresh an isolated copy of the actual PHP application for CMS QA.

python tests/cms-fixture.py --start
python tests/cms-fixture.py --refresh

No production data, sessions, credentials, or mail transports are used. The
fixture manifest is Git-ignored and contains only synthetic login information.
"""
from pathlib import Path
import argparse
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / "audit-evidence"
RELEASE = EVIDENCE / "production-release"
OVERLAY = ROOT / "visual-editor"
PHP = EVIDENCE / "tools/php-8.3.35/php.exe"
MANIFEST = EVIDENCE / "cms-fixture-active.json"


def copy_source(web):
    # Files are copied, never linked: media QA cannot delete recovered assets.
    shutil.copytree(RELEASE, web, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns("uploads", "images", "*.log"))
    images = ROOT / "review/public/images"
    if images.is_dir():
        shutil.copytree(images, web / "images", dirs_exist_ok=True)
    # Current category artwork is part of the production candidate, while the
    # older recovered preview supplies the remaining image dependencies.
    category_images = RELEASE / "images/categories"
    if category_images.is_dir():
        shutil.copytree(category_images, web / "images/categories", dirs_exist_ok=True)
    for source in OVERLAY.iterdir():
        if source.is_file() and source.suffix in (".php", ".html"):
            shutil.copy2(source, web / source.name)
        elif source.is_dir() and source.name in ("js", "css"):
            shutil.copytree(source, web / source.name, dirs_exist_ok=True)
    # A local fixture may use the owner's requested simple username. This
    # presentation-only adjustment stays in the copied test document root.
    app = web / "js/app.js"
    source = app.read_text(encoding="utf-8-sig")
    source = source.replace('<label for="auEmail">Email</label><input type="email" id="auEmail"',
                            '<label for="auEmail">${IS_ADMIN_HOST ? "Username or email" : "Email"}</label>'
                            '<input type="${IS_ADMIN_HOST ? "text" : "email"}" id="auEmail"')
    app.write_text(source, encoding="utf-8")


def validate_fixture(value):
    fixture = Path(value).resolve()
    if fixture.parent != EVIDENCE.resolve() or not fixture.name.startswith("cms-fixture-"):
        raise RuntimeError("The fixture path is outside the intended test workspace")
    return fixture


def refresh():
    active = json.loads(MANIFEST.read_text(encoding="utf-8"))
    fixture = validate_fixture(active["fixture"])
    copy_source(fixture / "public")
    # Match the production clean category/product route rewrites. Older QA
    # fixtures predate these URLs and would return 404 before JS can run.
    router = fixture / "router.php"
    routes = router.read_text(encoding="utf-8")
    seo_route = "if (preg_match('~^/(?:product/[^/]+|products|category/[a-z0-9-]+)/?$~D', $route)) { require $root . '/seo-page.php'; return true; }\n"
    marker = "if (preg_match('~^/(about|contact|faq|shipping|safety|wholesale|returns|terms|privacy)/?$~D'"
    if seo_route not in routes and marker in routes:
        routes = routes.replace(marker, seo_route + marker)
    home_route = "if ($route === '/') { $_GET['slug']='home'; require $root . '/cms-page.php'; return true; }\n"
    if home_route not in routes:
        routes = routes.replace("if ($route === '/' || preg_match(", home_route + "if (preg_match(")
    router.write_text(routes, encoding="utf-8")
    print(json.dumps({"refreshed": True, "url": active["editorUrl"],
                      "note": "Source refreshed; existing isolated draft/session data preserved"}))


def start(port):
    if port < 1024 or port > 65535:
        raise RuntimeError("Choose an unprivileged local port")
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", port)) == 0:
            raise RuntimeError("Port is already in use; refresh the active fixture or choose another port")
    fixture = Path(tempfile.mkdtemp(prefix="cms-fixture-", dir=EVIDENCE))
    web = fixture / "public"
    data, uploads, sessions = (fixture / name for name in ("data", "uploads", "sessions"))
    for directory in (web, data, uploads, sessions):
        directory.mkdir()
    copy_source(web)
    # Preserve the known public product snapshot and real seed catalog only.
    # Order/customer stores begin empty and are created by controlled QA calls.
    for name in ("products.json", "catalog.json"):
        payload = json.loads((ROOT / "review/fixtures" / name).read_text(encoding="utf-8-sig"))
        payload.pop("ok", None)
        (data / name).write_text(json.dumps(payload), encoding="utf-8")
    email = "cms-qa@example.test"
    password = "Local visual editor QA 2026!"
    env = os.environ.copy()
    env.update(CM_DATA_DIR=str(data), CM_UPLOAD_DIR=str(uploads),
               CM_STAFF_CONFIG=str(fixture / "staff-config.php"),
               CM_STAFF_GOOGLE_CONFIG=str(fixture / "google-config.php"),
               CM_DISABLE_MAIL="1", EMAIL_ENABLED="false", CM_EMAIL_TRANSPORT="fake",
               SMTP_PASSWORD="", SMTP_USER="", SMTP_HOST="", CM_QA_PASSWORD=password)
    hashed = subprocess.check_output([str(PHP), "-r",
                                      "echo password_hash(getenv('CM_QA_PASSWORD'), PASSWORD_DEFAULT);"],
                                     env=env, text=True).strip()
    (fixture / "staff-config.php").write_text(
        "<?php return ['email'=>'" + email + "','hash'=>'" + hashed + "'];", encoding="utf-8")
    (fixture / "google-config.php").write_text("<?php return ['emails'=>[], 'domains'=>[]];", encoding="utf-8")
    router = fixture / "router.php"
    router.write_text(r'''<?php
$route = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/');
if (preg_match('~(?:^|/)\.|\\\\|\x00~', $route)) { http_response_code(404); exit; }
$root = __DIR__ . '/public';
if ($route === '/__fixture-health') {
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode(['fixture'=>true, 'mail'=>'disabled', 'isolated'=>true]); exit;
}
if ($route === '/visual-editor' || $route === '/visual-editor/') {
    require $root . '/visual-editor.php'; return true;
}
if (preg_match('~^/cm-[a-z-]+\.php$~', $route)) { http_response_code(404); exit; }
if (str_starts_with($route, '/uploads/')) {
    $uploads = realpath(__DIR__ . '/uploads');
    $target = realpath($uploads . '/' . substr($route, 9));
    if (!$target || !str_starts_with($target, $uploads . DIRECTORY_SEPARATOR)
        || !preg_match('/\.(?:png|jpe?g|webp)$/iD', $target)) { http_response_code(404); exit; }
    header('Content-Type: ' . (new finfo(FILEINFO_MIME_TYPE))->file($target));
    header('X-Content-Type-Options: nosniff'); readfile($target); exit;
}
$target = realpath($root . $route);
if ($target && str_starts_with($target, realpath($root) . DIRECTORY_SEPARATOR) && is_file($target)) return false;
if (preg_match('~^/(?:product/[^/]+|products|category/[a-z0-9-]+)/?$~D', $route)) { require $root . '/seo-page.php'; return true; }
if (preg_match('~^/(about|contact|faq|shipping|safety|wholesale|returns|terms|privacy)/?$~D', $route, $match)) { $_GET['slug']=$match[1]; require $root . '/cms-page.php'; return true; }
 if ($route === '/') { $_GET['slug']='home'; require $root . '/cms-page.php'; return true; }
 if (preg_match('~^/(?:product|products|track|price-list)(?:/.*)?$~D', $route)) {
    header('Content-Type: text/html; charset=utf-8'); readfile($root . '/index.html'); return true;
}
if (preg_match('~^/([a-z0-9]+(?:-[a-z0-9]+)*)/?$~D', $route, $match)) { $_GET['slug']=$match[1]; require $root . '/cms-page.php'; return true; }
http_response_code(404); echo 'Not found';
''', encoding="utf-8")
    log = open(fixture / "php-server.log", "w", encoding="utf-8")
    command = [str(PHP), "-d", "display_errors=0", "-d", "log_errors=1",
               "-d", "session.save_path=" + str(sessions),
               "-d", "extension_dir=" + str(PHP.parent / "ext"),
               "-d", "extension=fileinfo", "-d", "extension=gd", "-d", "extension=openssl",
               "-S", "127.0.0.1:" + str(port), "-t", str(web), str(router)]
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    process = subprocess.Popen(command, cwd=web, env=env, stdin=subprocess.DEVNULL,
                               stdout=log, stderr=log, creationflags=flags)
    base = "http://127.0.0.1:" + str(port)
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError("The isolated PHP server did not start; inspect its local log")
        try:
            with urllib.request.urlopen(base + "/__fixture-health", timeout=1) as response:
                if json.load(response).get("isolated"):
                    break
        except (OSError, ValueError):
            time.sleep(.05)
    else:
        process.terminate()
        raise RuntimeError("The isolated PHP server did not become ready")
    active = {"fixture": str(fixture), "documentRoot": str(web), "pid": process.pid,
              "baseUrl": base, "publicUrl": "http://localhost:" + str(port),
              "editorUrl": base + "/visual-editor", "email": email, "password": password,
              "scope": "Isolated local copy; synthetic authentication; no production mutations or mail"}
    MANIFEST.write_text(json.dumps(active, indent=2), encoding="utf-8")
    print(json.dumps(active, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--start", action="store_true")
    mode.add_argument("--refresh", action="store_true")
    parser.add_argument("--port", type=int, default=4186)
    args = parser.parse_args()
    refresh() if args.refresh else start(args.port)
