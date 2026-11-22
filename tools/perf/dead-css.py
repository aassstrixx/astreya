# статический поиск мёртвых CSS-правил: правило мертво, если ни один из его классов/id нигде не упоминается (html, js, src, data), в том числе как начало собираемого имени
import re, glob, os, sys, json
os.chdir('/home/user/astreya')
def rd(p):
    try: return open(p, encoding='utf-8', errors='ignore').read()
    except: return ''
files = glob.glob('*.html') + glob.glob('*/*.html') + [f for f in glob.glob('js/*.js') if not f.endswith('kb.js')] + glob.glob('src/**/*.js', recursive=True) + glob.glob('data/**/*.json', recursive=True) + glob.glob('tools/check-*.js')
corp = '\n'.join(rd(f) for f in files)
corp_cls = set(re.findall(r'[A-Za-z_][\w-]*', corp))               # все слова корпуса
prefixes = set()                                                    # литералы, оканчивающиеся на дефис/подчёркивание перед кавычкой/${/+ (собираемые имена)
for m in re.finditer(r"([\w-]*[-_])(?=['\"`]\s*\+|\$\{|['\"`]\s*[,)\]])", corp): prefixes.add(m.group(1))
def alive(tok):
    if tok in corp_cls: return True
    parts = re.split(r'(?<=[-_])', tok)
    for i in range(1, len(parts)):
        if ''.join(parts[:i]) in prefixes: return True
    return False
def split_blocks(css):
    # возвращает список (начало, конец, прелюдия, тело) верхнего уровня; для @media — рекурсивно по телу
    out = []; i = 0; n = len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0: break
        pre = css[i:j]; depth = 1; k = j + 1
        while k < n and depth:
            c = css[k]
            if c == '{': depth += 1
            elif c == '}': depth -= 1
            k += 1
        out.append((i, k, pre, css[j + 1:k - 1])); i = k
    return out
def selector_dead(sel):
    toks = re.findall(r'[.#]([A-Za-z_][\w-]*)', re.sub(r'\[[^\]]*\]|\([^)]*\)', '', sel))
    return bool(toks) and any(not alive(t) for t in toks)
def stat(css):
    dead = 0; total = len(css)
    for s, e, pre, body in split_blocks(css):
        p = pre.strip()
        if p.startswith('@media') or p.startswith('@supports') or p.startswith('@layer'):
            d, _ = stat(body); dead += d
        elif p.startswith('@'): pass
        else:
            sels = [x for x in p.split(',') if x.strip()]
            if sels and all(selector_dead(x) for x in sels): dead += e - s
    return dead, total
tot_d = tot_t = 0
rows = []
for f in sorted(glob.glob('css/*.css')):
    css = re.sub(r'/\*.*?\*/', '', rd(f), flags=re.S)
    d, t = stat(css); tot_d += d; tot_t += t; rows.append((d, t, f))
for d, t, f in sorted(rows, reverse=True)[:22]: print(f'{f:28s} мёртвых {d/1024:6.1f} из {t/1024:6.1f} КБ ({100*d/max(t,1):.0f}%)')
print(f'ВСЕГО мёртвых правил: {tot_d/1024:.0f} из {tot_t/1024:.0f} КБ')
