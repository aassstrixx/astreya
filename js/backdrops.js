/* Фоновые вставки: подгружает картинки-текстуры (assets/bg/*.webp) для блоков с data-bd — лениво, когда блок подходит к экрану, и плавно проявляет.
   Разметку ставит сборка (src/backdrops.js), вид задаёт css/backdrops.css. Работает и в обычном сайте, и в автономной сборке (картинки тогда берутся из Astreya.assets). */
(function () {
  'use strict';
  const A = window.Astreya; if (!A) return;
  const $$ = A.$$ || ((s, r) => Array.from((r || document).querySelectorAll(s)));
  let io = null;
  const saver = () => { try { const c = navigator.connection; return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ''))); } catch (e) { return false; } };   // экономия трафика: фон не грузим
  const small = () => window.matchMedia && matchMedia('(max-width:700px)').matches;

  function src(name) {
    const f = 'assets/bg/' + name + (small() ? '-m' : '') + '.webp';
    if (A.assets && A.assets[f]) return A.assets[f];
    const root = document.body.getAttribute('data-root') || '';
    const v = (document.querySelector('link[rel=stylesheet][href*="backdrops.css"]') || {}).href || '', q = (v.match(/\?v=\w+/) || [''])[0];
    return new URL(root + f + q, document.baseURI).href;           // абсолютный адрес: относительный внутри var() считался бы от css/backdrops.css
  }
  function load(el) {
    const name = el.getAttribute('data-bd'); if (!name || el.classList.contains('bd-on')) return;
    const url = src(name), img = new Image();
    const show = () => { el.style.setProperty('--bd-img', 'url("' + url + '")'); requestAnimationFrame(() => el.classList.add('bd-on')); };
    img.onload = show; img.onerror = () => {}; img.decoding = 'async'; img.src = url;
    if (img.complete && img.naturalWidth) show();
  }
  function init(root) {
    if (io) { io.disconnect(); io = null; }
    const list = $$('[data-bd]:not(.bd-on)', root || document); if (!list.length || saver()) return;
    if (!('IntersectionObserver' in window)) { list.forEach(load); return; }
    io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); load(e.target); } }), {rootMargin: '900px 0px'});
    list.forEach(el => io.observe(el));
  }
  A.backdrops = {init};
  const prev = A.initPage;
  A.initPage = function () { if (prev) prev.apply(this, arguments); init(document); };
  if (document.readyState !== 'loading') init(document); else document.addEventListener('DOMContentLoaded', () => init(document));
})();
