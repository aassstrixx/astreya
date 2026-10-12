/* Файлы «для агентов и установки» (extras.agentReady): llms.txt — краткое описание сайта для ИИ-ассистентов (формат llmstxt.org: заголовок, цитата-резюме,
   разделы со ссылками) и manifest.webmanifest — установка сайта на главный экран телефона. Всё берётся из data/*.json, ничего не выдумывается. */
'use strict';
module.exports = function agentFiles(ctx, L, kb) {
  const {site} = ctx, abs = L.absUrl, c = site.contacts, brandName = id => (ctx.brandById[id] || {}).name || id;
  const lines = [];
  lines.push('# ' + site.name, '');
  lines.push('> ' + site.name + ' — дистрибьютор профессиональной косметики в России: бренды ' + ctx.brands.map(b => b.name).join(', ') + ', обучение специалистов и поддержка партнёров. Продукция рассчитана на специалистов (косметологов, салоны, клиники).', '');
  lines.push('Цен, наличия, сроков поставки и состава на сайте нет — их подтверждает менеджер: ' + c.phone + ', ' + c.email + ', ' + c.hours + '. Скидки по объёму закупки на сайте ориентировочные: ' + (site.discounts || []).map(d => 'от ' + d.from.toLocaleString('ru-RU').replace(/ /g, ' ') + ' ₽ — ' + d.pct + '%').join('; ') + '. Сайт не даёт медицинских рекомендаций: подбор ухода определяет специалист.', '');
  lines.push('## Каталог и бренды', '');
  lines.push('- [Каталог](' + abs('catalog.html') + '): ' + ctx.products.length + ' позиций; фильтры по бренду, категории, задаче и виду');
  ctx.brands.forEach(b => lines.push('- [' + b.name + '](' + abs('brands/' + b.id + '.html') + '): ' + String(b.tag || '').replace(/\s+/g, ' ')));
  lines.push('', '## Обучение', '');
  lines.push('- [Расписание](' + abs('training.html') + '): семинары, мастер-классы и вебинары учебного центра (' + ((ctx.training.cities || []).join(', ')) + ')');
  ctx.sortedEvents.slice(0, 8).forEach(e => lines.push('- [' + e.title + '](' + abs('training/' + e.slug + '.html') + '): ' + e.date + ', ' + e.city + ', ' + e.fmt));
  lines.push('', '## Партнёрам', '');
  lines.push('- [Стать партнёром](' + abs('partners.html') + '): условия сотрудничества и калькулятор скидок');
  lines.push('', '## Компания', '');
  lines.push('- [О компании](' + abs('company.html') + '): направления, преимущества, представительства');
  lines.push('- [Контакты](' + abs('contacts.html') + '): телефон, e-mail, адреса');
  lines.push('- [Новости](' + abs('news.html') + '): новости, акции, новинки и анонсы');
  const llms = lines.join('\n') + '\n';
  const manifest = JSON.stringify({name: site.name + ' — профессиональная косметика', short_name: site.name, description: site.tagline || '', lang: site.lang || 'ru', start_url: './', scope: './', display: 'standalone', background_color: '#f5f2ec', theme_color: '#f5f2ec',
    icons: [{src: 'assets/apple-touch-icon.png', sizes: '180x180', type: 'image/png'}, {src: 'assets/logo-512.png', sizes: '512x512', type: 'image/png'}]}, null, 2) + '\n';
  return {llms, manifest};
};
