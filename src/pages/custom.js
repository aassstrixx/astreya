/* Страница, созданная в админке (data/pages.json): заголовок + набор блоков. Все тексты экранируются; ссылки и картинки уже проверены в src/blocks-schema.js. */
const S = require('../../js/shared.js');
const {esc, I} = S;

module.exports = function customPage(ctx, C, P, pg) {
  const u = C.u;
  const href = h => /^(https?:|tel:|mailto:|#)/.test(h) ? h : u(P, h);
  const ext = h => /^https?:/.test(h) ? ' target="_blank" rel="noopener"' : '';
  const img = (src, alt, cls = '') => `<img${cls ? ` class="${cls}"` : ''} src="${esc(u(P, src))}" alt="${esc(alt || '')}" loading="lazy" decoding="async">`;
  const paras = list => (list || []).filter(x => x && x.trim()).map(x => `<p>${esc(x)}</p>`).join('');
  const head = (eyebrow, title) => title ? C.secHead(esc(eyebrow || ''), esc(title)) : '';
  const sec = (inner, cls = '') => `<section class="sec${cls ? ' ' + cls : ''}"><div class="wrap">${inner}</div></section>`;
  const B = {
    text: b => sec(`<div class="pg-text reveal">${b.title ? `<h2>${esc(b.title)}</h2>` : ''}${paras(b.paragraphs)}</div>`),
    image: b => sec(`<figure class="pg-fig reveal${b.wide ? ' wide' : ''}">${img(b.src, b.alt)}${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`),
    cards: b => sec(`${head(b.eyebrow, b.title)}<div class="grid g${[2, 3, 4].includes(+b.cols) ? +b.cols : 3}">${b.items.map(it => {
      const inner = `${it.image ? `<div class="pg-card-img">${img(it.image, '')}</div>` : ''}<h3>${esc(it.title)}</h3>${it.text ? `<p>${esc(it.text)}</p>` : ''}${it.href ? `<span class="lnk">Подробнее ${I.arrow}</span>` : ''}`;
      return it.href ? `<a class="card card-pad adv pg-card hov reveal" href="${esc(href(it.href))}"${ext(it.href)}>${inner}</a>` : `<article class="card card-pad adv pg-card reveal">${inner}</article>`; }).join('')}</div>`),
    list: b => sec(`<div class="pg-text reveal">${b.title ? `<h2>${esc(b.title)}</h2>` : ''}<ul class="ticks">${b.items.filter(x => x.trim()).map(x => `<li>${I.check}<span>${esc(x)}</span></li>`).join('')}</ul></div>`),
    columns: b => sec(`${b.title ? `<h2 class="pg-h2 reveal">${esc(b.title)}</h2>` : ''}<div class="pg-cols reveal"><div class="pg-text">${paras(b.left)}</div><div class="pg-text">${paras(b.right)}</div></div>`),
    steps: b => sec(`${head(b.eyebrow, b.title)}<div class="steps">${b.items.map((s, i) => `<div class="step reveal"><i>${i + 1}</i><h3>${esc(s.title)}</h3>${s.text ? `<p>${esc(s.text)}</p>` : ''}</div>`).join('')}</div>`, 'tint'),
    stats: b => `<section class="stats pg-stats" aria-label="Цифры"><div class="wrap stats-grid" style="--n:${Math.min(b.items.length, 4)}">${b.items.map(s => `<div class="stat reveal"><b>${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join('')}</div></section>`,
    faq: b => sec(`${head(b.eyebrow, b.title)}<div class="faq reveal">${b.items.map(f => `<div class="faq-item"><button class="faq-q" type="button" data-act="faq" aria-expanded="false"><span>${esc(f.q)}</span><i class="pm"></i></button><div class="faq-a"><div><p>${esc(f.a)}</p></div></div></div>`).join('')}</div>`),
    cta: b => b.tone === 'light'
      ? sec(`<div class="card card-pad pg-cta-light reveal"><div>${b.eyebrow ? `<span class="eyebrow">${esc(b.eyebrow)}</span>` : ''}<h2>${esc(b.title)}</h2>${b.text ? `<p class="muted">${esc(b.text)}</p>` : ''}</div><a class="btn btn-fill" href="${esc(href(b.href))}"${ext(b.href)}>${esc(b.label)} ${I.arrow}</a></div>`)
      : sec(`<div class="cta-band reveal pushin"><div class="cb-copy">${b.eyebrow ? `<span class="eyebrow">${esc(b.eyebrow)}</span>` : ''}<h2>${esc(b.title)}</h2>${b.text ? `<p>${esc(b.text)}</p>` : ''}<div class="row"><a class="btn btn-light" href="${esc(href(b.href))}"${ext(b.href)}>${esc(b.label)} ${I.arrow}</a></div></div>${C.ctaLogo}</div>`),
    form: b => sec(`<div class="form-card stack card reveal" id="form-${esc(b.kind)}">${b.title || b.text ? `<div>${b.title ? `<h2 style="font-size:var(--fs-h2-sm)">${esc(b.title)}</h2>` : ''}${b.text ? `<p class="muted">${esc(b.text)}</p>` : ''}</div>` : ''}${S.formHTML(b.kind, {root: P.root, uid: 'pg-' + b.kind})}</div>`)
  };
  return `<div class="wrap">
    ${C.pageHead(esc(pg.eyebrow || ''), esc(pg.title), esc(pg.lead || ''))}
  </div>
  ${pg.blocks.map(b => B[b.type] ? B[b.type](b) : '').join('\n  ')}`;
};
