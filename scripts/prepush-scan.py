"""푸시 전에 git이 추적하는 파일에 올라가면 안 되는 것이 있는지 찾습니다.
사용: python3 scripts/prepush-scan.py [메일 주소]
찾는 것: 비밀 값, 개인 정보(메일, 홈 경로), 구매한 도안의 이름과 지시문 (private/, prototype/ 의 JSON과 견줌)."""
import json, os, re, subprocess, sys

root = subprocess.run(['git', 'rev-parse', '--show-toplevel'], capture_output=True, text=True).stdout.strip()
email = sys.argv[1] if len(sys.argv) > 1 else None
files = subprocess.run(['git', 'ls-files', '--cached', '-z'], cwd=root, capture_output=True).stdout.decode().split('\0')
files = [f for f in files if f and os.path.isfile(os.path.join(root, f))]
corpus = {}
for f in files:
    try:
        corpus[f] = open(os.path.join(root, f), encoding='utf-8').read()
    except Exception:
        pass
print(f'files {len(files)} (text {len(corpus)})')
problems = 0
def report(kind, f, detail):
    global problems
    problems += 1
    print(f'  [{kind}] {f}: {detail}')

for f in files:
    if re.search(r'(^|/)\.env($|\.(?!example$))|^private/|^prototype/|^data/|(^|/)\.vercel/|node_modules/|(^|/)\.next', f):
        report('path', f, '올라가면 안 되는 경로')

secret = [
    ('anthropic key', re.compile(r'sk-ant-[A-Za-z0-9_\-]{16,}')),
    ('db url', re.compile(r'postgres(?:ql)?://[^\s"\'`<>]*:[^\s"\'`<>@]+@')),
    ('neon host', re.compile(r'[a-z0-9\-]+\.[a-z0-9\-]+\.aws\.neon\.tech')),
    ('private key', re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----')),
    ('jwt', re.compile(r'eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}\.')),
    ('secret assignment', re.compile(r'(?:AUTH_SECRET|VERCEL_OIDC_TOKEN|ANTHROPIC_API_KEY|DATABASE_URL)\s*[=:]\s*["\']?(?!pglite:)[A-Za-z0-9_\-+/=.:@]{12,}')),
]
for f, text in corpus.items():
    if f == 'scripts/prepush-scan.py':
        continue
    for name, rx in secret:
        for m in rx.finditer(text):
            report('secret', f, f'{name}: {m.group(0)[:14]}…')
    if email and email.lower() in text.lower():
        report('personal', f, '메일 주소')
    m = re.search(r'/Users/[A-Za-z0-9_\-]+', text)
    if m:
        report('personal', f, f'홈 경로 {m.group(0)}')
    for m in re.finditer(r'리갈\s*울|코리안\s*핏|regal\s*wool|korean\s*fit', text, re.I):
        report('pattern name', f, m.group(0))

han = re.compile(r'[가-힣]')
def walk(v, out):
    if isinstance(v, str):
        s = v.strip()
        if len(s) >= 18 and len(han.findall(s)) >= 8: out.add(s)  # 짧은 말은 기호 이름 같은 흔한 용어라 뺍니다
    elif isinstance(v, dict):
        for x in v.values(): walk(x, out)
    elif isinstance(v, list):
        for x in v: walk(x, out)
needles = set()
for base in ['private', 'prototype']:
    for d, _, fs in os.walk(os.path.join(root, base)):
        for name in fs:
            if name.endswith('.json'):
                try: walk(json.load(open(os.path.join(d, name), encoding='utf-8')), needles)
                except Exception: pass
squash = lambda s: re.sub(r'\s+', '', s)
flat = {f: squash(t) for f, t in corpus.items()}
hits = {}
for n in needles:
    key = squash(n)
    if len(key) < 10: continue
    for f, t in flat.items():
        if key in t: hits.setdefault(f, []).append(n)
print(f'도안 문자열 {len(needles)}개 대조')
for f, ns in hits.items():
    report('pattern text', f, f'{len(ns)}개 일치, 예: {ns[0][:40]}')
print('결과:', '문제 없음' if problems == 0 else f'{problems}건 확인 필요')
sys.exit(1 if problems else 0)
