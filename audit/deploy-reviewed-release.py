"""Upload/preflight or install one frozen reviewed release, stopping on every error.

Authentication uses an interactive password prompt, never arguments, environment
variables or saved files. Preflight and install are separate explicit invocations.
"""
from pathlib import Path
import argparse
import base64
import getpass
import hashlib
import json
import re
import shlex
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "audit-evidence/tools/ssh-python"))
import paramiko


HOST = "50.6.45.11"
PIN = "SHA256:IetZB9jjvIFwbImIvaVqAKToGo7HO8aFfqerCZ+6fCA"
digest = lambda data: hashlib.sha256(data).hexdigest()


def command(client, value, timeout=240):
    _, stdout, stderr = client.exec_command(value, timeout=timeout)
    output, error = stdout.read().decode("utf-8", "replace"), stderr.read().decode("utf-8", "replace")
    code = stdout.channel.recv_exit_status()
    print(json.dumps({"exitCode": code, "output": output, "error": error}), flush=True)
    if code:
        raise RuntimeError("Remote command failed; no subsequent action will run")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", required=True)
    parser.add_argument("--phase", choices=["preflight", "install"], required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{3,63}", args.release):
        parser.error("Invalid release ID")
    stage = ROOT / "audit-evidence" / ("deploy-" + args.release)
    spec = json.loads((stage / "release.json").read_text())
    assert spec["release"] == args.release and spec["root"] == "/home/crackersmela.com/public_html"
    for item in spec["files"]:
        local = (stage / "upload/production-release" / item["path"]).resolve()
        assert local.is_relative_to((stage / "upload/production-release").resolve())
        assert digest(local.read_bytes()) == item["afterSha256"], "Frozen candidate changed"
    assert digest((stage / "install.py").read_bytes()) == spec["installerSha256"]
    assert digest((stage / "prepare.py").read_bytes()) == spec["prepareSha256"]
    private_files = spec.get("privateFiles", [])
    for item in private_files:
        relative = Path(item["path"])
        assert relative.parts[:2] == ("operators", "seo") and ".." not in relative.parts
        local = (stage / relative).resolve()
        assert local.is_relative_to((stage / "operators/seo").resolve())
        assert digest(local.read_bytes()) == item["sha256"], "Frozen private operator changed"
    client = paramiko.SSHClient()
    client.load_host_keys(str(Path.home() / ".ssh/known_hosts"))
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    # Check the known pin before requesting a password, and again after transport negotiation.
    keys = client.get_host_keys().lookup(HOST)
    fingerprint = lambda key: "SHA256:" + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
    pinned = [key for key in keys.values() if fingerprint(key) == PIN] if keys else []
    assert pinned, "Known-host pin does not match"
    client.get_host_keys().clear()
    for key in pinned:
        client.get_host_keys().add(HOST, key.get_name(), key)
    password = getpass.getpass("Hosting password: ")
    try:
        client.connect(HOST, username="root", password=password, look_for_keys=False,
                       allow_agent=False, timeout=20, auth_timeout=20, banner_timeout=20)
    finally:
        password = None
    try:
        assert fingerprint(client.get_transport().get_remote_server_key()) == PIN, "Host fingerprint mismatch"
        remote = "/root/cm-release-" + args.release
        if args.phase == "preflight":
            # mkdir(exist_ok=False) makes remote release stages immutable. A collision stops uploads.
            setup = "from pathlib import Path;p=Path(" + repr(remote) + ");p.mkdir(mode=0o700);"
            parents = sorted({str(Path(item["path"]).parent).replace("\\", "/") for item in spec["files"]})
            setup += "[(p/'upload/production-release'/d).mkdir(parents=True,exist_ok=True) for d in " + repr(parents) + "]"
            if private_files:
                setup += ";(p/'operators/seo').mkdir(mode=0o700,parents=True,exist_ok=True)"
            command(client, "python3 -c " + shlex.quote(setup))
            with client.open_sftp() as sftp:
                for item in spec["files"]:
                    relative = "upload/production-release/" + item["path"]
                    sftp.put(str(stage / relative), remote + "/" + relative)
                for name in ["release.json", "prepare.py", "install.py"]:
                    sftp.put(str(stage / name), remote + "/" + name)
                for item in private_files:
                    sftp.put(str(stage / item["path"]), remote + "/" + item["path"])
                    sftp.chmod(remote + "/" + item["path"], 0o600)
            command(client, "python3 " + shlex.quote(remote + "/prepare.py"))
            with client.open_sftp() as sftp:
                for name in ["baseline-check.json", "preflight.json", "before.json"]:
                    sftp.get(remote + "/" + name, str(stage / name))
            print(json.dumps({"preflight": "PASS", "installed": False,
                              "next": "Review the local reports before the separate install phase"}), flush=True)
        else:
            preflight = json.loads((stage / "preflight.json").read_text())
            baseline = json.loads((stage / "baseline-check.json").read_text())
            assert not preflight["conflicts"] and baseline["reviewedBaselineMatches"]
            assert preflight["stage"] == remote and preflight["root"] == spec["root"]
            assert baseline["release"] == args.release
            # install.py rechecks every destination against preflight and verifies candidate.zip.
            # Verify host tooling/spec against local frozen hashes immediately before execution.
            verify = ("from pathlib import Path;import hashlib; p=Path(" + repr(remote) + ");"
                      "assert hashlib.sha256((p/'install.py').read_bytes()).hexdigest()==" + repr(spec["installerSha256"]) + ";"
                      "assert hashlib.sha256((p/'release.json').read_bytes()).hexdigest()==" + repr(digest((stage / "release.json").read_bytes())) + ";"
                      "assert not (p/'deployment.json').exists(),'Release already installed'")
            command(client, "python3 -c " + shlex.quote(verify))
            command(client, "python3 " + shlex.quote(remote + "/install.py") + " install")
            with client.open_sftp() as sftp:
                sftp.get(remote + "/deployment.json", str(stage / "deployment.json"))
            print(json.dumps({"deployed": True, "release": args.release,
                              "report": str(stage / "deployment.json")}), flush=True)
    finally:
        client.close()


if __name__ == "__main__":
    main()
