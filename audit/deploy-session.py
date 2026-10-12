"""Pinned-host deployment session. Password stays in memory; commands arrive on stdin."""
from pathlib import Path
import base64
import getpass
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'audit-evidence/tools/ssh-python'))
import paramiko

HOST = '50.6.45.11'
PIN = 'SHA256:IetZB9jjvIFwbImIvaVqAKToGo7HO8aFfqerCZ+6fCA'
client = paramiko.SSHClient()
client.load_host_keys(str(Path.home() / '.ssh/known_hosts'))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
password = getpass.getpass('Hosting password: ')
try:
    client.connect(HOST, username='root', password=password, look_for_keys=False,
                   allow_agent=False, timeout=20, auth_timeout=20, banner_timeout=20)
finally:
    password = None
fingerprint = 'SHA256:' + base64.b64encode(hashlib.sha256(client.get_transport().get_remote_server_key().asbytes()).digest()).decode().rstrip('=')
if fingerprint != PIN:
    client.close()
    raise RuntimeError('Host fingerprint mismatch')
print(json.dumps({'connected': True, 'hostKeyVerified': True}), flush=True)
sftp = client.open_sftp()
try:
    for line in sys.stdin:
        try:
            request = json.loads(line)
            if request['action'] == 'close':
                break
            if request['action'] == 'exec':
                _, stdout, stderr = client.exec_command(request['command'], timeout=request.get('timeout', 60))
                output, error = stdout.read().decode('utf-8', 'replace'), stderr.read().decode('utf-8', 'replace')
                print(json.dumps({'exitCode': stdout.channel.recv_exit_status(), 'output': output, 'error': error}), flush=True)
            elif request['action'] == 'get':
                local = (ROOT / request['local']).resolve()
                if not local.is_relative_to(ROOT / 'audit-evidence'):
                    raise ValueError('Download must stay in audit evidence')
                local.parent.mkdir(parents=True, exist_ok=True)
                sftp.get(request['remote'], str(local))
                print(json.dumps({'downloaded': request['local'], 'sha256': hashlib.sha256(local.read_bytes()).hexdigest()}), flush=True)
            elif request['action'] == 'put':
                local = (ROOT / request['local']).resolve()
                if not local.is_relative_to(ROOT / 'audit-evidence'):
                    raise ValueError('Upload must be an explicit release artifact')
                sftp.put(str(local), request['remote'])
                print(json.dumps({'uploaded': request['remote'], 'sha256': hashlib.sha256(local.read_bytes()).hexdigest()}), flush=True)
            else:
                raise ValueError('Unknown action')
        except Exception as error:
            print(json.dumps({'error': str(error)}), flush=True)
finally:
    sftp.close()
    client.close()
