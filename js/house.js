/* house.js — ASTREYA HOUSE: журнал после зала (подключается вместе с css/house.css, когда главная собрана как дом: <section class="arch-story is-house">).
   • После зала идёт только журнал (комнаты — его страницы). Он стоит в закреплённой сцене: прокрутка вниз — настоящий пролёт камеры от зала к журналу на столике (кадры Blender, tools/jar-render/hall_table.py flight);
     камера встаёт над журналом, живой журнал проявляется ровно поверх нарисованного, дальше прокрутка листает
     страницы — каждый лист поворачивается вслед за прокруткой (не по щелчку), посередине разворота страница стоит и читается. Кнопки «Назад/Далее», оглавление, клавиатура, свайп и прежние
     адреса (#room-…, #magazine/N, #hall, старые якоря главной) просто прокручивают к нужному развороту: прокрутка страницы не блокируется никогда.
   • Телефон: одна страница на экране, листаем пальцем (scroll-snap). Без анимации (prefers-reduced-motion, «лёгкий режим»): обычный экран с раскрытым журналом, листание кнопками.
   • Без JS страницы журнала идут подряд (обычные блоки), ссылки #room-… ведут на нужную страницу. Всё содержимое — настоящий HTML. */
(function () {
  'use strict';
  const A = window.Astreya = window.Astreya || {};
  const root = document.documentElement;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const track = (n, p) => { try { (A.track || function () {})(n, p || {}); } catch (e) {} };
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce) and (min-width: 100000px)').matches;                // только системная настройка «уменьшить движение»; автоматический «лёгкий режим» (html.lite, FPS < 30) пролёт и листание не отключает
  const phone = () => matchMedia('(max-width:700px)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let off = [];                                                    // отписка от прошлой страницы: переходы без перезагрузки подменяют #main, а скрипт остаётся

  function init() {
    off.forEach(f => { try { f(); } catch (e) {} }); off = [];
    const story = document.getElementById('arch-story');
    if (!story || !story.classList.contains('is-house')) return;
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); off.push(() => t.removeEventListener(ev, fn, o)); };
    off.push(() => document.body.classList.remove('house-reading'));
    const reader = $('#house-reader'), mag = $('#mag');
    if (!reader || !mag) return;

    const book = $('.mag-book', mag), leaves = $$('.leaf', mag), N = leaves.length;
    const stEl = $('.mag-st', mag), pvB = $('.mag-pv', mag), nxB = $('.mag-nx', mag), scroller = $('.leaves', mag);
    const ids = $$('.pg-r[data-room]', mag).map(el => el.getAttribute('data-room'));            // комнаты в порядке страниц журнала
    const LEGACY = {'start-path': 'partners', 'how-to-start': 'partners', 'brands-gallery': 'brands', 'hb-strip': 'brands', solutions: 'finder', 'training-block': 'academy', 'home-events': 'academy', 'expertise-block': 'expertise'};
    const stateOfRoom = id => { const i = ids.indexOf(id); return i < 0 ? 1 : i + 2; };         // разворот комнаты: лист i+2 лицом, обратная сторона предыдущего — слева
    const roomOfState = v => (v >= 2 && v - 2 < ids.length) ? ids[v - 2] : null;

    /* ---------- положение страницы ---------- */
    const abs = el => el.getBoundingClientRect().top + window.pageYOffset;
    const stageH = el => { const st = el && (el.classList.contains('hr-stage') ? el : el.firstElementChild); return st && st.offsetHeight && getComputedStyle(st).position === 'sticky' ? st.offsetHeight : window.innerHeight; };          // высота закреплённой сцены (100lvh) — постоянная; innerHeight на телефоне прыгает с панелью браузера, от неё прогресс дёргался
    const heroTail = () => (A.heroTail ? A.heroTail() : 0);          // хвост сцены героя (телефон): она стоит ещё столько же, пока гаснут холсты (js/jar.js, css/house.css)
    const hallY = () => story.classList.contains('jar-off') ? Math.max(0, abs(story)) : Math.max(0, abs(story) + story.offsetHeight - stageH(story) - heroTail());       // конец закреплённой сцены: герой стоит в готовом кадре зала
    const jump = y => window.scrollTo({top: Math.round(y), behavior: 'instant'});                // «instant» — мимо html{scroll-behavior:smooth}
    const readerBox = () => { const r = reader.getBoundingClientRect(); return {top: r.top + window.pageYOffset, total: Math.max(0, r.height - stageH($('.hr-stage', reader)))}; };
    /* положение читалки в документе меряем один раз и пересчитываем, только когда поменялась вёрстка (ResizeObserver, resize): раньше каждый кадр читал getBoundingClientRect() сразу после записей стилей предыдущего кадра — это принудительный пересчёт стилей и вёрстки прямо в обработчике прокрутки */
    let rbox = null;
    const rbx = () => rbox || (rbox = readerBox());
    const readerT = () => { const b = rbx(); return b.total > 0 ? clamp((window.pageYOffset - b.top) / b.total, 0, 1) : 1; };
    try { const ro = new ResizeObserver(() => { rbox = null; }); ro.observe(document.documentElement); ro.observe(reader); } catch (e) { /* без ResizeObserver — меряем заново на resize */ }
    window.addEventListener('resize', () => { rbox = null; }, {passive: true});
    const flat = () => reduce() || reader.classList.contains('is-flat');
    const hasM = reader.hasAttribute('data-m') && reader.hasAttribute('data-fly');
    const pm = () => hasM && phone() && !reduce();          // телефон с пролётом камеры: та же закреплённая сцена, что на ПК, но в окне одна страница — книга-разворот сдвигается (--bx) к нужной странице
    const pflat = () => phone() && !pm();                   // телефон без пролёта (нет данных): прежняя лента страниц (scroll-snap)

    /* ---------- журнал: p — «сколько листов перевёрнуто» (дробное — лист в движении); s — ближайший целый разворот ---------- */
    let s = 0, p = 0, current = null, stillNow = null;
    const inertOf = (el, onn) => { if ('inert' in el) el.inert = onn; else $$('a,button', el).forEach(f => { if (onn) f.setAttribute('tabindex', '-1'); else f.removeAttribute('tabindex'); }); el.setAttribute('aria-hidden', onn ? 'true' : 'false'); };
    const fs = leaves.map(() => -1), faces = leaves.map(l => [$('.front', l), $('.back', l)]), cache = {};
    const fx = leaves.map(l => [$('.front .fx', l), $('.back .fx', l)]), shR = $('.mag-sh.r', mag), shL = $('.mag-sh.l', mag);                    // тень и блик поворачивающегося листа и тень на страницах под ним — настоящие элементы: им пишутся только opacity и transform
    const setVar = (el, k, v) => { const c = cache[k] || (cache[k] = new Map()); if (c.get(el) === v) return; c.set(el, v); el.style.setProperty(k, v); };          // то же значение второй раз не пишем: каждая запись пользовательского свойства — пересчёт стилей поддерева
    let chat = null, entered = false, holdP = null, holdQ = null;                           // holdP — разворот, на котором журнал держится при возврате «На главную» (иначе страницы листались бы назад вслед за прокруткой)                                 // чат Стеллы и вход на разворот объявлены ниже (setP их вызывает раньше по тексту)
    /* Телефон: в окне одна страница, а слоёв у листов — по два на каждый из 11 (3D, will-change) с растром в 3× пикселях экрана, плюс ~120 раскодированных фото: вместе это сотни МБ, и iOS убивала вкладку на 5-й странице
       («Возникла повторяющаяся проблема»). Рядом с читаемым разворотом держим пять листов, остальные — display:none (css/house.css, .is-far): их слои и фото освобождаются, а подгружаются они за два листа до появления */
    let nearK = -9, nearK0 = -9;
    const chatLeaf = (() => { const el = $('.mp-chat', mag), l = el && el.closest('.leaf'); return l ? leaves.indexOf(l) : -1; })();
    const warmedK = new Set();
    function holdImgs(k, keep) {
      $$('img', leaves[k]).forEach(im => {
        if (keep) { if (im.dataset.hsrc) { im.setAttribute('src', im.dataset.hsrc); delete im.dataset.hsrc; if (im.dataset.hset) { im.setAttribute('srcset', im.dataset.hset); delete im.dataset.hset; } } }
        else if (im.hasAttribute('src') && !im.dataset.hsrc) { im.dataset.hsrc = im.getAttribute('src'); if (im.hasAttribute('srcset')) { im.dataset.hset = im.getAttribute('srcset'); im.removeAttribute('srcset'); } im.removeAttribute('src'); warmedK.delete(k); }
      });
    }
    function warmLeaf(k) {
      if (k < 0 || k >= N || warmedK.has(k)) return; warmedK.add(k);
      $$('img', leaves[k]).forEach(im => { try { im.loading = 'eager'; if (im.decode) im.decode().catch(() => {}); } catch (e) { /* — */ } });
    }
    function nearLeaves(k0) {
      if (k0 === nearK) return; nearK = k0;
      const was = chat && nearK0 > -9 ? chatLeaf < nearK0 - 2 || chatLeaf > nearK0 + 2 : false;
      leaves.forEach((l, k) => l.classList.toggle('is-far', k < k0 - 2 || k > k0 + 2));
      if (chat && chatLeaf >= 0 && !(chatLeaf < k0 - 2 || chatLeaf > k0 + 2) && (was || nearK0 === -9)) chat.refit();                       // лист с чатом снова рисуется: подсказки подгоняются под его ширину
      nearK0 = k0;
      for (let k = 0; k < N; k++) holdImgs(k, k >= k0 - 3 && k <= k0 + 3);                                       // фото листов дальше трёх от читаемого выгружаются (src снимается): раскодированные картинки копились по мере листания
      for (let k = k0 - 1; k <= k0 + 3; k++) warmLeaf(k);                                                         // фото ближайших листов раскодированы заранее, дальних — нет
    }
    function setP(v) {
      v = clamp(v, 0, N - 1); p = v;
      let sr = 0, sl = 0;
      leaves.forEach((l, k) => {
        const f = clamp(v - k, 0, 1), q = Math.round(f * 1000) / 1000;
        if (q === fs[k]) return; fs[k] = q;
        const lt = Math.sin(Math.PI * q), qs = q.toFixed(3), ls = lt.toFixed(3);
        l.style.setProperty('--f', qs); l.style.setProperty('--lt', ls);                      // --f/--lt объявлены через @property без наследования (css/house.css): стороны листа получают их напрямую, а страницы внутри — нет
        const bx = fx[k]; if (bx[0]) { bx[0].style.opacity = ls; bx[0].firstChild.style.transform = 'translate3d(' + (q * 384.6 - 50).toFixed(1) + '%,0,0)'; }                // блик бежит по лицу листа слева направо, по обороту — справа налево (центр полосы: 200 % ширины × доля поворота)
        if (bx[1]) { bx[1].style.opacity = ls; bx[1].firstChild.style.transform = 'translate3d(' + (50 - (1 - q) * 384.6).toFixed(1) + '%,0,0)'; }
        l.classList.toggle('is-flipped', q > .5);
        l.classList.toggle('is-turning', q > 0 && q < 1);
      });
      if (pm()) nearLeaves(Math.floor(v));
      for (let k = 0; k < N; k++) { const f = clamp(v - k, 0, 1); if (f > 0 && f < 1) { const lt = Math.sin(Math.PI * f); sr = Math.max(sr, lt * clamp((.64 - f) / .3, 0, 1)); sl = Math.max(sl, lt * clamp((f - .36) / .3, 0, 1)); } }
      if (shR) { const a = sr.toFixed(3), b2 = sl.toFixed(3); if (shR._v !== a) { shR._v = a; shR.style.opacity = a; } if (shL._v !== b2) { shL._v = b2; shL.style.opacity = b2; } }
      const still = fs.every(q => q === 0 || q === 1); if (still !== stillNow) { stillNow = still; book.classList.toggle('is-still', still); if (still && entered) setTimeout(pageIn, 60); else if (!still && chat) chat.stop(); }          // разворот стоит (ни один лист не в движении) — страницы рисуются без 3D-смещения, текст резкий
      if (book && !pm()) setVar(book, '--bx', (-.5 * (1 - Math.min(1, v))).toFixed(3));       // закрытый журнал стоит по центру, раскрытый — разворотом (на телефоне сдвигом ведёт applyQ)
      const ns = Math.round(v);
      if (ns !== s || !book.hasAttribute('data-s')) setS(ns);
    }
    function setS(ns) {
      s = ns;
      leaves.forEach((l, k) => { inertOf($('.front', l), !(k === s)); inertOf($('.back', l), !(k === s - 1)); l.classList.toggle('is-cur', k === s); l.classList.toggle('is-prev', k === s - 1); });         // справа читается лицевая сторона листа s, слева — оборот листа s−1
      book.setAttribute('data-s', String(s));
      if (!pm()) {
        if (stEl) stEl.textContent = s === 0 ? 'Обложка' : s >= N - 1 ? 'Контакты' : 'Страницы ' + (2 * s) + '–' + (2 * s + 1);
        if (pvB) pvB.disabled = s <= 1 && !pflat() && !flat(); if (nxB) nxB.disabled = s >= N - 1;
      }
      const r = roomOfState(s); if (r !== current) { current = r; }
    }
    function render(v, o) {                                                    // мгновенно: телефон, «без анимации», запасные случаи
      o = o || {}; setP(clamp(v, 0, N - 1));
      if (pflat() && scroller && !o.noScroll) { const q = s === 0 ? 0 : 2 * s - 1, w = scroller.clientWidth; scroller.scrollTo({left: q * w, behavior: o.instant || reduce() ? 'instant' : 'smooth'}); }
    }

    /* ---------- читалка: состояние журнала задаёт прокрутка ---------- */
    const RD = {open: .30, from: .34, span: .62, hold: .05, fade: [.9, .98]};          // hold — первые 5 % пути камера стоит: холсты героя гаснут над тем же кадром (баночка не мигает)                               // доли пути сцены: пролёт камеры 0….30, журнал стоит на первом развороте, с .34 разворот за разворотом до .96
    const WIN = [.14, .86];                                                    // окно поворота внутри отрезка одного разворота (остальное — страница стоит и читается)
    const ease = x => x * x * (3 - 2 * x);
    const pOf = t => {
      if (t <= RD.from) return 1; if (t >= RD.from + RD.span) return N - 1;
      const q = (t - RD.from) / RD.span * (N - 2), j = Math.floor(q), u = q - j;
      return 1 + j + ease(clamp((u - WIN[0]) / (WIN[1] - WIN[0]), 0, 1));
    };
    /* Телефон с пролётом: в окне одна страница. Остановки читалки — страницы (по две на разворот: левая 2s−1, правая 2s); Q — положение (дробное — между остановками).
       Левая → правая страница разворота: книга едет влево (лист не поворачивается); правая → левая следующего разворота: лист поворачивается, книга едет вправо вслед за ним. Окно покоя WIN — как у ПК. */
    const NS = () => pm() ? 2 * (N - 1) : N - 1;
    const qPm = t => {
      const M2 = 2 * (N - 1); if (t <= RD.from) return 1; if (t >= RD.from + RD.span) return M2;
      const q = (t - RD.from) / RD.span * (M2 - 1), j = Math.floor(q), u = q - j;
      return 1 + j + ease(clamp((u - WIN[0]) / (WIN[1] - WIN[0]), 0, 1));
    };
    const tOfStop = v => v <= 1 ? (RD.open + RD.from) / 2 : RD.from + (v - 1) / (NS() - 1) * RD.span;          // положение прокрутки (доля пути читалки), где остановка v стоит ровно
    const yOfStop = v => { const b = readerBox(); return Math.round(b.top + b.total * tOfStop(clamp(v, 1, NS()))); };
    const stopOfSpread = v => pm() ? clamp(2 * v - 1, 1, 2 * (N - 1)) : v;                                        // разворот комнаты / оглавления → остановка (на телефоне — левая страница разворота)
    let Q = 1, stopNow = -1;
    function applyQ(v) {
      const M2 = 2 * (N - 1); v = clamp(v, 1, M2); Q = v;
      const j = Math.min(M2, Math.floor(v)), u = j >= M2 ? 0 : v - j;
      let pp, pan;
      if (j % 2 === 1) { pp = (j + 1) / 2; pan = .5 - u; }
      else { pp = j / 2 + u; pan = -.5 + u; }
      setP(pp); if (book) setVar(book, '--bx', pan.toFixed(3));
      const st = Math.round(v);
      if (st !== stopNow) {
        stopNow = st; if (stEl) stEl.textContent = 'Страница ' + (st + 1) + ' из ' + (2 * N - 1);
        if (pvB) pvB.disabled = st <= 1; if (nxB) nxB.disabled = st >= M2; hm.box = null;
        if (entered && stillNow) setTimeout(pageIn, 60);
      }
    }

    /* ---------- пролёт камеры: тот же движок зала, что у героя (js/jar.js, режим data-fly) ----------
       Это не набор картинок: ключевые кадры + карты глубины + дорожка камеры + спрайты баночки; для любого положения прокрутки движок строит вид перепроекцией двух соседних ключей (60 к/с, без «шагов»)
       и рисует поверх живой шар и баночку — тот же свет, фон, тени, зерно и резкость, что на главной. Здесь — только положение (Astreya.flyP) и совмещение нарисованного журнала с живым. */
    const stageEl = $('.hr-stage', reader);
    const jsA = n => { try { return JSON.parse(reader.getAttribute(n)); } catch (e) { return null; } };
    const FLs = reader.hasAttribute('data-fly') ? {F: parseFloat(reader.getAttribute('data-fly-f')) || .3, rect: jsA('data-fly-rect'), rectM: jsA('data-fly-rect-m')} : null;
    const FLd = FLs ? {F: FLs.F, get rect() { return pm() && FLs.rectM ? FLs.rectM : FLs.rect; }} : null;
    let fbox = null, sbox = null, bbox = null;                                  // границы читалки в документе, размер сцены, где стоит живой журнал: меряем при размере окна, в кадре вёрстку не читаем
    const measureFly = () => { fbox = readerBox(); sbox = {w: stageEl.clientWidth, h: stageEl.clientHeight}; bbox = null; fitBook(); };
    const flyLin = t => clamp((t - RD.hold) / (RD.open - RD.hold), 0, 1);       // доля пролёта: 0 — кадр зала, 1 — камера над журналом
    A.flyP = () => {
      if (!FLd || !fbox || pflat() || flat()) return 0;
      const tt = fbox.total > 0 ? clamp((window.pageYOffset - fbox.top) / fbox.total, 0, 1) : 1;
      return flyLin(tt) * FLd.F;                                                // положение на дорожке камеры пролёта (путь 0…1, ключи лежат на его первой части 0…F)
    };
    const bookBox = () => { if (!bbox) { const w = $('.mag-wrap', mag); bbox = {x: w.offsetLeft + book.offsetLeft, y: w.offsetTop + book.offsetTop, w: book.offsetWidth, h: book.offsetHeight}; } return bbox; };
    /* Живой журнал подгоняется под нарисованный (а не наоборот): ширина разворота и положение берутся из рамки журнала в последнем ключе пролёта (house.fly.rect) и размера сцены.
       Слой пролёта при этом не двигается и не масштабируется — раньше его сдвигали и сжимали под живой журнал, и на широком экране по краям открывалась полоса другого цвета, а картинка мылилась от пересэмплирования. */
    function fitBook() {
      if (!FLd || !FLd.rect || !sbox || !sbox.w || pflat() || flat()) return;
      const por = pm(), W = sbox.w, Hh = sbox.h, ww = por ? Math.max(W, Hh * 9 / 16) : Math.max(W, Hh * 16 / 9), wh = por ? ww * 16 / 9 : ww * 9 / 16, r = FLd.rect;
      const cx = W / 2 + ((r[0] + r[2]) / 2 - .5) * ww, cy = Hh / 2 + ((r[1] + r[3]) / 2 - .5) * wh;          // центр нарисованного журнала на экране
      const pw = Math.round((r[2] - r[0]) * ww / 2);                                                          // целое: страницы по целым пикселям, иначе текст пересэмплируется и мылится
      const bxEnd = por ? .5 : 0;                                                                              // телефон: в конце пролёта камера над левой страницей — книга сдвинута вправо на полстраницы
      reader.style.setProperty('--fly-pw', pw + 'px'); reader.style.setProperty('--fly-dx', '0px'); reader.style.setProperty('--fly-dy', '0px'); wrapEl.style.transform = ''; hm.key = ''; hm.box = null;
      const bxPrev = book.style.getPropertyValue('--bx'); book.style.setProperty('--bx', '0');                  // книгу мерим без сдвига к странице (--bx): цель считается для неё же
      const bb = $('.mag-book', mag).getBoundingClientRect(), sb = stageEl.getBoundingClientRect();
      if (bxPrev) book.style.setProperty('--bx', bxPrev); else book.style.removeProperty('--bx');
      const L = Math.round(cx - pw - bxEnd * pw), T = Math.round(cy - bb.height / 2);                          // левый верх книги без сдвига — в целых пикселях сцены (дробный сдвиг слоя = размытый текст)
      reader.style.setProperty('--fly-dx', (L - (bb.left - sb.left)).toFixed(3) + 'px'); reader.style.setProperty('--fly-dy', (T - (bb.top - sb.top)).toFixed(3) + 'px'); bbox = null;
    }
    /* Живой журнал входит в кадр по той же камере, что нарисованный: углы разворота известны в мире (house.fly.book, tools/jar-render/hall_table.py flykeys bookq), движок после каждого кадра
       отдаёт камеру (Astreya.flyOnDraw), страница проецирует углы и ставит журнал проективным преобразованием (matrix3d: гомография прямоугольника книги в четырёхугольник на экране). Журнал
       появляется ещё в полёте (--rb), сначала приглушённый под нарисованный (--bd), и по мере подъезда светлеет и твердеет: рывка от «тусклого и мягкого» к «яркому и чёткому» нет — это один и тот же
       журнал, который просто становится резким. Матрица снимается, когда камера встала (fp ≥ 0,9995): последний шаг — чистая вёрстка по целым пикселям. */
    const BKs = {d: jsA('data-fly-book'), m: jsA('data-fly-book-m')};
    const BK = () => pm() && BKs.m ? BKs.m : BKs.d;                           // углы разворота в мире: ПК и телефон (портретный кадр) — свои
    const BKd = BKs.d;
    const wrapEl = $('.mag-wrap', mag);
    const HOM = {rb: [.46, .6], bd: [.5, .97], bdMax: .30};                       // лин. доля пролёта: журнал появляется / приглушение снимается; наибольшее приглушение
    const hm = {key: '', on: false};
    /* значения читалки (--fu, --ra, --rb, --bd) каждый кадр пишутся прямо в элементы, которые от них зависят (opacity / transform): раньше они лежали на читалке как наследуемые переменные,
       и каждая запись заставляла браузер пересчитывать стили всех элементов журнала (тысячи), причём принудительно — следом шло чтение положения прокрутки. Сами переменные остаются (не наследуются) для отладки и проверок. */
    const RS = {fu: 0, ra: 0, rb: 0, bd: 0}, pv = {fu: '', ra: '', rb: '', bd: '', veil: '', wrap: '', ctl: ''};
    const bgEl = $('.hr-bg', reader), veilEl = $('.hr-veil', reader), ctlEl = $('.mag-ctl', mag), barEl = $('.mag-bar', mag), dimEl = $('.mag-dim', mag);
    function paintReader() {
      const fu = RS.fu.toFixed(4), ra = RS.ra.toFixed(4), rb = RS.rb.toFixed(4), bd = RS.bd.toFixed(4);
      if (pv.fu !== fu) { pv.fu = fu; reader.style.setProperty('--fu', fu); if (bgEl) bgEl.style.transform = 'scale(' + (1 + RS.fu * .55).toFixed(4) + ')'; }
      if (pv.ra !== ra) { pv.ra = ra; reader.style.setProperty('--ra', ra); }
      if (pv.rb !== rb) { pv.rb = rb; reader.style.setProperty('--rb', rb); }
      if (pv.bd !== bd) { pv.bd = bd; reader.style.setProperty('--bd', bd); if (dimEl) dimEl.style.opacity = bd; }
      const vo = (RS.fu * .55 + RS.ra * .30).toFixed(4); if (pv.veil !== vo) { pv.veil = vo; if (veilEl) veilEl.style.opacity = vo; }
      const live = !!(FLd && !pflat() && A.flyDrawn && BK()), wo = (live ? RS.rb : RS.ra).toFixed(4); if (pv.wrap !== wo) { pv.wrap = wo; wrapEl.style.opacity = wo; }
      const co = clamp((RS.ra - .6) * 2.5, 0, 1).toFixed(3); if (pv.ctl !== co) { pv.ctl = co; if (ctlEl) ctlEl.style.opacity = co; if (barEl) barEl.style.opacity = co; }
    }
    function homography(src, dst) {                                               // проективное преобразование 4 точек → 4 точки (метод прямых линейных уравнений, 8×8)
      const A8 = [], b8 = [];
      for (let i = 0; i < 4; i++) {
        const [x, y] = src[i], [u, v] = dst[i];
        A8.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b8.push(u);
        A8.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b8.push(v);
      }
      for (let c = 0; c < 8; c++) {
        let m = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A8[r][c]) > Math.abs(A8[m][c])) m = r;
        [A8[c], A8[m]] = [A8[m], A8[c]]; [b8[c], b8[m]] = [b8[m], b8[c]];
        const d = A8[c][c]; if (Math.abs(d) < 1e-12) return null;
        for (let r = c + 1; r < 8; r++) { const f = A8[r][c] / d; if (!f) continue; for (let k = c; k < 8; k++) A8[r][k] -= f * A8[c][k]; b8[r] -= f * b8[c]; }
      }
      const h = new Array(8);
      for (let r = 7; r >= 0; r--) { let s2 = b8[r]; for (let k = r + 1; k < 8; k++) s2 -= A8[r][k] * h[k]; h[r] = s2 / A8[r][r]; }
      return h;
    }
    A.flyOnDraw = (pc, cam, proj) => {
      const BKd = BK(); if (!BKd || !FLd || !fbox || !sbox || !sbox.w || pflat() || flat()) return;
      if (!A.flyDrawn) { A.flyDrawn = true; if (!gateRaf) gateRaf = requestAnimationFrame(() => { gateRaf = 0; readerUpdate(); }); }          // первый кадр пролёта: герой может гаснуть (flyGate)
      const fp = pc / FLd.F;
      RS.rb = Math.max(fp > .22 ? .002 : 0, clamp((fp - HOM.rb[0]) / (HOM.rb[1] - HOM.rb[0]), 0, 1)); RS.bd = HOM.bdMax * (1 - ease(clamp((fp - HOM.bd[0]) / (HOM.bd[1] - HOM.bd[0]), 0, 1))); paintReader();
      /* слой книги поднимается (will-change) на ровном месте, до первой матрицы, и снимается на последнем шаге: пока подсказка стоит, Chrome не пересчитывает масштаб растра — слой, впервые нарисованный уменьшенным, остался бы мягким и в покое;
         после снятия он растеризуется заново в натуральную величину (резкий текст) */
      if (fp > .2 && fp < .9995 && !hm.wc) { hm.wc = true; wrapEl.style.willChange = 'transform'; }
      if (fp < HOM.rb[0] - .02 || fp > .9995) { if (hm.key) { wrapEl.style.transform = ''; hm.key = ''; } if (hm.wc && (fp > .9995 || fp < .2)) { hm.wc = false; wrapEl.style.willChange = ''; } return; }
      const por = pm(), W = sbox.w, Hh = sbox.h, ww = por ? Math.max(W, Hh * 9 / 16) : Math.max(W, Hh * 16 / 9), wh = por ? ww * 16 / 9 : ww * 9 / 16;
      const yaw = BKd.yaw * Math.PI / 180, ux = Math.cos(yaw), uy = Math.sin(yaw), vx = -uy, vy = ux, hw = BKd.pw, hh = BKd.ph / 2, c = BKd.c;
      const P = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(q => {                                                // левый верх, правый верх, правый низ, левый низ разворота (верх страницы — «вдаль»)
        const o = proj(cam, [c[0] + q[0] * hw * ux + q[1] * hh * vx, c[1] + q[0] * hw * uy + q[1] * hh * vy, BKd.z]);
        return [W / 2 + (o.u - .5) * ww, Hh / 2 + (o.v - .5) * wh];
      });
      if (!hm.box) {                                                                                             // прямоугольник книги в слое (без преобразования) и положение слоя в сцене: меряем один раз на размер окна, в кадре вёрстку не читаем
        wrapEl.style.transform = ''; const w2 = wrapEl.getBoundingClientRect(), b2 = $('.mag-book', mag).getBoundingClientRect(), sr = stageEl.getBoundingClientRect();
        hm.box = {ox: b2.left - w2.left, oy: b2.top - w2.top, bw: b2.width, bh: b2.height, wx: w2.left - sr.left, wy: w2.top - sr.top};
      }
      const B = hm.box, src = [[B.ox, B.oy], [B.ox + B.bw, B.oy], [B.ox + B.bw, B.oy + B.bh], [B.ox, B.oy + B.bh]];
      /* живая книга чуть больше нарисованной (≈ 1 %: так под ней не виден нарисованный край). Раньше матрицу снимали рывком на последнем шаге — книга «щёлкала» на 5 px;
         теперь к концу цель плавно переходит от нарисованных углов к реальной раскладке, и снятие матрицы (тождественной) незаметно */
      const kd = ease(clamp((fp - .80) / (.9995 - .80), 0, 1)), dst = P.map((q, i) => [(q[0] - B.wx) * (1 - kd) + src[i][0] * kd, (q[1] - B.wy) * (1 - kd) + src[i][1] * kd]);
      const h = homography(src, dst); if (!h) return;
      const m = [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, 1].map(v => +v.toFixed(7)).join(',');
      if (m !== hm.key) { hm.key = m; wrapEl.style.willChange = 'transform'; wrapEl.style.transform = 'matrix3d(' + m + ')'; }
    };
    /* ?flydebug в адресе — в углу экрана состояние пролёта (для разбора, если у кого-то вместо пролёта запасной «наезд») */
    if (FLd && /flydebug/.test(location.search + location.hash)) {
      const dbg = document.createElement('pre'); dbg.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;margin:0;padding:8px 10px;background:rgba(0,0,0,.78);color:#9f9;font:11px/1.35 monospace;max-width:92vw;white-space:pre-wrap;pointer-events:none'; document.body.appendChild(dbg);
      const iv = setInterval(() => { if (!dbg.isConnected) { clearInterval(iv); return; } const f = A.jar && A.jar.fly, st = f && f.state && f.state(), h = A.jar && A.jar.arch && A.jar.arch.state && A.jar.arch.state();
        dbg.textContent = 'пролёт: ' + (f ? (st && st.gl !== undefined ? 'движок есть' : 'мёртв') : 'нет экземпляра') + (reader.getAttribute('data-fly-why') ? ' — причина: ' + reader.getAttribute('data-fly-why') : '') + '\n' + (st && st.N ? 'ключей ' + st.loaded + '/' + st.N + ', в видеопамяти ' + st.resident + ', gl=' + st.gl + ', нарисован=' + !!st.firstDrawn + ', p=' + st.p.toFixed(3) + ', баночка=' + !!(st.jar && st.jar.shown) : '') + '\n' + 'warm=' + !!A.flyWarm + ' ready=' + reader.classList.contains('ready') + ' live=' + reader.classList.contains('is-live') + ' t=' + readerT().toFixed(3) + '\n' + 'герой: ' + (h && h.N ? h.loaded + '/' + h.N : '—') + ' | окно ' + innerWidth + '×' + innerHeight + ' dpr ' + devicePixelRatio; }, 300);
    }

    /* ключи пролёта грузим заранее и не ждём героя: пролёт нужен сразу, как только страница доехала до читалки (если ключей ещё нет, остаётся запасной «наезд» на постер — это худший случай, а не норма).
       Старт — через 3 с после загрузки страницы (после вступления заставки: компиляция шейдеров второй сцены не должна рвать её анимацию), но раньше, если страницу уже прокручивают к концу героя */
    let warmN = 0;
    function warmFly() {
      if (!FLd || A.flyWarm) return;
      const f = A.jar && A.jar.fly;
      if (!f) { if (warmN++ < 60) setTimeout(warmFly, 300); return; }
      A.flyWarm = true; f.warm();
    }

    const lv = {live: null, gone: null, hf: '', hy: ''};
    function setLive(live, hf) {                                               // герой и журнал — одна сцена (css/house.css, 3б): читалка встаёт на тот же экран под героем, холсты героя гаснут
      if (lv.live !== live) { if (lv.live && !live) A.sphereHold = true; lv.live = live; reader.classList.toggle('is-live', live); story.classList.toggle('rd-live', live); document.body.classList.toggle('house-reading', live); }          // пока журнал в сцене, верхней панели нет (и при прокрутке вверх она не выезжает)
      const hfs = hf.toFixed(3), gone = live && hf >= .985, hys = (live ? Math.max(0, Math.min(window.innerHeight * 1.2, window.pageYOffset - rbx().top - heroTail())) : 0).toFixed(1) + 'px';
      if (lv.hf !== hfs) { lv.hf = hfs; story.style.setProperty('--hf', hfs); }
      if (lv.gone !== gone) {
        lv.gone = gone; story.classList.toggle('rd-gone', gone);
        if (pm()) { const h = A.jar && A.jar.arch; if (h && !h.fly && h.lowOnly) h.lowOnly(gone); }          // телефон: герой погас — его полные кадры и спрайты баночки не нужны, видеопамять отдаём журналу (вернулись к герою — разворачиваются снова)
      }
      if (lv.hy !== hys && (live || lv.hy !== '0.0px')) { lv.hy = hys; story.style.setProperty('--hy', hys); }          // холсты героя стоят на месте, пока гаснут: сцена уезжает вверх, а они — вниз на столько же (в журнале, когда героя не видно, не пишем: это пересчёт стилей всей сцены героя)
    }
    /* Герой гаснет над кадром пролёта, только когда пролёт уже нарисовал первый кадр: иначе под гаснущим героем пустой фон страницы («смывание» перед пролётом на медленном телефоне).
       Пока не нарисовал — герой стоит как был; нарисовал — затухание включается за 0,28 с, а не скачком */
    let flyAt = 0, gateRaf = 0;
    function flyGate() {
      if (!FLd || pflat() || reader.classList.contains('jar-off') || A.lite) return 1;
      if (!A.flyDrawn) return 0;
      if (!flyAt) flyAt = performance.now();
      return clamp((performance.now() - flyAt) / 280, 0, 1);
    }
    /* телефон: видеопамять отдаётся тому, чем сейчас не пользуются (js/jar.js → trim): герой — пока он погас, пролёт — пока журнал открыт и камера далеко от кадров пролёта; возвращаются они заранее */
    const tr = {hero: false, fly: false, heroEver: false};
    function trimEngines(t) {
      if (!pm()) return;
      const j = A.jar, h = j && j.arch, f = j && j.fly;
      const wantH = tr.hero ? t >= RD.open - .06 : t >= RD.open + .02,                      // герой: отдаём память, когда пролёт закончился; возвращаем за ≈ 1800 px до экрана героя (разворачивается ~1–2 с)
            wantF = tr.fly ? t >= RD.open + .08 : t >= RD.open + .14;                         // пролёт: отдаём на 5–6-й странице; возвращаем на 3-й (кадры пролёта нужны, как только листают назад)
      if (h && h.trim && !h.fly && wantH !== tr.hero) { tr.hero = wantH; if (wantH) tr.heroEver = true; h.trim(wantH); }
      if (f && f.trim && wantF !== tr.fly) { tr.fly = wantF; f.trim(wantF); }
    }
    function readerUpdate() {
      if (flat()) { reader.classList.add('is-flat'); RS.fu = RS.ra = RS.rb = 1; RS.bd = 0; paintReader(); setLive(false, 0); if (s === 0 && p === 0) render(1, {instant: true, noScroll: true}); return; }
      reader.classList.remove('is-flat');
      const rb0 = rbx(), rrTop = rb0.top - window.pageYOffset, t = readerT();
      if (!fbox || Math.abs(rb0.top - fbox.top) > 2) measureFly();
      const lin = flyLin(t), fu = pflat() ? ease(clamp(t / .5, 0, 1)) : lin;                  // запасная лента телефона: журнал встаёт без пролёта, как раньше
      const ra = pflat() ? clamp((fu - .86) / .14, 0, 1) : clamp((lin - RD.fade[0]) / (RD.fade[1] - RD.fade[0]), 0, 1);
      if (!A.flyWarm && (t > 0 || window.pageYOffset > fbox.top * (pm() ? .1 : .4))) warmFly();                  // подъезжаем к концу героя — пролёт начинает грузиться сразу
      if (pflat()) { setLive(false, 0); const hid = rrTop < 4 && rrTop + rb0.total + window.innerHeight > window.innerHeight * .4; if (hid !== lv.phoneHide) { lv.phoneHide = hid; document.body.classList.toggle('house-reading', hid); } } else { /* после возврата из журнала герой появляется, только когда его кадры снова развёрнуты */ const gt = flyGate(), hh = A.jar && A.jar.arch, heroWait = tr.heroEver && hh && hh.ready && !hh.ready(); setLive(rrTop < -1, heroWait ? 1 : ease(clamp(t / RD.hold, 0, 1)) * gt); if (gt < 1 && gt > 0 && !gateRaf) gateRaf = requestAnimationFrame(() => { gateRaf = 0; readerUpdate(); }); trimEngines(t); }
      RS.fu = fu; RS.ra = ra;
      if (FLd && !pflat()) {                                                                    // живой журнал входит в полёте: прозрачность и приглушение под нарисованный (если движок не рисует — как раньше, от --ra)
        if (!(A.flyDrawn && BK())) { RS.rb = ra; RS.bd = 0; }              // движок не рисует (нет WebGL2/ключей): журнал проявляется как раньше; иначе --rb и --bd ведёт сам кадр (flyOnDraw), чтобы прозрачность была привязана к той позиции камеры, где журнал стоит на самом деле
      }
      paintReader();
      if (!pflat()) { const openNow = t >= RD.open - .001; if (openNow !== entered) { entered = openNow; if (entered) setTimeout(pageIn, 140); } }
      if (pflat()) { const target = ra > .94 ? Math.max(s, 1) : 0; if (target !== s && !(s > 0 && target > 0)) render(target, {noScroll: target === 0, instant: true}); return; }
      if (pm()) applyQ(holdQ !== null ? holdQ : qPm(t)); else setP(holdP !== null ? holdP : pOf(t));                                    // «На главную»: пока камера едет назад, журнал остаётся на развороте, где остановился читатель
    }

    /* ---------- автоматический плавный ход страницы: клик по «Откройте журнал», «Далее/Назад», оглавление, список разделов.
       Страницу ведёт одна кривая (rAF, по реальному времени кадра), журнал и камера считаются от прокрутки так же, как при колесе, — лист поворачивается тем же способом ---------- */
    let glideRaf = 0, goal = null, homing = false;
    const eIO = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;           // долгий ход: мягкий старт и мягкая остановка
    const eSoft = x => .5 * x + .5 * x * x * (3 - 2 * x);                                // листание: почти равномерно — лист успевает повернуться на виду
    const glideStop = () => { if (glideRaf) { cancelAnimationFrame(glideRaf); glideRaf = 0; } goal = null; homing = false; releaseHold(); navStop(); };
    function releaseHold() {                                                   // конец/обрыв возврата: если страница осталась в зоне журнала — ставим её на разворот, который показан, чтобы листы не перескочили
      if (holdP === null && holdQ === null) return;
      if (holdQ !== null) { const v = Math.round(holdQ); holdQ = null; if (!flat() && pm() && reader.classList.contains('is-live') && readerT() >= RD.from - .002) jump(yOfStop(v)); return; }
      const v = Math.round(holdP); holdP = null;
      if (!flat() && !phone() && reader.classList.contains('is-live') && readerT() >= RD.from - .002) { const b = readerBox(); jump(b.top + b.total * (RD.from + (clamp(v, 1, N - 1) - 1) / (N - 2) * RD.span)); }
    }
    function glide(y, g, o) {
      if ((holdP !== null || holdQ !== null) && !(o && o.home)) releaseHold();                    // другой ход (Далее/Назад, оглавление) — журнал снова идёт за прокруткой
      const mx = Math.max(0, document.documentElement.scrollHeight - window.innerHeight); y = Math.round(clamp(y, 0, mx));
      const y0 = window.pageYOffset, dist = y - y0; if (glideRaf) { cancelAnimationFrame(glideRaf); glideRaf = 0; } navStop();
      if (Math.abs(dist) < 2) { goal = null; return; }
      const far = Math.abs(dist) > window.innerHeight * 1.2, dur = o && o.dur ? o.dur : clamp(1050 + Math.abs(dist) / window.innerHeight * 330, 1200, 4200), ease = o && o.ease ? o.ease : far ? eIO : eSoft; let t0 = 0;
      goal = g === undefined ? null : g;
      const frame = ts => {
        if (!t0) t0 = ts; const k = clamp((ts - t0) / dur, 0, 1);
        window.scrollTo({top: y0 + dist * ease(k), behavior: 'instant'}); readerUpdate();
        if (k < 1) glideRaf = requestAnimationFrame(frame); else { glideRaf = 0; goal = null; homing = false; releaseHold(); window.scrollTo({top: y, behavior: 'instant'}); readerUpdate(); }
      };
      glideRaf = requestAnimationFrame(frame);
    }
    /* в самое начало страницы (герой с баночкой): кнопка «В начало» и быстрая серия прокруток вверх. Ход один, плавный (косинусная кривая), 4,5–8,5 с: камера пролёта и герой едут назад на виду; пока идёт, колесо вверх его не обрывает */
    /* «На главную»: к экрану героя с заголовком (последний экран сцены героя). Журнал остаётся на том развороте, где остановился читатель (страницы не листаются ни вперёд, ни назад, и на первый
       не перекидывает): камера едет назад к залу одним ходом (2,6–5 с, косинусная кривая), живой журнал к концу пролёта сменяется нарисованным, как при входе */
    const homeY = () => { const a = $('#arch-story'); const hy = a ? Math.round(a.getBoundingClientRect().top + window.pageYOffset + a.offsetHeight - stageH(a) - heroTail()) : 0; return Math.max(0, Math.min(hy, Math.round(readerBox().top))); };
    function home(via) {
      glideStop(); if (A.motion && A.motion.cancelSmooth) A.motion.cancelSmooth();
      track('house_magazine_home', {via: via || 'button'});
      const yh = homeY(), y0 = window.pageYOffset, vh = window.innerHeight;
      if (!flat() && reader.classList.contains('is-live') && readerT() >= RD.from - .002) { if (pm()) holdQ = Math.round(Q); else if (!phone()) holdP = Math.round(p); }
      homing = true;
      glide(yh, null, {home: true, dur: clamp(1000 + Math.abs(y0 - yh) / vh * 170, 1400, 2400), ease: x => .5 - .5 * Math.cos(Math.PI * x)});          // возврат быстрый: 1,4–2,4 с (раньше 2,6–5 с); косинусная кривая — мягкий старт и остановка
      if (!glideRaf) { homing = false; releaseHold(); }
    }
    on(window, 'wheel', e => { if (!e.__houseStep) glideStop(); }, {passive: true});          // хвост того же размаха колеса возврат не обрывает, а новое движение рукой (через ≈ 1 с) — обрывает: управление всегда возвращается               // рука на колесе — автоход уступает (кроме колеса, которым листают журнал: оно само запускает следующий ход)
    on(window, 'touchstart', glideStop, {passive: true});
    /* колесо в журнале ведёт листы вслед за рукой: скорость листания равна скорости прокрутки — медленно крутишь, лист поворачивается медленно, быстро — быстро. Прокрутка колеса переводится в «развороты»
       (≈ 150 пикселей колеса — один разворот), а страницу ведёт пружина с критическим затуханием по реальному времени кадра (60 fps): за один щелчок колеса — один разворот, за быстрый взмах — несколько. Рука остановилась —
       через 140 мс цель встаёт на ближайший разворот и лист доворачивается сам. Край журнала (первый/последний разворот) колесо не перехватывает: вверх идёт обратный пролёт камеры, вниз — прокрутка к подвалу.
       До журнала и на телефоне — обычная прокрутка */
    /* Листание колесом — то же движение, что при нажатии «Далее»/«Назад» (glide: тот же ход, та же длительность, не быстрее и не медленнее): один жест колеса — один разворот.
       Жест — серия событий с паузами меньше 130 мс (щелчки подряд, инерция трекпада); пока лист идёт, события колеса гасятся; следующий разворот — после паузы в 130 мс и после остановки листа.
       Край журнала (первый разворот вверх, последний вниз) колесо не перехватывает. */
    const GESTURE_GAP = 130;
    const wg = {t: 0, fired: false};
    const navStop = () => {};
    on(window, 'wheel', e => {
      if (e.ctrlKey || e.defaultPrevented || flat() || phone() || !reader.classList.contains('is-live') || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (e.target.closest && e.target.closest('.mp-chat')) return;                // над чатом Стеллы колесо принадлежит переписке (js ниже: плавная прокрутка), журнал не листается — даже у края переписки
      const t = readerT(); if (t < RD.open - .002 || t > RD.from + RD.span + .02) return;
      let dy = e.deltaY; if (e.deltaMode === 1) dy *= 34; else if (e.deltaMode === 2) dy *= window.innerHeight;
      if (Math.abs(dy) < 3) return;                                              // хвост инерции трекпада — шум
      const dir = dy > 0 ? 1 : -1, base = goal !== null ? goal : s;
      if ((dir > 0 && base >= N - 1) || (dir < 0 && base <= 1)) return;          // край журнала — обычная прокрутка (вверх с первого разворота — назад к пролёту камеры)
      e.preventDefault(); e.__houseStep = true;
      if (A.motion && A.motion.cancelSmooth) A.motion.cancelSmooth();
      const now = performance.now();
      if (now - wg.t > GESTURE_GAP) wg.fired = false; wg.t = now;
      if (wg.fired || glideRaf) return;                                          // этот жест уже листнул разворот / лист ещё идёт
      wg.fired = true; step(dir);
    }, {passive: false, capture: true});

    on(window, 'keydown', e => { if (glideRaf && /^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(e.key) && !(e.target && e.target.closest && e.target.closest('#mag'))) glideStop(); });
    on(window, 'pointerdown', e => { if (e.target === document.documentElement) glideStop(); });         // полоса прокрутки

    function toState(v, o) {                                                   // вести страницу так, чтобы журнал встал на разворот v
      v = clamp(v, 1, NS()); const y = yOfStop(v);
      if ((o && o.instant) || reduce()) { glideStop(); jump(y); readerUpdate(); return; }
      glide(y, v);
    }
    const step = d => { const base = goal !== null ? goal : (pm() ? Math.round(Q) : s); track('house_magazine_flip', {page: base + d}); if (flat() || pflat()) render(s + d); else toState(base + d); };

    function go(id, o) {                                                       // к развороту комнаты: те же адреса #room-…, что и раньше
      o = o || {}; const v = stateOfRoom(id);
      if (flat() || pflat()) { jump(readerBox().top); render(v, {instant: true}); } else toState(stopOfSpread(v), {instant: o.instant});
      if (!o.fromHash) { try { history.replaceState(history.state, '', '#room-' + id); } catch (e) {} }
      track('house_room', {room: id, via: o.via || 'link'});
    }
    function hall(o) {
      o = o || {};
      glideStop(); jump(hallY());
      const f = $('.mag-prev'); if (f) setTimeout(() => { try { f.focus({preventScroll: true}); } catch (e) {} }, 60);
      if (!o.fromHash) { try { history.replaceState(history.state, '', '#hall'); } catch (e) {} }
      track('house_hall', {via: o.via || 'link'});
    }

    let ticking = false, snapT = 0, sdir = 0, sY = window.pageYOffset;
    function onScroll() {
      const yy = window.pageYOffset; if (Math.abs(yy - sY) > 1) sdir = yy > sY ? 1 : -1; sY = yy;
      if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; readerUpdate(); }); }
      clearTimeout(snapT); snapT = setTimeout(snapCheck, 170);
    }
    /* прокрутка остановилась посередине поворота (инерция колеса, полоса прокрутки, клавиши) — лист доворачивается до ближайшего разворота сам, как при «Далее»: страница не «застревает» на полустранице */
    function snapCheck() {
      if (glideRaf || window.__HOUSE_SNAP === false || flat() || pflat() || !reader.classList.contains('is-live')) return;          // __HOUSE_SNAP === false — только для проверок точных промежуточных положений
      const t = readerT(); if (t < RD.from - .005 || t > RD.from + RD.span + .005) return;
      const cq = pm() ? Q : p;
      const v = clamp(sdir > 0 ? Math.ceil(cq - .03) : sdir < 0 ? Math.floor(cq + .03) : Math.round(cq), 1, NS());          // листок, оставленный посреди поворота (полоса прокрутки, клавиши), доворачивается туда, куда его вели, а не к ближайшему: назад он не уходит
      if (Math.abs(cq - v) > .03) toState(v);
    }
    on(window, 'scroll', onScroll, {passive: true}); on(window, 'resize', () => { fbox = null; onScroll(); }, {passive: true});

    /* ---------- события: клики, клавиатура, свайп ---------- */
    on(document, 'click', e => {
      const t = e.target.closest && e.target.closest('[data-house-go],[data-house-mag],[data-mag-page],[data-mag-step],[data-mag-home]'); if (!t) return;
      if (t.hasAttribute('data-mag-step')) { e.preventDefault(); step(parseInt(t.getAttribute('data-mag-step'), 10)); return; }
      if (t.hasAttribute('data-mag-home')) { e.preventDefault(); home('button'); return; }
      if (t.hasAttribute('data-mag-page')) { e.preventDefault(); const v = parseInt(t.getAttribute('data-mag-page'), 10); track('house_magazine_toc', {page: v}); if (flat() || pflat()) render(v); else toState(stopOfSpread(v)); return; }
      if (t.hasAttribute('data-house-go')) { e.preventDefault(); go(t.getAttribute('data-house-go'), {via: t.closest('.hall-rooms') ? 'hall-list' : 'link'}); return; }
      if (t.hasAttribute('data-house-mag')) {                                                  // журнал на столике: сцена «подъезжает» к нему и раскрывает
        e.preventDefault(); track('house_magazine_open', {from: t.getAttribute('data-from') || 'table', page: 1});
        if (flat()) { jump(readerBox().top); render(1, {instant: true, noScroll: true}); } else if (pflat()) { jump(readerBox().top + readerBox().total * .6); } else toState(1);          // ПК: камера сама плавно летит к журналу
      }
    });
    on(mag, 'keydown', e => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); step(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); step(-1); }
      else if (e.key === 'Home') { e.preventDefault(); if (flat() || pflat()) render(0); else toState(1); }
      else if (e.key === 'End') { e.preventDefault(); if (flat() || pflat()) render(N - 1); else toState(NS()); }
    });
    if (book) {
      let x0 = null, y0 = 0, t0 = 0;
      book.addEventListener('pointerdown', e => { if (phone()) return; x0 = e.clientX; y0 = e.clientY; t0 = Date.now(); });
      book.addEventListener('pointerup', e => {
        if (phone() || x0 === null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) { step(dx < 0 ? 1 : -1); return; }       // протяжка мышью
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8 && Date.now() - t0 < 600 && !(e.target.closest && e.target.closest('a,button'))) {       // клик по краю страницы
          const b = book.getBoundingClientRect(), x = (e.clientX - b.left) / b.width;
          if (x > 0.7 && s < N - 1) step(1); else if (x < 0.3 && s > 0) step(-1);
        }
      });
      book.addEventListener('pointermove', e => {
        if (phone()) return; const b = book.getBoundingClientRect(), x = (e.clientX - b.left) / b.width;
        book.setAttribute('data-hover', x > 0.7 && s < N - 1 ? 'r' : x < 0.3 && s > 0 ? 'l' : '');
      });
      book.addEventListener('pointerleave', () => book.removeAttribute('data-hover'));
      /* телефон (журнал на сцене, pm): горизонтальный свайп листает страницы, как у настоящего журнала (влево — дальше, вправо — назад); вертикальная прокрутка остаётся прокруткой.
         От самой левой кромки экрана свайп не берём — это системный жест «назад» браузера */
      let tx = null, ty = 0, tt = 0;
      mag.addEventListener('touchstart', e => { if (!pm() || e.touches.length !== 1) { tx = null; return; } const t0 = e.touches[0]; tx = t0.clientX > 24 ? t0.clientX : null; ty = t0.clientY; tt = Date.now(); }, {passive: true});
      mag.addEventListener('touchend', e => {
        if (tx === null || !pm()) return; const t1 = e.changedTouches[0], dx = t1.clientX - tx, dy = t1.clientY - ty; tx = null;
        if (Date.now() - tt < 900 && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5 && !(e.target.closest && e.target.closest('.mp-chat-log, input, textarea'))) step(dx < 0 ? 1 : -1);
      }, {passive: true});
      if (scroller) {                                                   // телефон: свайп — это прокрутка ленты страниц; номер страницы следует за ней
        let st = 0;
        scroller.addEventListener('scroll', () => {
          if (!pflat()) return; clearTimeout(st);
          st = setTimeout(() => { const q = Math.round(scroller.scrollLeft / Math.max(1, scroller.clientWidth)), v = q === 0 ? 0 : Math.ceil(q / 2); if (v !== s) render(v, {noScroll: true}); }, 90);
        }, {passive: true});
      }
    }

    /* ---------- адрес: #room-…, #hall, #magazine/N и прежние якоря ---------- */
    function applyHash(initial) {
      const h = decodeURIComponent((location.hash || '').replace(/^#/, ''));
      if (!h) return;
      if (h === 'hall') { hall({fromHash: true}); return; }
      let m = /^room-([a-z]+)$/.exec(h);
      if (m && ids.indexOf(m[1]) >= 0) { go(m[1], {fromHash: true, instant: initial, via: 'url'}); return; }
      m = /^magazine(?:\/(\d+))?$/.exec(h);
      if (m) { const v = m[1] === undefined ? 1 : parseInt(m[1], 10); if (flat() || pflat()) { jump(readerBox().top); render(v, {instant: true}); } else toState(stopOfSpread(v), {instant: initial}); return; }
      if (LEGACY[h]) go(LEGACY[h], {fromHash: true, instant: true, via: 'anchor'});
    }
    on(window, 'popstate', () => applyHash(false));
    if (location.hash) { const run = () => setTimeout(() => applyHash(true), 350); if (document.readyState === 'complete') run(); else on(window, 'load', run, {once: true}); }
    /* фото страниц журнала лениво не ждём: к моменту первого поворота они загружены и разобраны (иначе лист при быстром листании «моргает» пустой страницей) */
    const warm = () => pm() ? undefined : $$('img', mag).forEach(im => { try { im.loading = 'eager'; if (im.decode) im.decode().catch(() => {}); } catch (e) {} });
    if ('requestIdleCallback' in window) setTimeout(() => requestIdleCallback(warm, {timeout: 4000}), 2500); else setTimeout(warm, 3500);
    mag.removeAttribute('hidden');
    if (pflat() || flat()) { setS(0); setP(0); } else if (pm()) applyQ(1); else setP(1);
    readerUpdate(); setTimeout(warmFly, pm() ? 2200 : 3000);
    on(window, 'load', () => { bbox = null; measureFly(); }, {once: true});

    /* маскот Стеллы на страницах журнала: тот самый, что на кнопке чата и в окне диалога (js/assistant.js → Astreya.pearl; градиенты — #pe-defs, анимация моргания — css/extras.css) */
    function paintPearls() {
      if (!A.pearl) return;
      $$('.mp-pe[data-pe]', mag).forEach(el => { if (el.getAttribute('data-done')) return; el.setAttribute('data-done', '1'); el.innerHTML = A.pearl(el.getAttribute('data-pe') || 'idle', true, ''); });
    }
    paintPearls(); on(window, 'load', paintPearls, {once: true});

    /* ---------- чат Стеллы на развороте 12–13: оживает и отвечает по-настоящему ----------
       Тот же «мозг», что в окне чата (Astreya.assistant.session): ответ собирается из каталога сайта, разговор помнит предыдущие вопросы (уточнения вроде «Почему именно эти?» понятны).
       При входе на разворот переписка «проигрывается» (сообщения появляются по очереди, перед ответом — точки набора, маскот «думает» и «говорит»); дальше — подсказки-кнопки и поле ввода.
       Нет ассистента — кнопки и поле открывают настоящее окно чата (Astreya.stella.ask). Без JS остаётся готовая переписка. Реплики из данных не подменяются: первые два ответа — настоящие ответы помощника (проверяет tools/check-house.js) */
    const esc = t => String(t).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    chat = (() => {
      const el = $('.mp-chat', mag); if (!el) return null;
      const log = $('.mp-chat-log', el), live = $('.mp-chat-live', el), chipsEl = $('.mp-chat-chips', el), form = $('.mp-chat-in', el), inp = $('input', form), tpl = $('.mp-tpl-go', el);
      const goHTML = tpl ? tpl.innerHTML : '';
      let sess = null, busy = false, touched = false, tms = [], typ = null;
      const at = (ms, f) => { tms.push(setTimeout(f, ms)); };
      const top = () => $('.mp-chat-top .pe', el);
      const mood = m => { const pe = top(); if (pe) pe.setAttribute('data-m', m); };
      const pearlHTML = () => '<span class="mp-pe" data-pe="idle" data-done="1">' + (A.pearl ? A.pearl('idle', true, '') : ($('.mp-av .mp-pe', el) || {innerHTML: ''}).innerHTML) + '</span>';
      const bottom = (smooth) => { log.scrollTo({top: log.scrollHeight, behavior: smooth === false ? 'instant' : 'smooth'}); };
      const shade = () => log.classList.toggle('is-sc', log.scrollTop > 4);
      on(log, 'scroll', shade, {passive: true});
      const typing = on_ => {
        if (typ) { typ.remove(); typ = null; }
        if (!on_) return;
        typ = document.createElement('div'); typ.className = 'mp-m mp-s mp-typing mp-new'; typ.setAttribute('aria-hidden', 'true');
        typ.innerHTML = '<span class="mp-av">' + pearlHTML() + '</span><div><i></i><i></i><i></i></div>';
        const pe = $('.pe', typ); if (pe) pe.setAttribute('data-m', 'think');
        log.appendChild(typ); bottom();
      };
      const cut = () => { while (log.children.length > 16) { const f = log.firstElementChild; if (f === typ) break; f.remove(); } };
      const userEl = q => { const m = document.createElement('div'); m.className = 'mp-m mp-u mp-new'; const p = document.createElement('p'); p.textContent = q; m.appendChild(p); return m; };
      const botEl = r => {
        const m = document.createElement('div'); m.className = 'mp-m mp-s mp-new';
        let h = '<span class="mp-av">' + pearlHTML() + '</span><div>' + (r.html || '') + (r.html2 || '');
        r.cards.slice(0, 2).forEach(c => { h += '<a class="mp-pc" href="' + esc(c.url) + '" data-track="house_magazine_product" data-product="' + esc(c.id) + '"><span class="mp-pk">' + (c.im ? '<img src="' + esc(c.im) + '" alt="" loading="lazy" decoding="async">' : '') + '</span><span><em class="mp-bn">' + esc(c.brand) + '</em><strong>' + esc(c.name) + '</strong></span>' + goHTML + '</a>'; });
        r.links.slice(0, 2).forEach(l => { h += '<a class="mp-pl" href="' + esc(l.h) + '" data-track="house_magazine_page" data-room="stella">' + esc(l.l) + goHTML + '</a>'; });
        r.actions.filter(a => a.act === 'form').slice(0, 1).forEach(a => { h += '<button type="button" class="mp-act" data-act="form" data-type="' + esc(a.type) + '"' + (a.ref ? ' data-ref="' + esc(a.ref) + '"' : '') + ' data-track="house_magazine_stella">' + esc(a.l) + '</button>'; });
        m.innerHTML = h + '</div>'; return m;
      };
      let chipList = null;
      const setChips = list => {                                                 // подсказки: сколько влезает в одну строку
        chipList = list; chipsEl.textContent = '';
        (list || []).slice(0, 5).forEach(q => { const b = document.createElement('button'); b.type = 'button'; b.className = 'mp-chip'; b.setAttribute('data-q', q.q || q); b.textContent = q.l || q; chipsEl.appendChild(b); });
        let guard = 8; while (guard-- && chipsEl.scrollWidth > chipsEl.clientWidth + 1 && chipsEl.children.length > 1) chipsEl.lastElementChild.remove();
      };
      const initial = $$('.mp-chip', chipsEl).map(b => ({l: b.textContent, q: b.getAttribute('data-q')}));
      const finish = () => { tms.forEach(clearTimeout); tms = []; typing(false); $$('.mp-hid', log).forEach(m => m.classList.remove('mp-hid')); busy = false; form.classList.remove('is-busy'); mood('idle'); };
      function ask(q) {
        q = String(q || '').trim(); if (!q || busy) return;
        if (!(A.assistant && A.assistant.session)) { if (A.stella && A.stella.ask) A.stella.ask(q); return; }
        if (!touched) { touched = true; finish(); }
        track('house_magazine_stella_ask', {len: q.length}); busy = true; form.classList.add('is-busy'); inp.value = '';
        log.appendChild(userEl(q)); cut(); bottom(); mood('think');
        let res = null; try { sess = sess || A.assistant.session(); res = sess.ask(q); } catch (e) { res = null; }
        if (!res) { busy = false; form.classList.remove('is-busy'); mood('idle'); if (A.stella && A.stella.ask) A.stella.ask(q); return; }
        at(300, () => typing(true));
        at(800 + Math.min(700, res.text.length * 2.5), () => { typing(false); log.appendChild(botEl(res)); cut(); bottom(); mood('talk'); setChips(res.chips); });
        at(1300 + Math.min(700, res.text.length * 2.5), () => { busy = false; form.classList.remove('is-busy'); mood('happy'); at(1400, () => mood('idle')); });
      }
      /* колесо над чатом: область «залочена» — прокручивается только переписка, и плавно (пружина с критическим затуханием, как у страницы в js/motion.js); журнал не листается */
      let wt = 0, wc = 0, wv = 0, wr = 0, wl = 0;
      const wmax = () => Math.max(0, log.scrollHeight - log.clientHeight);
      const wstep = ts => {
        const dt = wl ? Math.min(.05, Math.max(.004, (ts - wl) / 1000)) : .0167; wl = ts;
        const e = Math.exp(-11 * dt), d = wc - wt, c = wv + 11 * d; wc = wt + (d + c * dt) * e; wv = (wv - 11 * c * dt) * e;
        if (Math.abs(wt - wc) < .4 && Math.abs(wv) < 4) { wc = wt; wv = 0; wr = 0; wl = 0; } else wr = requestAnimationFrame(wstep);
        log.scrollTop = wc;
      };
      on(el, 'wheel', e => {
        if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        e.preventDefault(); if (A.motion && A.motion.cancelSmooth) A.motion.cancelSmooth();
        let dy = e.deltaY; if (e.deltaMode === 1) dy *= 34; else if (e.deltaMode === 2) dy *= log.clientHeight;
        if (!wr) { wc = wt = log.scrollTop; wv = 0; }
        if (dy * wv < 0) wv = 0;
        wt = clamp(wt + dy, 0, wmax()); if (!wr) wr = requestAnimationFrame(wstep);
      }, {passive: false});
      on(form, 'submit', e => { e.preventDefault(); ask(inp.value); });
      on(chipsEl, 'click', e => { const b = e.target.closest && e.target.closest('.mp-chip'); if (b) ask(b.getAttribute('data-q')); });
      live.hidden = false; setChips(initial);
      /* проигрывание: все реплики прячутся и появляются по очереди; если пользователь уже спрашивал сам — переписку не трогаем */
      function play() {
        if (touched) return; finish();
        const msgs = $$('.mp-m', log); msgs.forEach(m => m.classList.add('mp-hid')); log.scrollTop = 0; busy = true; form.classList.add('is-busy'); mood('idle');
        let t = 380;
        msgs.forEach(m => {
          const bot = m.classList.contains('mp-s'), len = m.textContent.length;
          if (bot) { at(t, () => { typing(true); mood('think'); }); t += 500 + Math.min(700, len * 2.5); at(t, () => { typing(false); m.classList.remove('mp-hid'); m.classList.add('mp-new'); bottom(); mood('talk'); }); t += 450; }
          else { at(t, () => { m.classList.remove('mp-hid'); m.classList.add('mp-new'); bottom(); }); t += 450; }
        });
        at(t, () => { busy = false; form.classList.remove('is-busy'); mood('happy'); at(1300, () => mood('idle')); });
      }
      return {el, play, stop: () => { if (!touched) finish(); }, ask, refit: () => { if (chipList) setChips(chipList); }};          // refit — подсказки заново «сколько влезает»: лист, где они стоят, был выключен (display:none, ширина 0) и подсказки не обрезались
    })();

    /* ---------- вход на разворот: на развороте со Стеллой проигрывается переписка ----------
       Запускается, когда лист остановился и журнал открыт. Страницы сами при остановке не анимируются (раньше блоки «въезжали» — это мерцало и прятало текст на каждом развороте) */
    let rzT = 0; on(window, 'resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (chat && chat.refit) chat.refit(); }, 160); }, {passive: true});          // поворот экрана / смена режима: подсказки чата заново подгоняются под ширину
    function pageIn() {
      if (pflat() || flat()) return;
      const pg = chat && chat.el.closest('.pg'); if (!pg) return;
      if (pm() && (pg.closest('.face.front') ? 0 : 1) !== (Math.round(Q) % 2)) return;          // телефон: переписка играет, когда её страница (правая — чётная остановка, левая — нечётная) в окне
      if (pg.closest('.leaf.is-cur') || pg.closest('.leaf.is-prev')) chat.play();
    }
    /* картинки страниц журнала раскодируются заранее, по две за такт простоя: иначе первый поворот листа с фото и нишами брендов ждал загрузки и декодирования прямо в кадре анимации (подвисание в момент листания) */
    let warmedImgs = false;
    function warmPages() {
      if (warmedImgs || pm()) return; warmedImgs = true;
      const imgs = $$('img', mag); let i = 0;
      const step = () => {
        for (let n = 0; n < 2 && i < imgs.length; n++) { const im = imgs[i++]; try { im.loading = 'eager'; if (im.decode) im.decode().catch(() => {}); } catch (e) { /* — */ } }
        if (i < imgs.length) { if (window.requestIdleCallback) window.requestIdleCallback(step, {timeout: 400}); else setTimeout(step, 80); }
      };
      step();
    }
    setTimeout(warmPages, 5000);
    A.house = {busy: () => !!glideRaf, home: () => home('api'), go: id => go(id, {via: 'api'}), hall: () => hall({via: 'api'}), openMagazine: v => { if (flat() || pflat()) { jump(readerBox().top); render(v === undefined ? 1 : v, {instant: true}); } else toState(v === undefined ? 1 : stopOfSpread(v)); }, state: () => ({room: current, magazine: true, page: s, rooms: ids, reader: true}), readerState: () => { const f = A.jar && A.jar.fly, st = f && f.state ? f.state() : null; return {t: readerT(), s, p, q: Q, stop: pm() ? Math.round(Q) : s, pm: pm(), fly: {on: !!FLd, n: st ? st.N : 0, loaded: st ? st.loaded : 0, drawn: !!(st && st.firstDrawn), p: st ? st.p : 0, jarOk: st ? st.jarOk : null, size: st ? st.size : null, sprites: st ? st.jar : null}}; }};
  }

  init();
  const prev = A.initPage; A.initPage = function () { if (prev) prev.apply(this, arguments); init(); };
})();
