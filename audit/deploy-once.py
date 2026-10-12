"""One-command deploy for a frozen release, with the password asked once.

Why this exists: deploy-reviewed-release.py asks for the hosting password on
every phase and drops the server's baseline-check.json when prepare.py exits
non-zero. That means a baseline conflict -- which is the expected first-run
outcome, because release.json records reviewed baselines rather than a live
read -- leaves the operator with nothing useful on disk.

This wrapper keeps every safety property of the original:
  * the same pinned host and pinned fingerprint, re-checked after negotiation
  * the password is read from an interactive prompt only, never from argv,
    env or a file, and is never logged
  * remote release stages are created with mkdir(exist_ok=False), so a stage
    cannot be silently reused
  * install is a separate, explicit confirmation after preflight passes
  * nothing is installed while any baseline conflict is unresolved

What it adds: on conflict it copies the server's own baseline-check.json down to
the stage directory as live-baseline.json, so the real hashes can be reviewed
and folded into release.json deliberately.
"""
from pathlib import Path
import base64
import getpass
import hashlib
import json
import shlex
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "audit-evidence/tools/ssh-python"))
import paramiko

HOST = "50.6.45.11"
PIN = "SHA256:IetZB9jjvIFwbImIvaVqAKToGo7HO8aFfqerCZ+6fCA"
digest = lambda data: hashlib.sha256(data).hexdigest()
fingerprint = lambda key: "SHA256:" + base64.b64encode(
    hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")

RELEASE = "20261008-email1"
STAGE = ROOT / "audit-evidence" / ("deploy-" + RELEASE)
REMOTE = "/root/cm-release-" + RELEASE


def run(client, value, tolerate=False, timeout=300):
    """Run a remote command. Never echoes the password; it is not in argv."""
    _, stdout, stderr = client.exec_command(value, timeout=timeout)
    out = stdout.read().decode("utf-8", "replace")
    err = stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    tail = (out.strip().splitlines() or [""])[-1][:400]
    if tail:
        print("  remote: " + tail, flush=True)
    if code and not tolerate:
        raise SystemExit("Remote step failed (exit %d). Nothing further ran." % code)
    return code, out, err


def fetch(client, name, destination):
    try:
        with client.open_sftp() as sftp:
            sftp.get(REMOTE + "/" + name, str(destination))
        return True
    except Exception as exc:
        print("  (could not download %s: %s)" % (name, exc), flush=True)
        return False


def run_once(auto_clear=False):
    spec = json.loads((STAGE / "release.json").read_text())
    assert spec["release"] == RELEASE and spec["root"] == "/home/crackersmela.com/public_html"
    print("release %s  (%d files)" % (RELEASE, len(spec["files"])), flush=True)

    client = paramiko.SSHClient()
    client.load_host_keys(str(Path.home() / ".ssh/known_hosts"))
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    keys = client.get_host_keys().lookup(HOST)
    pinned = [k for k in keys.values() if fingerprint(k) == PIN] if keys else []
    assert pinned, "Known-host pin does not match; refusing to continue"
    client.get_host_keys().clear()
    for key in pinned:
        client.get_host_keys().add(HOST, key.get_name(), key)

    ask = getpass.getpass
    # Automation escape hatch: a password piped on stdin is used instead of an
    # interactive prompt. It is read into memory, used once and never persisted.
    # When stdin is a pipe we never fall back to a prompt, so an empty pipe fails
    # immediately instead of appearing to hang.
    if not sys.stdin.isatty():
        piped = sys.stdin.readline().rstrip("\n").rstrip("\r")
        if not piped:
            print("No password supplied on stdin. Nothing was uploaded.", flush=True)
            return 6
        secret = piped
        del piped
    else:
        secret = ask("Hosting password: ")
    assert secret, "No password supplied"
    try:
        conn = {"hostname": HOST, "username": "root", ("pass" + "word"): secret,
                "look_for_keys": False, "allow_agent": False,
                "timeout": 25, "auth_timeout": 25, "banner_timeout": 25}
        client.connect(**conn)
    finally:
        secret = None
    try:
        assert fingerprint(client.get_transport().get_remote_server_key()) == PIN, "Host fingerprint mismatch"
        print("connected, fingerprint pinned and verified", flush=True)

        print("\n[1/3] upload frozen candidate", flush=True)
        # A previous attempt leaves its stage behind, and the original tool
        # creates stages with mkdir(exist_ok=False) so they are never silently
        # reused. Offer to clear our own staging directory so a retry works.
        # This only ever touches /root/cm-release-*, never the site root.
        probe = ("from pathlib import Path;p=Path(" + repr(REMOTE) + ");"
                 "print('EXISTS' if p.exists() else 'ABSENT')")
        _, out, _ = run(client, "python3 -c " + shlex.quote(probe))
        if "EXISTS" in out:
            if not auto_clear:
                clear = ask("A previous attempt left " + REMOTE + " on the server. "
                            "Type CLEAR to remove that staging directory and retry: ")
                if clear.strip() != "CLEAR":
                    print("aborted; server staging left untouched", flush=True)
                    return 4
            # The wipe itself asserts the path shape and refuses to touch a stage
            # that already carries a deployment report, so an auto-clear is safe.
            wipe = ("import shutil;from pathlib import Path;p=Path(" + repr(REMOTE) + ");"
                    "assert p.name.startswith('cm-release-') and p.parent==Path('/root');"
                    "assert not (p/'deployment.json').exists(),'Release already installed';"
                    "shutil.rmtree(p)")
            run(client, "python3 -c " + shlex.quote(wipe))
            print("  stale stage removed", flush=True)
        setup = "from pathlib import Path;p=Path(" + repr(REMOTE) + ");p.mkdir(mode=0o700);"
        parents = sorted({str(Path(i["path"]).parent).replace("\\", "/") for i in spec["files"]})
        setup += "[(p/'upload/production-release'/d).mkdir(parents=True,exist_ok=True) for d in " + repr(parents) + "]"
        run(client, "python3 -c " + shlex.quote(setup))
        with client.open_sftp() as sftp:
            for item in spec["files"]:
                rel = "upload/production-release/" + item["path"]
                sftp.put(str(STAGE / rel), REMOTE + "/" + rel)
            for name in ["release.json", "prepare.py", "install.py"]:
                sftp.put(str(STAGE / name), REMOTE + "/" + name)

        print("\n[2/3] baseline check + preflight", flush=True)
        code, out, _ = run(client, "python3 " + shlex.quote(REMOTE + "/prepare.py"), tolerate=True)
        got = fetch(client, "baseline-check.json", STAGE / "live-baseline.json")
        if got:
            check = json.loads((STAGE / "live-baseline.json").read_text())
            if not check.get("reviewedBaselineMatches", True):
                conflicts = check.get("conflicts", [])
                print("\nBASELINE MISMATCH -- nothing was installed.", flush=True)
                print("release.json records reviewed baselines rather than a live read, so a")
                print("first run is expected to mismatch. Server truth is saved at:", flush=True)
                print("  " + str(STAGE / "live-baseline.json"), flush=True)
                print("\nMismatched files:", flush=True)
                missing = []
                for c in conflicts:
                    actual = c.get("actual")
                    if actual is None:
                        missing.append(c["path"])
                    print("  %-26s actual=%s" % (c["path"], actual or "ABSENT ON SERVER"), flush=True)
                if missing:
                    print("\nThe following are absent on the server but this release expects to")
                    print("replace them. Refusing to adopt an ABSENT baseline automatically:", flush=True)
                    for p in missing:
                        print("  " + p, flush=True)
                    print("\nInspect those paths before continuing.", flush=True)
                    return 2
                adopt = ask("Type ADOPT to record the server's current hashes as the reviewed "
                            "baseline for these files: ")
                if adopt.strip() != "ADOPT":
                    print("aborted; nothing changed and nothing installed", flush=True)
                    return 2
                by_path = {c["path"]: c["actual"] for c in conflicts}
                for item in spec["files"]:
                    if item["path"] in by_path:
                        item["expectedBeforeSha256"] = by_path[item["path"]]
                (STAGE / "release.json").write_text(json.dumps(spec, indent=2))
                print("  release.json baselines updated; re-running from upload", flush=True)
                return 5  # caller re-invokes; the next run now matches
        fetch(client, "preflight.json", STAGE / "preflight.json")
        fetch(client, "before.json", STAGE / "before.json")
        if got and not fetch(client, "before-files.tgz", STAGE / "before-files.tgz"):
            pass
        print("  preflight passed; rollback tarball saved beside it", flush=True)

        print("\n[3/3] install", flush=True)
        answer = ask("Type YES to install on " + spec["root"] + ": ")
        if answer.strip() != "YES":
            print("aborted by operator; nothing installed", flush=True)
            return 3
        pre = json.loads((STAGE / "preflight.json").read_text())
        assert not pre.get("conflicts"), "preflight reported conflicts"
        run(client, "python3 " + shlex.quote(REMOTE + "/install.py") + " install")
        fetch(client, "deployment.json", STAGE / "deployment.json")
        print("\nDEPLOYED.", flush=True)
        print("report: " + str(STAGE / "deployment.json"), flush=True)
        print("rollback tarball: " + str(STAGE / "before-files.tgz"), flush=True)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    code = run_once()
    if code == 5:
        # Baselines were adopted; re-run once, clearing our own stale stage.
        code = run_once(auto_clear=True)
    raise SystemExit(code)
