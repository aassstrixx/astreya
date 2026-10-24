/* Каталог в виде шоурума (data/redesign.json → extras.showroom; стили — css/showroom.css, поведение — js/showroom.js).
   Здесь — только разметка. Центральная витрина — это «элевация» бутика 1536×1024 из отдельных слоёв: задний план (стена, свет, арки, ниша с полками, растение), средний план (ступени, платформа),
   передний план (подиумы и товары — их ставит js/showroom.js) и интерфейс поверх сцены (панель фильтров, заголовок, карточка товара, «Рекомендуем», преимущества).
   Всё, на что опирается остальной сайт (#results, #f-brand/#f-cat/#f-task/#f-kind/#f-sort, #cat-q, .cat-tile, #cat-grid .pcard, #res-count, #cat-reset, #cat-empty), остаётся на месте. */
const fs = require('fs');
const path = require('path');
const S = require('../../js/shared.js');
const {esc, I} = S;


/* карточки полного списка на этой странице показывают тот же 3D-макет упаковки, что и сцена (вместо CSS-иллюстрации); есть настоящее фото и включён extras.showroomPhotos — остаётся фото */
const PK_TAIL = /<div class="art" role="img"([^>]*)><div class="pk[^"]*"><i class="sh"><\/i><i class="hd"><\/i><i class="cap"><\/i><i class="body"><b class="lbl"><\/b><\/i><\/div><\/div>/;

module.exports = function showroom(ctx, C, P) {
  const {cats, tasks, kinds, brands, products, content} = ctx;
  const cnt = {brand: {}, cat: {}, task: {}, kind: {}};
  products.forEach(p => { cnt.brand[p.brand] = (cnt.brand[p.brand] || 0) + 1; cnt.cat[p.cat] = (cnt.cat[p.cat] || 0) + 1; cnt.kind[p.kind] = (cnt.kind[p.kind] || 0) + 1; p.tasks.forEach(t => { cnt.task[t] = (cnt.task[t] || 0) + 1; }); });
  const assistant = C.xon('assistant');
  const GROUPS = [
    ['brand', 'Бренд', 'f-brand', 'Все бренды', brands.map(b => [b.id, b.name])],
    ['cat', 'Категория', 'f-cat', 'Все категории', cats.map(c => [c.id, c.name])],
    ['task', 'Назначение', 'f-task', 'Любое назначение', tasks.map(t => [t.id, t.label])],
    ['kind', 'Тип продукта', 'f-kind', 'Все типы', kinds.map(k => [k.id, k.name])]
  ];
  const LIM = 5;
  const group = ([key, label, id, all, opts], i) => {
    const open = i < 2;
    return `<div class="shw-grp${open ? ' is-open' : ''}" data-key="${key}">
      <button class="shw-gh" type="button" data-act="shw-grp" aria-expanded="${open}" aria-controls="shw-go-${key}"><span>${label}</span>${I.chevron}</button>
      <div class="shw-go" id="shw-go-${key}"><div class="shw-gi" role="group" aria-label="${label}">
        ${opts.map(([v, t], j) => `<button class="shw-o${j >= LIM ? ' xtra' : ''}" type="button" data-act="shw-opt" data-key="${key}" data-v="${esc(v)}" aria-pressed="false"><i class="shw-ck" aria-hidden="true">${I.check}</i><span class="t">${esc(t)}</span><em>${cnt[key][v] || 0}</em></button>`).join('')}
        ${opts.length > LIM ? `<button class="shw-more" type="button" data-act="shw-more" aria-expanded="false">Ещё ${opts.length - LIM}</button>` : ''}
      </div></div>
      <div class="fld shw-fld"><label for="${id}">${label}</label><div class="sel"><select id="${id}">${[['all', all], ...opts].map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>${I.chevron}</div></div>
    </div>`;
  };
  const sort = `<div class="fld shw-sort"><label for="f-sort">Сортировка</label><div class="sel"><select id="f-sort">${[['def', 'По умолчанию'], ['new', 'Сначала новинки'], ['az', 'По названию А–Я'], ['brand', 'По бренду']].map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}</select>${I.chevron}</div></div>`;
  const reset = `<svg class="ic" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M3.8 10a6.2 6.2 0 1 0 1.9-4.4M3.5 3.6v3.2h3.2"/></svg>`;

  const renderArt = (html, p) => html;                                                                        // карточки полного списка собирает C.productCardX (src/components.js): мини-экспозиция вместо голубого полукруга

  const aside = `<aside class="shw-aside" aria-label="Фильтры каталога">
    <div class="toolbar shw-panel" id="results">
      <div class="tb-top">
        <label class="search"><span class="sr">Поиск по каталогу</span>${I.search}<input id="cat-q" type="search" placeholder="Поиск по каталогу…" autocomplete="off"></label>
        <button class="btn btn-ghost btn-sm filters-toggle" type="button" data-act="filters" aria-expanded="false" aria-controls="filters">${I.filter} Фильтры <span class="badge" id="f-badge" hidden>0</span></button>
      </div>
      <div class="shw-drop">
      <div class="filters shw-filters" id="filters">
        ${GROUPS.map(group).join('')}
        ${sort}
      </div>
      <div class="active-filters" id="active-filters" hidden></div>
      <div class="shw-aside-foot"><span class="shw-count" data-shw-count>${products.length} из ${products.length}</span><button class="shw-reset" type="button" data-act="cat-reset" data-shw-reset hidden>${reset}Сбросить фильтры</button></div>
      </div>
    </div>
  </aside>`;

  /* картинка товара для сцены и ряда «Рекомендуем»: настоящее фото (поле image) либо — пока его нет — условный макет упаковки без текста */
  const imgSrc = p => C.u(P, p.image && C.xon('showroomPhotos') ? p.image : S.packOf(p));
  const imgTag = (p, cls) => `<img class="${cls}${p.image && C.xon('showroomPhotos') ? '' : ' is-mock'}" src="${esc(imgSrc(p))}" alt="" loading="lazy" decoding="async">`;

  /* «Рекомендуем» — товары с отметкой «В подборке» (featured) из админки; новинки — первыми */
  const feat = products.filter(p => p.featured).sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
  const popCard = p => {
    const b = ctx.brandById[p.brand], k = ctx.kindById[p.kind];
    return `<article class="shw-pc" role="listitem" style="${S.bstyle(b)}" data-id="${p.id}">
      ${p.isNew ? '<span class="shw-pc-tag">Новинка</span>' : ''}
      <div class="shw-pc-art" aria-hidden="true">${imgTag(p, 'shw-pc-img')}</div>
      <div class="shw-pc-b">
        <span class="shw-pc-br">${esc(b.name)}</span>
        <h3><a class="stretch" href="${C.purl(P, p)}" data-track="product_card_click" data-place="showroom_pop" data-product="${p.id}">${esc(p.name)}</a></h3>
        <span class="shw-pc-k">${esc(k ? k.name : '')}</span>
        <div class="shw-pc-f"><span class="shw-pc-v">${esc(p.volume || '')}</span><button class="shw-ask z3" type="button" data-act="form" data-type="product" data-ref="${p.id}">Запросить ${I.arrow}</button></div>
      </div>
    </article>`;
  };
  const pop = feat.length ? `<section class="shw-pop" aria-labelledby="shw-pop-t">
      <div class="shw-pop-h"><h2 id="shw-pop-t">Рекомендуем</h2><a class="lnk" href="#shw-all">Смотреть весь список ${I.arrow}</a></div>
      <div class="shw-pop-w">
        <button class="shw-nav prev" type="button" data-act="shw-pop-nav" data-dir="-1" aria-label="Назад" disabled>${I.arrow}</button>
        <div class="shw-pop-t" role="list" tabindex="0" aria-label="Рекомендуем">${feat.map(popCard).join('')}</div>
        <button class="shw-nav next" type="button" data-act="shw-pop-nav" data-dir="1" aria-label="Вперёд">${I.arrow}</button>
      </div>
    </section>` : '';

  /* полоса преимуществ — тексты сайта (data/content.json → advantages), ничего не придумано */
  const advs = (content.advantages || []).filter(a => ['Оригинальная продукция', 'Учебный центр', 'Поддержка специалистов'].includes(a.title));
  const adv = `<div class="shw-adv" aria-label="Преимущества">
      ${advs.map(a => `<div class="shw-av"><span class="shw-av-i" aria-hidden="true">${I[a.icon] || ''}</span><span class="shw-av-t"><b>${esc(a.title)}</b><span>${esc(a.text)}</span></span></div>`).join('')}
      ${assistant ? `<button class="shw-help shw-stella" type="button" data-act="gal-help" aria-label="Спросить Стеллу — она учтёт выбранные фильтры"><span class="shw-help-pe" aria-hidden="true"><svg class="pe live" data-m="happy" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><g class="pe-b"><circle cx="24" cy="26" r="19" fill="url(#pe-g)"/><circle cx="24" cy="26" r="18.6" fill="none" stroke="#8ea3d8" stroke-opacity=".55" stroke-width=".8"/><ellipse cx="16.4" cy="17.4" rx="6.2" ry="3.1" transform="rotate(-32 16.4 17.4)" fill="#fff" opacity=".92"/><circle cx="31.5" cy="35.6" r="2.2" fill="#fff" opacity=".35"/><g class="pe-f"><g class="pe-e"><ellipse cx="18" cy="26.6" rx="2.1" ry="2.9" fill="#0b1a33"/><ellipse cx="30" cy="26.6" rx="2.1" ry="2.9" fill="#0b1a33"/><circle cx="18.8" cy="25.4" r=".85" fill="#fff"/><circle cx="30.8" cy="25.4" r=".85" fill="#fff"/></g><g class="pe-eh"><path d="M15.4 27.6q2.6-3.9 5.2 0M27.4 27.6q2.6-3.9 5.2 0" fill="none" stroke="#0b1a33" stroke-width="1.9" stroke-linecap="round"/></g><g class="pe-es"><path d="M15.4 26.2q2.6 3.5 5.2 0M27.4 26.2q2.6 3.5 5.2 0" fill="none" stroke="#0b1a33" stroke-width="1.8" stroke-linecap="round"/></g><ellipse class="pe-bl" cx="12.8" cy="31.6" rx="2.7" ry="1.75" fill="#f4a3b8"/><ellipse class="pe-bl" cx="35.2" cy="31.6" rx="2.7" ry="1.75" fill="#f4a3b8"/><path class="pe-m" d="M20.8 31.6q3.2 3.3 6.4 0" fill="none" stroke="#0b1a33" stroke-width="1.6" stroke-linecap="round"/><ellipse class="pe-mo" cx="24" cy="33.2" rx="2" ry="2.4" fill="#0b1a33"/></g></g><path class="pe-st" d="M37.6 2.6l1.7 4.4 4.4 1.7-4.4 1.7-1.7 4.4-1.7-4.4-4.4-1.7 4.4-1.7z" fill="#f6d58b" stroke="#e3b95c" stroke-width=".5" stroke-linejoin="round"/></svg></span><span class="shw-help-t"><b>Спросить Стеллу</b><small>подберёт под вашу задачу</small></span></button>` : ''}
    </div>`;

  const head = C.pageHead('Каталог', 'Каталог профессиональной косметики', 'Направления, бренды и задачи — фильтруйте ассортимент так, как думает специалист.');
  const pills = `<div class="cat-tiles shw-pills" id="categories" role="group" aria-label="Категории">
      <button type="button" class="shw-all on" data-act="cat-tile" data-id="all" aria-pressed="true"><b>Все</b></button>
      ${cats.map(c => {
        const n = products.filter(p => p.cat === c.id).length;
        return `<button type="button" class="cat-tile" data-act="cat-tile" data-id="${c.id}" aria-pressed="false"><b>${esc(c.name)}</b><span>${n}</span></button>`;
      }).join('')}
    </div>`;

  /* слои сзади вперёд: стена и пол (с окном и тенями) → ниша со стеклянными полками и LED-подсветкой → арка → платформа и ступени из травертина → растение → (подиумы и товары: js/showroom.js) → интерфейс.
     Каждый слой — отдельный 3D-рендер одной сцены с одной камеры (tools/showroom-assets/scene.py): тень и отражённый свет каждого объекта попадают во все слои, но сам объект виден только в своём. */
  let LY = {}; try { LY = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'showroom', 'layers.json'), 'utf8')); } catch (e) {}
  const layer = (k, extra = '') => LY[k] ? `<img class="shw-ly shw-ly-${k}" src="${C.u(P, LY[k].file)}" alt="" width="${Math.round(LY[k].w)}" height="${Math.round(LY[k].h)}" style="left:${LY[k].x}px;top:${LY[k].y}px;width:${LY[k].w}px;height:${LY[k].h}px" decoding="async"${extra}>` : '';
  const world = `<div class="shw-plane shw-world" aria-hidden="true" data-shw-world>
        ${layer('shell', ' fetchpriority="high"')}${layer('niche')}${layer('ring')}${layer('dais')}${layer('plant')}
      </div>`;

  const scene = `<section class="shw" data-shw aria-label="Витрина каталога">
      <div class="shw-room" data-shw-room>
        <div class="shw-canvas">
          <div class="shw-hero">
          <div class="shw-vw">
            <div class="shw-view" data-shw-view>
              ${world}
              <div class="shw-motes" aria-hidden="true"><i style="--x:60%;--y:89%;--s:14px;--dx:17px;--t:21s;--d:-18s"></i><i style="--x:27%;--y:41%;--s:18px;--dx:20px;--t:23s;--d:-19s"></i><i style="--x:26%;--y:30%;--s:14px;--dx:-2px;--t:15s;--d:-2s"></i><i style="--x:71%;--y:23%;--s:18px;--dx:10px;--t:20s;--d:-20s"></i><i style="--x:81%;--y:38%;--s:18px;--dx:-39px;--t:21s;--d:-2s"></i><i style="--x:10%;--y:22%;--s:9px;--dx:-10px;--t:22s;--d:-0s"></i><i style="--x:62%;--y:59%;--s:14px;--dx:35px;--t:16s;--d:-16s"></i><i style="--x:32%;--y:55%;--s:14px;--dx:-40px;--t:23s;--d:-2s"></i><i style="--x:61%;--y:53%;--s:14px;--dx:30px;--t:14s;--d:-8s"></i><i style="--x:43%;--y:47%;--s:18px;--dx:-4px;--t:13s;--d:-2s"></i><i style="--x:75%;--y:31%;--s:14px;--dx:-27px;--t:17s;--d:-12s"></i><i style="--x:11%;--y:20%;--s:7px;--dx:-13px;--t:16s;--d:-1s"></i><i style="--x:63%;--y:66%;--s:14px;--dx:13px;--t:14s;--d:-18s"></i><i style="--x:83%;--y:43%;--s:11px;--dx:3px;--t:14s;--d:-9s"></i><i style="--x:45%;--y:19%;--s:14px;--dx:57px;--t:14s;--d:-4s"></i><i style="--x:34%;--y:30%;--s:7px;--dx:-33px;--t:20s;--d:-15s"></i></div>
              <div class="shw-plane shw-stage" data-shw-stage role="group" aria-label="Товары в экспозиции">
                  <div class="shw-empty" data-shw-empty hidden><b>Ничего не нашлось</b><span>Измените запрос или сбросьте фильтры.</span><button class="btn btn-ghost btn-sm" type="button" data-act="cat-reset">Сбросить фильтры</button></div>
              </div>
            </div>
            <button class="shw-pan prev" type="button" data-act="shw-pan" data-dir="-1" aria-label="Сдвинуть сцену влево" hidden>${I.arrow}</button>
            <button class="shw-pan next" type="button" data-act="shw-pan" data-dir="1" aria-label="Сдвинуть сцену вправо" hidden>${I.arrow}</button>
          </div>
          ${aside}
          <div class="shw-head">${head}${pills}</div>
          <aside class="shw-card is-idle" data-shw-card hidden aria-live="polite" aria-label="Выбранный товар"></aside>
          <div class="shw-pager" data-shw-pager hidden>
            <button class="shw-nav prev" type="button" data-act="shw-page" data-dir="-1" aria-label="Предыдущие товары">${I.arrow}</button>
            <span class="shw-pg" data-shw-pg aria-live="polite"></span>
            <button class="shw-nav next" type="button" data-act="shw-page" data-dir="1" aria-label="Следующие товары">${I.arrow}</button>
          </div>
          </div>
          ${pop}
        </div>
      </div>
    </section>`;

  /* «Выберите направление ухода»: по плитке-экспозиции на каждую существующую категорию — стена и пол той же сцены, до трёх товаров категории на подиумах разной высоты (новинки и рекомендованные первыми).
     Клик включает категорию и возвращает к главной экспозиции, которая перестраивается под неё. Категории и товары — из данных каталога, ничего не придумано. */
  const dirTile = (c, ci) => {
    const list = products.filter(p => p.cat === c.id).sort((x, y) => (y.featured ? 2 : 0) + (y.isNew ? 1 : 0) - ((x.featured ? 2 : 0) + (x.isNew ? 1 : 0))).slice(0, 3);
    const n = products.filter(p => p.cat === c.id).length, bs = [...new Set(products.filter(p => p.cat === c.id).map(p => (ctx.brandById[p.brand] || {}).name).filter(Boolean))];
    const lay = list.length === 1 ? [[50, 22, 1]] : list.length === 2 ? [[30, 18, .88], [70, 22, 1]] : [[17, 14, .8], [50, 21, 1], [83, 16, .86]];
    const body = list.map((p, i) => { const [x, ph, k] = lay[i], B0 = 9, pk = Math.round((B0 + ph * .79) * 10) / 10, th = Math.round(S.packH(p) * .5 * k * 10) / 10;
      return `<i class="ax-pod" style="--pr:.42;left:${x}%;bottom:${B0}%;height:${ph}%" aria-hidden="true"></i><img src="${esc(C.u(P, S.packOf(p)))}" alt="" style="left:${x}%;bottom:${pk}%;height:${th}%" loading="lazy" decoding="async">`; }).join('');
    return `<button class="shw-dir reveal" type="button" data-act="shw-to" data-key="cat" data-id="${c.id}" aria-pressed="false" aria-label="${esc(c.name)}: ${n} ${S.plural(n, 'позиция', 'позиции', 'позиций')}">
      <span class="ax-stage shw-dir-st" data-w="${(ci * 5 + 1) % 6}" aria-hidden="true">${body}</span>
      <span class="shw-dir-cap"><b>${esc(c.name)}</b><em>${n} ${S.plural(n, 'позиция', 'позиции', 'позиций')}${bs.length ? ' · ' + esc(bs.slice(0, 3).join(', ')) : ''}</em></span>
    </button>`;
  };
  /* «Подбор по задаче» — восемь задач из каталога с их пояснениями (data/catalog.json → tasks[].note) и числом товаров; клик перестраивает витрину под задачу */
  const taskTile = t => {
    const n = cnt.task[t.id] || 0, bs = (t.brands || []).map(id => ctx.brandById[id]).filter(Boolean).slice(0, 4);
    return `<button class="shw-task reveal" type="button" data-act="shw-to" data-key="task" data-id="${t.id}" aria-pressed="false">
      <span class="shw-task-n">${n} ${S.plural(n, 'товар', 'товара', 'товаров')}</span>
      <b>${esc(t.label)}</b>
      <span class="shw-task-d">${esc(t.note || '')}</span>
      <span class="shw-task-f"><span class="shw-task-b">${bs.map(b => `<i style="background:${esc(b.c1)}" title="${esc(b.name)}"></i>`).join('')}</span><span class="shw-task-go">Показать в витрине ${I.arrow}</span></span>
    </button>`;
  };
  const tasksBlock = `<section class="shw-tasks" aria-labelledby="shw-tasks-h">
      <div class="shw-all-h"><span class="eyebrow">Подбор</span><h2 id="shw-tasks-h">Подберите по задаче</h2><p class="shw-dirs-lead">Выберите задачу кабинета или домашнего ухода — витрина выше соберёт подходящие продукты.</p></div>
      <div class="shw-task-grid">${tasks.map(taskTile).join('')}</div>
    </section>`;
  /* «Бренды в галерее» — логотипы, страна и направления из данных брендов */
  const brandTile = b => {
    const n = cnt.brand[b.id] || 0;
    return `<button class="shw-brand reveal" type="button" data-act="shw-to" data-key="brand" data-id="${b.id}" aria-pressed="false" style="${S.bstyle(b)}">
      <span class="shw-brand-l">${b.logo ? `<img src="${esc(C.u(P, b.logo))}" alt="" loading="lazy" decoding="async">` : `<b>${esc(b.name)}</b>`}</span>
      <span class="shw-brand-c">${esc(b.group || '')} · ${n} ${S.plural(n, 'товар', 'товара', 'товаров')}</span>
      <span class="shw-brand-t">${esc(b.tag || '')}</span>
    </button>`;
  };
  const brandsBlock = `<section class="shw-brands" aria-labelledby="shw-brands-h">
      <div class="shw-all-h"><span class="eyebrow">Партнёры</span><h2 id="shw-brands-h">Бренды в галерее</h2></div>
      <div class="shw-brand-grid">${brands.map(brandTile).join('')}</div>
    </section>`;
  const dirs = `<section class="shw-dirs" id="shw-dirs" aria-labelledby="shw-dirs-h">
      <div class="shw-all-h"><span class="eyebrow">Коллекции</span><h2 id="shw-dirs-h">Выберите направление ухода</h2><p class="shw-dirs-lead">Каждая коллекция — отдельная экспозиция в той же галерее. Нажмите, и главная витрина переставится под выбранное направление.</p></div>
      <div class="shw-dir-grid" role="group" aria-label="Направления ухода">${cats.map(dirTile).join('')}</div>
    </section>`;

  return `<div class="wrap shw-wrap" data-catalog data-showroom>
    ${scene}
    <div class="shw-rest">
    ${adv}
    ${tasksBlock}
    ${dirs}
    ${brandsBlock}
    <details class="shw-list" id="shw-all" data-shw-list>
      <summary><span class="shw-list-t"><span class="eyebrow">Полный список</span><b>Весь ассортимент списком</b></span><em class="shw-list-n" id="shw-list-n">${products.length}</em><span class="shw-list-i" aria-hidden="true">${I.chevron}</span></summary>
      <div class="shw-list-bg" aria-hidden="true"><i data-bd="cream" data-bd-pos="r" data-bd-o="9" style="--i:0"></i><i data-bd="film" data-bd-pos="l" data-bd-o="9" style="--i:1"></i><i data-bd="smear" data-bd-pos="r" data-bd-o="8" style="--i:2"></i><i data-bd="pipette" data-bd-pos="l" data-bd-o="8" style="--i:3"></i><i data-bd="swatch" data-bd-pos="r" data-bd-o="8" style="--i:4"></i><i data-bd="water" data-bd-pos="l" data-bd-o="8" style="--i:5"></i><i data-bd="molecules" data-bd-pos="r" data-bd-o="7" style="--i:6"></i><i data-bd="ribbon" data-bd-pos="l" data-bd-o="9" style="--i:7"></i><i data-bd="cream" data-bd-pos="r" data-bd-o="9" style="--i:8"></i></div>
      <div class="res-line"><span id="res-count" aria-live="polite">Найдено: ${products.length} из ${products.length}</span><button class="lnk" type="button" data-act="cat-reset" id="cat-reset" hidden>Сбросить фильтры</button></div>
      <h2 class="sr">Товары каталога</h2>
      <div class="grid g4" id="cat-grid">${products.map((p, i) => C.productCardX(P, p, i)).join('')}</div>
      <div class="empty" id="cat-empty" hidden><b>Ничего не нашлось</b>Измените запрос или сбросьте фильтры.</div>
    </details>
    ${C.noteBox(`${ctx.redesign && ctx.redesign.ui && ctx.redesign.ui.showDemoNotices === false ? '' : 'Ассортимент на этой странице демонстрационный (placeholder). '}Полный каталог, описания и документы пришлёт менеджер — оставьте заявку или спросите Стеллу.`)}
    <div style="height:clamp(60px,8vw,110px)"></div>
    </div>
  </div>`;
};
