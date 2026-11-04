/* jar.js — первый экран главной: закреплённая сцена со скролл-анимацией (секция #arch-story, data/redesign.json → jar.arch).
   Секция в несколько экранов высотой, внутри — закреплённая сцена (sticky). Положение прокрутки внутри секции (0…1) — это положение камеры на заранее отрендеренном пути (Blender, tools/jar-render/hall_story.py):
   вниз — вперёд, вверх — обратная перемотка. Камера «наезд с отъездом» от крупной баночки по центру (заставка с полоской «Листайте») к готовому кадру; баночка раскручивается, уходит на подиум и встаёт там одна,
   затем поверх встаёт герой (заголовок, кнопки, панель «Почему выбирают Астрею?»).

   Как рисуется (js/jar-gl.js, WebGL2) — и почему картинка не «дребезжит» и не мылится в движении:
   • зал — ключевые кадры (60 штук, 1920×1080 / 900×1600) с картами глубины; для любого положения прокрутки два соседних кадра перепроецируются на камеру этого положения (дорожка камеры из Blender)
     и сливаются. Никакого смешивания «картинка в картинку»: предметы не раздваиваются, кромки резкие, камера движется непрерывно, а не шагает от кадра к кадру. Набор кадров один, без «лёгких»
     уровней: в движении тот же резкий кадр, что и в покое;
   • в покое сцена стоит там, где остановили прокрутку (к ближайшему ключевому кадру её не подтягивает: это «подталкивало» баночку сразу после остановки; резкость между ключами — 95–100 % от резкости на самом кадре);
   • баночка — отдельный слой (canvas .ar-jar-cv, второй WebGL-контекст): спрайт баночки без этикетки (Blender) ставится по настоящей проекции её центра на камеру, а надписи этикетки рисуются поверх
     по геометрии цилиндра — баночка вращается плавно при любом положении прокрутки, не шагает от спрайта к спрайту и не ползёт относительно фона;
   • каменный шар — часть кадров зала (запечён из того же камня, что и гора); на сайте от него остаётся только положение в готовом кадре — вокруг него встают орбиты логотипов (jar.arch.sphere);
   • движение ведёт «пружина» с критическим затуханием: нет рывка на старте и мягкая остановка без «щелчка»; в цикле нет чтения вёрстки, CSS-переменные пишутся только при изменении;
   • загрузка: первый кадр, его глубина и спрайт — сразу; остальное «от грубого к тонкому» с окном впереди по ходу движения; в видеопамяти держатся ближайшие к положению кадры (остальные —
     в виде сжатых файлов и разворачиваются по требованию); слабое устройство: регулятор нагрузки уменьшает холст.
   Сцена показывается при любых настройках устройства («уменьшить движение», экономия трафика) — по решению заказчика; без JS или без WebGL2 её нет (остаётся прежний герой).
   Интерфейс от прогресса p: --cue («Листайте» и виньетка гаснут с первой прокруткой), --h1…--h3 (герой), классы body.arch-hide / arch-nav / arch-top / arch-live (шапка уходит на время кино,
   возвращается к финалу; кнопки героя нажимаются, только когда видны). Файл загружается только на главной и только пока jar.enabled = true (data/redesign.json). */
(function () {
  'use strict';
  const A = window.Astreya || {};
  /* Защита от цикла падений: iOS убивает вкладку по нехватке памяти и тут же перезагружает её (после нескольких раз — страница «Возникла повторяющаяся проблема»).
     Пока вкладка на экране, в sessionStorage лежит «идёт» (run); при уходе со страницы или в фон — «закончено». Если при загрузке осталось «идёт» — прошлая загрузка оборвалась на экране:
     включаем облегчённый режим на всю сессию (A.lite): пролёт остаётся, но кадры — окном (по 1 с каждой стороны) вместо всех 49, у героя окно кадров минимальное и холст меньше; память вдвое меньше, траектория та же.
     ?lite=1 включает режим для проверки, ?lite=0 снимает. */
  (function guard() {
    let lite = false;
    try {
      const ss = window.sessionStorage, q = /[?&]lite=([01])/.exec(location.search), st = JSON.parse(ss.getItem('astreya-boot') || 'null') || {};
      lite = ss.getItem('astreya-lite') === '1';
      A.crashed = !!(st.run && Date.now() - (st.t || 0) < 600000);          // прошлая загрузка оборвалась на экране (читает журнал вылетов ниже: к этому моменту «идёт» уже перезаписано)
      let nc = +(ss.getItem('astreya-crashes') || 0); if (A.crashed) { nc++; ss.setItem('astreya-crashes', String(nc)); }
      if (!lite && A.crashed) lite = true;
      /* второй обрыв подряд: анимацию на этом устройстве не тянем — статичный зал и лента страниц (без WebGL, цикл падений «повторно возникла проблема» невозможен). ?nogl=1 включает режим, ?nogl=0 снимает.
         Счётчик обнуляется, если страница продержалась на экране 45 с без обрыва */
      const qn = /[?&]nogl=([01])/.exec(location.search); A.nogl = qn ? qn[1] === '1' : nc >= 2; A.crashN = nc;
      if (qn && qn[1] === '0') { ss.removeItem('astreya-crashes'); A.nogl = false; }
      if (A.nogl) { const rd = document.querySelector('.house-reader'); if (rd) { rd.removeAttribute('data-m'); rd.removeAttribute('data-fly'); } }          // читалка без пролёта: прежняя лента страниц (js/house.js читает эти атрибуты при старте)
      setTimeout(() => { try { if (document.visibilityState === 'visible') ss.removeItem('astreya-crashes'); } catch (e) { /* — */ } }, 45000);
      if (q) lite = q[1] === '1';
      if (lite) ss.setItem('astreya-lite', '1'); else ss.removeItem('astreya-lite');
      const mark = run => { try { ss.setItem('astreya-boot', JSON.stringify({run, t: Date.now()})); } catch (e) { /* — */ } };
      mark(document.visibilityState !== 'hidden');
      document.addEventListener('visibilitychange', () => mark(document.visibilityState === 'visible'));
      window.addEventListener('pagehide', () => mark(false));
    } catch (e) { /* без sessionStorage — защиты нет */ }
    A.lite = lite;
  })();
  /* Журнал для разбора вылетов: короткая лента последних действий (тапы, свайпы, позиции прокрутки, состояние движков, потеря контекста WebGL) в sessionStorage. Если вкладка оборвалась на экране
     (то же условие, что у облегчённого режима), лента прошлого запуска переезжает в localStorage (astreya:crashlog, последние 3 вылета) и уходит событием crash_prev. Показать: адрес с ?diag=1 —
     вверху страницы появляется текст (журнал вылетов и текущего запуска), его можно сфотографировать или скопировать. На работу страницы не влияет: запись — раз в 0,4 с, до 70 строк. */
  (function diag() {
    let ss = null, ls = null; try { ss = window.sessionStorage; ls = window.localStorage; } catch (e) { /* — */ }
    const KEY = 'astreya-bc', CL = 'astreya:crashlog', t0 = performance.now();
    let buf = [], crashed = false;
    try {
      crashed = !!A.crashed;
      const prev = JSON.parse(ss.getItem(KEY) || '[]');
      if (crashed && prev.length && ls) { const l = JSON.parse(ls.getItem(CL) || '[]'); l.push({at: new Date().toISOString(), ev: prev.slice(-70)}); ls.setItem(CL, JSON.stringify(l.slice(-3))); if (A.track) A.track('crash_prev', {last: JSON.stringify(prev.slice(-6)).slice(0, 400)}); }
    } catch (e) { /* — */ }
    let ft = 0;
    const flush = () => { ft = 0; try { ss && ss.setItem(KEY, JSON.stringify(buf)); } catch (e) { /* — */ } };
    const bc = A.bc = (tag, d) => { buf.push([Math.round((performance.now() - t0) / 100) / 10, tag, d === undefined ? '' : String(d).slice(0, 48)]); if (buf.length > 70) buf.splice(0, buf.length - 70); if (!ft) ft = setTimeout(flush, 400); };
    bc('boot', [innerWidth + 'x' + innerHeight, 'dpr' + (window.devicePixelRatio || 1), 'dm' + (navigator.deviceMemory || '?'), A.lite ? 'lite' : 'full', crashed ? 'after-crash' : ''].join(' '));
    document.addEventListener('visibilitychange', () => { bc('vis', document.visibilityState); flush(); });
    window.addEventListener('pagehide', () => { bc('pagehide'); flush(); });
    window.addEventListener('error', e => bc('err', (e.message || '') + ' ' + ((e.filename || '').split('/').pop()) + ':' + (e.lineno || '')));
    const lab = el => { const e = el && el.closest && el.closest('button,a,[data-act],.leaf,.hr-stage,canvas,input'); return e ? (e.tagName.toLowerCase() + (e.id ? '#' + e.id : e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '') + (e.getAttribute('data-act') ? '[' + e.getAttribute('data-act') + ']' : '')) : (el && el.tagName ? el.tagName.toLowerCase() : '?'); };
    document.addEventListener('click', e => bc('tap', lab(e.target)), true);
    let tx = 0, ty = 0, tt = 0;
    document.addEventListener('touchstart', e => { const t = e.touches[0]; if (t) { tx = t.clientX; ty = t.clientY; tt = performance.now(); } }, {passive: true, capture: true});
    document.addEventListener('touchend', e => { const t = e.changedTouches[0]; if (!t) return; const dx = Math.round(t.clientX - tx), dy = Math.round(t.clientY - ty); if (Math.abs(dx) > 40 || Math.abs(dy) > 40) bc('swipe', dx + ',' + dy + ' ' + Math.round(performance.now() - tt) + 'ms ' + lab(e.target)); }, {passive: true, capture: true});
    let sT = 0;
    window.addEventListener('scroll', () => {
      const n = performance.now(); if (n - sT < 600) return; sT = n;
      let r = ''; try { const j = A.jar, a = j && j.arch && j.arch.state && j.arch.state(), f = j && j.fly && j.fly.state && j.fly.state(); r = ' h' + (a ? a.resident + '/' + a.lows : '-') + ' f' + (f ? f.resident + '/' + f.lows : '-'); } catch (e) { /* — */ }
      bc('y', Math.round(window.pageYOffset) + r);
    }, {passive: true});
    {
      const show = () => {
        if (document.getElementById('astreya-diag')) return;
        const pre = document.createElement('pre'); pre.id = 'astreya-diag';
        pre.style.cssText = 'position:fixed;left:0;right:0;top:0;max-height:62vh;overflow:auto;margin:0;padding:8px 10px;z-index:2147483647;background:rgba(0,0,0,.86);color:#9fe;font:10px/1.35 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-all';
        const fmt = ev => ev.map(r => r.join(' ')).join('\n');
        const render = () => { let o = 'Астрея · журнал · ' + (A.lite ? 'облегчённый' : 'полный') + '\n'; try { const l = JSON.parse(ls.getItem(CL) || '[]'); o += l.length ? 'ВЫЛЕТЫ (' + l.length + '):\n' + l.map(c => '— ' + c.at + '\n' + fmt(c.ev.slice(-30))).join('\n') + '\n' : 'вылетов не записано\n'; } catch (e) { /* — */ } pre.textContent = o + 'ТЕКУЩИЙ ЗАПУСК:\n' + fmt(buf.slice(-40)); };
        render(); const x = document.createElement('button'); x.textContent = 'закрыть'; x.style.cssText = 'position:sticky;float:right;top:0;font:11px sans-serif'; x.onclick = () => { clearInterval(iv); pre.remove(); }; pre.prepend(x);
        const iv = setInterval(() => { const sc = pre.scrollTop; render(); pre.prepend(x); pre.scrollTop = sc; }, 1500); document.body.appendChild(pre);
      };
      const diagOn = /[?&]diag=1/.test(location.search);
      if (diagOn) { if (document.body) show(); else document.addEventListener('DOMContentLoaded', show); }
      /* после обрыва вкладки — короткая плашка внизу: страница перезапустилась, включён облегчённый режим (или без анимации); «Отчёт» открывает журнал (его можно сфотографировать и прислать) */
      if (crashed && !diagOn) {
        const toast = () => {
          if (!document.body) return;
          const t = document.createElement('div'); t.setAttribute('role', 'status');
          t.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:2147483000;display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 12px;border-radius:14px;background:rgba(11,26,51,.92);color:#fff;font:13px/1.3 system-ui,-apple-system,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3)';
          const m = document.createElement('span'); m.textContent = A.nogl ? 'Страница перезапустилась. Включён режим без анимации.' : 'Страница перезапустилась. Включён облегчённый режим.';
          const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Отчёт'; b.style.cssText = 'flex:none;border:0;border-radius:10px;padding:7px 11px;font:600 12px system-ui,sans-serif;background:#f4ecda;color:#0b1a33';
          b.onclick = () => { t.remove(); show(); };
          t.append(m, b); document.body.appendChild(t); setTimeout(() => t.remove(), 14000);
        };
        if (document.body) setTimeout(toast, 1500); else document.addEventListener('DOMContentLoaded', () => setTimeout(toast, 1500));
      }
    }
  })();
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  /* «хвост» сцены героя: на телефоне читалка наезжает на конец сцены не на 100lvh, а на 100lvh + хвост (css/house.css), и сцена героя стоит на месте, пока её холсты гаснут над кадром пролёта.
     Раньше сцена уезжала вверх в тот же момент, а холсты сдвигались обратно из JS (--hy): на iOS прокрутка идёт мимо главного потока, сдвиг запаздывал, и поверх кадра пролёта на 1–3 кадра
     висел второй, смещённый слой (двойное изображение — «шторка»). Хвост меряется по вёрстке: конец закреплённой сцены минус верх читалки (на ПК — 0) */
  function heroTail(root, stage) {
    const rd = document.getElementById('house-reader'); if (!rd || !root.classList.contains('is-house')) return 0;
    const sy = window.scrollY || window.pageYOffset || 0, st = stage || root.firstElementChild;
    const end = root.getBoundingClientRect().top + sy + root.offsetHeight - (st ? st.clientHeight : innerHeight), rt = rd.getBoundingClientRect().top + sy;
    return clamp(Math.round(end - rt), 0, root.offsetHeight);
  }
  const ease = x => x * x * (3 - 2 * x);
  const pad = i => String(i).padStart(3, '0');
  const portraitMQ = window.matchMedia('(max-aspect-ratio: 11/10)');
  const OMEGA = 24;           // жёсткость пружины, 1/с: отставание при равномерной прокрутке ≈ 2/OMEGA ≈ 0,08 с, остановка (до 2 %) ≈ 0,25 с
  const IDLE_TAIL = 150;      // мс после остановки прокрутки, пока цикл ещё идёт (пружина доводит кадр до точного положения)
  const FAST_ON = 30, FAST_OFF = 12;   // ключевых кадров в секунду: быстрее FAST_ON — «взмах»: тяжёлые полные кадры не разворачиваем и не грузим в видеопамять (их уже не успеть, а загрузка гасит кадры анимации), картинка идёт по уменьшенным копиям; медленнее FAST_OFF — снова обычная работа
  const FAST_ON_PF = 30, FAST_OFF_PF = 12;   // пролёт на телефоне: при обычной прокрутке пальцем (≈ 15–20 ключей/с) кадры остаются полными, копии — только на настоящем взмахе
  const FAST_ON_P = 9, FAST_OFF_P = 3;   // то же для телефона (портретный кадр): взмах начинается уже при ≈ 9 ключах в секунду — обычная прокрутка пальцем идёт по уменьшенным копиям, полные кадры подтягиваются, когда движение замедлилось (каждая загрузка полного кадра в видеопамять на iPhone — 10–30 мс главного потока, т. е. пропущенные кадры)
  const UP_GAP_P = 70, UP_GAP_LOW = 40, UP_GAP_F = 34;          // UP_GAP_F — пролёт: окно ±8 должно обновляться быстрее, чем камера его съедает (≈ 29 ключей/с)        // мс: на телефоне в движении загрузка в видеопамять — не чаще одной за этот промежуток (полный кадр / уменьшенная копия во «взмахе»): раньше копии всех кадров пролёта грузились по одной за каждый кадр анимации ровно во время первого пролёта
  const MOVING = 0.04;        // ключевых кадров в секунду: быстрее — идёт движение (включается сглаживание кромок)
  const LANES = [14, 8];      // запросов одновременно: [компьютер, телефон] (HTTP/2)
  const RES = [5, A.lite ? 1 : 3];         // сколько ключевых кадров по обе стороны от положения держим в видеопамяти: [компьютер, телефон]
  const K1 = 12;                              // телефон, пролёт: столько первых ключей грузится и во время прокрутки героя, остальные — в паузах (и сразу, как читалка входит в сцену)
  const DECODERS = 3, DECODERS_P = 2;         // одновременных разворачиваний картинок в текстуры
  /* уменьшенные копии всех кадров (всегда в видеопамяти; во взмах картинка идёт по ним): ширина цвета, высота цвета, ширина и высота глубины (0 — глубина в натуральном размере: тогда полный кадр берёт её же и держит только цвет), ширина спрайта баночки.
     Они должны быть почти неотличимы от полных кадров (мелкие копии давали «мыло» и ступеньки на кромках): на мощных устройствах (≥ 8 ГБ памяти) цвет 1280×720 и глубина целиком (≈ 350 МБ), иначе 960×540 и глубина 640×360 (≈ 180 МБ); телефон — 450×800 / 540×960 */
  const DM = navigator.deviceMemory || 4, RICH = DM >= 8;
  const PHONE = (() => { try { return matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 520; } catch (e) { return false; } })();          // телефон (в том числе повёрнутый набок): холст не больше портретного бюджета — ориентация экрана не должна удваивать видеопамять
  const LOWSZ = [RICH ? [1280, 720, 0, 0, 640] : [960, 540, 640, 360, 480], RICH ? [540, 960, 0, 0, 480] : [300, 533, 300, 533, 360]];      // телефон: на 8 ГБ — цвет 540×960 и вся глубина (≈ 210 МБ), иначе 450×800 и глубина 300×533 (≈ 125 МБ)
  const LOWDEC = [2, 1];           // одновременных разворачиваний уменьшенных копий (они мелкие, идут в стороне от основной очереди)
  let ctrl = null, ctrls = [];       // ctrls — все сцены страницы (на главной одна: #arch-story), ctrl — она же

  function glOk() {                  // WebGL2 есть? (проверка на отдельном холсте — холсты сцены остаются нетронутыми)
    try { const c = document.createElement('canvas'), g = c.getContext('webgl2'); if (!g) return false; const e = g.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); return true; } catch (e) { return false; }
  }

  function create(root) {
    const FLY = root.hasAttribute('data-fly');
    const FLYBAKE = FLY && root.hasAttribute('data-fly-bake');            // баночка запечена в ключи пролёта (tools/jar-render/bake_jar.py): как камень на фоне, живой спрайт не рисуем               // второй экземпляр на странице-доме: пролёт камеры от зала к журналу (ключи пролёта вместо кадров героя); положение берёт у читалки (A.flyP), а не из прокрутки секции
    const stage = root.querySelector('.js-stage') || root.querySelector('.hr-stage');
    const cv = root.querySelector('.js-cv');
    const jcv = root.querySelector('.ar-jar-cv'), world = root.querySelector('.ar-world');
    const ds = root.dataset, NH = +ds.n || 1, ext = ds.ext || 'webp', ver = ds.v ? '?v=' + ds.v : '';
    /* вид заставки (data/redesign.json → jar.arch.look): размер баночки на старте и живая тень (кадры до shadow.from тени не содержат — её рисует сайт по текущему положению баночки) */
    let look = {}; try { look = JSON.parse(ds.look || '{}') || {}; } catch (e) { look = {}; }
    const LS = look.scale || {}, LSH = look.shadow || null, LG = look.ground || null, LH = look.halo || null;
    const dead0 = () => { root.classList.add('jar-off'); return {root, complete: () => true, destroy() {}, state: () => ({})}; };
    if (A.nogl) { root.setAttribute('data-fly-why', 'режим без анимации (после падений вкладки / ?nogl=1)'); return dead0(); }
    if (!A.ArchGL || !stage || !cv || !jcv || typeof fetch !== 'function' || typeof createImageBitmap !== 'function' || !glOk() || (FLY && portraitMQ.matches && !root.hasAttribute('data-m'))) {
      if (FLY) root.setAttribute('data-fly-why', !A.ArchGL ? 'нет jar-gl.js' : (!stage || !cv || !jcv) ? 'нет холстов в читалке' : typeof createImageBitmap !== 'function' ? 'нет createImageBitmap' : !glOk() ? 'нет WebGL2' : 'узкое окно (высота больше ширины): пролёт только на широком экране');         // для ?flydebug (js/house.js)
      return dead0();
    }
    const nums = s => String(s || '').split(',').filter(x => x !== '').map(Number);
    const fm0 = FLY && !!ds.m && portraitMQ.matches;                                 // пролёт на телефоне: свой набор (портретные ключи, глубина, дорожка, расписание)
    let Phi = nums(fm0 && ds.pm ? ds.pm : ds.p);
    if (Phi.length !== NH || Phi.some(isNaN)) { Phi = []; for (let i = 0; i < NH; i++) Phi.push(NH > 1 ? i / (NH - 1) : 0); }
    const jsonOf = t => { try { const a = JSON.parse(t || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
    const JR = [jsonOf(ds.jr), jsonOf(ds.jrm)];                                     // рамки баночки по кадрам (доли кадра: x, y, w, h) — [компьютер, телефон]
    const isPortrait = () => FLY ? fm0 : portraitMQ.matches;                          // пролёт: портретный набор только если он есть в данных (иначе пролёт — только широкий экран)
    const KS = (NH - 1) / Math.max(1e-6, Phi[NH - 1] - Phi[0]);                        // ключевых кадров на единицу пути (у героя ключи по всему пути 0…1, у пролёта — на его части)
    const urlOf = p => (A.assetUrl ? A.assetUrl(p) : p) + ver;
    const canFetch = true;
    const PRESERVE = !!window.__ASTREYA_GL_PRESERVE;                                // проверки читают пиксели холстов

    /* ---- состояние ---- */
    let W = 0, H = 0, JW = 0, JH = 0, dead = false, firstDrawn = false, jarShown = false, running = false, last = 0, dirty = true, started = false;
    let cp = 0, vp = 0, pT = 0, pPrev = -1, lastMove = 0, paintedP = -2, rzTimer = 0;
    let sTop = 0, sTot = 1, sH = 1, yNow = 0, sTail = 0;
    const born = performance.now();
    let hall = null, jar = null, track = null, set = '', gen = 0, labelReady = false, lastDraw = null, resScale = 1;
    let flyCam = null;                                                              // дорожка камеры пролёта (для живой книги: js/house.js проецирует углы журнала камерой, которой нарисован кадр)
    let lastJarOk = null, dtEma = 16.7, minDt = 16.7, slowRun = 0, govChanges = 0;
    const perfRing = new Float32Array(240); let perfN = 0;
    /* пролёт на телефоне — как на ПК: все ключи лежат в видеопамяти целиком (900×1600 + глубина ≈ 7 МБ на ключ, ≈ 350 МБ на 49), без «быстрого режима» по уменьшенным копиям: картинка в движении такая же чёткая, как в покое.
       Герой, пока журнал открыт, свою видеопамять отдаёт (trim). После падения вкладки (A.lite) — прежнее окно кадров + копии: память вдвое меньше, пролёт тот же */
    const FULL = /[?&]full=1/.test(location.search);                                // ?full=1 — все ключи пролёта в видеопамяти (по умолчанию на телефоне — широкое окно, см. winR)
    const PHALL = FLY && fm0 && !A.lite && !RICH && FULL, ALLRES = FLY && (RICH || PHALL);
    /* ALLRES: на мощном устройстве (≥ 8 ГБ) и на телефоне (PHALL) все ключи пролёта лежат в видеопамяти целиком — уменьшенных копий и быстрого режима нет */
    let dirSign = 1, gate = !FLY;                                                      // gate — пролёт грузит ключи, когда читалка разрешит (self.warm): пока герой не доехал до конца, трафик нужен ему

    /* ---- живой шар: вращается сам (≈ 7,5°/с, 60 fps) только в статике — на финальном экране героя с текстом (cp ≥ 0,995); на курсор не реагирует; во всей скролл-анимации (и когда её остановили посередине) стоит на месте: раньше вращение продолжалось на паузах и баночка подлагивала от лишних проходов шара (js/jar-gl.js рисует его поверх кадра зала с учётом глубины) ---- */
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce) and (min-width: 100000px)');
    const sph = {yaw: 0.6, pitch: -0.12, hx: 0, hy: 0, lx: 0, ly: 0, sy: -1, raf: 0, last: 0, view: false, fed: false};
    const SPH_IDLE = 0.13;                                                   // ≈ 7,5°/с — собственное вращение
    let lastScrollT = 0;
    let quiet = 99;                                                          // сколько кадров подряд страница не двигалась
    const scrolling = () => performance.now() - lastScrollT < 380 || quiet < 4;          // (и по кадрам: на медленном устройстве кадр бывает дольше 0,4 с)           // идёт прокрутка (скролл-анимация): шар стоит на месте и не вращается
    function sphMat() {                                                      // объект → мир: сначала вращение вокруг вертикали (полюс шара стоит вертикально), затем наклон
      const y = sph.yaw, p = sph.pitch, cy = Math.cos(y), sy = Math.sin(y), cp_ = Math.cos(p), sp_ = Math.sin(p);
      return [cy, sy * cp_, sy * sp_,   -sy, cy * cp_, cy * sp_,   0, -sp_, cp_];      // Rx(p)·Rz(y), по столбцам
    }
    function sphPush() { if (hall) hall.setSphere(sphMat(), sph.lx, sph.ly); }
    /* шаг по времени кадра (60 fps: dt — реальное время между кадрами, всё считается по нему, а не по числу кадров). От курсора шар не зависит — ни поворота, ни света (по решению заказчика) */
    function sphStep(dt) { sph.yaw += SPH_IDLE * dt; A.sphYaw = sph.yaw; sphPush(); }
    function sphWanted() { return !FLY && !!hall && hall.sphereReady && sph.view && !document.hidden && cp >= 0.995 && !A.sphereHold && !reduceMQ.matches && !root.classList.contains('rd-live') && !document.documentElement.classList.contains('anim-off'); }
    function sphLoop(t) {
      sph.raf = 0;
      if (!sphWanted() || dead) { sph.last = 0; return; }
      { const sy = window.pageYOffset; if (sy !== sph.sy) { sph.sy = sy; lastScrollT = performance.now(); quiet = 0; } else if (quiet < 99) quiet++; }          // страница сдвинулась в этом кадре — шар не двигается (не ждём события scroll)
      if (scrolling()) sph.last = 0;                                           // прокрутка: шар неподвижен (пока она идёт); после остановки продолжает с того же места
      else {
        const gap = isPortrait() ? 33 : 0;                                    // ПК — каждый кадр экрана (60 fps), телефон — через кадр
        if (!sph.last || t - sph.last >= gap) {
          const dt = sph.last ? Math.min(0.05, (t - sph.last) / 1000) : 0.0167; sph.last = t;
          sphStep(dt);
          if (!running) hall.drawSphere();                                    // зал стоит — перерисовываем один шар; идёт прокрутка — шар нарисует обычный цикл
        }
      }
      sph.raf = requestAnimationFrame(sphLoop);
    }

    function sphStart() { if (!sph.raf && sphWanted()) { sph.last = 0; sph.raf = requestAnimationFrame(sphLoop); } }
    function loadSphere() {                                                  // текстуры шара (цвет и нормали): после первых кадров, с низким приоритетом
      if (!hall || !hall.hasSphere || !ds.sa || !ds.sn) return;
      const g = gen;
      Promise.all([fetch(urlOf(ds.sa), {priority: 'low'}).then(r => r.blob()), fetch(urlOf(ds.sn), {priority: 'low'}).then(r => r.blob())])
        .then(bs => Promise.all(bs.map(b => createImageBitmap(b, (isPortrait() && !RICH) ? {premultiplyAlpha: 'none', colorSpaceConversion: 'none', resizeWidth: 1024, resizeQuality: 'high'} : {premultiplyAlpha: 'none', colorSpaceConversion: 'none'}))))
        .then(([a, n]) => { if (g === gen && hall && !dead && hall.setSphereTex(a, n)) { sphPush(); dirty = true; schedule(); sphStart(); } try { a.close(); n.close(); } catch (e) { /* — */ } })
        .catch(() => {});
    }
    document.addEventListener('visibilitychange', sphStart);

    /* ---- данные ключевых кадров: сжатые файлы (Blob) всегда, текстуры — только рядом с положением ---- */
    const blobs = {c: new Array(NH).fill(null), z: new Array(NH).fill(null), j: new Array(NH).fill(null)};
    const busy = {c: new Uint8Array(NH), z: new Uint8Array(NH), j: new Uint8Array(NH)};
    const resident = new Uint8Array(NH), resJ = new Uint8Array(NH), decoding = new Uint8Array(NH * 2);
    const lowDone = new Uint8Array(NH), lowJDone = new Uint8Array(NH), lowBusy = new Uint8Array(NH * 2);       // уменьшенные копии: 1 — в видеопамяти, 2 — не получилось (браузер не умеет сжимать при разворачивании)
    let decL = 0, shownP = -1, lastCp = 0, lowOnlyF = false, trimmed = false, fast = false, lowN = 0, lowJN = 0, cpTick = 0;
    const upQ = [], upN = {full: 0, low: 0};                                                          // загрузки в видеопамять идут по одной-две за кадр: несколько больших текстур сразу — это подвисание
    let inflight = 0, decN = 0, loadedKeys = 0, pin = null;                  // pin — диапазон кадров, которые держим в видеопамяти независимо от положения (для проверок и точных замеров)
    const pinned = k => !!pin && k >= pin[0] && k <= pin[1];
    const ctz = (i, n) => { if (!i || i === n - 1) return 99; let c = 0; while (!(i & 1)) { i >>= 1; c++; } return c; };
    const hier = Array.from({length: NH}, (_, i) => i).sort((a, b) => ctz(b, NH) - ctz(a, NH) || a - b);   // «от грубого к тонкому»
    let hierPos = 0;
    function locate(p) {                          // положение на сценарии → пара кадров и доля между ними
      if (p <= Phi[0]) return {k: 0, t: 0};
      if (p >= Phi[NH - 1]) return {k: Math.max(0, NH - 2), t: 1};
      let lo = 0, hi = NH - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (Phi[m] <= p) lo = m; else hi = m; }
      return {k: lo, t: (p - Phi[lo]) / (Phi[lo + 1] - Phi[lo])};
    }
    const kNear = p => { const l = locate(p); return l.t >= 0.5 ? Math.min(NH - 1, l.k + 1) : l.k; };
    const dirOf = () => (isPortrait() ? 'm' : 'd');
    const urls = (key, i) => key === 'c' ? urlOf((dirOf() === 'm' ? ds.m : ds.d) + pad(i) + '.' + ext) : key === 'z' ? urlOf((dirOf() === 'm' ? ds.zm : ds.zd) + pad(i) + '.' + (ds.zx || 'webp')) : urlOf((dirOf() === 'm' ? ds.jm : ds.jd) + pad(i) + '.' + (ds.jx || 'webp'));
    const keyDone = k => !!(blobs.c[k] && blobs.z[k]);

    /* что грузить следующим: первый кадр → пара у положения → окно впереди по ходу движения → остальное от грубого к тонкому */
    function pickNext() {
      const need = k => { for (const key of ['c', 'z', 'j']) { if (FLY && key === 'j' && k > 0) continue; if (!busy[key][k]) return key; } return null; };               // пролёт: баночка — один спрайт (ключ 0, тот же, что на главной), остальные не нужны
      const tryK = k => { if (k < 0 || k >= NH) return null; const key = need(k); return key ? {key, k} : null; };
      let r;
      if ((r = tryK(0))) return r;
      if (FLY && (r = tryK(NH - 1))) return r;                                  // пролёту нужны оба конца дорожки сразу: даже с двумя ключами камера летит (перепроекцией), остальные ключи добавляют точности
      const l = locate(cp), kc = kNear(cp);
      if ((r = tryK(l.k)) || (r = tryK(Math.min(NH - 1, l.k + 1)))) return r;
      for (let d = 1; d <= 6; d++) { if ((r = tryK(kc + dirSign * d)) || (r = tryK(kc - dirSign * d))) return r; }
      while (hierPos < NH) { const k = hier[hierPos]; if ((r = tryK(k))) return r; hierPos++; }
      return null;
    }
    function pump() {
      if (dead || !canFetch || !gate) return;
      const lanes = LANES[isPortrait() ? 1 : 0];
      while (inflight < lanes) {
        const j = pickNext(); if (!j) return;
        const {key, k} = j, g = gen;
        busy[key][k] = 1; inflight++;
        fetch(urls(key, k), {priority: k === 0 || Math.abs(k - kNear(cp)) < 3 || (FLY && (k === NH - 1 || pT > 0)) ? 'high' : 'low'}).then(r => { if (!r.ok) throw new Error('http'); return r.blob(); })
          .then(b => { if (g !== gen) return; blobs[key][k] = b; busy[key][k] = 2; inflight--; if (key === 'c') loadedKeys++; dirty = true; schedule(); pumpDecode(); pump(); })
          .catch(() => { if (g !== gen) return; busy[key][k] = 3; inflight--; pump(); });
      }
    }
    async function bmp(blob, premul) {
      try { return await createImageBitmap(blob, {premultiplyAlpha: premul ? 'premultiply' : 'none', colorSpaceConversion: 'none'}); }
      catch (e) { const u = URL.createObjectURL(blob); try { const im = new Image(); im.src = u; await im.decode(); return im; } finally { setTimeout(() => URL.revokeObjectURL(u), 3000); } }
    }
    /* то же, но сразу в нужном размере (меньше памяти и работы): null — браузер размер не применил или не справился */
    async function bmpR(blob, premul, w, h, q) {
      try {
        const o = {premultiplyAlpha: premul ? 'premultiply' : 'none', colorSpaceConversion: 'none'}; if (w) { o.resizeQuality = q; o.resizeWidth = w; } if (h) o.resizeHeight = h;
        const b = await createImageBitmap(blob, o);
        if (b.width > (w || 1e9) * 1.5) { try { b.close(); } catch (e) { /* — */ } return null; }
        return b;
      } catch (e) { return null; }
    }
    const closeB = b => { try { b && b.close && b.close(); } catch (e) { /* — */ } };
    /* телефон (герой и пролёт): у уменьшенных копий глубина натуральная (450×800, общая с полным кадром): с глубиной 300×533 на кромках дивана, плит и журнала в движении были видны
       ступеньки-квадраты (видео заказчика). Цена — +0,8 МБ на кадр (≈ +90 МБ на оба движка), но память отдаётся (trim), когда читатель далеко от движка */
    const lowSz = () => { const L = LOWSZ[isPortrait() ? 1 : 0]; return isPortrait() && !RICH ? [L[0], L[1], 0, 0, L[4]] : L; };
    /* телефон: полный кадр разворачиваем сразу в ширину холста (744 px при бюджете 1,2 млн пикселей), а не в натуральные 900: на экране он всё равно показывается 1:1 с холстом,
       а в видеопамяти занимает на треть меньше (цвет 3,9 МБ вместо 5,8 МБ; на 49 ключей пролёта ≈ −90 МБ). 0 — натуральный размер (ПК, мощные устройства, браузер размер не применил) */
    let WF = 0;
    const keyW = () => (isPortrait() && !RICH && WF > 0) ? Math.min(900, Math.max(560, Math.round(WF))) : 0;
    const bmpJ = blob => (isPortrait() && !RICH) ? bmpR(blob, true, 800, 0, 'medium').then(b => b || bmp(blob, true)) : bmp(blob, true);          // спрайт баночки на телефоне — 800 px
    const bmpKey = blob => { const w = keyW(); return w && w < 880 ? bmpR(blob, false, w, 0, 'medium').then(b => b || bmp(blob, false)) : bmp(blob, false); };
    function decodeLow(k, sprite) {
      const L = lowSz(), g = gen, bi = sprite ? NH + k : k;
      lowBusy[bi] = 1; decL++;
      (sprite ? bmpR(blobs.j[k], true, L[4], 0, 'medium').then(s => [s]) : Promise.all([bmpR(blobs.c[k], false, L[0], L[1], 'medium'), bmpR(blobs.z[k], false, L[2], L[3], 'pixelated')])).then(a => {
        const ok = a.every(Boolean);
        if (g !== gen || !ok || dead || trimmed) { if (!ok && g === gen) (sprite ? lowJDone : lowDone)[k] = 2; if (g === gen) lowBusy[bi] = 0; a.forEach(closeB); return; }
        pushUp(() => {                                                       // busy снимается только после загрузки в видеопамять: иначе пока она в очереди, тот же кадр разворачивался бы снова и снова
          if (g === gen) lowBusy[bi] = 0;
          if (g === gen && !dead && !trimmed && (sprite ? jar : hall)) { if (sprite) { jar.setSpriteLow(k, a[0]); if (lowJDone[k] !== 1) lowJN++; lowJDone[k] = 1; } else if (PHALL && resident[k]) { lowDone[k] = 3; } else { hall.setLow(k, a[0], a[1], a[0].width, a[0].height, a[1].width, a[1].height); if (lowDone[k] !== 1) lowN++; lowDone[k] = 1; } dirty = true; }
          a.forEach(closeB);
        }, true);
      }).catch(() => { if (g === gen) { (sprite ? lowJDone : lowDone)[k] = 2; lowBusy[bi] = 0; } }).then(() => { decL--; pumpDecode(); });
    }
    /* копии (lows) на телефоне — через ключ (в облегчённом режиме через два): в движении картинка идёт по ним, а между соседними копиями кадры перепроецируются (plan: разрыв до 3 ключей допустим); память копий вдвое меньше */
    const lowStride = () => (isPortrait() && !RICH) ? (A.lite ? 3 : 2) : 1;
    const lowWanted = k => { const st = lowStride(); return st === 1 || k % st === 0 || k === NH - 1; };
    let lowTgtS = 0, lowTgtV = NH;
    const lowTgt = () => { const st = lowStride(); if (st !== lowTgtS) { lowTgtS = st; lowTgtV = 0; for (let k = 0; k < NH; k++) if (lowWanted(k)) lowTgtV++; } return lowTgtV; };
    function pumpLows() {
      const LD = LOWDEC[isPortrait() ? 1 : 0];
      if ((ALLRES && !PHALL) || decL >= LD || !hall || !firstDrawn || trimmed) return;                  // пролёт на мощном устройстве держит в видеопамяти все ключи целиком — уменьшенные копии ему не нужны
      const u = locate(cp), c = u.k + u.t;
      if (PHALL && pT <= 0) return;
      if (FLY && pT <= 0 && !A.flyNear) return;                          // пролёт: копии нужны, когда герой подъехал к концу (A.flyNear) — раньше они лишь занимают видеопамять рядом с героем
      if (upQ.length >= UPQ_MAX() + 2) return;                                    // пролёт на телефоне: пока герой на экране, копии не нужны (полные ключи подгрузятся в паузе)
      for (let d = 0; d < (PHALL ? 8 : NH) && decL < LD; d++) {          // PHALL: копии — только страховка на ±8 ключей вокруг положения, пока полные ещё грузятся
        for (const k of [Math.round(c) + dirSign * d, Math.round(c) - dirSign * d]) {
          if (k < 0 || k >= NH || decL >= LD) continue;
          if (!lowDone[k] && !lowBusy[k] && keyDone(k) && lowWanted(k)) { if (PHALL && resident[k]) lowDone[k] = 3; else decodeLow(k, false); }          // PHALL: полный кадр уже лежит — копия не нужна
          else if (jar && !lowJDone[k] && !lowBusy[NH + k] && blobs.j[k]) decodeLow(k, true);
        }
      }
    }
    let upTimer = 0;
    function pushUp(f, low) {                                                     // в очередь на загрузку в видеопамять; запасной таймер — на случай, когда кадры анимации не идут (вкладка в фоне)
      if (low) f.low = true; upQ.push(f); schedule();
      if (!upTimer) upTimer = setTimeout(function again() { upTimer = 0; flushUploads(8); if (upQ.length) upTimer = setTimeout(again, 250); }, 250);
    }
    let lastUp = 0;
    function flushUploads(budget) {
      if (!upQ.length) return;
      const t0 = performance.now();
      do {
        const i = fast ? upQ.findIndex(f => f.low) : 0;                      // во взмах тяжёлые загрузки ждут (в очереди их мало: новые не запускаются), уменьшенные копии идут
        if (i < 0) break;
        const f = upQ.splice(i, 1)[0]; if (f.low) upN.low++; else upN.full++; lastUp = performance.now(); try { f(); } catch (e) { /* — */ }
      } while (upQ.length && performance.now() - t0 < budget);
      if (upQ.length < UPQ_MAX()) setTimeout(pumpDecode, 0);                          // очередь разгрузилась — разворачиваем следующие кадры
    }

    /* развёртывание файлов в текстуры: нужные кадры рядом с положением, дальние выгружаем */
    const UPQ_MAX = () => isPortrait() ? 2 : 6;          // не больше стольких развёрнутых кадров ждут загрузки в видеопамять: дальше новые не разворачиваем (иначе на быстром телефоне очередь растёт до сотен МБ)
    const winR = () => { if (!isPortrait()) return RES[0]; return FLY ? (A.lite ? 3 : 8) : RES[1]; };          // сколько полных ключей по обе стороны от положения держим в видеопамяти
    function pumpDecode() {
      if (dead || !hall || trimmed) return;
      pumpLows();
      if (fast) return;
      const R = ALLRES ? NH : winR(), l = locate(cp);
      const need = [];
      for (let d = 0; d <= R; d++) { for (const k of [l.k + d, l.k + 1 - d]) if (k >= 0 && k < NH && need.indexOf(k) < 0) need.push(k); }
      need.sort((a, b) => Math.abs(a - (l.k + l.t)) - Math.abs(b - (l.k + l.t)));
      if (pin) for (let k = pin[0]; k <= pin[1]; k++) if (need.indexOf(k) < 0) need.push(k);
      const holdFar = FLY && PHALL && pT <= 0 && (scrolling() || !A.flyNear);          // герой ещё листают пальцем или он ещё далеко от конца (A.flyNear — js/house.js): дальше первых K1 ключей пролёта не разворачиваем и не грузим в видеопамять — сделаем это в паузе (onScroll → wakeT), иначе каждый кадр скролла героя делит поток с загрузкой 49 ключей
      for (const k of need) {
        if (decN >= (isPortrait() ? DECODERS_P : DECODERS) || lowOnlyF) break;
        if (upQ.length + decN >= UPQ_MAX() + 1) break;
        if (holdFar && k >= K1) continue;
        if (!resident[k] && keyDone(k) && !decoding[k]) {
          decoding[k] = 1; decN++; const g = gen;
          const shared = lowDone[k] === 1 && !lowSz()[2];                 // глубина уменьшенной копии — натуральная: второй раз её не разворачиваем
          Promise.all([bmpKey(blobs.c[k]), shared ? null : bmp(blobs.z[k], false)]).then(([c, z]) => {
            if (g === gen && hall && !dead) pushUp(() => {
              if (g === gen) decoding[k] = 0;
              if (g === gen && hall && !dead && !trimmed) { if (shared && hall.hasLow(k)) hall.setKeyShared(k, c, c.width, c.height); else if (z) hall.setKey(k, c, z, c.width, c.height, z.width, z.height); else { closeB(c); return; } resident[k] = 1; dirty = true; if (PHALL && hall.hasLow(k)) { hall.adoptDepth(k); hall.dropLow(k); if (lowDone[k] === 1) lowN--; lowDone[k] = 3; } }          // PHALL: цвет копии больше не нужен (полный кадр лежит), глубину забирает полный кадр
              closeB(c); closeB(z);
            });
            else { if (g === gen) decoding[k] = 0; closeB(c); closeB(z); }
          }).catch(() => { if (g === gen) decoding[k] = 0; }).then(() => { decN--; pumpDecode(); evict(); });
        } else if (!resJ[k] && blobs.j[k] && jar && !decoding[NH + k]) {
          decoding[NH + k] = 1; decN++; const g = gen;
          bmpJ(blobs.j[k]).then(s => { if (g === gen && jar && !dead) pushUp(() => { if (g === gen) decoding[NH + k] = 0; if (g === gen && jar && !dead && !trimmed) { jar.setSprite(k, s); resJ[k] = 1; dirty = true; } closeB(s); }); else { if (g === gen) decoding[NH + k] = 0; closeB(s); } })
            .catch(() => { if (g === gen) decoding[NH + k] = 0; }).then(() => { decN--; pumpDecode(); });
        }
      }
    }
    function evict() {                                                // дальше окна — выгружаем текстуры (файлы остаются в памяти и разворачиваются снова по требованию)
      if (!hall || fast || ALLRES || trimmed) return;
      const R = winR(), l = locate(cp), c = l.k + l.t;
      const ka = lastDraw ? lastDraw.ka : -1, kb = lastDraw ? lastDraw.kb : -1;       // кадры, по которым нарисовано то, что на экране сейчас, не выгружаем: иначе при нехватке новых картинка скачет назад к чужому кадру
      for (let k = 0; k < NH; k++) {
        if (k === ka || k === kb) continue;
        if (resident[k] && Math.abs(k - c) > R + 3 && !pinned(k)) { hall.dropKey(k); resident[k] = 0; }
        if (resJ[k] && Math.abs(k - c) > R + 3 && k !== 0 && !pinned(k)) { jar && jar.dropSprite(k); resJ[k] = 0; }
      }
    }

    /* ---- инициализация WebGL (после загрузки дорожки камеры) ---- */
    async function initGL() {
      const key = dirOf();
      const tr = await (await fetch(urlOf(key === 'm' ? ds.camm : ds.cam))).json();
      if (dead || key !== dirOf()) return;
      track = tr; if (FLY) flyCam = A.ArchGL.camTrack(tr);
      const fa = key === 'm' ? 9 / 16 : 16 / 9;
      hall = A.ArchGL.createHall(cv, {track: tr, sphere: tr.sphere3d && ds.sa && ds.sn ? {c: tr.sphere3d.slice(0, 3), r: tr.sphere3d[3]} : null, phi: Phi, portrait: key === 'm', frameAspect: fa, grid: (key === 'm' ? [300, 533] : [960, 540]).map(v => Math.max(60, Math.round(v * (window.__ASTREYA_GL_GRID || 1)))), stretch: 0.4, smoothBlend: FLY, preserve: PRESERVE,
        shadowFrom: LSH ? +(LSH.from && typeof LSH.from === 'object' ? LSH.from[key === 'm' ? 'mobile' : 'desktop'] : LSH.from) || 0 : 0, shadowAmount: LSH && LSH.amount !== undefined ? +LSH.amount : 1, contact: LSH && LSH.contact !== undefined ? +LSH.contact : 0.42,
        veil: LSH && +LSH.veil || 0, veilCut: LSH && +LSH.veilCut || 0});
      const rects = JR[key === 'm' ? 1 : 0];
      jar = rects.length === NH ? A.ArchGL.createJar(jcv, {track: tr, phi: Phi, rects, portrait: key === 'm', frameAspect: fa, ink: +ds.ink || 0.43, preserve: PRESERVE}) : null;
      if (!hall) { root.classList.add('jar-off'); if (FLY) root.setAttribute('data-fly-why', 'createHall вернул null (WebGL2 / шейдеры)'); dead = true; return; }
      hall.setSize(W, H); JW = JH = 0; sizeJar();
      loadSphere();
      if (jar && ds.lbl && !FLYBAKE) bmp(await (await fetch(urlOf(ds.lbl))).blob(), false).then(b => { if (jar) { jar.setLabel(b); labelReady = true; dirty = true; schedule(); } }).catch(() => {});
      cv.addEventListener('webglcontextlost', e => { e.preventDefault(); A.bc && A.bc('ctxlost', FLY ? 'fly' : 'hero'); hall = null; jar = null; resident.fill(0); resJ.fill(0); lowDone.fill(0); lowJDone.fill(0); lowBusy.fill(0); decL = 0; upQ.length = 0; shownP = -1; fast = false; lowN = lowJN = 0; }, false);
      cv.addEventListener('webglcontextrestored', () => { if (!dead) initGL().catch(() => {}); }, false);
      pumpDecode(); schedule();
    }

    /* ---- размер холстов ---- */
    function sizeCanvas() {
      const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
      /* пикселей на холсте — не больше, чем в самом кадре (1920×1080 ≈ 2,1 млн): больше деталей на экране всё равно не появится; при слабом устройстве регулятор нагрузки снижает ещё (resScale) */
      const dpr = Math.min(window.devicePixelRatio || 1, 2), s = Math.min(dpr, Math.sqrt((isPortrait() || PHONE ? (A.lite ? 7e5 : 1.0e6) : 2.1e6) / Math.max(1, w * h))) * resScale;          // телефон: ≈ 1,2 млн пикселей — слабые видеокарты не тянут больше; сетка реже, кромки решаются поточечно (jar-gl.js)
      const nw = trimmed && !FLY ? 2 : Math.round(w * s), nh = trimmed && !FLY ? 2 : Math.round(h * s);          // герой погас — его холст не держим в полном размере
      if (nw > 8) WF = nw;                                                              // ширина «живого» холста (когда герой погас, он 2×2): по ней выбирается размер разворачиваемых кадров
      if (hall && (nw !== W || nh !== H)) { W = nw; H = nh; hall.setSize(W, H); }
      else if (!hall) { W = nw; H = nh; }
      sizeJar();
      dirty = true;
    }
    /* баночка: отдельный холст по размеру «мира» сцены (рамка кадра 16:9 или 9:16): спрайт отрендерен с передискретизацией, поэтому на Retina он резкий; пикселей — с запасом (до 6,5 млн) */
    function sizeJar() {
      if (!jar || !world) return;
      const w = world.clientWidth, h = world.clientHeight; if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2), s = Math.min(dpr, Math.sqrt(6.5e6 / (w * h)));
      /* пролёт с запечённой баночкой: холст баночки ничего не рисует (нужна лишь проекция jar.proj для живой книги) — делаем его крошечным; раньше на телефоне он был 3314×1864 (6,2 млн пикселей) и
         кадр за кадром собирался композитором поверх всего: пролёт шёл с ~25 кадров/с, а память росла на ~50 МБ */
      const nw = (trimmed || FLYBAKE) ? 2 : Math.round(w * s), nh = (trimmed || FLYBAKE) ? 2 : Math.round(h * s);
      if (nw !== JW || nh !== JH) { JW = nw; JH = nh; jar.setSize(JW, JH); dirty = true; }
    }

    /* во сколько раз баночка меньше натуральной: пока баночка раскручивается и идёт на камеру (до p=from) — уменьшена (ПК/телефон); когда она уходит к подиуму и камера отъезжает (видимый размер и так падает вдвое-втрое), от p=from до p=to плавно возвращается к натуральной — размер на экране при этом только убывает */
    function jarK(p) {
      const k0 = isPortrait() ? (LS.mobile || 1) : (LS.desktop || 1);
      if (k0 >= 1) return 1;
      const a = LS.from === undefined ? 0.46 : +LS.from, b = LS.to === undefined ? 0.62 : +LS.to, x = clamp((p - a) / (b - a), 0, 1);
      return k0 + (1 - k0) * x * x * (3 - 2 * x);
    }

    /* на заставке баночка стоит ровно по центру экрана (в кадре она чуть ниже); сдвиг вверх сходит на нет за первые 40 % пути (liftFrom…liftTo) — дальше баночка идёт по своему пути */
    function jarLift(p) {
      const por = isPortrait(), r = JR[por ? 1 : 0][0], k0 = por ? (LS.mobile || 1) : (LS.desktop || 1), cy = look.center && look.center[por ? 1 : 0];     // cy — где на самом деле (по прозрачности спрайта) центр баночки в первом кадре
      if (!r || k0 >= 1) return 0;
      const a = LS.liftFrom === undefined ? 0.1 : +LS.liftFrom, b = LS.liftTo === undefined ? 0.4 : +LS.liftTo, x = clamp((p - a) / (b - a), 0, 1);
      return ((cy || (r[1] + r[3] / 2)) - 0.5) * (1 - x * x * (3 - 2 * x));        // положительное — вверх
    }

    /* сила мягкой тени под парящей баночкой: на заставке (look.ground.amount), сходит на нет, когда баночка уходит со своего места — дальше её тень рисует зал (живая тень) */
    function jarGround(p) {
      if (!LG || !LG.amount) return 0;
      const a = LG.from === undefined ? 0.1 : +LG.from, b = LG.to === undefined ? 0.4 : +LG.to, x = clamp((p - a) / (b - a), 0, 1);
      return +LG.amount * (1 - x * x * (3 - 2 * x));
    }

    /* свечение вокруг баночки: на заставке (look.halo.amount), сходит на нет вместе с мягкой тенью — дальше баночка уже в зале и подсвечена самой сценой */
    function jarHalo(p) {
      if (!LH || !LH.amount) return 0;
      const a = LH.from === undefined ? 0.1 : +LH.from, b = LH.to === undefined ? 0.4 : +LH.to, x = clamp((p - a) / (b - a), 0, 1);
      return +LH.amount * (1 - x * x * (3 - 2 * x));
    }

    /* ---- отрисовка ---- */
    function paint(now) {
      if (!hall) return false;
      const speed = Math.abs(vp) * KS;
      let pc = hall.plan(cp);                                                      // рисуем это положение: обычно cp. Если рядом нет ни полных кадров, ни уменьшенных копий (страница только открыта), — ближайший загруженный кадр как есть
      /* пока кадров рядом нет, картинка не должна идти против прокрутки: «ближайший» кадр бывает позади только что показанного — тогда остаёмся на показанном (оно ещё рисуется чисто) */
      if (pc !== cp && shownP >= 0) { const mv = cp - lastCp; if (((mv > 0 && pc < shownP) || (mv < 0 && pc > shownP)) && hall.plan(shownP) === shownP) pc = shownP; }
      lastCp = cp; shownP = pc;
      const jk = FLY ? 1 : jarK(pc), lift = FLY ? 0 : jarLift(pc), ground = FLY ? 0 : jarGround(pc), halo = FLY ? 0 : jarHalo(pc);
      if (FLY && typeof A.sphYaw === 'number') sph.yaw = A.sphYaw;                // шар стоит так же, как он стоял на последнем экране героя (там он вращался сам)
      sphPush();
      const pair = hall.draw(pc, 0, !window.__ASTREYA_NOAA, {jk, lift});                          // сглаживание кромок — всегда, когда кадр строится перепроекцией (между ключами): раньше только в движении, а в покое сцену подтягивало к ключу (без перепроекции); теперь покой бывает между ключами, и без сглаживания кромки по глубине шли «лесенкой»
      if (!pair) return false;
      lastDraw = {ka: pair.ka, kb: pair.kb, t: pair.t, single: !!pair.single};
      if (!firstDrawn) { firstDrawn = true; if (cp < 0.02 && !FLY) root.classList.add('ar-intro'); root.classList.add('ready'); }
      if (jar) {
        const ok = jar.draw(pc, pair, {jk, lift, ground, halo, fixed: FLY ? 0 : -1, base: FLY, skip: FLYBAKE}); lastJarOk = ok;
        if (FLY && A.flyOnDraw && flyCam && jar.proj) { try { A.flyOnDraw(pc, flyCam.view(pc), jar.proj); } catch (e) { /* — */ } }       // живая книга встаёт по той же камере, что и кадр
        if (ok && !jarShown) { jarShown = true; if (cp < 0.02 && !FLY) root.classList.add('ar-intro'); root.classList.add('jar-ready'); }
      }
      return true;
    }

    /* ---- запись CSS-переменных только при изменении значения ---- */
    function setv(el, name, val) {
      const key = '_' + name;
      if (el[key] === val) return;
      el[key] = val; el.style.setProperty(name, val);
    }

    /* ---- интерфейс сцены от прогресса p (0…1) ---- */
    const archSt = {hide: false, nav: false, live: false, top: false};
    function ui(p, inView) {
      const st = (a, b) => ease(clamp((p - a) / (b - a), 0, 1));
      setv(stage, '--cue', (1 - clamp(p / 0.03, 0, 1)).toFixed(3));           // «Листайте» и виньетка заставки гаснут с первой прокруткой
      setv(stage, '--h1', st(0.62, 0.76).toFixed(3));                         // подпись и заголовок — когда камера почти закончила отъезд
      setv(stage, '--h2', st(0.70, 0.82).toFixed(3));                         // текст, кнопки, орбиты логотипов
      setv(stage, '--h3', st(0.78, 0.90).toFixed(3));                         // панель «Почему выбирают Астрею?»
      const hide = inView && p > 0.02 && p < 0.76, nav = inView && p >= 0.76 && yNow < sTop + sTot + innerHeight * 0.55, live = p > 0.8,
        top = inView && (p <= 0.02 || (p >= 0.76 && yNow < sTop + sTot + innerHeight * 0.1));      // шапка прозрачная на заставке и пока герой стоит на месте; возвращается с героем и остаётся, пока он не ушёл больше чем наполовину
      if (hide !== archSt.hide) { archSt.hide = hide; document.body.classList.toggle('arch-hide', hide); }       // пока идёт кино — шапки нет
      if (nav !== archSt.nav) { archSt.nav = nav; document.body.classList.toggle('arch-nav', nav); }             // с появлением героя шапка возвращается (даже при прокрутке вниз); в конце пути — обычное поведение сайта
      if (top !== archSt.top) { archSt.top = top; document.body.classList.toggle('arch-top', top); }
      if (live !== archSt.live) { archSt.live = live; stage.classList.toggle('ar-live', live); document.body.classList.toggle('arch-live', live); document.dispatchEvent(new CustomEvent('astreya:arch', {detail: live})); }                  // кнопки героя нажимаются, только когда видны
    }

    /* ---- границы сцены измеряются один раз (и при изменении размера) — в цикле вёрстку не читаем ---- */
    function measureStatic() {
      const sy = window.scrollY || window.pageYOffset || 0;
      const r = root.getBoundingClientRect(); sTop = r.top + sy; sH = root.offsetHeight; sTail = FLY ? 0 : heroTail(root, stage); sTot = Math.max(1, sH - stage.clientHeight - sTail);          // хвост: сцена героя ещё стоит на месте, пока гаснут её холсты (телефон, css/house.css), — прогресс героя считается без него
    }

    /* ---- цикл: прокрутка → цель; пружина ведёт текущее положение к цели; в покое цель — ближайший ключевой кадр ---- */
    function schedule() { if (!running && !dead) { running = true; last = 0; requestAnimationFrame(tick); } }
    function tick(t) {
      if (dead) { running = false; return; }
      const w0 = performance.now();
      const dtRaw = last ? t - last : 0, dt = last ? clamp(dtRaw / 1000, 0.001, 0.35) : 0.016; last = t;          // пружина считается точным решением — устойчива при любом шаге; потолок лишь не даёт сцене «прыгнуть» после долгого простоя вкладки
      const y = window.scrollY || window.pageYOffset || 0, vh = innerHeight; yNow = y;
      pT = FLY ? clamp(A.flyP ? A.flyP() : 0, 0, 1) : clamp((y - sTop) / sTot, 0, 1);          // пролёт: путь задаёт читалка (js/house.js), а не прокрутка секции
      /* страница открыта посреди сцены (восстановление прокрутки после перезагрузки) — без «разгона» с нуля */
      if (!started || (w0 - born < 900 && Math.abs(pT - cp) > 0.08)) { started = true; cp = pT; vp = 0; pPrev = pT; lastMove = t; }
      if (Math.abs(pT - pPrev) > 1e-6) { pPrev = pT; lastMove = t; }
      /* цель пружины — то, куда показывает прокрутка. «Примагничивания» к ближайшему ключевому кадру в покое нет: оно подтягивало сцену на полкадра сразу после остановки (баночку «подталкивало»),
         а резкость между ключами та же (замер: лапласиан между кадрами 95–100 % от резкости на самом кадре) */
      const target = pT;
      // критически затухающая пружина (точное решение на шаг dt): x'' = −2ω x' − ω² (x − цель)
      const e = Math.exp(-OMEGA * dt);
      let d = cp - target, c = vp + OMEGA * d;
      cp = target + (d + c * dt) * e; vp = (vp - OMEGA * c * dt) * e;
      if (Math.abs(cp - target) < 2e-6 && Math.abs(vp) < 1e-4) { cp = target; vp = 0; }
      cp = clamp(cp, 0, 1);
      if (Math.abs(vp) > 1e-3) dirSign = vp > 0 ? 1 : -1;
      { const spd = Math.max(Math.abs(vp), Math.abs(cp - cpTick) / dt) * KS; cpTick = cp;      // скорость: и пружины, и реально пройденное за кадр (при редких кадрах скорость пружины к концу шага уже мала)                                   // «взмах»: пока он идёт, полные кадры не разворачиваем и не грузим (уменьшенных копий хватает)
        const por = isPortrait(), fOn = por ? (FLY ? FAST_ON_PF : FAST_ON_P) : FAST_ON, fOff = por ? (FLY ? FAST_OFF_PF : FAST_OFF_P) : FAST_OFF;          // пролёт на ПК без быстрого режима (все ключи рядом), на телефоне он есть и в пролёте
        if ((!FLY || (por && !PHALL)) && !fast && spd > fOn && lowN >= lowTgt() * 0.9 && (!jar || lowJN >= NH * 0.9)) fast = true;
        else if (fast && spd < fOff) { fast = false; pumpDecode(); } }
      const inView = y + vh > sTop && y < sTop + sH;
      if (inView !== sph.view) sph.view = inView;
      if (!FLY && A.sphereHold && cp < 0.99) A.sphereHold = false;                  // после возврата из журнала шар стоит; когда посетитель уходит с экрана героя вверх, вращение в статике снова разрешено
      if (inView && !sph.raf) sphStart();                                    // шар вращается сам, даже если курсор не двигают (цикл запускается, как только герой в кадре и сцена дошла до зала)
      /* регулятор нагрузки: кадры идут дольше бюджета — холст чуть меньше (не чаще раза в 1,5 с) */
      if (inView && Math.abs(vp) * KS > MOVING && dtRaw > 0) {
        const dtc = Math.min(dtRaw, 80); minDt = Math.max(5, Math.min(minDt + 0.004, dtc));
        const base = isPortrait() ? 16.67 : minDt < 19 ? minDt : minDt < 28 ? 16.67 : 33.33;          // телефон: цель всегда 60 кадров/с (из минимума по кадрам цель «ползла» к 30 и регулятор переставал снижать качество) dtEma += (dtc - dtEma) * 0.15;
        if (dtEma > base * 1.35 + 0.5) slowRun++; else slowRun = 0;
        if (slowRun >= (isPortrait() ? 12 : 24) && resScale > 0.6 && now() - lastGov > 1500) { resScale = resScale > 0.8 ? 0.8 : 0.65; govChanges++; A.bc && A.bc('gov', (FLY ? 'fly ' : 'hero ') + resScale + ' dt' + Math.round(dtEma)); slowRun = 0; lastGov = now(); if (resScale < 0.7 && hall) hall.setGridScale(0.5); sizeCanvas(); }
      }
      if (upQ.length) { const mv = Math.abs(vp) * KS > MOVING || (FLY && PHALL && scrolling()); if (!mv || !isPortrait() || performance.now() - lastUp >= (fast ? UP_GAP_LOW : (FLY ? UP_GAP_F : UP_GAP_P))) flushUploads(mv ? 2.5 : 8); }          // телефон: в движении тяжёлая загрузка не чаще раза в UP_GAP_P мс (иначе каждый кадр с хвостом)                // по одной-две тяжёлые текстуры за кадр; в покое — быстрее
      if ((inView || !firstDrawn) && hall && (dirty || Math.abs(cp - paintedP) > 1e-7)) {
        if (paint(t)) { paintedP = cp; dirty = false; } else dirty = true;
      }
      if (inView && hall) { pumpDecode(); }
      if (!FLY) ui(cp, inView);
      if (FLY && !gate && (A.flyWarm || pT > 0)) openGate();              // читалка подошла (или разрешила заранее) — ключи пролёта грузятся
      perfRing[perfN++ % perfRing.length] = performance.now() - w0;
      if (cp !== target || vp !== 0 || upQ.length || (dirty && !firstDrawn) || (inView && (t - lastMove <= IDLE_TAIL || Math.abs(target - cp) > 1e-7))) requestAnimationFrame(tick); else running = false;
    }
    let lastGov = -1e9;
    const now = () => performance.now();

    let wakeT = 0;
    const onScroll = () => { lastScrollT = performance.now(); quiet = 0; schedule(); if (FLY && PHALL) { clearTimeout(wakeT); wakeT = setTimeout(() => { if (!dead && hall && !trimmed && !scrolling()) { pumpDecode(); schedule(); } }, 420); } };          // пауза в прокрутке — догружаем отложенные ключи пролёта
    const onResize = () => { clearTimeout(rzTimer); rzTimer = setTimeout(() => { measureStatic(); sizeCanvas(); schedule(); }, 120); schedule(); };
    /* поменялась ориентация экрана (телефон ↔ компьютер): другой набор кадров, другая дорожка камеры — данные загружаем заново, холсты остаются теми же */
    const onMQ = () => {
      if (dead || FLY || set === dirOf()) return;
      gen++; set = dirOf(); inflight = 0; decN = 0; hierPos = 0; loadedKeys = 0; labelReady = false;
      for (const k in blobs) blobs[k].fill(null); for (const k in busy) busy[k].fill(0);
      resident.fill(0); resJ.fill(0); decoding.fill(0); lowDone.fill(0); lowJDone.fill(0); lowBusy.fill(0); decL = 0; upQ.length = 0; shownP = -1; fast = false; lowN = lowJN = 0;
      if (hall) hall.destroy(true); if (jar) jar.destroy(true); hall = jar = null; W = H = JW = JH = 0;
      measureStatic(); sizeCanvas(); pump(); initGL().then(() => { if (!dead) { pumpDecode(); schedule(); } }).catch(() => { root.classList.add('jar-off'); dead = true; }); schedule();
    };
    addEventListener('scroll', onScroll, {passive: true});
    addEventListener('resize', onResize);
    /* размер сцены может поменяться и без события resize (встроенные браузеры мессенджеров, панели браузера) — следим за самой сценой */
    let ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => { if (dead) return; measureStatic(); sizeCanvas(); schedule(); }); ro.observe(stage); if (world) ro.observe(world); }
    portraitMQ.addEventListener && portraitMQ.addEventListener('change', onMQ);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!dead) { measureStatic(); schedule(); } });
    const onLoad = () => { if (dead) return; measureStatic(); pump(); schedule(); };
    addEventListener('load', onLoad);

    function destroyGL() {
      gen++; upQ.length = 0; clearTimeout(upTimer); upTimer = 0; clearTimeout(rzTimer); if (ro) ro.disconnect();
      removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); removeEventListener('load', onLoad);
      document.removeEventListener('visibilitychange', sphStart); if (sph.raf) cancelAnimationFrame(sph.raf); sph.raf = 0;
      portraitMQ.removeEventListener && portraitMQ.removeEventListener('change', onMQ);
      if (hall) hall.destroy(false); if (jar) jar.destroy(false); hall = jar = null;
      if (!FLY) document.body.classList.remove('arch-hide', 'arch-nav', 'arch-live', 'arch-top');
    }

    set = dirOf();
    measureStatic();
    sizeCanvas();
    const boot = () => initGL().then(() => { if (!dead) { pumpDecode(); schedule(); } }).catch(e => { root.classList.add('jar-off'); if (FLY) root.setAttribute('data-fly-why', 'ошибка запуска: ' + (e && e.message || e)); dead = true; });
    function openGate() { if (gate) return; gate = true; boot(); pump(); schedule(); }          // пролёт поднимается (контексты WebGL, шейдеры, загрузка ключей), только когда читалка его позвала: страница при открытии не платит за вторую сцену
    pump(); if (!FLY) boot();
    schedule();
    const uOf = () => { const l = locate(cp); return l.k + l.t; };
    const self = {
      root,
      /* для проверок: держать кадры a…b в видеопамяти и дождаться, пока они развернутся (все — и зал, и спрайты) */
      prefetch(a, b) { pin = [Math.max(0, a), Math.min(NH - 1, b)]; return new Promise(res => { const t = setInterval(() => { let ok = !!hall; for (let k = pin[0]; k <= pin[1]; k++) if (!resident[k] || (!resJ[k] && !(FLY && k > 0))) ok = false; if (ok || dead) { clearInterval(t); res(ok); } else pumpDecode(); }, 80); }); },
      unpin() { pin = null; },
      /* для проверок: только уменьшенные копии (полные кадры и спрайты выгружены и не разворачиваются) — так выглядит прокрутка, пока рядом нет полных кадров */
      lowOnly(on) { lowOnlyF = !!on; if (on && hall) { for (let k = 0; k < NH; k++) { if (resident[k]) { hall.dropKey(k); resident[k] = 0; } if (resJ[k] && jar) { jar.dropSprite(k); resJ[k] = 0; } } } dirty = true; schedule(); },
      fly: FLY, warm() { if (FLY) openGate(); },
      /* телефон: пока читатель далеко от этого движка (герой — когда он погас, пролёт — когда журнал уже открыт), его видеопамять отдаётся: полные кадры, уменьшенные копии, спрайты, холсты в 2×2.
         Пролёт оставляет последний кадр целиком и три последних уменьшенных (подложка под журналом). trim(false) — всё разворачивается снова от положения (первыми — ближайшие кадры); ready() — можно ли нарисовать текущее положение */
      shrink(n) {                                                                      // вернулись выше конца героя: ключи пролёта дальше первых n (и их копии) отдаём — на подъезде к концу героя они развернутся снова
        if (!FLY || trimmed || !hall) return false; let any = 0;
        for (let k = n; k < NH; k++) { if (resident[k]) { hall.dropKey(k); resident[k] = 0; any++; } if (lowDone[k] === 1) { hall.dropLow(k); lowDone[k] = 0; lowN--; } }
        if (any) { A.bc && A.bc('shrink', any); dirty = true; } return any > 0;
      },
      trim(on) {
        on = !!on; if (on === trimmed) return; trimmed = on; A.bc && A.bc('trim', (FLY ? 'fly ' : 'hero ') + (on ? 'вкл' : 'выкл'));
        if (on) {
          fast = false; flushUploads(1e9);                                              // очередь отрабатывает вхолостую (при trimmed она только закрывает ImageBitmap и снимает отметки «разворачивается»)
          if (hall) for (let k = 0; k < NH; k++) {
            if (resident[k] && !(FLY && k === NH - 1)) { hall.dropKey(k); resident[k] = 0; }
            if (lowDone[k] === 1 && !(FLY && k >= NH - 3)) { hall.dropLow(k); lowDone[k] = 0; lowN--; }
          }
          if (jar) for (let k = 0; k < NH; k++) {
            if (resJ[k]) { jar.dropSprite(k); resJ[k] = 0; }
            if (lowJDone[k] === 1 && !FLY) { jar.dropSpriteLow(k); lowJDone[k] = 0; lowJN--; }
          }
          if (!FLY) { sizeCanvas(); sizeJar(); }
        } else { sizeCanvas(); sizeJar(); dirty = true; schedule(); pumpDecode(); }
      },
      ready() { return !!hall && !trimmed && firstDrawn && hall.plan(cp) === cp; },
      jump(p, moving) { cp = pT = p; cpTick = p; pPrev = p; vp = moving ? 0.05 : 0; started = true; lastMove = performance.now(); flushUploads(1e9); if (hall) paint(performance.now()); vp = 0; if (!FLY) ui(p, true); },      // moving — для проверок: нарисовать так, как рисуется в движении (со сглаживанием кромок)
      state() {
        const ring = Array.prototype.slice.call(perfRing, 0, Math.min(perfN, perfRing.length)).sort((a, b) => a - b);
        let res = 0, resj = 0, lo = 0, loj = 0; for (let k = 0; k < NH; k++) { res += resident[k]; resj += resJ[k]; lo += lowDone[k] === 1 ? 1 : 0; loj += lowJDone[k] === 1 ? 1 : 0; }
        return {p: cp, pTarget: pT, u: uOf(), N: NH, loaded: loadedKeys, set, gl: !!hall, drawn: lastDraw, firstDrawn, resident: res, residentJar: resj, lows: lo, lowSprites: loj, resScale, govChanges, fast, up: {full: upN.full, low: upN.low, queued: upQ.length}, rest: vp === 0 && Math.abs(cp - pT) < 1e-5,
          jar: {loaded: blobs.j.filter(Boolean).length, n: NH, shown: jarShown, sprites: resj, label: labelReady},
          sphere: {ready: !!(hall && hall.sphereReady), yaw: sph.yaw, cur: [sph.hx, sph.hy], running: !!sph.raf, still: scrolling()}, jarOk: lastJarOk, fastNow: fast, trimmed,
          size: [W, H, JW, JH], perf: {n: perfN, mean: ring.length ? ring.reduce((s, v) => s + v, 0) / ring.length : 0, p95: ring.length ? ring[Math.floor(ring.length * 0.95)] : 0, max: ring.length ? ring[ring.length - 1] : 0}};
      },
      destroy() { dead = true; destroyGL(); for (const k in blobs) blobs[k].fill(null); }
    };
    self.complete = () => loadedKeys >= NH && blobs.z.every(Boolean) && (FLY ? !!blobs.j[0] : blobs.j.every(Boolean));
    return self;
  }

  function init() {
    const roots = Array.prototype.slice.call(document.querySelectorAll('.jar-story'));
    if (ctrls.length === roots.length && ctrls.every((c, i) => c.root === roots[i])) return;
    ctrls.forEach(c => c.destroy()); ctrls = [];
    roots.forEach(root => { try { ctrls.push(create(root)); } catch (e) { root.classList.add('jar-off'); } });
    ctrl = ctrls[0] || null;
  }
  A.heroTail = () => { const ar = document.getElementById('arch-story'); return ar ? heroTail(ar, ar.firstElementChild) : 0; };
  window.Astreya = A; A.jar = {init, get ctrl() { return ctrl; }, get ctrls() { return ctrls; }, get arch() { return ctrl; }, get fly() { return ctrls.find(c => c.fly) || null; }};
  /* где в документе «покой» героя (его верх под шапкой): от этой прокрутки считается уход текста героя (js/motion.js). Сцена есть — это конец её закреплённой части
     (кадры доиграли, текст и панель на месте); нет сцены (выключена, нет WebGL) — верх запасного героя под шапкой */
  A.heroBase = function () {
    const ar = document.getElementById('arch-story');
    if (ar && ar.offsetHeight) {
      const st = ar.firstElementChild, y = ar.getBoundingClientRect().top + scrollY + 0.97 * Math.max(0, ar.offsetHeight - (st ? st.clientHeight : innerHeight) - heroTail(ar, st));
      return Math.max(0, Math.round(y));
    }
    return 0;
  };

  /* подключаемся к инициализации страницы: при первой загрузке и после подмены содержимого (переходы между страницами) */
  const prev = A.initPage;
  A.initPage = function (r) { if (prev) prev.apply(this, arguments); init(); };
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
