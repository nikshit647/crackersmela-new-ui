"""Resume an existing isolated QA server without replacing its saved data."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
from urllib.parse import urlparse
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = (ROOT / "audit-evidence").resolve()
PHP = EVIDENCE / "tools/php-8.3.35/php.exe"


def resume(name):
    manifest = (EVIDENCE / name).resolve()
    if manifest.parent != EVIDENCE or manifest.suffix != ".json":
        raise ValueError("Expected a local fixture manifest")
    active = json.loads(manifest.read_text(encoding="utf-8"))
    fixture = Path(active["fixture"]).resolve()
    web = Path(active["documentRoot"]).resolve()
    parsed = urlparse(active["baseUrl"])
    if (fixture.parent != EVIDENCE or not fixture.name.startswith("cms-fixture-")
            or web != fixture / "public" or parsed.hostname != "127.0.0.1"
            or parsed.scheme != "http" or not parsed.port or parsed.port < 1024):
        raise ValueError("Refusing to resume a nonlocal or nonfixture server")
    with socket.socket() as probe:
        in_use = probe.connect_ex(("127.0.0.1", parsed.port)) == 0
    if not in_use:
        env = os.environ.copy()
        env.update(CM_DATA_DIR=str(fixture / "data"),
                   CM_UPLOAD_DIR=str(fixture / "uploads"),
                   CM_STAFF_CONFIG=str(fixture / "staff-config.php"),
                   CM_STAFF_GOOGLE_CONFIG=str(fixture / "google-config.php"),
                   CM_DISABLE_MAIL="1", EMAIL_ENABLED="false", CM_EMAIL_TRANSPORT="fake",
                   SMTP_PASSWORD="", SMTP_USER="", SMTP_HOST="")
        # Reuse the already-installed local invoice runtime. Nothing is fetched
        # and production configuration remains untouched.
        invoice_runtime = EVIDENCE / "invoice-render-20261005"
        if ((invoice_runtime / "vendor/autoload.php").is_file()
                and (invoice_runtime / "invoice-assets").is_dir()):
            invoice_tmp = fixture / "invoice-tmp"
            invoice_tmp.mkdir(exist_ok=True)
            env.update(CM_INVOICE_MPDF_AUTOLOAD=str(invoice_runtime / "vendor/autoload.php"),
                       CM_INVOICE_FONT_DIR=str(invoice_runtime / "invoice-assets"),
                       CM_INVOICE_MPDF_TMP=str(invoice_tmp))
        command = [str(PHP), "-d", "display_errors=0", "-d", "log_errors=1",
                   "-d", "session.save_path=" + str(fixture / "sessions"),
                   "-d", "extension_dir=" + str(PHP.parent / "ext"),
                   "-d", "extension=fileinfo", "-d", "extension=gd", "-d", "extension=openssl",
                   "-d", "extension=mbstring",
                   "-S", "127.0.0.1:" + str(parsed.port), "-t", str(web), str(fixture / "router.php")]
        with (fixture / "php-server.log").open("a", encoding="utf-8") as log:
            process = subprocess.Popen(command, cwd=web, env=env, stdin=subprocess.DEVNULL,
                                       stdout=log, stderr=log,
                                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError("Local PHP server stopped; inspect its fixture log")
            try:
                with urlopen(active["baseUrl"] + "/__fixture-health", timeout=1) as response:
                    health = json.load(response)
                break
            except OSError:
                time.sleep(.05)
        else:
            process.terminate()
            raise RuntimeError("Local PHP server did not become ready")
        active["pid"] = process.pid
        manifest.write_text(json.dumps(active, indent=2), encoding="utf-8")
    else:
        with urlopen(active["baseUrl"] + "/__fixture-health", timeout=2) as response:
            health = json.load(response)
    if health.get("isolated") is not True or health.get("mail") != "disabled":
        raise RuntimeError("Server did not confirm isolated data and disabled mail")
    print(json.dumps({"ready": True, "url": active["publicUrl"], "dataPreserved": True}))


if __name__ == "__main__":
    for filename in sys.argv[1:]:
        resume(filename)
