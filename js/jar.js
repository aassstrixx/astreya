/* jar.js — вступление на главной: баночка «Астрея» оживает по скроллу.
   Секция #jar-story в несколько экранов высотой, внутри — закреплённая сцена (sticky) с canvas. Положение прокрутки внутри секции (0…1)
   выбирает момент заранее отрендеренной последовательности кадров (WebP): вниз — вперёд, вверх — обратная перемотка.

   Как устроена плавность (по итогам «арены» — tools/jar-bench: десятки вариантов гоняли под нагрузкой и сравнивали по метрикам):
   • картинка рисуется на 2D-canvas прямо из <img> — основной поток почти ничего не делает. WebGL/ImageBitmap/интерполяция потока были
     медленнее: загрузка текстур и декодирование выполняются в основном потоке и забивают его при быстрой прокрутке (отсюда «лаги»);
   • три уровня качества кадров (LOD): «полные» (1920×1080 / 810×1440, 278 кадров) — в покое; «средние» (1280×720 / 720×1280, 555 кадров: между
     каждой парой полных — дорисованный промежуточный, tools/jar-render/bake_mid.py) — пока картинка движется; «низкие» (960×540 / 540×960) — только
     если устройство не справляется. Средний кадр декодировать дешевле, а кадров вдвое больше — движение ровнее;
   • регулятор нагрузки: если кадры идут дольше бюджета (по интервалам requestAnimationFrame), уровень качества на время движения снижается,
     а когда запас снова есть — возвращается. В покое всегда показываются полные кадры; смена уровня идёт короткой перекрёстной сменой;
   • движение по кадрам ведёт «пружина» с критическим затуханием (а не простое сглаживание): нет рывка на старте и мягкая остановка без «щелчка»;
     в покое показывается ровно ближайший кадр (без двоения), при движении соседние кадры смешиваются;
   • в цикле нет чтения вёрстки: границы сцены измеряются один раз (и при изменении размера), CSS-переменные пишутся только при изменении;
   • первая загрузка (холодный кэш): кадры берутся через fetch → Blob → <img> — это не задерживает событие load (его ждёт заставка), поэтому начинается сразу, и
     тянутся параллельно по HTTP/2 (16 «полос» на компьютере, 10 на телефоне: при 3–4 полосах скорость упиралась в задержку запроса, а не в канал). Порядок:
     первый кадр → полные кадры у положения → «каркас» среднего набора (каждый 8-й кадр) → средний набор с окном впереди по ходу движения и «от грубого к тонкому» →
     полные кадры рядом (в покое) → остальные полные. Пока идёт движение, полные кадры не грузим (в движении показываются средние, а канал нужен им). Пока кадров
     рядом ещё нет, смешиваются ближайшие загруженные (не дальше 8 кадров) — картинка едет по положению, а не шагает (замеры: tools/jar-bench/cold.js);
 (пружина по щелчкам колеса) — везде одинаково, в том числе на этой сцене; пружина плейхеда добавляет к нему
     лишь небольшую задержку и ведёт сцену при касаниях, перетаскивании ползунка и якорях (подбор — tools/jar-bench/scroll-sim.js).
   Кадры: assets/jar/d, dm, dl (горизонтальный экран) и m, mm, ml (вертикальный); в автономной сборке — только низкий набор dl/ml из data:-адресов (вес).
   Положения кадров по сценарию (p от 0 до 1): data-p — полный набор (сетка неравномерная, кадров больше там, где движение быстрее),
   data-pb — средний и низкий наборы.
   Вступление показывается при любых настройках устройства («уменьшить движение», экономия трафика) — по решению заказчика; без JS его нет.
   Подписи, шапка и кнопка «Пропустить» — тоже от прокрутки. После баночки идёт экран с лозунгом (#jar-outro): слова проявляются по той же
   прокрутке, линия с жемчужиной дорисовывается, затем всё уходит.
   Файл загружается только на главной и только пока jar.enabled = true (data/redesign.json). */
(function () {
  'use strict';
  const A = window.Astreya || {};
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = x => x * x * (3 - 2 * x);
  /* смешивание соседних полных кадров: пока на кадре чёткие детали (p < 0.6) — только на середине шага, чтобы этикетка не двоилась;
     на гладком креме (нырок) — плавно по всему шагу */
  const narrowBlend = (x, p) => p < 0.6 ? ease(clamp((x - 0.42) / 0.16, 0, 1)) : ease(x);
  const pad = i => String(i).padStart(3, '0');
  const portraitMQ = window.matchMedia('(max-aspect-ratio: 11/10)');
  const OMEGA = 24;           // жёсткость пружины, 1/с: отставание при равномерной прокрутке ≈ 2/OMEGA ≈ 0,08 с, остановка (до 2 %) ≈ 0,25 с
  /* скорость плейхеда считаем в кадрах полного набора в секунду; полные кадры шагают по ~15 px, поэтому при любом заметном движении лучше средний уровень:
     вдвое плотнее, с запечёнными промежуточными (арена, раунд 11: рывки 2,6 → 0,5 px, кадров дольше 33 мс 2,2 → 0,5 %) */
  const FAST = 5;             // быстрее — средний уровень (в покое и почти в покое — полные)
  const SLOW = 2.5;           // медленнее (дольше HOLD мс) — снова полные
  const HOLD = 140;
  const MOVING = 2.5;         // выше — «идёт движение»: регулятор нагрузки может ограничить уровень
  const XFADE = 160;          // мс, перекрёстная смена уровней
  /* загрузка кадров: HTTP/2 (GitHub Pages) тянет много маленьких файлов параллельно — «полос» должно быть много, иначе на мобильной сети скорость упирается
     в задержку запроса, а не в канал (замеры: tools/jar-bench/cold.js) */
  const LANES = [16, 10];     // [компьютер, телефон] — при загрузке через fetch (HTTP/2)
  const LANES_IMG = [4, 3];   // запасной путь (file://, нет fetch) — как раньше
  const FLOOR_LVL = 3;        // «каркас» среднего набора: каждый 8-й кадр (≈70 кадров)
  const GAP = 8;              // пока кадров рядом ещё нет, пару для смешивания берём из ближайших загруженных не дальше стольких кадров
  let ctrl = null;

  function create(root) {
    const stage = root.querySelector('.js-stage'), skip = root.querySelector('.js-skip');
    const cv = root.querySelector('.js-cv');
    const caps = Array.prototype.slice.call(root.querySelectorAll('.js-cap')).map(el => ({el, a: +el.dataset.from, b: +el.dataset.to}));
    const ds = root.dataset, NH = +ds.n || 1, ext = ds.ext || 'webp', ver = ds.v ? '?v=' + ds.v : '', bundle = !!window.__ASTREYA_BUNDLE;
    const nums = s => String(s || '').split(',').filter(x => x !== '').map(Number);
    let Phi = nums(ds.p);
    if (Phi.length !== NH || Phi.some(isNaN)) { Phi = []; for (let i = 0; i < NH; i++) Phi.push(NH > 1 ? i / (NH - 1) : 0); }
    let Pb = nums(ds.pb);
    if (Pb.some(isNaN)) Pb = [];

    const outro = document.getElementById('jar-outro'), jo = outro && outro.querySelector('.jo-stage');
    const words = outro ? Array.prototype.slice.call(outro.querySelectorAll('.jo-w')) : [];

    let ctx2d = null;
    try { ctx2d = cv.getContext('2d', {alpha: false}); } catch (e) { ctx2d = null; }
    if (!ctx2d) { root.classList.add('jar-off'); return {root, destroy() {}}; }

    /* ---- наборы кадров (уровни): для телефона — вертикальные; в автономной сборке — только лёгкий ---- */
    const isPortrait = () => portraitMQ.matches;
    const urlOf = (dir, i) => { const p = dir + pad(i) + '.' + ext; return A.assetUrl ? A.assetUrl(p) + (bundle ? '' : ver) : p + ver; };
    let T = [], hasHi = false, liteIdx = 0, xlIdx = -1, set = '', gen = 0;
    /* порядок «от грубого к тонкому»: сначала каждый 64-й кадр, потом каждый 32-й, 16-й … — на любом этапе загрузки кадры лежат по сценарию равномерно */
    const ctz = (i, n) => { if (!i || i === n - 1) return 99; let c = 0; while (!(i & 1)) { i >>= 1; c++; } return c; };
    const hier = n => Array.from({length: n}, (_, i) => i).sort((a, b) => ctz(b, n) - ctz(a, n) || a - b);
    function makeTiers() {
      const por = isPortrait(), pick = (a, b) => (por ? b : a), list = [];
      const add = (dir, P) => { let t; if (dir && P.length) list.push({dir, P, N: P.length, im: new Array(P.length).fill(null), busy: new Uint8Array(P.length), loaded: 0, bb: hier(P.length), bbPos: 0, floor: 0}); t = list[list.length - 1]; t.floor = t.bb.filter(i => ctz(i, t.N) >= FLOOR_LVL).length; };
      hasHi = false; liteIdx = 0; xlIdx = -1;
      const mid = pick(ds.dm, ds.mm), low = pick(ds.dl, ds.ml);
      if (bundle && Pb.length && low) add(low, Pb);                        // автономная сборка: один набор — самый лёгкий по весу
      else {
        add(pick(ds.d, ds.m), Phi); hasHi = list.length > 0;
        if (Pb.length && mid) { liteIdx = list.length; add(mid, Pb); }
        if (Pb.length && low) { xlIdx = list.length; add(low, Pb); }
      }
      if (liteIdx >= list.length) liteIdx = 0;
      if (xlIdx >= list.length) xlIdx = -1;
      return list;
    }

    /* ---- состояние ---- */
    let W = 0, H = 0, dead = false, firstDrawn = false, running = false, last = 0, dirty = true, started = false;
    let cp = 0, vp = 0, pT = 0, cq = 0, vq = 0, qT = 0, paintedP = -1, paintedWant = -1, rzTimer = 0;
    let sTop = 0, sTot = 1, sH = 1, oTop = 0, oTot = 1, oH = 0;
    const born = performance.now();
    /* уровень по скорости и регулятор нагрузки */
    let lastDraw = null, lastSig = -1, tier = 0, calm = 0, gov = 0, used = -1, wantIdx = 0, restW = 1, xf = null, xlWanted = false;
    let dtEma = 16.7, minDt = 16.7, slowRun = 0, fastRun = 0, govLock = 0, lastGov = -1e9, upLocked = false, govChanges = 0;
    const perfRing = new Float32Array(240); let perfN = 0;

    /* ---- загрузка. Кадры берутся через fetch → Blob → <img>: такая загрузка не задерживает событие load (его ждёт заставка), поэтому начинается сразу;
       если fetch недоступен (страница с диска, старый браузер) — обычные <img>, и до load берётся только первый кадр ----
       Порядок: первый кадр → полные кадры у положения (чтобы первый вид был резким) → средний набор «от грубого к тонкому» с окном впереди по ходу движения →
       полные кадры рядом с положением (в покое) → остальные полные от положения; самый лёгкий набор — только если регулятор его попросил. Пока идёт движение,
       полные кадры не грузим: в движении показываются средние, а канал нужен им */
    const canFetch = !bundle && typeof fetch === 'function' && location.protocol !== 'file:';
    let inflight = 0, winLoaded = document.readyState === 'complete', firstAsked = false, hiPrime = 3, dirSign = 1;
    const blobUrls = [];
    function locate(P, p) {                // положение на сценарии → пара кадров и доля между ними
      const N = P.length;
      if (p <= P[0]) return {k: 0, t: 0};
      if (p >= P[N - 1]) return {k: Math.max(0, N - 2), t: 1};
      let lo = 0, hi = N - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m] <= p) lo = m; else hi = m; }
      return {k: lo, t: (p - P[lo]) / (P[lo + 1] - P[lo])};
    }
    function nearestMissing(t, from, maxd) {
      const lim = Math.min(t.N, maxd === undefined ? t.N : maxd + 1);
      for (let d = 0; d < lim; d++) {
        const a = from - d, b = from + d;
        if (a >= 0 && !t.busy[a]) return a;
        if (b < t.N && !t.busy[b]) return b;
      }
      return -1;
    }
    function nearDir(t, from, dir, ahead, behind) {       // ближайший ещё не запрошенный кадр в окне: впереди по ходу движения — шире, позади — уже
      for (let d = 0, m = Math.max(ahead, behind); d <= m; d++) {
        const a = from + dir * d, b = from - dir * d;
        if (d <= ahead && a >= 0 && a < t.N && !t.busy[a]) return a;
        if (d <= behind && b >= 0 && b < t.N && !t.busy[b]) return b;
      }
      return -1;
    }
    function nextHier(t, limit) {
      const lim = limit === undefined ? t.N : limit;
      while (t.bbPos < lim && t.busy[t.bb[t.bbPos]]) t.bbPos++;
      return t.bbPos < lim ? t.bb[t.bbPos] : -1;
    }
    function pickNext() {
      const lt = T[liteIdx], hi = hasHi ? T[0] : null, xl = xlIdx >= 0 ? T[xlIdx] : null;
      const kOf = t => locate(t.P, cp).k;
      let i;
      if (!canFetch && !winLoaded) {                                  // без fetch до load — только первый кадр: остальные задержали бы событие load
        if (firstAsked || !lt) return null;
        firstAsked = true; i = nearestMissing(lt, kOf(lt)); return i >= 0 ? {ti: liteIdx, i} : null;
      }
      const moving = Math.abs(vp) * (NH - 1) > MOVING;
      if (lt && !firstAsked) { firstAsked = true; i = nearestMissing(lt, kOf(lt)); if (i >= 0) return {ti: liteIdx, i}; }
      if (hi && hiPrime > 0 && (i = nearestMissing(hi, kOf(hi))) >= 0) { hiPrime--; return {ti: 0, i}; }
      if (hi && !moving && (i = nearestMissing(hi, kOf(hi), 3)) >= 0) return {ti: 0, i};          // стоим — нужен резкий кадр
      if (lt) {
        if ((i = nextHier(lt, lt.floor)) >= 0) return {ti: liteIdx, i};                               // сначала «каркас» — каждый 2^FLOOR_LVL-й кадр: листать можно из любого места
        if ((i = nearDir(lt, kOf(lt), dirSign, moving ? 28 : 16, moving ? 6 : 4)) >= 0) return {ti: liteIdx, i};
        if ((i = nextHier(lt)) >= 0) return {ti: liteIdx, i};
      }
      if (hi && (i = nearestMissing(hi, kOf(hi))) >= 0) return {ti: 0, i};
      if (xl && xlWanted && (i = nearestMissing(xl, kOf(xl))) >= 0) return {ti: xlIdx, i};
      return null;
    }
    const lanesNow = () => (canFetch ? LANES : LANES_IMG)[isPortrait() ? 1 : 0];
    function pump() {
      if (dead) return;
      const lanes = lanesNow();
      while (inflight < lanes) { const j = pickNext(); if (!j) return; load(j.ti, j.i); }
    }
    function load(ti, i) {
      const t = T[ti], g = gen, url = urlOf(t.dir, i);
      t.busy[i] = 1; inflight++;
      const done = img => {
        if (g !== gen) return;
        inflight--; t.busy[i] = 2;
        if (img) { t.im[i] = img; t.loaded++; if (Math.abs(i - locate(t.P, cp).k) <= GAP + 1) { dirty = true; schedule(); } }        // перерисовываем, только если кадр нужен рядом с текущим положением
        pump();
      };
      const viaImg = (src, blob) => {
        const img = new Image(); img.decoding = 'async';
        img.onload = () => { img.onload = img.onerror = null; done(img); };
        img.onerror = () => { img.onload = img.onerror = null; if (blob) { try { URL.revokeObjectURL(src); } catch (e) {} } done(null); };
        img.src = src;
      };
      if (canFetch) {
        fetch(url, {priority: 'low'}).then(r => { if (!r.ok) throw new Error('http'); return r.blob(); })
          .then(b => { if (g !== gen) return; const u = URL.createObjectURL(b); blobUrls.push(u); viaImg(u, true); })
          .catch(() => { if (g === gen) viaImg(url, false); });
      } else viaImg(url, false);
    }
    function startLoading() {
      const key = isPortrait() ? 'm' : 'd'; if (set === key) return;
      set = key; gen++; inflight = 0; firstAsked = false; hiPrime = 3; used = -1; paintedWant = -1; xf = null; lastSig = -1; dirty = true;
      T = makeTiers();
      pump();
    }

    /* ---- размер холста ---- */
    function sizeCanvas() {
      const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2), s = Math.min(dpr, Math.sqrt(4.4e6 / Math.max(1, w * h)));
      const nw = Math.round(w * s), nh = Math.round(h * s);
      if (nw !== W || nh !== H || cv.width !== nw || cv.height !== nh) { W = nw; H = nh; if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; } lastSig = -1; }
      dirty = true;
    }

    /* ---- что рисовать: для уровня want — пара кадров и доля смешивания; если кадров ещё нет, берётся другой уровень или ближайший загруженный кадр ---- */
    function mkPair(ti, ia, ib, tt) {          // пара кадров уровня ti и доля смешивания; null — нужных картинок ещё нет
      const t = T[ti], full = hasHi && ti === 0;
      let a = ib === ia ? 0 : (full ? narrowBlend(tt, cp) : tt) * (1 - restW) + (tt < 0.5 ? 0 : 1) * restW;       // в покое — ровно ближайший кадр, без двоения
      let A_ = t.im[ia], B_ = t.im[ib];
      if (a < 0.02) a = 0; else if (a > 0.98) { a = 0; A_ = B_; ia = ib; }
      return A_ && (a === 0 || B_) ? {ti, ia, ib, a, A_, B_: a > 0 ? B_ : null} : null;
    }
    function pairFor(ti, gapMax) {
      const t = T[ti], l = locate(t.P, cp), ib = Math.min(t.N - 1, l.k + 1);
      const r = mkPair(ti, l.k, ib, l.t); if (r || !gapMax) return r;
      let lo = l.k, up = ib;                      // кадров рядом ещё нет (идёт загрузка) — смешиваем ближайшие загруженные с обеих сторон, если они не слишком далеко
      while (lo >= 0 && l.k - lo < gapMax && !t.im[lo]) lo--;
      while (up < t.N && up - ib < gapMax && !t.im[up]) up++;
      if (lo < 0 || up >= t.N || !t.im[lo] || !t.im[up]) return null;
      return mkPair(ti, lo, up, clamp((cp - t.P[lo]) / (t.P[up] - t.P[lo]), 0, 1));
    }
    function resolve(want) {
      const order = [want], nu = T.length;
      for (let d = 1; d < nu; d++) { if (want + d < nu) order.push(want + d); if (want - d >= 0) order.push(want - d); }
      let r;
      for (let n = 0; n < order.length; n++) if ((r = pairFor(order[n], 0))) return r;              // точная пара где-нибудь
      for (let n = 0; n < order.length; n++) if ((r = pairFor(order[n], GAP))) return r;            // пара из ближайших загруженных
      let best = null, bd = 1e9;                         // ничего подходящего не загружено (самое начало) — ближайший к положению загруженный кадр любого уровня
      T.forEach((t, ti) => {
        const k = locate(t.P, cp).k;
        for (let d = 0; d < t.N; d++) {
          let found = false;
          [k - d, k + 1 + d].forEach(j => { if (j >= 0 && j < t.N && t.im[j]) { found = true; const dd = Math.abs(t.P[j] - cp); if (dd < bd) { bd = dd; best = {ti, ia: j, ib: j, a: 0, A_: t.im[j], B_: null}; } } });
          if (found) break;
        }
      });
      return best;
    }
    function drawImg(im, alpha) {
      const iw = im.naturalWidth, ih = im.naturalHeight; if (!iw || !ih) return;
      const k = Math.max(W / iw, H / ih), dw = iw * k, dh = ih * k;
      ctx2d.globalAlpha = alpha; ctx2d.drawImage(im, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }
    function compose(r, alpha, single) {
      ctx2d.imageSmoothingEnabled = true; ctx2d.imageSmoothingQuality = 'low';      // 'high' на процессорной растеризации в 10–20 раз дороже (замеры), а выигрыш в чёткости — доли дБ
      if (single) { drawImg(r.B_ && r.a >= 0.5 ? r.B_ : r.A_, alpha); return; }
      drawImg(r.A_, 1);
      if (r.B_ && r.a > 0) drawImg(r.B_, r.a);
    }
    function paint(now) {
      if (!T.length) return false;
      restW = clamp(1 - Math.abs(vp) * (NH - 1), 0, 1);
      const r = resolve(clamp(wantIdx, 0, T.length - 1)); if (!r) return false;
      if (r.ti !== used) { if (used >= 0 && used < T.length && firstDrawn) xf = {from: used, t0: now}; used = r.ti; }      // сменился уровень — короткая перекрёстная смена
      const sig = ((r.ti * 1024 + r.ia) * 1024 + r.ib) * 65 + Math.round(r.a * 64);
      if (!xf && sig === lastSig) { lastDraw.xf = 0; return true; }       // та же картинка, что уже на холсте (например, пока полный кадр держится на месте) — не перерисовываем
      let drew = false;
      if (xf) {
        const pr = (now - xf.t0) / XFADE;
        if (pr >= 1 || xf.from === r.ti) xf = null;
        else { const r0 = resolve(xf.from); if (r0) { compose(r0, 1, false); compose(r, ease(pr), true); drew = true; } else xf = null; }
      }
      if (!drew) compose(r, 1, false);
      ctx2d.globalAlpha = 1;
      lastDraw = {ti: r.ti, ia: r.ia, ib: r.ib, a: r.a, xf: drew ? ease(clamp((now - xf.t0) / XFADE, 0, 1)) : 0, xfTi: drew ? xf.from : -1};
      lastSig = drew ? -1 : sig;
      if (!firstDrawn) { firstDrawn = true; root.classList.add('ready'); }
      return true;
    }

    /* ---- уровень по скорости + регулятор нагрузки ---- */
    function chooseTier(now, dtRaw) {
      const fps = Math.abs(vp) * (NH - 1), moving = fps > MOVING;
      if (cp === pT && vp === 0) { tier = 0; calm = 0; }          // остановились — полные кадры
      else {
        const want = fps > FAST ? 1 : 0;
        if (want >= tier) { tier = want; calm = 0; }
        else if (fps < SLOW) { if (!calm) calm = now; if (now - calm > HOLD) { tier = want; calm = 0; } }
        else calm = 0;
      }
      if (moving && T.length > 1 && dtRaw > 0) {
        // интервалы кадров дольше бюджета → ограничиваем уровень сверху; запас → возвращаем. Бюджет считаем от частоты экрана (минимальный интервал)
        dtRaw = Math.min(dtRaw, 80);
        minDt = Math.max(5, Math.min(minDt + 0.004, dtRaw));
        const base = minDt < 19 ? minDt : minDt < 28 ? 16.67 : 33.33;
        dtEma += (dtRaw - dtEma) * 0.15;
        if (dtEma > base * 1.25 + 0.5) { slowRun++; fastRun = 0; }
        else if (dtEma < base * 1.05 + 0.2) { fastRun++; slowRun = 0; }
        else slowRun = 0;
        if (slowRun >= 14 && gov < T.length - 1 && now > govLock) {
          gov = gov === 0 && T.length > 2 ? 2 : gov + 1; govChanges++; slowRun = fastRun = 0; govLock = now + 1200;      // уровень 1 (средний) при движении и так включён — сразу на низкий
          if (now - lastGov < 4000) upLocked = true;                 // уровень снижали дважды подряд — устройство слабое, обратно не поднимаем
          lastGov = now; if (gov >= 1) xlWanted = true;
        } else if (fastRun >= 240 && gov > 0 && !upLocked && now > govLock + 2800) { gov = gov === 2 && T.length > 2 ? 0 : gov - 1; govChanges++; fastRun = 0; govLock = now + 1200; lastGov = now; }
      }
      wantIdx = Math.min(Math.max(tier, moving ? gov : 0), Math.max(0, T.length - 1));
    }

    /* ---- запись CSS-переменных только при изменении значения ---- */
    function setv(el, name, val) {
      const key = '_' + name;
      if (el[key] === val) return;
      el[key] = val; el.style.setProperty(name, val);
    }

    /* ---- интерфейс сцены от прогресса p (0…1) ---- */
    function ui(p, inView) {
      caps.forEach(c => {
        const len = c.b - c.a, f = Math.max(0.012, len * 0.2);
        const o = ease(clamp((p - c.a) / f, 0, 1)) * (1 - ease(clamp((p - (c.b - f)) / f, 0, 1)));
        setv(c.el, '--o', o.toFixed(3));
        setv(c.el, '--y', ((1 - o) * 26 * (p < (c.a + c.b) / 2 ? 1 : -1)).toFixed(1) + 'px');
      });
      setv(stage, '--cue', (1 - clamp(p / 0.035, 0, 1)).toFixed(3));
      const sk = 1 - clamp((p - 0.84) / 0.05, 0, 1);
      setv(stage, '--skip', sk.toFixed(3)); if (skip) skip.classList.toggle('gone', sk < 0.05);
      setv(stage, '--m', ease(clamp((p - 0.76) / 0.225, 0, 1)).toFixed(3));       // крем плавно растворяется в молоко почти до конца сцены
      document.body.classList.toggle('jar-on', inView && p < 0.56);       // светлая шапка — только пока фон тёмный; на светлом креме возвращается обычная
    }

    /* ---- экран с лозунгом: q (0…1) — прокрутка внутри закреплённой части; проявление по порядку: подпись → слова → линия с жемчужиной → девиз → уход ---- */
    function uiOutro(q) {
      const st = (a, b) => ease(clamp((q - a) / (b - a), 0, 1));
      const n = words.length;
      setv(jo, '--q', q.toFixed(3));
      setv(jo, '--e', st(0.02, 0.12).toFixed(3));
      words.forEach((w, i) => { const a = 0.07 + i * (n > 1 ? 0.36 / (n - 1) : 0); setv(w, '--o', st(a, a + 0.2).toFixed(3)); });
      setv(jo, '--r', st(0.56, 0.74).toFixed(3));
      setv(jo, '--s', st(0.70, 0.82).toFixed(3));
      setv(jo, '--x', (1 - st(0.90, 1.0)).toFixed(3));
      setv(jo, '--g', (st(0.0, 0.45) * (1 - st(0.88, 1.0))).toFixed(3));       // свечение фона: из молока и обратно в молоко (без видимых краёв сцены)
    }

    /* ---- границы сцены измеряются один раз (и при изменении размера) — в цикле вёрстку не читаем ---- */
    function measureStatic() {
      const sy = window.scrollY || window.pageYOffset || 0;
      const r = root.getBoundingClientRect(); sTop = r.top + sy; sH = root.offsetHeight; sTot = Math.max(1, sH - stage.clientHeight);
      if (outro) { const o = outro.getBoundingClientRect(); oTop = o.top + sy; oH = outro.offsetHeight; oTot = Math.max(1, oH - jo.clientHeight); }
    }

    /* ---- цикл: прокрутка → цель; пружина ведёт текущее положение к цели ---- */
    function schedule() { if (!running && !dead) { running = true; last = 0; requestAnimationFrame(tick); } }
    function tick(t) {
      if (dead) { running = false; return; }
      const w0 = performance.now();
      const dtRaw = last ? t - last : 0, dt = last ? clamp(dtRaw / 1000, 0.001, 0.1) : 0.016; last = t;
      const y = window.scrollY || window.pageYOffset || 0, vh = innerHeight;
      pT = clamp((y - sTop) / sTot, 0, 1);
      qT = outro ? clamp((y - oTop) / oTot, 0, 1) : 0;
      /* страница открыта посреди сцены (восстановление прокрутки после перезагрузки) — без «разгона» с нуля */
      if (!started || (w0 - born < 900 && Math.abs(pT - cp) > 0.08)) { started = true; cp = pT; vp = 0; if (Math.abs(qT - cq) > 0.08) { cq = qT; vq = 0; } }
      // критически затухающая пружина (точное решение на шаг dt): x'' = −2ω x' − ω² (x − цель)
      const e = Math.exp(-OMEGA * dt);
      let d = cp - pT, c = vp + OMEGA * d;
      cp = pT + (d + c * dt) * e; vp = (vp - OMEGA * c * dt) * e;
      d = cq - qT; c = vq + OMEGA * d;
      cq = qT + (d + c * dt) * e; vq = (vq - OMEGA * c * dt) * e;
      if (Math.abs(cp - pT) < 2e-6 && Math.abs(vp) < 1e-4) { cp = pT; vp = 0; }
      if (Math.abs(cq - qT) < 2e-6 && Math.abs(vq) < 1e-4) { cq = qT; vq = 0; }
      cp = clamp(cp, 0, 1); cq = clamp(cq, 0, 1);
      if (Math.abs(vp) > 1e-3) dirSign = vp > 0 ? 1 : -1;
      const inView = y + vh > sTop && y < sTop + sH;
      const inOutro = !!outro && y + vh > oTop && y < oTop + oH;
      if (inView) chooseTier(t, dtRaw);
      if ((inView || !firstDrawn) && (dirty || xf || wantIdx !== paintedWant || Math.abs(cp - paintedP) > 1e-7)) {
        if (paint(t)) { paintedP = cp; paintedWant = wantIdx; dirty = false; } else dirty = true;
      }
      ui(cp, inView);
      if (jo && (inOutro || cq !== qT)) uiOutro(cq);
      perfRing[perfN++ % perfRing.length] = performance.now() - w0;
      if (cp !== pT || cq !== qT || xf || (dirty && !firstDrawn) || (inView && wantIdx !== paintedWant)) requestAnimationFrame(tick); else running = false;
    }

    const onScroll = () => schedule();
    const onResize = () => { clearTimeout(rzTimer); rzTimer = setTimeout(() => { measureStatic(); sizeCanvas(); startLoading(); schedule(); }, 120); schedule(); };
    const onMQ = () => { measureStatic(); sizeCanvas(); startLoading(); schedule(); };
    addEventListener('scroll', onScroll, {passive: true});
    addEventListener('resize', onResize);
    /* размер сцены может поменяться и без события resize (встроенные браузеры мессенджеров, поздно пришедший CSS, панели браузера) — тогда холст
       остался бы старого размера и картинка растянулась; следим за самой сценой (CSS object-fit: cover страхует от растяжения до пересчёта) */
    let ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => { if (dead) return; measureStatic(); sizeCanvas(); schedule(); }); ro.observe(stage); }
    portraitMQ.addEventListener && portraitMQ.addEventListener('change', onMQ);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!dead) { measureStatic(); schedule(); } });
    const onLoad = () => { if (dead) return; winLoaded = true; measureStatic(); pump(); schedule(); };
    addEventListener('load', onLoad);
    if (skip) skip.addEventListener('click', () => {
      const hero = document.querySelector('.hero'), hh = (document.getElementById('hdr') || {}).offsetHeight || 0;
      const to = hero ? hero.getBoundingClientRect().top + scrollY - hh : root.getBoundingClientRect().bottom + scrollY;
      scrollTo({top: Math.round(to), behavior: 'smooth'});
    });

    measureStatic();
    sizeCanvas();
    startLoading();
    schedule();
    const uOf = () => { const l = locate(Phi, cp); return l.k + l.t; };
    return {
      root,
      tierP() { return T.map(t => t.P); },
      jump(p) { cp = pT = p; vp = 0; started = true; wantIdx = 0; tier = 0; restW = 1; xf = null; paint(performance.now()); ui(p, true); },
      state() {
        const ring = Array.prototype.slice.call(perfRing, 0, Math.min(perfN, perfRing.length)).sort((a, b) => a - b);
        return {p: cp, pTarget: pT, u: uOf(), cur: uOf(), target: pT * (NH - 1), N: NH, loaded: T.length ? T[hasHi ? 0 : liteIdx].loaded : 0, set,
          drawn: lastDraw, tiers: T.map(t => t.loaded), tierN: T.map(t => t.N), complete: T.length > 0 && T.every((t, i) => i === xlIdx || t.loaded >= t.N), tierCount: T.length, hasHi, used, want: wantIdx, gov, govChanges, xl: xlWanted, firstDrawn, oq: cq, oTarget: qT,
          perf: {n: perfN, mean: ring.length ? ring.reduce((s, v) => s + v, 0) / ring.length : 0, p95: ring.length ? ring[Math.floor(ring.length * 0.95)] : 0, max: ring.length ? ring[ring.length - 1] : 0}};
      },
      destroy() {
        dead = true; gen++; clearTimeout(rzTimer); if (ro) ro.disconnect();
        removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); removeEventListener('load', onLoad);
        portraitMQ.removeEventListener && portraitMQ.removeEventListener('change', onMQ);
        T = []; blobUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} }); blobUrls.length = 0;
        document.body.classList.remove('jar-on');
      }
    };
  }

  function init() {
    const root = document.getElementById('jar-story');
    if (ctrl && ctrl.root === root) return;
    if (ctrl) { ctrl.destroy(); ctrl = null; }
    if (!root) return;
    try { ctrl = create(root); } catch (e) { root.classList.add('jar-off'); ctrl = null; }
  }
  window.Astreya = A; A.jar = {init, get ctrl() { return ctrl; }};
  /* где в документе «покой» героя (его верх под шапкой): от этой прокрутки считается уход текста героя (js/motion.js) */
  A.heroBase = function () {
    const r = document.getElementById('jar-story'), hero = r && document.querySelector('.hero');
    if (!r || !hero || !r.offsetHeight) return 0;
    return Math.max(0, Math.round(hero.getBoundingClientRect().top + scrollY - ((document.getElementById('hdr') || {}).offsetHeight || 0)));
  };

  /* подключаемся к инициализации страницы: при первой загрузке и после подмены содержимого (автономная сборка/переходы) */
  const prev = A.initPage;
  A.initPage = function (r) { if (prev) prev.apply(this, arguments); init(); };
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
