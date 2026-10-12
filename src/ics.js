/* Файл календаря (.ics, RFC 5545) для мероприятия: кнопка «В календарь» на странице мероприятия (data/redesign.json → extras.calendar).
   Время — «плавающее» (без часового пояса): событие показывается в календаре на те же часы, что и на сайте, то есть по времени города проведения.
   Всё берётся из data/events.json; ничего не придумывается. Файл детерминирован (DTSTAMP — дата мероприятия), поэтому повторная сборка ничего не меняет. */
'use strict';

const esc = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/* строки не длиннее 75 октетов; продолжение — перевод строки и пробел (не разрывая многобайтовые символы) */
function fold(line) {
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) { const n = Buffer.byteLength(ch); if (bytes + n > 75) { out.push(cur); cur = ' ' + ch; bytes = 1 + n; } else { cur += ch; bytes += n; } }
  out.push(cur); return out.join('\r\n');
}
const pad = n => String(n).padStart(2, '0');
function times(t) {                                              // «10:30–18:00» → ['103000', '180000']; одно время → +1 час; нет времени → null (событие на весь день)
  const s = String(t || ''), r = s.match(/(\d{1,2})[:.](\d{2})\s*[–—-]\s*(\d{1,2})[:.](\d{2})/);
  if (r) return [pad(r[1]) + r[2] + '00', pad(r[3]) + r[4] + '00'];
  const o = s.match(/(\d{1,2})[:.](\d{2})/); if (o) return [pad(o[1]) + o[2] + '00', pad(Math.min(23, +o[1] + 1)) + o[2] + '00'];
  return null;
}
function nextDay(iso) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10).replace(/-/g, ''); }

function eventIcs(e, o) {                                        // o: {url, brand, org}
  const day = e.date.replace(/-/g, ''), tm = times(e.time), online = e.fmt !== 'Очно';
  const place = online ? 'Онлайн' + (e.place ? ' (' + String(e.place).replace(/^./, c => c.toLowerCase()) + ')' : '') : [e.place, e.city].filter(Boolean).join(', ');
  const desc = [e.description, e.speaker ? 'Преподаватель: ' + String(e.speaker).replace(/\.?$/, '.') : '', o.url ? 'Подробности и запись: ' + o.url : ''].filter(Boolean).join('\n\n');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//' + (o.org || 'Астрея') + '//Учебный центр//RU', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', 'UID:' + e.id + '@astreya', 'DTSTAMP:' + day + 'T000000Z',
    tm ? 'DTSTART:' + day + 'T' + tm[0] : 'DTSTART;VALUE=DATE:' + day, tm ? 'DTEND:' + day + 'T' + tm[1] : 'DTEND;VALUE=DATE:' + nextDay(e.date),
    'SUMMARY:' + esc(e.title), 'LOCATION:' + esc(place), 'DESCRIPTION:' + esc(desc), o.url ? 'URL:' + o.url : null, o.brand ? 'CATEGORIES:' + esc(o.brand) : null, 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean);
  return L.map(fold).join('\r\n') + '\r\n';
}
module.exports = {eventIcs};
