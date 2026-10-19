/* Политика безопасности страниц (Content-Security-Policy): браузер выполняет только свои скрипты сайта и скрипты разрешённых сервисов, остальное блокирует.
   Это главная защита от внедрения чужого кода (XSS). Политика собирается из того, что реально подключено: нет Метрики — нет и адресов Яндекса в разрешениях.
   Встроенные скрипты разрешены по хэшу (sha256), а не «всем подряд». Политика кладётся в <meta> каждой страницы; сервер из server/ дополнительно отдаёт её заголовком (с frame-ancestors). */
const crypto = require('crypto');

const sha = js => "'sha256-" + crypto.createHash('sha256').update(js, 'utf8').digest('base64') + "'";
const originOf = u => { try { const x = new URL(u, 'http://x.invalid'); return x.host === 'x.invalid' ? '' : x.origin; } catch (e) { return ''; } };
const YM = ['https://mc.yandex.ru', 'https://mc.yandex.com'];
const CAPTCHA = 'https://smartcaptcha.yandexcloud.net';

function build(ctx, inlineScripts) {
  const i = ctx.integrations || {}, m = i.metrika || {}, metrika = /^\d{4,12}$/.test(String(m.id || '')), captcha = !!((i.captcha || {}).siteKey);
  const api = originOf(ctx.site.formEndpoint), self = "'self'";
  const d = {
    'default-src': [self],
    'script-src': [self, ...inlineScripts.map(sha), ...(metrika ? [...YM, 'https://yastatic.net'] : []), ...(captcha ? [CAPTCHA] : [])],
    'style-src': [self, "'unsafe-inline'"],                                                  // на страницах много style="…" (оформление блоков) — стили допускаются встроенными, скрипты — нет
    'img-src': [self, 'data:', 'blob:', ...(metrika ? YM : []), ...(captcha ? [CAPTCHA] : [])],
    'font-src': [self, 'data:'],
    'connect-src': [self, ...(api ? [api] : []), ...(metrika ? [...YM, 'wss://mc.yandex.ru', 'wss://mc.yandex.com'] : []), ...(captcha ? [CAPTCHA] : [])],
    'frame-src': [...(metrika ? YM : []), ...(captcha ? [CAPTCHA] : [])].length ? [...(metrika ? YM : []), ...(captcha ? [CAPTCHA] : [])] : ["'none'"],
    'child-src': [...(metrika ? ['blob:', ...YM] : ["'none'"])],
    'worker-src': [self, 'blob:'],
    'media-src': [self],
    'manifest-src': [self],
    'object-src': ["'none'"],
    'base-uri': [self],
    'form-action': [self, ...(api ? [api] : [])]
  };
  return Object.entries(d).map(([k, v]) => k + ' ' + [...new Set(v)].join(' ')).join('; ');
}
module.exports = {build, sha, originOf};
