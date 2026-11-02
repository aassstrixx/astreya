/* Страницы журнала ASTREYA (развороты 4–21): «Галерея доверия», бренды, подбор, экспертиза, Стелла, учебный центр, партнёрская гостиная, редакция, контакты.
   Вызывается из src/pages/home-house.js; вёрстка — css/house-pages.css; заголовки и подписи — data/redesign.json → house.mag.pages (редактируются там), тела текстов, цифры, бренды, задачи, товары, события, новости,
   преподаватели, контакты — из data/*.json (content, site, brands, catalog, products, events, news, redesign.teachers). Ничего не выдумано: нет в данных — этого нет и на странице.
   Каждая кнопка — настоящая ссылка на страницу сайта (бренд, карточка товара, подбор по задаче, семинар, новость, партнёрская заявка) либо кнопка Стеллы (data-act="asst-open"). Текст остаётся HTML (не в картинках). */
const fs = require('fs'), path = require('path');
const S = require('../../js/shared.js');
const {esc, I} = S;

/* пиктограммы: тонкая линия, один стиль на весь журнал (оригинальные, не из набора сайта) */
const IC = {
  cube: '<path d="M12 3.5l7.5 4v9l-7.5 4-7.5-4v-9z"/><path d="M12 12l7.5-4.5M12 12v8.5M12 12 4.5 7.5"/>',
  person: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.6-3.7 3.5-5.6 7-5.6s6.4 1.9 7 5.6"/>',
  book: '<path d="M4 5.5c0-.6.4-1 1-1h5.5c.8 0 1.5.7 1.5 1.5V19c0-.8-.7-1.5-1.5-1.5H5c-.6 0-1-.4-1-1z"/><path d="M20 5.5c0-.6-.4-1-1-1h-5.5c-.8 0-1.5.7-1.5 1.5V19c0-.8.7-1.5 1.5-1.5H19c.6 0 1-.4 1-1z"/>',
  link: '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>',
  target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5"/>',
  layers: '<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5 12 17l8.5-4.5M3.5 16.5 12 21l8.5-4.5"/>',
  chat: '<path d="M5 5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16h-7l-4.5 3.5V16H5a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 5 5z"/><path d="M8.5 10.3h.01M12 10.3h.01M15.5 10.3h.01"/>',
  pin: '<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.6"/><path d="m4 7 8 6 8-6"/>',
  phone: '<path d="M6.6 4.2 9 4l1.6 4-1.7 1.3a10 10 0 0 0 5.8 5.8l1.3-1.7 4 1.6-.2 2.4a2 2 0 0 1-2 1.8A15 15 0 0 1 4.8 6.2a2 2 0 0 1 1.8-2z"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14" rx="1.6"/><path d="M4 10h16M8.5 3.8v3.4M15.5 3.8v3.4"/>',
  spark: '<path d="M12 3.5 13.9 10 20.5 12 13.9 14 12 20.5 10.1 14 3.5 12 10.1 10z"/>'
};
const ic = n => `<svg class="mp-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${IC[n] || IC.spark}</svg>`;
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

module.exports = function magSpreads(ctx, C, P, deps) {
  const {rd, H, content, site, brands, tasks, products, events, pimg, foot, run, href, pc, ab, nicheCard, mc, logoSvg} = deps;
  const pg = H.mag.pages, news = ctx.news, showDemo = !!(rd.ui && rd.ui.showDemoNotices), productBy = id => products.find(p => p.id === id);
  const teachers = (rd.teachers || {}).items || [], newsCat = Object.fromEntries((ctx.newsCats || []).map(c => [c.id, c]));
  const go = '<span class="mp-go" aria-hidden="true">' + I.arrow + '</span>';
  const lnk = (h, label, track, extra = '') => `<a class="mp-lnk" href="${esc(h)}" data-track="${track}" data-place="magazine"${extra}>${esc(label)} ${go}</a>`;
  const hh = (lines, cls = '') => `<h3 class="mp-h${cls ? ' ' + cls : ''}">${esc(lines[0])}<em>${esc(lines[1])}</em></h3>`;
  const srcText = b => b.src ? ((getPath(content, b.src[0]) || [])[b.src[1]] || {}).text || '' : b.text || '';
  const img = (src, alt = '', cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="${esc(C.u(P, src))}" alt="${esc(alt)}" loading="lazy" decoding="async">`;
  const dmy = d => S.dparts(d);
  const brandName = id => (ctx.brandById[id] || {}).name || id;
  /* логотип бренда (assets/brands/*, те же файлы, что на странице «Бренды»); нет файла — название текстом */
  const logo = (id, cls = 'mp-bl') => { const b = ctx.brandById[id]; return b && b.logo ? `<img class="${cls}" src="${esc(C.u(P, b.logo))}" alt="${esc(b.name)}" loading="lazy" decoding="async">` : `<b class="${cls} mp-bn">${esc(brandName(id))}</b>`; };
  const logosRow = (ids, cls = '') => `<ul class="mp-logos${cls ? ' ' + cls : ''}">${ids.map(id => `<li><a href="${C.burl(P, ctx.brandById[id])}" data-track="house_magazine_brand" data-brand="${id}">${logo(id, 'mp-lg')}</a></li>`).join('')}</ul>`;
  const demoNote = showDemo ? `<p class="mp-demo">${esc(pg.demoNote)}</p>` : '';
  const evRow = e => { const d = dmy(e.date); return `<li><a class="mp-ev" href="${C.eurl(P, e)}" data-track="house_magazine_event" data-event="${e.id}"><time datetime="${e.date}"><b>${d.d}</b><i>${d.m}</i></time><span><strong>${esc(e.title)}</strong><em>${esc(e.fmt)} · ${esc(e.city)}</em></span></a></li>`; };

  /* ------------------------------------------------ 4–5. Галерея доверия — о компании */
  const about = {
    L: n => `<div class="pg pg-l pg-ph pg-abl"><div class="mg-ph mp-fade">${pimg('about2')}</div>
      <p class="mg-run mp-runw" aria-hidden="true"><span>${esc(pg.about.kick)}</span><span>ASTREYA</span></p>
      <h3 class="mp-hb">${esc(pg.about.hl[0])}<em>${esc(pg.about.hl[1])}</em></h3>
      <p class="mp-lead">${esc(content.company.h1)}. ${esc(content.company.lead)}</p>${foot(n, 'l')}</div>`,
    R: n => `<div class="pg pg-r pg-tx pg-abr" id="room-about" data-room="about">${run}<p class="mg-kick">${esc(pg.about.kick)}</p>${hh(pg.about.hr)}
      <p class="mg-p mp-intro">${esc(ab.text[1])}</p>
      <ul class="mp-grid4">${pg.about.blocks.map(b => `<li>${ic(b.icon)}<strong>${esc(b.t)}</strong><span>${esc(srcText(b))}</span></li>`).join('')}</ul>
      <blockquote class="mp-quote"><i aria-hidden="true">“</i><p>${esc(site.tagline)}</p><cite>${esc(ab.title)}</cite></blockquote>
      ${lnk(href('company.html'), pg.about.cta, 'house_magazine_page', ' data-room="about"')}${foot(n, 'r')}</div>`
  };

  /* ------------------------------------------------ 6–7. Галерея брендов */
  const nicheOf = b => { const m = /<div class="br-niche[\s\S]*?<\/div>/.exec(nicheCard(b)); return m ? m[0] : ''; };
  const stat3 = [[brands.length, pc(brands.length, 'бренд', 'бренда', 'брендов').replace(/^\d+ /, '')], [tasks.length, 'направлений подбора'], [(site.offices || []).length, 'города присутствия']];
  const real = {a: 'assets/photos/dermatime-micellar.webp', b: 'assets/photos/iraltone-shampoo.webp', c: 'assets/photos/keenwell-mask.webp'};
  const brandsP = {
    L: n => `<div class="pg pg-l pg-tx pg-brl">${run}<p class="mg-kick">${esc(pg.brands.kick)}</p>${hh(pg.brands.hl)}
      <p class="mg-p mp-intro">${esc(ab.text[0])}</p>
      <div class="mp-brrow"><div><ul class="mp-stat3">${stat3.map(s => `<li><b>${s[0]}</b><span>${esc(s[1])}</span></li>`).join('')}</ul>
        <p class="mp-cap">${esc(pg.brands.cap)}</p>${logosRow(['dermatime', 'iraltone', 'keenwell'])}</div>
        <figure class="mp-arch"><img class="mp-arch-bg" src="${esc(C.u(P, 'assets/brands/niche-dermatime.webp'))}" alt="" loading="lazy" decoding="async">
          <span class="mp-rp mp-rp-a">${img(real.a)}</span><span class="mp-rp mp-rp-b">${img(real.b)}</span><span class="mp-rp mp-rp-c">${img(real.c)}</span></figure></div>${foot(n, 'l')}</div>`,
    R: n => `<div class="pg pg-r pg-tx pg-brr" id="room-brands" data-room="brands">${run}<p class="mg-kick">${esc(pg.brands.gallery)}</p>
      <ul class="mp-bgal">${brands.map(b => `<li><a href="${C.burl(P, b)}" data-track="house_magazine_brand" data-brand="${b.id}" aria-label="${esc(b.name)}"><span class="mp-nw">${nicheOf(b)}</span>${logo(b.id)}<span class="mp-bt">${esc(b.tag)}</span></a></li>`).join('')}</ul>
      ${lnk(href('brands.html'), pg.brands.cta, 'house_magazine_page', ' data-room="brands"')}${foot(n, 'r')}</div>`
  };

  /* ------------------------------------------------ 8–9. От задачи к решению */
  const tex = ['water', 'cream', 'silk', 'pipette', 'swatch', 'film', 'molecules', 'smear'];
  const finder = {
    L: n => `<div class="pg pg-l pg-tx pg-fnl">${run}<p class="mg-kick">${esc(pg.finder.kick)}</p>${hh(pg.finder.hl)}
      <p class="mg-p mp-intro">${esc(rd.solutions.lead)}</p>
      <ul class="mp-tasks">${tasks.map((t, i) => `<li><a href="${C.u(P, 'catalog.html')}?task=${t.id}" data-track="house_magazine_task" data-task="${t.id}"><img class="mp-tx" src="${esc(C.u(P, `assets/bg/${tex[i % tex.length]}.webp`))}" alt="" loading="lazy" decoding="async"><span class="mp-tn">${String(i + 1).padStart(2, '0')}</span><strong>${esc(t.label)}</strong><span class="mp-tl">${t.brands.map(id => logo(id, 'mp-tlg')).join('')}</span></a></li>`).join('')}</ul>${foot(n, 'l')}</div>`,
    R: n => `<div class="pg pg-r pg-tx pg-fnr" id="room-finder" data-room="finder">${run}<p class="mg-kick">${esc(pg.finder.kick)}</p>${hh(pg.finder.hr)}
      <ol class="mp-steps3">${pg.finder.steps.map(s => `<li><span class="mp-sn">${s.n}</span>${ic(s.icon)}<strong>${esc(s.t)}</strong><span>${esc(s.p)}</span></li>`).join('')}</ol>
      <p class="mp-sub">${esc(pg.finder.pick)}</p>
      <ul class="mp-prods">${pg.finder.products.map(productBy).filter(Boolean).map(p => `<li><a href="${C.purl(P, p)}" data-track="house_magazine_product" data-product="${p.id}"><span class="mp-pk">${img(S.packOf(p))}</span><span class="mp-pt">${logo(p.brand, 'mp-pbl')}<strong>${esc(p.name)}</strong><span>${esc(p.desc)}</span></span></a></li>`).join('')}</ul>
      <p class="mp-note">${esc(pg.finder.note)}</p>
      <a class="btn btn-fill btn-sm mp-cta" href="${C.u(P, 'catalog.html')}" data-track="house_magazine_page" data-room="finder" data-place="magazine">${esc(pg.finder.cta)} ${I.arrow}</a>${foot(n, 'r')}</div>`
  };

  /* ------------------------------------------------ 10–11. Профессиональная экспертиза */
  const tch = ['savinykh', 'bondareva', 'korepanov'].map(id => teachers.find(t => t.id === id)).filter(Boolean);
  const ed = rd.editorial;
  const expertise = {
    L: n => `<div class="pg pg-l pg-tx pg-exl">${run}<p class="mg-kick">${esc(pg.expertise.kick)}</p>${hh(pg.expertise.hl)}
      <div class="mp-collage"><figure class="mp-c1">${pimg('expertise')}</figure><figure class="mp-c2">${pimg('about3')}</figure></div>
      <p class="mp-lede">${esc(ed.lead.join(' '))} <em>${esc(ed.accent.join(' '))}</em></p>
      <ul class="mp-tch">${tch.map(t => `<li><a href="${href('training.html#teachers')}" data-track="house_magazine_page" data-room="expertise" data-place="magazine">${t.photo ? img(t.photo, `${t.first} ${t.last}`) : ''}<span><strong>${esc(t.last)} ${esc(t.first.split(' ')[0])}</strong><em>${esc(t.role.split(',')[0])}</em></span></a></li>`).join('')}</ul>${foot(n, 'l')}</div>`,
    R: n => `<div class="pg pg-r pg-tx pg-exr" id="room-expertise" data-room="expertise">${run}<p class="mg-kick">${esc(pg.expertise.kick)}</p>${hh(pg.expertise.hr)}
      <ul class="mp-grid4 mp-sup">${pg.expertise.support.map(b => `<li>${ic(b.icon)}<strong>${esc(b.t)}</strong><span>${esc(srcText(b))}</span></li>`).join('')}</ul>
      <p class="mp-sub">${esc(pg.expertise.journey.t)}</p>
      <ol class="mp-journey">${pg.expertise.journey.steps.map((s, i) => `<li><a href="${C.u(P, s.href)}" data-track="house_magazine_page" data-room="expertise" data-place="magazine"><b>${i + 1}</b><span>${esc(s.t)}</span></a></li>`).join('')}</ol>
      ${lnk(href('company.html'), pg.expertise.cta, 'house_magazine_page', ' data-room="expertise"')}${foot(n, 'r')}</div>`
  };

  /* ------------------------------------------------ 12–13. Стелла */
  const st = pg.stella, pearl = '<svg class="mp-pearl" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="26" r="19" fill="#dfe6f6" stroke="#8ea3d8" stroke-opacity=".6" stroke-width=".8"/><ellipse cx="16.4" cy="17.4" rx="6.2" ry="3.1" transform="rotate(-32 16.4 17.4)" fill="#fff" opacity=".9"/><ellipse cx="18" cy="26.6" rx="2.1" ry="2.9" fill="#0b1a33"/><ellipse cx="30" cy="26.6" rx="2.1" ry="2.9" fill="#0b1a33"/><circle cx="18.8" cy="25.4" r=".85" fill="#fff"/><circle cx="30.8" cy="25.4" r=".85" fill="#fff"/><path d="M24 2.5l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#b08e4e"/></svg>';
  const pearlSlot = (cls = '') => `<span class="mp-pe${cls ? ' ' + cls : ''}" data-pe="idle">${pearl}</span>`;          // настоящий маскот Стеллы (js/assistant.js → Astreya.pearl) подставляет js/house.js; без JS остаётся упрощённый рисунок
  const dlg = st.dialog.map(d => {
    const pr = d.product ? productBy(d.product) : null;
    return `<div class="mp-m mp-u"><p>${esc(d.q)}</p></div>
      <div class="mp-m mp-s"><span class="mp-av">${pearlSlot()}</span><div><p>${esc(d.a)}</p>${pr ? `<a class="mp-pc" href="${C.purl(P, pr)}" data-track="house_magazine_product" data-product="${pr.id}"><span class="mp-pk">${img(S.packOf(pr))}</span><span>${logo(pr.brand, 'mp-pbl')}<strong>${esc(pr.name)}</strong></span>${go}</a>` : ''}${d.note ? `<small>${esc(d.note)}</small>` : ''}${d.link ? `<a class="mp-pl" href="${C.u(P, d.link.h)}" data-track="house_magazine_page" data-room="stella">${esc(d.link.l)} ${go}</a>` : ''}</div></div>`;
  }).join('');
  const stella = {
    L: n => `<div class="pg pg-l pg-tx pg-stl">${run}<p class="mg-kick">${esc(st.kick)}</p>${hh(st.hl)}
      <p class="mp-sub2">${esc(st.sub)}</p>
      <div class="mp-chat" role="img" aria-label="Пример диалога со Стеллой: настоящие ответы помощника сайта"><div class="mp-chat-top">${pearlSlot()}<b>Стелла</b><span>помощник ASTREYA</span></div>${dlg}</div>${foot(n, 'l')}</div>`,
    R: n => `<div class="pg pg-r pg-tx pg-str" id="room-stella" data-room="stella">${run}<div class="mp-stone" aria-hidden="true">${pearlSlot('mp-pe-big')}<b>STELLA</b></div>${hh(st.hr)}
      <ol class="mp-steps3 mp-steps-s">${st.steps.map(s => `<li><span class="mp-sn">${s.n}</span>${ic(s.icon)}<strong>${esc(s.t)}</strong><span>${esc(s.p)}</span></li>`).join('')}</ol>
      <div class="mp-why"><p class="mp-sub">${esc(st.why)}</p><ul>${st.why_list.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <button class="btn btn-fill btn-sm mp-cta" type="button" data-act="asst-open" data-track="house_magazine_stella" data-place="magazine">${esc(st.cta)} ${I.arrow}</button>
      <p class="mp-note mp-note-s">${esc(st.note)}</p>${foot(n, 'r')}</div>`
  };

  /* ------------------------------------------------ 14–15. Учебный центр */
  const tr = rd.training, nextEv = events.slice(0, 3), fmts = ['Семинары', 'Вебинары', 'Практические занятия'];
  const academy = {
    L: n => `<div class="pg pg-l pg-ph pg-acl"><div class="mg-ph mp-fade mp-fade-t">${pimg('about3')}</div>
      <p class="mg-run mp-runw" aria-hidden="true"><span>${esc(pg.academy.kick)}</span><span>ASTREYA</span></p>
      <h3 class="mp-hb">${esc(pg.academy.hl[0])}<em>${esc(pg.academy.hl[1])}</em></h3>
      <p class="mp-lead">${esc(tr.text)}</p>${foot(n, 'l')}</div>`,
    R: n => `<div class="pg pg-r pg-tx pg-acr" id="room-academy" data-room="academy">${run}<p class="mg-kick">${esc(pg.academy.kick)}</p>${hh(pg.academy.hr.length > 1 ? pg.academy.hr : [pg.academy.hr[0], ''])}
      <ul class="mp-fmt">${fmts.map((f, i) => `<li>${ic(['cal', 'chat', 'target'][i])}<span>${esc(f)}</span></li>`).join('')}</ul>
      <p class="mg-p mp-intro">${esc(rd.homePath.academy.facts.join('. '))}.</p>
      <p class="mp-sub">${esc(pg.academy.upcoming)}</p>
      <ul class="mp-evs">${nextEv.length ? nextEv.map(evRow).join('') : `<li class="mp-empty">${esc(tr.emptyNote)}</li>`}</ul>${demoNote}
      ${lnk(href('training.html'), pg.academy.cta, 'house_magazine_page', ' data-room="academy"')}${foot(n, 'r')}</div>`
  };

  /* ------------------------------------------------ 16–17. Партнёрская гостиная */
  const aud = rd.audience.items, steps4 = content.partners.steps;
  const audCard = (a, i) => `<li><span class="mp-an">${String(i + 1).padStart(2, '0')}</span><strong>${esc(a.title)}</strong><span>${esc(a.text)}</span><a href="${C.u(P, a.href)}" data-track="house_magazine_page" data-room="partners" data-place="magazine">${esc(a.cta)} ${go}</a></li>`;
  const partners = {
    L: n => `<div class="pg pg-l pg-tx pg-pal">${run}<p class="mg-kick">${esc(pg.partners.kick)}</p>${hh(pg.partners.hl)}
      <p class="mg-p mp-intro">${esc(content.partners.lead)}</p>
      <ul class="mp-aud">${aud.slice(0, 2).map((a, i) => audCard(a, i)).join('')}</ul>
      <figure class="mp-hall">${pimg('about')}</figure>${foot(n, 'l')}</div>`,
    R: n => `<div class="pg pg-r pg-tx pg-par" id="room-partners" data-room="partners">${run}<p class="mg-kick">${esc(pg.partners.kick)}</p>
      <ul class="mp-aud">${aud.slice(2).map((a, i) => audCard(a, i + 2)).join('')}</ul>
      <p class="mp-sub">${esc(pg.partners.steps)}</p>
      <ol class="mp-path">${steps4.map((s, i) => `<li><b>${i + 1}</b><span><strong>${esc(s.t)}</strong>${esc(s.p)}</span></li>`).join('')}</ol>
      <a class="btn btn-fill btn-sm mp-cta" href="${C.u(P, 'partners.html')}" data-track="partner_cta" data-place="magazine">${esc(pg.partners.cta)} ${I.arrow}</a>${foot(n, 'r')}</div>`
  };

  /* ------------------------------------------------ 18–19. Редакция */
  /* словарь ухода: определения — из мини-справочника Стеллы (data/stella/glossary.json: общая справка, не рекомендация); берётся первое предложение */
  let gl = []; try { gl = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'stella', 'glossary.json'), 'utf8')).topics || []; } catch (e) { gl = []; }
  const terms = (pg.editorial.glossary || []).map(id => gl.find(x => x.id === id)).filter(Boolean).map(x => { const a = String(x.a[0]).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(), m = /^(.+?)\s+—\s+(.+?[.!?])(\s|$)/.exec(a); return m ? {t: m[1].replace(/\s*\(.*\)$/, ''), d: m[2]} : null; }).filter(Boolean);
  const glossary = terms.length ? `<p class="mp-sub">${esc(pg.editorial.glossaryTitle)}</p><dl class="mp-gl">${terms.map(x => `<div><dt>${esc(x.t)}</dt><dd>${esc(x.d)}</dd></div>`).join('')}</dl>` : '';
  const [n0, n1, n2] = news, cat = n => (newsCat[n.category] || {}).name || '';
  const nPhoto = n => { const b = (n.related || {}).brands && n.related.brands[0] || (/dermatime|keenwell|iraltone|heliocare|eva|neoretin|endocare|biretix|elancyl/.exec(n.title.toLowerCase()) || [])[0]; return b && ctx.brandById[b] ? `assets/brands/niche-${b}.webp` : 'assets/brands/niche-dermatime.webp'; };
  const editorial = {
    L: n => `<div class="pg pg-l pg-tx pg-edl">${run}<p class="mg-kick">${esc(pg.editorial.kick)}</p>${hh(pg.editorial.hl)}
      ${n0 ? `<article class="mp-feat"><a href="${C.nurl(P, n0)}" data-track="house_magazine_news" data-news="${n0.id}"><span class="mp-fp">${img(nPhoto(n0))}</span><time datetime="${n0.date}">${esc(cat(n0))} · ${esc(dmy(n0.date).full)}</time><strong>${esc(n0.title)}</strong><span>${esc(n0.excerpt)}</span></a></article>` : ''}${foot(n, 'l')}</div>`,
    R: n => `<div class="pg pg-r pg-tx pg-edr" id="room-editorial" data-room="editorial">${run}<p class="mg-kick">${esc(pg.editorial.kick)}</p>
      <ul class="mp-nws">${[n1, n2].filter(Boolean).map(x => `<li><a href="${C.nurl(P, x)}" data-track="house_magazine_news" data-news="${x.id}"><time datetime="${x.date}">${esc(cat(x))} · ${esc(dmy(x.date).full)}</time><strong>${esc(x.title)}</strong><span>${esc(x.excerpt)}</span></a></li>`).join('')}</ul>
      <p class="mp-sub">${esc(pg.editorial.events)}</p>
      <ul class="mp-evs">${nextEv.length ? nextEv.slice(0, 2).map(evRow).join('') : `<li class="mp-empty">${esc(tr.emptyNote)}</li>`}</ul>${demoNote}${glossary}
      ${lnk(href('news.html'), pg.editorial.cta, 'house_magazine_page', ' data-room="editorial"')}${foot(n, 'r')}</div>`
  };

  /* ------------------------------------------------ 20–21. Контакты */
  const offices = site.offices || [], ct = pg.contacts, cn = site.contacts;
  const contactsP = {
    L: n => `<div class="pg pg-l pg-cont-l pg-cnl"><p class="mg-run mp-runw" aria-hidden="true"><span>${esc(mc.contactsTitle)}</span><span>ASTREYA</span></p>
      <h3 class="mp-hb mp-hb-n">${esc(ct.hl[0])}<em>${esc(ct.hl[1])}</em></h3>
      <ul class="mp-off">${offices.map(o => `<li>${ic('pin')}<span><strong>${esc(o.city)}</strong><em>${esc(o.role)}</em><span>${esc(o.addr)}</span></span></li>`).join('')}</ul><p class="mp-closing mp-closing-n">${esc(ct.closing)}</p>${foot(n, 'l')}</div>`,
    R: n => `<div class="pg pg-r pg-tx pg-cnr">${run}<p class="mg-kick">${esc(mc.contactsTitle)}</p><h3 class="mg-h">${esc(site.legalName)}</h3>
      <ul class="mg-contacts mp-cts"><li>${ic('phone')}<a href="tel:${cn.phoneRaw}" data-track="phone_click">${esc(cn.phone)}</a></li><li>${ic('mail')}<a href="mailto:${cn.email}" data-track="email_click">${esc(cn.email)}</a></li><li>${ic('cal')}<span>${esc(cn.hours)}</span></li><li>${ic('pin')}<span>${esc(cn.address)}${cn.addressNote ? ` · ${esc(cn.addressNote)}` : ''}</span></li></ul>
      <div class="mp-ctas"><a class="btn btn-fill btn-sm" href="${C.u(P, 'partners.html')}" data-track="partner_cta" data-place="magazine">${esc(ct.ctas.partner)} ${I.arrow}</a>
        <a class="btn btn-ghost btn-sm" href="${C.u(P, 'catalog.html')}" data-track="catalog_click" data-place="magazine">${esc(ct.ctas.catalog)}</a>
        <button class="btn btn-ghost btn-sm" type="button" data-act="asst-open" data-track="house_magazine_stella" data-place="magazine">${esc(ct.ctas.stella)}</button></div>
      <p class="mp-sub">${esc(ct.brands)}</p>${logosRow(brands.map(b => b.id), 'mp-logos-all')}
      ${foot(n, 'r')}</div>`
  };

  return {about, brands: brandsP, finder, expertise, stella, academy, partners, editorial, contacts: contactsP};
};
