/* ASTREYA HOUSE — главная как архитектурный дом (data/redesign.json → house; css/house.css; js/house.js; docs/ASTREYA-HOUSE.md).
   Центральный зал (поверх последнего кадра сцены #arch-story): приветствие, проходы в комнаты, журнал на столике. Семь комнат подряд — в каждой лежит
   настоящее содержимое прежней главной (те же секции, те же ссылки, якоря и события аналитики), а журнал собирается из тех же данных и ведёт в те же комнаты.
   Ничего не выдумано: цифры, бренды, задачи, события, новости, преподаватели, контакты — из data/*.json; здесь только компоновка. */
const S = require('../../js/shared.js');
const {esc, I} = S;
const magSpreads = require('./mag-spreads.js');
const {nicheCardMaker} = require('./brands.js');

module.exports = function homeHouse(ctx, C, P, deps) {
  const rd = ctx.redesign, H = rd.house, content = ctx.content, h = content.home, site = ctx.site, brands = ctx.brands, tasks = ctx.tasks;
  const {events, val, img, hpS, brandsX, news, fork, finalCta, marquee, heroX} = deps;
  const hp = rd.homePath, ed = rd.editorial, tr = rd.training, A = hp.academy, F = hp.finder, R = hp.roles, ST = hp.steps, sol = rd.solutions;
  const href = x => { const [path, hash] = x.split('#'); return C.u(P, path) + (hash ? '#' + hash : ''); };
  const rooms = H.rooms.map((r, i) => Object.assign({no: i + 1, n2: String(i + 1).padStart(2, '0')}, r));
  const roomBy = id => rooms.find(r => r.id === id);
  const pc = (n, one, few, many) => `${n} ${S.plural(n, one, few, many)}`;
  const next = events[0];
  const pct = n => (Math.round(n * 1000) / 10) + '%';

  /* ---------------------------------------------------------------- зал: журнал стоит на столике в кадрах (3D-модель, tools/jar-render/mag_model.py); кнопки на нём нет — вход в журнал только прокруткой и подсказкой внизу */
  const mc = H.mag, tb = H.hall.table;          // tb — точка, из которой «наезжает» запасной кадр читалки (house.hall.table)
  const hallWorld = '';
  const hallRooms = `<nav class="hall-rooms" aria-label="${esc(H.hall.doorsLabel)}"><ol>${rooms.map(r => `<li><a href="#room-${r.id}" data-house-go="${r.id}" data-track="house_room" data-place="hall"><b>${r.n2}</b><span>${esc(r.short)}</span></a></li>`).join('')}</ol></nav>`;

  /* ---------------------------------------------------------------- журнал: настоящие страницы, содержимое — из данных */
  const ph = k => rd.photos[k];
  const pimg = (k, cls = '') => { const f = ph(k), hq = (H.mag.hq || {})[k]; return `<img${cls ? ` class="${cls}"` : ''} src="${C.u(P, hq || f.src)}" alt="${esc(f.alt)}" width="${f.w}" height="${f.h}" loading="lazy" decoding="async">`; };
  const foot = (n, side) => `<footer class="pg-f ${side}"><span>ASTREYA</span><b>${n}</b></footer>`;
  const run = `<p class="mg-run" aria-hidden="true"><span>ASTREYA</span><span>${esc(mc.kicker)}</span></p>`;       // бегущий колонтитул текстовых страниц
  const pageBtn = r => `<a class="btn btn-fill btn-sm mg-open" href="${href(r.href)}" data-track="house_magazine_page" data-room="${r.id}">${esc(r.cta)} ${I.arrow}</a>`;
  const statsOf = () => [...h.stats, ...rd.stats.extra].filter(s => s.value !== null && s.value !== undefined);
  const nTasks = tasks.length;
  const facts = arr => `<ul class="mg-facts">${arr.map(f => `<li><b>${esc(String(f[0]))}</b><span>${esc(f[1])}</span></li>`).join('')}</ul>`;
  const lines = arr => `<ul class="mg-lines">${arr.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
  const ab = h.about, pf = hp.proof;
  const reasons = pf.pick.map(k => content.advantages[k]).filter(Boolean);
  /* что написано на правой странице комнаты: заголовок, абзац, факты/строки — только реальные тексты и цифры */
  const rightOf = {
    about: () => ({head: ab.title, text: ab.text[1], extra: facts(statsOf().slice(0, 4).map(s => [val(s) + (s.suffix || ''), s.label]))}),
    brands: () => ({head: `${pc(brands.length, 'бренд', 'бренда', 'брендов')} — один подход`, text: `${brands.slice(0, 4).map(b => b.name).join(', ')} и ещё ${brands.length - 4}. ${ab.points[0]}.`, extra: `<ul class="mg-chips">${brands.map(b => `<li>${esc(b.name)}</li>`).join('')}</ul>`}),
    finder: () => ({head: F.title, text: sol.lead, extra: `<ul class="mg-chips">${tasks.map(t => `<li>${esc(t.label)}</li>`).join('')}</ul>`}),
    expertise: () => ({head: `${ed.lead.join(' ')} ${ed.accent.join(' ')}`, text: tr.text, extra: lines(A.facts)}),
    academy: () => {
      const d = next && S.dparts(next.date);
      return {head: tr.title, text: tr.sub + '.', extra: next ? `<p class="mg-next"><b>${d.d} ${d.m}</b><span>${esc(next.title)}<em>${esc(next.fmt)} · ${esc(next.city)}</em></span></p>` : `<p class="mg-next"><span>${esc(tr.emptyNote)}</span></p>`};
    },
    partners: () => ({head: R.title, text: R.lead, extra: lines((rd.audience.items || []).map(a => a.title))}),
    editorial: () => ({head: 'Новости и события Астрея', text: '', extra: `<ul class="mg-news">${ctx.news.slice(0, 3).map(n => `<li><time datetime="${n.date}">${esc(S.dparts(n.date).full)}</time><span>${esc(n.title)}</span></li>`).join('')}</ul>`})
  };
  const leftPhoto = {
    about: () => pimg('about'), brands: () => `<img src="${C.u(P, 'assets/brands/hero.webp')}" alt="" loading="lazy" decoding="async">`, finder: () => pimg('hero'),
    expertise: () => pimg('expertise'), academy: () => pimg('about2'), partners: () => pimg('about3'),
    editorial: () => `<img src="${C.u(P, 'assets/photos/keenwell-mask.webp')}" alt="" class="mg-prod" loading="lazy" decoding="async">`
  };
  const pageL0 = (r, n) => `<div class="pg pg-l pg-ph pg-${r.id}"><div class="mg-ph">${leftPhoto[r.id]()}</div><p class="mg-no" aria-hidden="true">${r.n2}</p><p class="mg-kick">${esc(r.short)}</p>${foot(n, 'l')}</div>`;
  const pageR0 = (r, n) => { const c = rightOf[r.id](); return `<div class="pg pg-r pg-tx pg-${r.id}" id="room-${r.id}" data-room="${r.id}">${run}<p class="mg-kick">${esc(r.name)}</p><h3 class="mg-h">${esc(c.head)}</h3>${c.text ? `<p class="mg-p${c.text.length > 130 ? ' mg-drop' : ''}">${esc(c.text)}</p>` : ''}${c.extra || ''}<div class="mg-act">${pageBtn(r)}</div>${foot(n, 'r')}</div>`; };
  const logoSvg = '<svg class="lgo" viewBox="46 338 836 436" aria-hidden="true"><use href="#logo-art"/></svg>';
  const pCover = `<div class="pg pg-cover"><span class="cv-kick">${esc(mc.kicker)}</span><p class="cv-title" role="heading" aria-level="2">${esc(mc.title)}</p><figure class="cv-ph">${pimg('hero')}</figure><span class="cv-year">${site.year}</span>${logoSvg}</div>`;
  /* разворот 2–3 (на нём журнал раскрыт на столике): слева — фото на всю страницу с крупным заголовком, справа — содержание в журнальной вёрстке */
  const tag = site.tagline.split(/(?<=\.)\s*/).filter(Boolean);
  const pWelcome = `<div class="pg pg-l pg-ph pg-welcome"><div class="mg-ph">${pimg('about')}</div><i class="mg-scrim" aria-hidden="true"></i><p class="mg-kick">${esc(mc.welcome)}</p>
    <p class="mg-quote">${tag.map(t => `<span>${esc(t)}</span>`).join('')}</p><p class="mg-deck">${esc(mc.kicker)}</p>${foot(2, 'l')}</div>`;
  const pToc = `<div class="pg pg-r pg-tx pg-toc">${run}<p class="mg-kick">${esc(mc.tocTitle)}</p><h3 class="mg-h">${esc(site.name)} <em>· ${esc(site.nameLatin)}</em></h3>
    <ol class="mg-toc">${rooms.map((r, i) => `<li><button type="button" data-mag-page="${i + 2}"><b>${r.n2}</b><span><strong>${esc(r.name)}</strong><em>${esc(r.short)}</em></span><i>${(i + 1) * 2 + 2}</i></button></li>`).join('')}<li><button type="button" data-mag-page="${rooms.length + 2}"><b>—</b><span><strong>${esc(mc.contactsTitle)}</strong><em>${esc(site.name)}</em></span><i>${(rooms.length + 1) * 2 + 2}</i></button></li></ol>${foot(3, 'r')}</div>`;
  const offices = site.offices || [];
  const pContactsL = n => `<div class="pg pg-l pg-ph pg-cont-l"><div class="mg-ph"><ul class="mg-cities">${offices.map(o => `<li><b>${esc(o.city)}</b><span>${esc(o.role)}</span></li>`).join('')}</ul></div><p class="mg-kick">${esc(mc.contactsTitle)}</p>${foot(n, 'l')}</div>`;
  const pContactsR = n => `<div class="pg pg-r pg-tx pg-cont-r">${run}<p class="mg-kick">${esc(mc.contactsTitle)}</p><h3 class="mg-h">${esc(site.legalName)}</h3>
    <ul class="mg-contacts"><li><a href="tel:${site.contacts.phoneRaw}" data-track="phone_click">${esc(site.contacts.phone)}</a></li><li><a href="mailto:${site.contacts.email}" data-track="email_click">${esc(site.contacts.email)}</a></li><li>${esc(site.contacts.address)}</li><li>${esc(site.contacts.hours)}</li></ul>
    <div class="mg-act"><a class="btn btn-fill btn-sm" href="${C.u(P, 'partners.html')}" data-track="partner_cta" data-place="magazine">Стать партнёром ${I.arrow}</a><a class="mg-deep" href="${C.u(P, 'catalog.html')}" data-track="catalog_click" data-place="magazine">Каталог ${I.arrow}</a></div>${foot(n, 'r')}</div>`;
  const pBack = `<div class="pg pg-l pg-back"><p class="mg-colophon">${esc(site.legalName)} · ${esc(site.tagline)}</p>${logoSvg}</div>`;
  /* развороты 4–21: заголовки и подписи — data/redesign.json → house.mag.pages, тексты и данные — из data/*.json (src/pages/mag-spreads.js); у каждой комнаты свои левая и правая страницы */
  const SP = magSpreads(ctx, C, P, {rd, H, content, site, brands, tasks, products: ctx.products, events, pimg, foot, run, href, pc, ab, nicheCard: nicheCardMaker(ctx, C, P), mc, logoSvg});

  /* листы: лист k — спереди правая страница, сзади левая страница следующего разворота; порядок в DOM = порядок страниц при чтении */
  const pageL = (r, n) => SP[r.id] ? SP[r.id].L(n) : pageL0(r, n), pageR = (r, n) => SP[r.id] ? SP[r.id].R(n) : pageR0(r, n);
  const pagesR = [pCover, pToc, ...rooms.map((r, i) => pageR(r, (i + 1) * 2 + 3)), SP.contacts.R((rooms.length + 1) * 2 + 3)];
  const pagesL = [pWelcome, ...rooms.map((r, i) => pageL(r, (i + 1) * 2 + 2)), SP.contacts.L((rooms.length + 1) * 2 + 2), pBack];
  const leaves = pagesR.map((f, k) => `<div class="leaf" data-k="${k}" style="--zr:${pagesR.length - k};--zl:${k + 1}"><div class="face front">${f}<i class="fx" aria-hidden="true"><b></b></i></div><div class="face back">${pagesL[k] || ''}<i class="fx" aria-hidden="true"><b></b></i></div></div>`).join('');
  const magazine = `<div class="mag" id="mag" role="region" aria-label="Журнал ASTREYA" data-n="${pagesR.length}">
    <div class="mag-wrap">
      <div class="mag-bar"><p class="mag-st" aria-live="polite"></p></div>
      <div class="mag-book" tabindex="-1"><div class="mag-spine" aria-hidden="true"></div><div class="leaves">${leaves}<i class="mag-sh r" aria-hidden="true"></i><i class="mag-sh l" aria-hidden="true"></i></div><i class="mag-dim" aria-hidden="true"></i></div>
      <div class="mag-ctl"><button class="mag-pv" type="button" data-mag-step="-1">${I.arrow}<span>${esc(mc.prevLabel)}</span></button><button class="mag-hm" type="button" data-mag-home aria-label="${esc(mc.homeLabel || 'На главную')}">${I.arrow}<span>${esc(mc.homeLabel || 'На главную')}</span></button><button class="mag-nx" type="button" data-mag-step="1"><span>${esc(mc.nextLabel)}</span>${I.arrow}</button></div>
    </div>
  </div>`;

  /* переход скролла к раскрытому журналу: после зала — закреплённая сцена; тот же кадр зала уходит вглубь, журнал вырастает со столика, обложка раскрывается, дальше прокрутка листает разворот за разворотом
     (журнал — единственное, что идёт после зала: комнаты — его страницы; прокрутка не блокируется; без JS страницы идут подряд, при уменьшенном движении — обычный блок с раскрытым журналом) */
  const pst = (rd.house.arch && rd.house.arch.poster) || {};
  /* пролёт камеры к журналу — вторая сцена того же движка, что у героя (js/jar.js, js/jar-gl.js): ключевые кадры + карты глубины + дорожка камеры + спрайты баночки (house.fly, tools/jar-render/apply_fly.py);
     читалка — второй корень .jar-story с атрибутом data-fly: ключи пролёта берутся вместо кадров героя, положение задаёт прокрутка читалки (js/house.js → Astreya.flyP). Нет ключей / нет WebGL2 — запасной «наезд» постера */
  const fy = H.fly && H.fly.enabled ? H.fly : null, ar = rd.house.arch || {}, st = ar.sphereTex;
  const flyAttrs = fy ? ` data-fly data-fly-f="${fy.F}" data-fly-rect="${esc(JSON.stringify(fy.rect))}"${fy.book ? ` data-fly-book="${esc(JSON.stringify(fy.book))}"` : ''}${fy.bake ? ' data-fly-bake' : ''} data-n="${fy.n}" data-ext="${fy.ext}" data-v="${esc(ctx.assetVersion || '')}" data-d="${fy.dir}" data-zd="${fy.depth}" data-zx="${(ar.depth || {}).ext || 'webp'}" data-cam="${fy.cam}" data-lbl="${ar.label}" ${st ? `data-sa="${st.a}" data-sn="${st.n}" ` : ''}data-ink="${ar.ink}" data-p="${fy.p.join(',')}" data-jd="${fy.jar}" data-jx="${(ar.jar || {}).ext || 'webp'}" data-jr="${esc(JSON.stringify(fy.rects))}"` : '';
  const flyMark = fy ? `<div class="hr-fly" aria-hidden="true"><canvas class="js-cv"></canvas><div class="ar-world"><canvas class="ar-jar-cv"></canvas></div></div>` : '';
  const reader = `<section class="house-reader${fy ? ' jar-story' : ''}" id="house-reader" aria-label="${esc(mc.readerLabel || 'Журнал ASTREYA: листайте прокруткой')}"${flyAttrs || ` data-n="${pagesR.length}"`} style="--hrh:${(H.reader || {}).heightVh || 560}vh;--hrhm:${(H.reader || {}).heightVhMobile || 190}vh;--tx:${tb.d[0]};--ty:${tb.d[1]};--txm:${tb.m[0]};--tym:${tb.m[1]}">
    <div class="hr-stage">
      <picture class="hr-bg" aria-hidden="true"><source media="(max-aspect-ratio: 11/10)" srcset="${C.u(P, pst.mobile || 'assets/house-hall/poster-m.webp')}"><img src="${C.u(P, pst.desktop || 'assets/house-hall/poster-d.webp')}" alt="" width="1920" height="1080" decoding="async" loading="lazy"></picture>
      ${flyMark}
      <div class="hr-veil" aria-hidden="true"></div>
      <a class="hr-skip" href="#house-end" data-track="house_reader_skip">${esc((H.reader || {}).skip || 'К контактам')} ${I.arrow}</a>
      ${magazine}
    </div>
  </section>`;

  /* вместо панели «Почему выбирают Астрею?» внизу зала — подсказка: она же кнопка, по клику сцена сама плавно летит к журналу */
  const cueTxt = (H.reader || {}).cue || 'Листайте ниже — откроется журнал';
  const hallCue = `<button type="button" class="hs-cue" data-house-mag data-from="cue" aria-label="${esc(cueTxt)}"><span>${esc(cueTxt)}</span><i aria-hidden="true"></i></button>`;

  return {
    hall: {world: hallWorld, rooms: hallRooms, cue: hallCue},
    compose: arch => [arch, heroX, reader, '<div id="house-end" aria-hidden="true"></div>'].join('\n\n  ')
  };
};
