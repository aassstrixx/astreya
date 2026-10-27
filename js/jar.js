/* jar.js — первый экран главной: закреплённая сцена со скролл-анимацией (секция #arch-story, data/redesign.json → jar.arch).
   Секция в несколько экранов высотой, внутри — закреплённая сцена (sticky). Положение прокрутки внутри секции (0…1) — это положение камеры на заранее отрендеренном пути (Blender, tools/jar-render/hall_story.py):
   вниз — вперёд, вверх — обратная перемотка. Камера «наезд с отъездом» от крупной баночки по центру (заставка с полоской «Листайте») к готовому кадру; баночка раскручивается, уходит на подиум и встаёт там одна,
   затем поверх встаёт герой (заголовок, кнопки, панель «Почему выбирают Астрею?»).

   Как рисуется (js/jar-gl.js, WebGL2) — и почему картинка не «дребезжит» и не мылится в движении:
   • зал — ключевые кадры (60 штук, 1920×1080 / 900×1600) с картами глубины; для любого положения прокрутки два соседних кадра перепроецируются на камеру этого положения (дорожка камеры из Blender)
     и сливаются. Никакого смешивания «картинка в картинку»: предметы не раздваиваются, кромки резкие, камера движется непрерывно, а не шагает от кадра к кадру. Набор кадров один, без «лёгких»
     уровней: в движении тот же резкий кадр, что и в покое;
   • в покое прокрутка мягко «примагничивается» к ближайшему ключевому кадру: показывается сам отрендеренный кадр пиксель в пиксель (чёткость Cycles без пересчёта);
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
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const ease = x => x * x * (3 - 2 * x);
  const pad = i => String(i).padStart(3, '0');
  const portraitMQ = window.matchMedia('(max-aspect-ratio: 11/10)');
  const OMEGA = 24;           // жёсткость пружины, 1/с: отставание при равномерной прокрутке ≈ 2/OMEGA ≈ 0,08 с, остановка (до 2 %) ≈ 0,25 с
  const SNAP_DELAY = 110;     // мс без движения прокрутки, после которых плейхед мягко встаёт на ближайший ключевой кадр
  const MOVING = 0.04;        // ключевых кадров в секунду: быстрее — идёт движение (включается сглаживание кромок)
  const LANES = [14, 8];      // запросов одновременно: [компьютер, телефон] (HTTP/2)
  const RES = [5, 4];         // сколько ключевых кадров по обе стороны от положения держим в видеопамяти: [компьютер, телефон]
  const DECODERS = 2;         // одновременных разворачиваний картинок в текстуры
  let ctrl = null, ctrls = [];       // ctrls — все сцены страницы (на главной одна: #arch-story), ctrl — она же

  function glOk() {                  // WebGL2 есть? (проверка на отдельном холсте — холсты сцены остаются нетронутыми)
    try { const c = document.createElement('canvas'), g = c.getContext('webgl2'); if (!g) return false; const e = g.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); return true; } catch (e) { return false; }
  }

  function create(root) {
    const stage = root.querySelector('.js-stage');
    const cv = root.querySelector('.js-cv');
    const jcv = root.querySelector('.ar-jar-cv'), world = root.querySelector('.ar-world');
    const ds = root.dataset, NH = +ds.n || 1, ext = ds.ext || 'webp', ver = ds.v ? '?v=' + ds.v : '';
    /* вид заставки (data/redesign.json → jar.arch.look): размер баночки на старте и живая тень (кадры до shadow.from тени не содержат — её рисует сайт по текущему положению баночки) */
    let look = {}; try { look = JSON.parse(ds.look || '{}') || {}; } catch (e) { look = {}; }
    const LS = look.scale || {}, LSH = look.shadow || null, LG = look.ground || null;
    const dead0 = () => { root.classList.add('jar-off'); return {root, complete: () => true, destroy() {}, state: () => ({})}; };
    if (!A.ArchGL || !cv || !jcv || typeof fetch !== 'function' || typeof createImageBitmap !== 'function' || !glOk()) return dead0();
    const nums = s => String(s || '').split(',').filter(x => x !== '').map(Number);
    let Phi = nums(ds.p);
    if (Phi.length !== NH || Phi.some(isNaN)) { Phi = []; for (let i = 0; i < NH; i++) Phi.push(NH > 1 ? i / (NH - 1) : 0); }
    const jsonOf = t => { try { const a = JSON.parse(t || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
    const JR = [jsonOf(ds.jr), jsonOf(ds.jrm)];                                     // рамки баночки по кадрам (доли кадра: x, y, w, h) — [компьютер, телефон]
    const isPortrait = () => portraitMQ.matches;
    const urlOf = p => (A.assetUrl ? A.assetUrl(p) : p) + ver;
    const canFetch = true;
    const PRESERVE = !!window.__ASTREYA_GL_PRESERVE;                                // проверки читают пиксели холстов

    /* ---- состояние ---- */
    let W = 0, H = 0, JW = 0, JH = 0, dead = false, firstDrawn = false, jarShown = false, running = false, last = 0, dirty = true, started = false;
    let cp = 0, vp = 0, pT = 0, pPrev = -1, lastMove = 0, paintedP = -2, rzTimer = 0, snapped = false;
    let sTop = 0, sTot = 1, sH = 1, yNow = 0;
    const born = performance.now();
    let hall = null, jar = null, track = null, set = '', gen = 0, labelReady = false, lastDraw = null, resScale = 1;
    let dtEma = 16.7, minDt = 16.7, slowRun = 0, govChanges = 0;
    const perfRing = new Float32Array(240); let perfN = 0;
    let dirSign = 1;

    /* ---- данные ключевых кадров: сжатые файлы (Blob) всегда, текстуры — только рядом с положением ---- */
    const blobs = {c: new Array(NH).fill(null), z: new Array(NH).fill(null), j: new Array(NH).fill(null)};
    const busy = {c: new Uint8Array(NH), z: new Uint8Array(NH), j: new Uint8Array(NH)};
    const resident = new Uint8Array(NH), resJ = new Uint8Array(NH), decoding = new Uint8Array(NH * 2);
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
      const need = k => { for (const key of ['c', 'z', 'j']) if (!busy[key][k]) return key; return null; };
      const tryK = k => { if (k < 0 || k >= NH) return null; const key = need(k); return key ? {key, k} : null; };
      let r;
      if ((r = tryK(0))) return r;
      const l = locate(cp), kc = kNear(cp);
      if ((r = tryK(l.k)) || (r = tryK(Math.min(NH - 1, l.k + 1)))) return r;
      for (let d = 1; d <= 6; d++) { if ((r = tryK(kc + dirSign * d)) || (r = tryK(kc - dirSign * d))) return r; }
      while (hierPos < NH) { const k = hier[hierPos]; if ((r = tryK(k))) return r; hierPos++; }
      return null;
    }
    function pump() {
      if (dead || !canFetch) return;
      const lanes = LANES[isPortrait() ? 1 : 0];
      while (inflight < lanes) {
        const j = pickNext(); if (!j) return;
        const {key, k} = j, g = gen;
        busy[key][k] = 1; inflight++;
        fetch(urls(key, k), {priority: k === 0 || Math.abs(k - kNear(cp)) < 3 ? 'high' : 'low'}).then(r => { if (!r.ok) throw new Error('http'); return r.blob(); })
          .then(b => { if (g !== gen) return; blobs[key][k] = b; busy[key][k] = 2; inflight--; if (key === 'c') loadedKeys++; dirty = true; schedule(); pumpDecode(); pump(); })
          .catch(() => { if (g !== gen) return; busy[key][k] = 3; inflight--; pump(); });
      }
    }
    async function bmp(blob, premul) {
      try { return await createImageBitmap(blob, {premultiplyAlpha: premul ? 'premultiply' : 'none', colorSpaceConversion: 'none'}); }
      catch (e) { const u = URL.createObjectURL(blob); try { const im = new Image(); im.src = u; await im.decode(); return im; } finally { setTimeout(() => URL.revokeObjectURL(u), 3000); } }
    }
    /* развёртывание файлов в текстуры: нужные кадры рядом с положением, дальние выгружаем */
    function pumpDecode() {
      if (dead || !hall) return;
      const R = RES[isPortrait() ? 1 : 0], l = locate(cp);
      const need = [];
      for (let d = 0; d <= R; d++) { for (const k of [l.k + d, l.k + 1 - d]) if (k >= 0 && k < NH && need.indexOf(k) < 0) need.push(k); }
      need.sort((a, b) => Math.abs(a - (l.k + l.t)) - Math.abs(b - (l.k + l.t)));
      if (pin) for (let k = pin[0]; k <= pin[1]; k++) if (need.indexOf(k) < 0) need.push(k);
      for (const k of need) {
        if (decN >= DECODERS) break;
        if (!resident[k] && keyDone(k) && !decoding[k]) {
          decoding[k] = 1; decN++; const g = gen;
          Promise.all([bmp(blobs.c[k], false), bmp(blobs.z[k], false)]).then(([c, z]) => {
            if (g === gen && hall && !dead) { hall.setKey(k, c, z, c.width, c.height, z.width, z.height); resident[k] = 1; dirty = true; schedule(); }
            try { c.close && c.close(); z.close && z.close(); } catch (e) { /* — */ }
          }).catch(() => {}).then(() => { decoding[k] = 0; decN--; pumpDecode(); evict(); });
        } else if (!resJ[k] && blobs.j[k] && jar && !decoding[NH + k]) {
          decoding[NH + k] = 1; decN++; const g = gen;
          bmp(blobs.j[k], true).then(s => { if (g === gen && jar && !dead) { jar.setSprite(k, s); resJ[k] = 1; dirty = true; schedule(); } try { s.close && s.close(); } catch (e) { /* — */ } })
            .catch(() => {}).then(() => { decoding[NH + k] = 0; decN--; pumpDecode(); });
        }
      }
    }
    function evict() {                                                // дальше окна — выгружаем текстуры (файлы остаются в памяти и разворачиваются снова по требованию)
      if (!hall) return;
      const R = RES[isPortrait() ? 1 : 0], l = locate(cp), c = l.k + l.t;
      for (let k = 0; k < NH; k++) {
        if (resident[k] && Math.abs(k - c) > R + 3 && !pinned(k)) { hall.dropKey(k); resident[k] = 0; }
        if (resJ[k] && Math.abs(k - c) > R + 3 && k !== 0 && !pinned(k)) { jar && jar.dropSprite(k); resJ[k] = 0; }
      }
    }

    /* ---- инициализация WebGL (после загрузки дорожки камеры) ---- */
    async function initGL() {
      const key = dirOf();
      const tr = await (await fetch(urlOf(key === 'm' ? ds.camm : ds.cam))).json();
      if (dead || key !== dirOf()) return;
      track = tr;
      const fa = key === 'm' ? 9 / 16 : 16 / 9;
      hall = A.ArchGL.createHall(cv, {track: tr, phi: Phi, portrait: key === 'm', frameAspect: fa, grid: (key === 'm' ? [450, 800] : [960, 540]).map(v => Math.max(60, Math.round(v * (window.__ASTREYA_GL_GRID || 1)))), stretch: 0.4, preserve: PRESERVE,
        shadowFrom: LSH ? +(LSH.from && typeof LSH.from === 'object' ? LSH.from[key === 'm' ? 'mobile' : 'desktop'] : LSH.from) || 0 : 0, shadowAmount: LSH && LSH.amount !== undefined ? +LSH.amount : 1, contact: LSH && LSH.contact !== undefined ? +LSH.contact : 0.42,
        veil: LSH && +LSH.veil || 0, veilCut: LSH && +LSH.veilCut || 0});
      const rects = JR[key === 'm' ? 1 : 0];
      jar = rects.length === NH ? A.ArchGL.createJar(jcv, {track: tr, phi: Phi, rects, portrait: key === 'm', frameAspect: fa, ink: +ds.ink || 0.43, preserve: PRESERVE}) : null;
      if (!hall) { root.classList.add('jar-off'); dead = true; return; }
      hall.setSize(W, H); JW = JH = 0; sizeJar();
      if (jar && ds.lbl) bmp(await (await fetch(urlOf(ds.lbl))).blob(), false).then(b => { if (jar) { jar.setLabel(b); labelReady = true; dirty = true; schedule(); } }).catch(() => {});
      cv.addEventListener('webglcontextlost', e => { e.preventDefault(); hall = null; jar = null; resident.fill(0); resJ.fill(0); }, false);
      cv.addEventListener('webglcontextrestored', () => { if (!dead) initGL().catch(() => {}); }, false);
      pumpDecode(); schedule();
    }

    /* ---- размер холстов ---- */
    function sizeCanvas() {
      const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
      /* пикселей на холсте — не больше, чем в самом кадре (1920×1080 ≈ 2,1 млн): больше деталей на экране всё равно не появится; при слабом устройстве регулятор нагрузки снижает ещё (resScale) */
      const dpr = Math.min(window.devicePixelRatio || 1, 2), s = Math.min(dpr, Math.sqrt(2.1e6 / Math.max(1, w * h))) * resScale;
      const nw = Math.round(w * s), nh = Math.round(h * s);
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
      const nw = Math.round(w * s), nh = Math.round(h * s);
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

    /* ---- отрисовка ---- */
    function paint(now) {
      if (!hall) return false;
      const speed = Math.abs(vp) * (NH - 1);
      const jk = jarK(cp), lift = jarLift(cp), ground = jarGround(cp);
      const pair = hall.draw(cp, 0, speed > MOVING, {jk, lift});
      if (!pair) return false;
      lastDraw = {ka: pair.ka, kb: pair.kb, t: pair.t, single: !!pair.single};
      if (!firstDrawn) { firstDrawn = true; if (cp < 0.02) root.classList.add('ar-intro'); root.classList.add('ready'); }
      if (jar) {
        const ok = jar.draw(cp, pair, {jk, lift, ground});
        if (ok && !jarShown) { jarShown = true; if (cp < 0.02) root.classList.add('ar-intro'); root.classList.add('jar-ready'); }
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
      const r = root.getBoundingClientRect(); sTop = r.top + sy; sH = root.offsetHeight; sTot = Math.max(1, sH - stage.clientHeight);
    }

    /* ---- цикл: прокрутка → цель; пружина ведёт текущее положение к цели; в покое цель — ближайший ключевой кадр ---- */
    function schedule() { if (!running && !dead) { running = true; last = 0; requestAnimationFrame(tick); } }
    function tick(t) {
      if (dead) { running = false; return; }
      const w0 = performance.now();
      const dtRaw = last ? t - last : 0, dt = last ? clamp(dtRaw / 1000, 0.001, 0.35) : 0.016; last = t;          // пружина считается точным решением — устойчива при любом шаге; потолок лишь не даёт сцене «прыгнуть» после долгого простоя вкладки
      const y = window.scrollY || window.pageYOffset || 0, vh = innerHeight; yNow = y;
      pT = clamp((y - sTop) / sTot, 0, 1);
      /* страница открыта посреди сцены (восстановление прокрутки после перезагрузки) — без «разгона» с нуля */
      if (!started || (w0 - born < 900 && Math.abs(pT - cp) > 0.08)) { started = true; cp = pT; vp = 0; pPrev = pT; lastMove = t; }
      if (Math.abs(pT - pPrev) > 1e-6) { pPrev = pT; lastMove = t; }
      /* цель пружины: куда показывает прокрутка; если она стоит — ближайший ключевой кадр (там картинка — сам отрендеренный кадр) */
      let target = pT;
      if (t - lastMove > SNAP_DELAY && hall) { const kn = kNear(pT); if (resident[kn] || keyDone(kn)) target = Phi[kn]; }
      // критически затухающая пружина (точное решение на шаг dt): x'' = −2ω x' − ω² (x − цель)
      const e = Math.exp(-OMEGA * dt);
      let d = cp - target, c = vp + OMEGA * d;
      cp = target + (d + c * dt) * e; vp = (vp - OMEGA * c * dt) * e;
      if (Math.abs(cp - target) < 2e-6 && Math.abs(vp) < 1e-4) { cp = target; vp = 0; }
      cp = clamp(cp, 0, 1);
      if (Math.abs(vp) > 1e-3) dirSign = vp > 0 ? 1 : -1;
      const inView = y + vh > sTop && y < sTop + sH;
      /* регулятор нагрузки: кадры идут дольше бюджета — холст чуть меньше (не чаще раза в 1,5 с) */
      if (inView && Math.abs(vp) * (NH - 1) > MOVING && dtRaw > 0) {
        const dtc = Math.min(dtRaw, 80); minDt = Math.max(5, Math.min(minDt + 0.004, dtc));
        const base = minDt < 19 ? minDt : minDt < 28 ? 16.67 : 33.33; dtEma += (dtc - dtEma) * 0.15;
        if (dtEma > base * 1.35 + 0.5) slowRun++; else slowRun = 0;
        if (slowRun >= 24 && resScale > 0.6 && now() - lastGov > 1500) { resScale = resScale > 0.8 ? 0.8 : 0.65; govChanges++; slowRun = 0; lastGov = now(); if (resScale < 0.7 && hall) hall.setGridScale(0.5); sizeCanvas(); }
      }
      if ((inView || !firstDrawn) && hall && (dirty || Math.abs(cp - paintedP) > 1e-7)) {
        if (paint(t)) { paintedP = cp; dirty = false; } else dirty = true;
      }
      if (inView && hall) { pumpDecode(); }
      ui(cp, inView);
      perfRing[perfN++ % perfRing.length] = performance.now() - w0;
      if (cp !== target || vp !== 0 || (dirty && !firstDrawn) || (inView && (t - lastMove <= SNAP_DELAY + 40 || Math.abs(target - cp) > 1e-7))) requestAnimationFrame(tick); else running = false;
    }
    let lastGov = -1e9;
    const now = () => performance.now();

    const onScroll = () => schedule();
    const onResize = () => { clearTimeout(rzTimer); rzTimer = setTimeout(() => { measureStatic(); sizeCanvas(); schedule(); }, 120); schedule(); };
    /* поменялась ориентация экрана (телефон ↔ компьютер): другой набор кадров, другая дорожка камеры — данные загружаем заново, холсты остаются теми же */
    const onMQ = () => {
      if (dead || set === dirOf()) return;
      gen++; set = dirOf(); inflight = 0; decN = 0; hierPos = 0; loadedKeys = 0; labelReady = false;
      for (const k in blobs) blobs[k].fill(null); for (const k in busy) busy[k].fill(0);
      resident.fill(0); resJ.fill(0); decoding.fill(0);
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
      gen++; clearTimeout(rzTimer); if (ro) ro.disconnect();
      removeEventListener('scroll', onScroll); removeEventListener('resize', onResize); removeEventListener('load', onLoad);
      portraitMQ.removeEventListener && portraitMQ.removeEventListener('change', onMQ);
      if (hall) hall.destroy(false); if (jar) jar.destroy(false); hall = jar = null;
      document.body.classList.remove('arch-hide', 'arch-nav', 'arch-live', 'arch-top');
    }

    set = dirOf();
    measureStatic();
    sizeCanvas();
    pump();
    initGL().then(() => { if (!dead) { pumpDecode(); schedule(); } }).catch(() => { root.classList.add('jar-off'); dead = true; });
    schedule();
    const uOf = () => { const l = locate(cp); return l.k + l.t; };
    const self = {
      root,
      /* для проверок: держать кадры a…b в видеопамяти и дождаться, пока они развернутся (все — и зал, и спрайты) */
      prefetch(a, b) { pin = [Math.max(0, a), Math.min(NH - 1, b)]; return new Promise(res => { const t = setInterval(() => { let ok = !!hall; for (let k = pin[0]; k <= pin[1]; k++) if (!resident[k] || !resJ[k]) ok = false; if (ok || dead) { clearInterval(t); res(ok); } else pumpDecode(); }, 80); }); },
      unpin() { pin = null; },
      jump(p) { cp = pT = p; pPrev = p; vp = 0; started = true; lastMove = performance.now(); if (hall) paint(performance.now()); ui(p, true); },
      state() {
        const ring = Array.prototype.slice.call(perfRing, 0, Math.min(perfN, perfRing.length)).sort((a, b) => a - b);
        let res = 0, resj = 0; for (let k = 0; k < NH; k++) { res += resident[k]; resj += resJ[k]; }
        return {p: cp, pTarget: pT, u: uOf(), N: NH, loaded: loadedKeys, set, gl: !!hall, drawn: lastDraw, firstDrawn, resident: res, residentJar: resj, resScale, govChanges, snapped: vp === 0 && Math.abs(cp - Phi[kNear(cp)]) < 1e-5,
          jar: {loaded: blobs.j.filter(Boolean).length, n: NH, shown: jarShown, sprites: resj, label: labelReady},
          size: [W, H, JW, JH], perf: {n: perfN, mean: ring.length ? ring.reduce((s, v) => s + v, 0) / ring.length : 0, p95: ring.length ? ring[Math.floor(ring.length * 0.95)] : 0, max: ring.length ? ring[ring.length - 1] : 0}};
      },
      destroy() { dead = true; destroyGL(); for (const k in blobs) blobs[k].fill(null); }
    };
    self.complete = () => loadedKeys >= NH && blobs.z.every(Boolean) && blobs.j.every(Boolean);
    return self;
  }

  function init() {
    const roots = Array.prototype.slice.call(document.querySelectorAll('.jar-story'));
    if (ctrls.length === roots.length && ctrls.every((c, i) => c.root === roots[i])) return;
    ctrls.forEach(c => c.destroy()); ctrls = [];
    roots.forEach(root => { try { ctrls.push(create(root)); } catch (e) { root.classList.add('jar-off'); } });
    ctrl = ctrls[0] || null;
  }
  window.Astreya = A; A.jar = {init, get ctrl() { return ctrl; }, get ctrls() { return ctrls; }, get arch() { return ctrl; }};
  /* где в документе «покой» героя (его верх под шапкой): от этой прокрутки считается уход текста героя (js/motion.js). Сцена есть — это конец её закреплённой части
     (кадры доиграли, текст и панель на месте); нет сцены (выключена, нет WebGL) — верх запасного героя под шапкой */
  A.heroBase = function () {
    const ar = document.getElementById('arch-story');
    if (ar && ar.offsetHeight) {
      const st = ar.firstElementChild, y = ar.getBoundingClientRect().top + scrollY + 0.97 * Math.max(0, ar.offsetHeight - (st ? st.clientHeight : innerHeight));
      return Math.max(0, Math.round(y));
    }
    return 0;
  };

  /* подключаемся к инициализации страницы: при первой загрузке и после подмены содержимого (переходы между страницами) */
  const prev = A.initPage;
  A.initPage = function (r) { if (prev) prev.apply(this, arguments); init(); };
  if (document.readyState !== 'loading') init(); else document.addEventListener('DOMContentLoaded', init);
})();
