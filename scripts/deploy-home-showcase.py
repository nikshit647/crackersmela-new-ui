"""Deploy only the reviewed homepage files, with hash checks, backup and rollback."""
from pathlib import Path
import argparse, datetime, hashlib, json, subprocess, sys, tarfile
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--deploy', action='store_true')
scopes = parser.add_mutually_exclusive_group()
scopes.add_argument('--polish', action='store_true', help='Deploy category cards and final hero compatibility fixes from a fresh baseline')
scopes.add_argument('--label', action='store_true', help='Deploy only the category label stylesheet and versioned shell from a fresh baseline')
scopes.add_argument('--trust', action='store_true', help='Deploy service cards and the verified category label from a fresh baseline')
scopes.add_argument('--projection', action='store_true', help='Deploy the first-paint projection correction from a fresh baseline')
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[1]
release_name = ('home-projection' if args.projection else 'trust-cards' if args.trust else
                'category-label' if args.label else 'category-cards' if args.polish else 'home-showcase')
TASK = ROOT / ('audit-evidence/' + release_name + '-20261013')
FILES = ['js/hero-showcase.js', 'css/hero-showcase.css', 'js/cms-runtime.js',
         'js/app.js', 'cm-cms-render.php', 'cm-home.php', 'cms-page.php',
         'visual-preview.php', 'index.html', '.htaccess']
if args.polish:
    FILES = ['js/hero-showcase.js', 'css/category-cards.css', 'js/app.js', 'index.html']
if args.label:
    FILES = ['css/category-cards.css', 'index.html']
if args.trust:
    FILES = ['css/styles.css', 'css/category-cards.css', 'js/app.js', 'cm-home.php', 'index.html']
if args.projection:
    FILES = ['cm-cms-render.php']
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%d-%H%M%S')
manifest = {'release': stamp, 'documentRoot': '/home/crackersmela.com/public_html', 'files': [
    {'path': name, 'expected': digest(TASK/'live-before'/name), 'candidate': digest(TASK/'candidate'/name)} for name in FILES]}
assert all(entry['candidate'] for entry in manifest['files'])
for name in FILES:
    if name.endswith('.js'):
        subprocess.run(['node', '--check', str(TASK/'candidate'/name)], check=True, capture_output=True)
archive = TASK / ('release-' + stamp + '.tar.gz')
with tarfile.open(archive, 'w:gz') as bundle:
    for name in FILES:
        bundle.add(TASK/'candidate'/name, arcname=name, recursive=False)
(TASK/'release-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
if not args.deploy:
    print(json.dumps({'prepared': str(archive), 'files': len(FILES), 'deployed': False}))
    sys.exit(0)
remote = '/home/crackersmela.com/codex-releases/' + release_name + '-' + stamp
subprocess.run(['ssh', '-o', 'BatchMode=yes', 'bluehost-vps', 'mkdir', '-p', remote], check=True)
subprocess.run(['scp', '-q', str(archive), 'bluehost-vps:' + remote + '/release.tar.gz'], check=True)
script = r'''
import hashlib,json,os,pathlib,shutil,stat,subprocess,tarfile,tempfile
manifest=json.loads(MANIFEST);release=pathlib.Path(RELEASE)
root=pathlib.Path(manifest['documentRoot']).resolve()
assert str(root)=='/home/crackersmela.com/public_html'
assert release.parent==pathlib.Path('/home/crackersmela.com/codex-releases')
os.chmod(release,0o700)
new=release/'new';backup=release/'backup'
new.mkdir(mode=0o700);backup.mkdir(mode=0o700)
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest() if p.exists() else None
with tarfile.open(release/'release.tar.gz','r:gz') as archive:
    assert set(archive.getnames())=={e['path'] for e in manifest['files']}
    for e in manifest['files']:
        name=e['path'];target=root/name
        assert target.parent.resolve() in [root,root/'js',root/'css'] and not target.is_symlink()
        assert digest(target)==e['expected'],'Production changed since inspection: '+name
        member=archive.getmember(name);assert member.isfile()
        staged=new/name;staged.parent.mkdir(exist_ok=True)
        staged.write_bytes(archive.extractfile(member).read())
        assert digest(staged)==e['candidate']
        if name.endswith('.php'):subprocess.run(['php','-l',str(staged)],check=True,capture_output=True)
        meta=(target if target.exists() else root/'index.html').stat()
        e.update(mode=stat.S_IMODE(meta.st_mode),uid=meta.st_uid,gid=meta.st_gid)
        if target.exists():
            saved=backup/name;saved.parent.mkdir(exist_ok=True);shutil.copy2(target,saved)
# Preserve an additional complete web-root archive on the server, outside public access.
subprocess.run(['tar','-czf',str(release/'deployment-before.tar.gz'),'-C',str(root),'.'],check=True,capture_output=True)
manifest['backup']=str(backup)
(release/'manifest.json').write_text(json.dumps(manifest,indent=2))
def install(source,target,e):
    fd,tmp=tempfile.mkstemp(prefix='.cm-home-',dir=target.parent)
    try:
        with os.fdopen(fd,'wb') as out:out.write(source.read_bytes());out.flush();os.fsync(out.fileno())
        os.chmod(tmp,e['mode']);os.chown(tmp,e['uid'],e['gid']);os.replace(tmp,target)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
installed=[]
try:
    for e in manifest['files']:
        install(new/e['path'],root/e['path'],e);installed.append(e)
    assert all(digest(root/e['path'])==e['candidate'] for e in manifest['files'])
except BaseException:
    for e in reversed(installed):
        target=root/e['path']
        if e['expected'] is None:target.unlink(missing_ok=True)
        else:install(backup/e['path'],target,e)
    raise
rollback="""import json,pathlib,shutil,os
release=pathlib.Path(__file__).resolve().parent
m=json.loads((release/'manifest.json').read_text());root=pathlib.Path(m['documentRoot'])
assert str(root.resolve())=='/home/crackersmela.com/public_html'
for e in reversed(m['files']):
    target=root/e['path'];assert target.parent.resolve() in [root,root/'js',root/'css'] and not target.is_symlink()
    if e['expected'] is None:target.unlink(missing_ok=True)
    else:
        shutil.copy2(release/'backup'/e['path'],target)
        os.chmod(target,e['mode']);os.chown(target,e['uid'],e['gid'])
print('Restored homepage deployment files; customer data unchanged.')
"""
(release/'rollback.py').write_text(rollback)
print(json.dumps({'deployed':True,'release':str(release),'backup':str(release/'deployment-before.tar.gz'),'files':len(installed)}))
'''
script = script.replace('MANIFEST', repr(json.dumps(manifest)), 1).replace('RELEASE', repr(remote), 1)
result = subprocess.run(['ssh', '-o', 'BatchMode=yes', 'bluehost-vps', 'python3', '-'], input=script, text=True, capture_output=True)
if result.returncode:
    print(result.stderr, file=sys.stderr); sys.exit(result.returncode)
response = json.loads(result.stdout)
(TASK/'deployment-result.json').write_text(json.dumps(response, indent=2), encoding='utf-8')
print(json.dumps(response))
