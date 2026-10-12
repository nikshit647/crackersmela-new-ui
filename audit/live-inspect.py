import subprocess, re

h = subprocess.run(['curl', '-s', '--max-time', '30', 'https://crackersmela.com/'],
                   capture_output=True, text=True, encoding='utf-8', errors='replace').stdout

print('data-cms-element occurrences:', len(re.findall(r'data-cms-element=', h)))
print('data-cms-section occurrences:', len(re.findall(r'data-cms-section=', h)))
print('data-cms-inline  occurrences:', len(re.findall(r'data-cms-inline', h)))

m = re.search(r'<section[^>]*data-cms-section="home:hero"[^>]*>', h)
print('hero section tag:', (m.group(0)[:220] if m else 'NOT FOUND'))

print('\n--- markup around "STANDARD CRACKERS" ---')
i = h.find('STANDARD CRACKERS')
print(h[max(0, i - 420):i + 60].replace('\n', ' ')[:520])

print('\n--- any CSS rule mentioning e1.0.1 ---')
hits = re.findall(r'[^{}]{0,140}e1\.0\.1[^{}]{0,40}\{[^}]{0,300}\}', h)
for x in hits[:4]:
    print(' *', x.strip()[:380])
if not hits:
    print(' (none)')

print('\n--- display:none rules present in served CSS ---')
dn = re.findall(r'[^{}]{0,160}\{[^}]*display:\s*none\s*!important[^}]*\}', h)
print('count:', len(dn))
for x in dn[:6]:
    print(' *', x.strip()[:260])