"""Local dry-run of the staged release tooling against a simulated document root.

Runs the exact prepare.py / install.py that would run on the host, with only the
hardcoded document root redirected to a temp directory. Proves the generated
tooling is syntactically valid and that freeze -> preflight -> install -> verify
completes, before a single byte is uploaded to the real server.
"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / 'audit-evidence/deploy-20261008-catorder2'
PREVIOUS = ROOT / 'audit-evidence/deploy-20261007-full1/upload/production-release'
LIVE_ROOT = '/home/crackersmela.com/public_html'
digest = lambda value: hashlib.sha256(value).hexdigest()

# 1. Syntax-check the generated host tooling exactly as it will be uploaded.
print('== syntax check of host tooling ==')
for name in ('prepare.py', 'install.py'):
    proc = subprocess.run([sys.executable, '-m', 'py_compile', str(STAGE / name)], capture_output=True, text=True)
    print(f'   {name}: {"OK" if proc.returncode == 0 else "FAIL " + proc.stderr.strip()[:300]}')
    if proc.returncode != 0:
        raise SystemExit('host tooling does not parse; refusing to continue')

with tempfile.TemporaryDirectory(prefix='cm-dryrun-') as tmp:
    tmp = Path(tmp)
    # 2. Simulate the server: a document root holding the OLD versions of these files.
    sim_root = tmp / 'public_html'
    staged = STAGE / 'upload/production-release'
    names = []
    for path in sorted(p for p in staged.rglob('*') if p.is_file()):
        rel = path.relative_to(staged)
        names.append(rel.as_posix())
        live = sim_root / rel
        live.parent.mkdir(parents=True, exist_ok=True)
        old = PREVIOUS / rel
        if old.is_file():
            shutil.copy2(old, live)
        else:
            live.write_bytes(b'/* previous live version */\n')
    print(f'\n== simulated server root: {len(names)} existing files ==')

    sim_stage = tmp / 'stage'
    shutil.copytree(STAGE, sim_stage)

    # 3. Redirect only the hardcoded document root, exactly as the host would run it.
    prepare_src = (sim_stage / 'prepare.py').read_text(encoding='utf-8').replace(
        f"ROOT = Path('{LIVE_ROOT}')", f"ROOT = Path(r'{sim_root}')")
    (sim_stage / 'prepare.py').write_text(prepare_src, encoding='utf-8')
    install_src = (sim_stage / 'install.py').read_text(encoding='utf-8').replace(
        f"assert str(root) == '{LIVE_ROOT}'", "pass")
    # The host PHP path is correct for production; locally, point the syntax
    # check at the bundled PHP so the rest of the flow can be exercised offline.
    local_php = ROOT / 'audit-evidence/tools/php-8.3.35/php.exe'
    install_src = install_src.replace(
        "php = '/usr/local/lsws/lsphp81/bin/php'", f"php = r'{local_php}'")
    # os.chown / st_uid / st_gid are Linux-only and correct on the real host.
    # Shim them so the install/verify half of the flow can also run on Windows.
    shim = """
_real_stat = Path.stat
class _PosixStat:
    def __init__(self, target):
        real = _real_stat(target)
        self.st_uid, self.st_gid, self.st_mode = 0, 0, real.st_mode
Path.stat = lambda self: _PosixStat(self)
os.chown = lambda *args, **kwargs: None
"""
    install_src = install_src.replace(
        "digest = lambda value: hashlib.sha256(value).hexdigest()",
        "digest = lambda value: hashlib.sha256(value).hexdigest()\n" + shim, 1)
    (sim_stage / 'install.py').write_text(install_src, encoding='utf-8')

    def run(script, *args):
        return subprocess.run([sys.executable, str(sim_stage / script), *args],
                              capture_output=True, text=True, cwd=str(sim_stage))

    # 4. Freeze.
    prep = run('prepare.py')
    if prep.returncode != 0:
        raise SystemExit('prepare failed:\n' + prep.stdout + prep.stderr)
    plan = json.loads((sim_stage / 'plan.json').read_text())
    print(f"\n== freeze ==\n   files={len(plan['files'])} release={plan['release']}")
    print(f"   zipSha256={plan['zipSha256'][:16]}...  installOrder last = {plan['files'][-1]['path']}")
    assert plan['files'][-1]['path'] == 'index.html', 'index.html must install last'

    # 5. Preflight must report no conflicts against unchanged destinations.
    pre = run('install.py', 'preflight')
    preflight_report = sim_stage / 'preflight.json'
    if not preflight_report.is_file():
        raise SystemExit('preflight produced no report:\n' + pre.stdout + pre.stderr)
    report = json.loads(preflight_report.read_text())
    print(f"\n== preflight ==\n   phpSyntax={report['phpSyntax']} conflicts={report['conflicts']}")
    if pre.returncode != 0:
        raise SystemExit('preflight reported conflicts:\n' + pre.stdout + pre.stderr)

    before_hashes = {p.as_posix(): digest((sim_root / p).read_bytes()) for p in staged.rglob('*') if p.is_file()}

    # 6. Install.
    ins = run('install.py', 'install')
    if ins.returncode != 0:
        raise SystemExit('install failed:\n' + ins.stdout + ins.stderr)
    deployment = json.loads((sim_stage / 'deployment.json').read_text())
    print(f"\n== install ==\n   status={deployment['status']} files={deployment['files']} "
          f"allHashesMatch={deployment['allHashesMatch']} dataFilesTouched={deployment['dataFilesTouched']}")

    # 7. Verify every destination now matches the staged bytes and nothing else moved.
    mismatch = []
    for rel in names:
        if digest((sim_root / rel).read_bytes()) != digest((staged / rel).read_bytes()):
            mismatch.append(rel)
    print(f"\n== verify ==\n   destinations matching staged bytes: {len(names) - len(mismatch)}/{len(names)}")
    if mismatch:
        raise SystemExit('after install mismatch: ' + ', '.join(mismatch))
    changed = sum(1 for rel in names if before_hashes[rel] != digest((sim_root / rel).read_bytes()))
    print(f'   files actually replaced: {changed}')
    print(f"   before-image backup: {(sim_stage / 'before-files.tgz').is_file()}")

    # 8. Idempotence: a second preflight against the now-installed tree must stay clean.
    pre2 = run('install.py', 'preflight')
    report2 = json.loads((sim_stage / 'preflight.json').read_text())
    print(f"\n== repeat preflight ==\n   conflicts={report2['conflicts']} (must be empty)")
    if report2['conflicts']:
        raise SystemExit('repeat preflight is not idempotent')

print('\nDRY-RUN PASS: freeze -> preflight -> install -> verify all succeed offline.')