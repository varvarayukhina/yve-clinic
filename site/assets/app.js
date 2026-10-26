// Контакты клиники: меняются здесь — меняются на всех страницах. Пустое значение = кнопка скрыта.
const CONFIG = {
  booking: 'https://n1676841.yclients.ru/company/1501872/personal/menu?o=',
  telegram: '', // ссылка на бота WaHelp, например https://t.me/yve_clinic_bot
  phone: '+79919882299', // с карточки клиники на Яндекс Картах
  lead: '',     // адрес приёма заявок на перезвон (POST, FormData: name, phone); пусто — черновик, заявка никуда не уходит
};

const CATALOG = window.CATALOG || [];
const byId = Object.fromEntries(CATALOG.map(c => [c.id, c]));
const rub = n => n.toLocaleString('ru-RU') + ' ₽';
const esc = s => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const pr = new Intl.PluralRules('ru');
const services = n => `${n} ${{ one: 'услуга', few: 'услуги', many: 'услуг' }[pr.select(n)]}`;
// «1 единица», «1 линия» и сыворотки-добавки — не процедуры, в «от … ₽» их не считаем
const isAddon = i => /(^|\s)1 (линия|единица)/i.test(i.n) || i.n.startsWith('Сыворотка');
// В прайсе встречаются неразрывные дефисы (U+2011): приводим все дефисы и тире к обычному
const norm = s => s.toLowerCase().replaceAll('ё', 'е').replace(/[‐-―−]/g, '-');

/* ---------- Прайс: направления главной = группы каталога ---------- */
const DIRS = [
  { name: 'Консультации и программы', cats: ['konsultacii', 'kompleksy'] },
  { name: 'Инъекционная косметология', cats: ['botulinoterapiya', 'konturnaya-plastika', 'biorevitalizaciya', 'kollagenostimulyaciya'] },
  { name: 'Аппаратная косметология', cats: ['tulievyj-lazer', 'smas-lifting', 'igolchatyj-rf', 'bipolyarnyj-rf', 'monopolyarnyj-rf', 'fototerapiya', 'fotodinamicheskaya-terapiya'] },
  { name: 'Эстетика лица', cats: ['estetika-lica'] },
  { name: 'Трихология', cats: ['trihologiya'] },
  { name: 'Капельницы', cats: ['kapelnicy'] },
  { name: 'Лазерная эпиляция', cats: ['epilyaciya'] },
];
const placed = new Set(DIRS.flatMap(d => d.cats));
const rest = CATALOG.filter(c => !placed.has(c.id)).map(c => c.id); // новый раздел в YCLIENTS не потеряется
if (rest.length) DIRS.push({ name: 'Другое', cats: rest });

// «Фототерапия (INMODE LUMECCA)» → «Фототерапия» + подпись «InMode Lumecca»
const BRAND = { INMODE: 'InMode', LASEMD: 'LaseMD', MPT: 'MPT', XL: 'XL', RF: 'RF' };
const TITLE = { kompleksy: 'Программы сезона' };
const splitTitle = c => {
  const m = c.title.match(/^(.*?)\s*\(([^)]+)\)$/);
  const dev = m ? m[2].split(' ').map(w => BRAND[w] || w[0] + w.slice(1).toLowerCase()).join(' ') : '';
  return [TITLE[c.id] || (m ? m[1] : c.title), dev];
};

// Кириллица и латиница сводятся к одному «скелету»: новакутан = Novacutan, ксеомин = Xeomin
const LAT = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'iu', я: 'ia' };
const skel = s => [...s].map(ch => LAT[ch] ?? ch).join('').replace(/ph/g, 'f').replace(/x/g, 'ks').replace(/[cq]/g, 'k').replace(/w/g, 'v').replace(/y/g, 'i').replace(/[^a-z0-9]/g, '');
// Как говорят посетители → как записано в прайсе
const SYN = { ботокс: 'ботулино', botox: 'ботулино', потлив: 'гипергидроз', потоотд: 'гипергидроз' };

const GROUPS = DIRS.map(d => ({ name: d.name, cats: d.cats.map(id => byId[id]).filter(Boolean) })).filter(g => g.cats.length);
const ALL = GROUPS.flatMap(g => g.cats.flatMap(c => {
  const [base, dev] = splitTitle(c);
  return c.items.map(i => {
    const text = norm(`${i.n} ${i.d} ${c.title} ${base} ${g.name}`);
    return { ...i, cat: c, base, dev, q: text, sk: skel(text) };
  });
}));

const terms = q => norm(q).split(/[\s,.;:!?«»"]+/).filter(w => w.length > 1).map(w => {
  const stem = w.length > 5 ? w.slice(0, -2) : w.length > 3 ? w.slice(0, -1) : w; // «подмышки» найдёт «подмышечные»
  const syn = Object.entries(SYN).find(([k]) => stem.startsWith(k) || (stem.length > 3 && k.startsWith(stem)))?.[1];
  const sk = skel(w.length > 5 ? stem : w); // «смас» = SMAS, «акне» = acne
  return { stem, sk: sk.length > 2 ? sk : '', syn };
});
// Показываем услуги, совпавшие с наибольшим числом слов: «увеличение губ» найдёт губы, хотя слова «увеличение» в прайсе нет.
// null — запрос пустой, показывать всё.
const search = q => {
  const t = terms(q);
  if (!t.length) return null;
  const score = ALL.map(it => t.filter(w => it.q.includes(w.stem) || (w.sk && it.sk.includes(w.sk)) || (w.syn && it.q.includes(w.syn))).length);
  const best = Math.max(...score);
  return best ? ALL.filter((_, k) => score[k] === best) : [];
};

/* ---------- Контакты ---------- */
document.querySelectorAll('[data-tg]').forEach(a => { if (CONFIG.telegram) a.href = CONFIG.telegram; else a.hidden = true; });
const phoneText = CONFIG.phone.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, '+7 ($1) $2-$3-$4');
document.querySelectorAll('[data-phone]').forEach(a => {
  if (!CONFIG.phone) return a.removeAttribute('href');
  a.href = 'tel:' + CONFIG.phone;
  a.textContent = phoneText;
});

/* ---------- Боковые панели: запись и заявка. «Назад» закрывает панель, а не уводит со страницы ---------- */
const closeIcon = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l12 12M16 4L4 16"/></svg>';
const panel = (cls, html) => {
  const d = document.createElement('dialog');
  d.className = cls;
  d.innerHTML = html;
  document.body.append(d);
  d.querySelector('.book-close').addEventListener('click', () => d.close());
  d.addEventListener('click', e => { if (e.target === d) d.close(); });
  d.addEventListener('close', () => {
    if (d.dataset.swap) return delete d.dataset.swap;
    if (history.state?.panel) history.back();
  });
  return d;
};
const openPanel = d => {
  const other = document.querySelector('dialog[open]');
  if (other) { other.dataset.swap = '1'; other.close(); } else history.pushState({ panel: 1 }, '');
  d.showModal();
};
addEventListener('popstate', () => document.querySelectorAll('dialog[open]').forEach(d => { d.dataset.swap = '1'; d.close(); }));

/* Онлайн-запись: YCLIENTS в панели. Без JS ссылка просто открывает YCLIENTS. */
const dlg = panel('book', `<div class="book-bar"><b class="book-title" id="book-title">Онлайн-запись</b><button class="book-close" type="button" aria-label="Закрыть">${closeIcon}</button></div>
  <div class="book-body"><p class="book-wait">Загружаем онлайн-запись…</p><iframe title="Онлайн-запись YCLIENTS"></iframe></div>
  <p class="book-alt">Не загружается? <a class="link" href="${CONFIG.booking}" target="_blank" rel="noopener">Откройте запись в новой вкладке</a>${CONFIG.phone ? ` или позвоните: <a class="link" href="tel:${CONFIG.phone}">${phoneText}</a>` : ''}.</p>`);
dlg.setAttribute('aria-labelledby', 'book-title');
const frame = dlg.querySelector('iframe');
frame.addEventListener('load', () => dlg.classList.add('loaded'));
document.addEventListener('click', e => {
  const a = e.target.closest('[data-book]');
  if (!a) return;
  e.preventDefault();
  dlg.querySelector('.book-title').textContent = a.dataset.svc ? 'Запись: ' + a.dataset.svc : 'Онлайн-запись';
  if (!frame.src) frame.src = CONFIG.booking;
  openPanel(dlg);
});

/* Заявка на перезвон: окошко справа внизу «Хочу быть красивой, но не знаю, с чего начать» */
const lead = panel('book lead', `<div class="book-bar"><b id="lead-title">Хочу быть красивой, но не знаю, с чего начать</b><button class="book-close" type="button" aria-label="Закрыть">${closeIcon}</button></div>
  <form class="lead-form">
    <p class="lead-intro">Оставьте телефон — администратор перезвонит, ответит на вопросы и поможет выбрать первый шаг.</p>
    <label class="field">Имя<input name="name" autocomplete="given-name" required></label>
    <label class="field">Телефон<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 900 000-00-00" required minlength="10"></label>
    <label class="consent"><input type="checkbox" name="consent" required><span>Даю <a class="link" href="svedeniya.html#soglasie" target="_blank">согласие на обработку персональных данных</a></span></label>
    <button class="btn btn-solid" type="submit">Перезвоните мне</button>
    <p class="lead-status" role="status"></p>
  </form>`);
lead.setAttribute('aria-labelledby', 'lead-title');
const helper = document.createElement('div');
helper.className = 'helper';
helper.innerHTML = `<div class="helper-bubble"><button class="helper-say" type="button" data-lead>Хочу быть красивой, но&nbsp;не&nbsp;знаю, с&nbsp;чего начать</button><button class="helper-x" type="button" aria-label="Скрыть подсказку">${closeIcon}</button></div>
  <button class="helper-btn" type="button" data-lead aria-label="Заявка на перезвон"><svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="14" cy="12.5" rx="8" ry="9"/><path d="M14 21.5V29M11 29h6M10.2 9.4a4.6 4.6 0 0 1 3.2-2.6M26.5 3.5v4M24.5 5.5h4"/></svg></button>`;
document.body.append(helper);
try { if (sessionStorage.getItem('yve-helper-x')) helper.querySelector('.helper-bubble').hidden = true; } catch { /* приватный режим: подсказка просто покажется снова */ }
helper.querySelector('.helper-x').addEventListener('click', () => {
  helper.querySelector('.helper-bubble').hidden = true;
  try { sessionStorage.setItem('yve-helper-x', '1'); } catch { /* приватный режим */ }
});
document.addEventListener('click', e => { if (e.target.closest('[data-lead]')) openPanel(lead); });
const form = lead.querySelector('form');
form.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = form.querySelector('[type=submit]');
  const status = form.querySelector('.lead-status');
  btn.disabled = true;
  status.textContent = 'Отправляем…';
  try {
    if (CONFIG.lead) {
      const r = await fetch(CONFIG.lead, { method: 'POST', body: new FormData(form) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
    }
    form.innerHTML = '<div class="lead-done"><p class="h3">Спасибо!</p><p>Администратор перезвонит в рабочее время клиники. А пока можно посмотреть <a class="link" href="uslugi.html">услуги и цены</a>.</p>'
      + (CONFIG.lead ? '' : '<p><span class="todo">Черновик: приём заявок ещё не подключён, заявка никуда не ушла</span></p>') + '</div>';
  } catch (err) {
    console.error(err);
    status.textContent = 'Не удалось отправить заявку. Попробуйте ещё раз или запишитесь онлайн.';
    btn.disabled = false;
  }
});

/* ---------- Мобильное меню: закрывается по ссылке, касанию мимо и Esc ---------- */
const menu = document.querySelector('.menu');
if (menu) {
  const sum = menu.querySelector('summary');
  menu.addEventListener('toggle', () => { sum.textContent = menu.open ? 'Закрыть' : 'Меню'; });
  menu.addEventListener('click', e => { if (e.target.closest('a')) menu.open = false; });
  document.addEventListener('click', e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.open) { menu.open = false; sum.focus(); } });
}

/* Шапка прозрачная, пока под ней первый экран */
const header = document.querySelector('.header');
const hero = document.querySelector('.hero');
if (hero) new IntersectionObserver(([e]) => header.classList.toggle('on-hero', e.isIntersecting), { rootMargin: '-76px 0px 0px 0px' }).observe(hero);

/* Направления на главной: «от … ₽» из прайса */
document.querySelectorAll('.dir').forEach(li => {
  const dir = DIRS.find(d => d.name === li.querySelector('h3').textContent);
  const items = (dir?.cats || []).flatMap(id => byId[id]?.items || []).filter(i => !isAddon(i));
  if (items.length) li.querySelector('.price').textContent = 'от ' + rub(Math.min(...items.map(i => i.p)));
});

/* Версия 2 первого экрана: активное направление крупнее, фото и описание меняются; сами по себе — каждые 3,5 с, пока посетитель не взаимодействует */
const hl = document.querySelector('.hero-list');
if (hl) {
  const links = [...hl.querySelectorAll('.hl-list a')];
  const photos = [...hl.querySelectorAll('.hl-photos img')];
  const desc = hl.querySelector('.hl-desc');
  const dirs = [...document.querySelectorAll('.dir')];
  const show = i => {
    links.forEach((a, k) => a.classList.toggle('on', k === i));
    photos.forEach((img, k) => img.classList.toggle('on', k === i));
    const d = dirs[i];
    desc.innerHTML = d ? `${esc(d.querySelector('p').textContent)} <b>${esc(d.querySelector('.price').textContent)}</b>` : '';
  };
  let cur = 0, timer = null;
  const auto = () => { timer = setInterval(() => show(cur = (cur + 1) % links.length), 3500); };
  links.forEach((a, i) => ['mouseenter', 'focus'].forEach(ev => a.addEventListener(ev, () => { clearInterval(timer); show(cur = i); })));
  show(0);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) auto();
}

/* Программы сезона на главной */
document.querySelectorAll('.offer-list[data-cat]').forEach(ul => {
  ul.innerHTML = (byId[ul.dataset.cat]?.items || []).map(i =>
    `<li class="offer"><div><h3>${esc(i.n)}</h3><p>${esc(i.d)}</p></div><div class="price">${rub(i.p)}<small>${esc(i.t)}</small><a class="link" href="${CONFIG.booking}" data-book data-svc="${esc(i.n)}">Записаться<span class="visually-hidden">: ${esc(i.n)}</span></a></div></li>`).join('');
});

/* ---------- Каталог: «Подобрать процедуру» (карточки) и «Все цены» (полный прайс) ---------- */
// Одна карточка — одна понятная процедура; зоны, препараты и объёмы — внутри неё.
// Группировку методов нужно согласовать с врачом. Новая строка прайса без правила попадёт в карточку своего раздела.
const CARD = {
  konsultacii: i => i.n,
  kompleksy: i => i.n,
  trihologiya: i => /^Плазмо/.test(i.n) ? 'Плазмотерапия кожи головы' : /^Мезотерапия/.test(i.n) ? 'Мезотерапия кожи головы' : i.n,
  'estetika-lica': i => /^Чистка/.test(i.n) ? 'Чистка лица' : /пилинг/i.test(i.n) ? 'Пилинги' : i.n,
  botulinoterapiya: i => /гипергидроз/i.test(i.n) ? 'Лечение гипергидроза' : 'Ботулинотерапия',
  biorevitalizaciya: i => /^Коллагенотерапия/.test(i.n) ? 'Коллагенотерапия' : /^Плазмо/.test(i.n) ? 'Плазмотерапия лица'
    : /^Липолитическая/.test(i.n) ? 'Липолитическая мезотерапия' : /Hair/.test(i.n) ? 'Мезотерапия кожи головы'
    : /^(Мезо|MESO|Фракционная)/.test(i.n) ? 'Мезотерапия лица' : 'Биоревитализация',
  'igolchatyj-rf': i => /^Волосистая/.test(i.n) ? 'Игольчатый RF для кожи головы' : /гипергидроз/i.test(i.n) ? 'Коррекция гипергидроза' : 'Игольчатый RF для лица и тела',
  'tulievyj-lazer': i => /^Сыворотка/.test(i.n) ? null : /^Волосы/.test(i.n) ? 'Тулиевый лазер для кожи головы' : 'Тулиевый лазер для лица и тела',
};
const CARD_TITLE = { epilyaciya: 'Лазерная эпиляция', 'konturnaya-plastika': 'Контурная пластика губ' };
// Фильтры по запросу — навигация по текстам прайса, а не назначение процедуры
const NEEDS = [
  ['Тон и пигментация', c => /пигмент|тона\b|тон кожи|осветл|сосуд/i.test(c.text)],
  ['Высыпания и жирность', c => /воспал|акне|acne|высып|жирност/i.test(c.text)],
  ['Морщины и овал лица', c => /морщин|лифтинг|подтяжк|контур|упруг|омолож|коллаген/i.test(c.text) && c.cat.id !== 'epilyaciya'],
  ['Волосы и кожа головы', c => /волос|кожи головы|волосист|перхот/i.test(c.text) && c.cat.id !== 'epilyaciya'],
  ['Удаление волос', c => c.cat.id === 'epilyaciya'],
  ['Тело', c => /живот|бёдер|ягодиц|бока|жиров|колен|локт|плеч/i.test(c.text)],
];
const SERUM = 'Сыворотка не входит в стоимость.';

const cards = (() => {
  const out = [], byKey = new Map();
  GROUPS.forEach((g, gi) => g.cats.forEach(c => {
    const [base, dev] = splitTitle(c);
    const addons = c.items.filter(i => CARD[c.id] && CARD[c.id](i) === null);
    c.items.forEach(i => {
      const t = CARD[c.id] ? CARD[c.id](i) : (CARD_TITLE[c.id] || base);
      if (t === null) return;
      const key = c.id + '|' + t;
      if (!byKey.has(key)) {
        const card = { gi, cat: c, title: t, sub: dev, items: [], addons, anchor: [...byKey.keys()].some(k => k.startsWith(c.id + '|')) ? null : c.id };
        byKey.set(key, card); out.push(card);
      }
      byKey.get(key).items.push(ALL.find(x => x.cat === c && x.n === i.n && x.p === i.p));
    });
  }));
  out.forEach(cd => {
    cd.text = [cd.title, ...cd.items.map(i => i.n + ' ' + i.d)].join(' ');
    const main = cd.items.filter(i => !isAddon(i));
    cd.feat = cd.items.find(i => i.n === 'Лицо') || [...main].sort((x, y) => x.p - y.p)[0] || cd.items[0];
  });
  return out;
})();

const cardsEl = document.getElementById('catalog-cards');
const list = document.getElementById('catalog-list');
if (cardsEl && list) {
  const nav = document.getElementById('cat-nav');
  const input = document.getElementById('q');
  const empty = document.getElementById('empty');
  const found = document.getElementById('found');
  const needsEl = document.getElementById('needs');
  const modeBtns = [...document.querySelectorAll('.modes button')];
  const book = i => `<a class="link" href="${CONFIG.booking}" data-book data-svc="${esc(i.n)}">Записаться<span class="visually-hidden">: ${esc(i.n)}</span></a>`;
  const desc = i => i.d.startsWith(SERUM) ? i.d.slice(SERUM.length).trim() : i.d;
  const row = i => `<tr data-i="${ALL.indexOf(i)}"><td class="n">${esc(i.n)}</td><td class="t">${esc(i.t)}</td><td class="p">${rub(i.p)}</td><td class="b">${book(i)}</td></tr>`;

  // Карточки
  cardsEl.innerHTML = GROUPS.map((g, gi) => `
    <section class="dir-block" data-k="${gi}" aria-labelledby="dc-${gi}"><h2 id="dc-${gi}">${esc(g.name)}</h2><div class="pcards">${cards.filter(c => c.gi === gi).map((c, ci) => {
      const f = c.feat, serumNote = c.items.some(i => i.d.startsWith(SERUM)) && c.addons.length;
      return `
      <article class="pcard" data-c="${cards.indexOf(c)}"${c.anchor ? ` data-anchor="${c.anchor}"` : ''}>
        <h3>${esc(c.title)}</h3>${c.sub ? `<p class="pc-sub">${esc(c.sub)}</p>` : ''}
        ${desc(f) ? `<p class="pc-req">${esc(desc(f))}</p>` : ''}
        <ul class="pc-hits"></ul>
        <div class="pc-price">${c.items.length > 1 ? `<span>${esc(f.n)}, ${esc(f.t)}</span>` : `<span>${esc(f.t)}</span>`}<b>${rub(f.p)}</b></div>
        ${serumNote ? `<p class="pc-extra">Сыворотка оплачивается отдельно — от ${rub(Math.min(...c.addons.map(a => a.p)))}. <span class="todo">обязательна или по желанию — уточнить</span></p>` : ''}
        <div class="pc-actions"><a class="btn btn-solid" href="${CONFIG.booking}" data-book data-svc="${esc(f.n === c.title ? f.n : c.title + ': ' + f.n)}">Записаться</a>${c.items.length > 1 || c.addons.length ? `<button class="link pc-more" type="button" aria-expanded="false">Все варианты и цены — ${c.items.length + (c.addons.length && c.items.some(i => i.d.startsWith(SERUM)) ? c.addons.length : 0)}</button>` : ''}</div>
        <div class="pc-all" hidden><table><tbody>${c.items.map(row).join('')}</tbody></table>${serumNote ? `<p class="pc-addons-title">Сыворотки к процедуре</p><table><tbody>${c.addons.map(row).join('')}</tbody></table>` : ''}</div>
      </article>`;
    }).join('')}</div></section>`).join('');
  cardsEl.addEventListener('click', e => {
    const btn = e.target.closest('.pc-more');
    if (!btn) return;
    const card = btn.closest('.pcard'), open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    card.classList.toggle('open', open);
    card.querySelector('.pc-all').hidden = !open;
    btn.firstChild.textContent = open ? 'Свернуть' : btn.dataset.label;
  });
  cardsEl.querySelectorAll('.pc-more').forEach(b => { b.dataset.label = b.textContent; });

  // Полный прайс
  list.innerHTML = GROUPS.map((g, gi) => `
    <div class="grp-block" data-k="${gi}"><h2 class="grp-title">${esc(g.name)}</h2>${g.cats.map(c => {
      const [base, dev] = splitTitle(c);
      const serum = Math.min(...c.items.filter(i => i.n.startsWith('Сыворотка')).map(i => i.p));
      return `
      <section class="cat" data-anchor="${c.id}" aria-labelledby="h-${c.id}">
        <div class="cat-title"><h3 id="h-${c.id}">${esc(base)}${dev ? ` <small>${esc(dev)}</small>` : ''}</h3><span>${services(c.items.length)}</span></div>
        <ul class="svc-list">${c.items.map(i => {
          const extra = i.d.startsWith(SERUM) && Number.isFinite(serum);
          return `
          <li class="svc" data-i="${ALL.findIndex(x => x.cat === c && x.n === i.n && x.p === i.p)}">
            <div><h4>${esc(i.n)}</h4>${desc(i) ? `<p>${esc(desc(i))}</p>` : ''}</div>
            <span class="dur">${esc(i.t)}</span>
            <span class="price">${rub(i.p)}${extra ? `<small>+ сыворотка от ${rub(serum)}</small>` : ''}</span>
            ${book(i).replace('class="link"', 'class="book-btn link"')}
          </li>`;
        }).join('')}
        </ul>
      </section>`;
    }).join('')}</div>`).join('');

  // Навигация — только направления
  nav.innerHTML = '<ul>' + GROUPS.map((g, gi) => `<li><a href="#" data-k="${gi}">${esc(g.name)}</a></li>`).join('') + '</ul>';
  nav.addEventListener('click', e => {
    const a = e.target.closest('a[data-k]');
    if (!a) return;
    e.preventDefault();
    document.querySelector(`${mode === 'all' ? '#catalog-list .grp-block' : '#catalog-cards .dir-block'}[data-k="${a.dataset.k}"]`)?.scrollIntoView({ behavior: 'smooth' });
  });

  // Фильтры по запросу
  needsEl.innerHTML = NEEDS.map(([name], k) => `<button type="button" aria-pressed="false" data-n="${k}">${name}</button>`).join('');
  let need = null;
  needsEl.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    need = need === +b.dataset.n ? null : +b.dataset.n;
    needsEl.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.n === need)));
    apply();
  });

  // Режим просмотра; якоря (#botulinoterapiya и т. п.) получает только активный вид
  let mode = new URLSearchParams(location.search).get('mode') === 'all' ? 'all' : 'cards';
  const setMode = m => {
    mode = m;
    modeBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
    cardsEl.hidden = m !== 'cards'; list.hidden = m !== 'all';
    document.querySelectorAll('[data-anchor]').forEach(el => { el.removeAttribute('id'); });
    (m === 'all' ? list : cardsEl).querySelectorAll('[data-anchor]').forEach(el => { el.id = el.dataset.anchor; });
    apply();
  };
  modeBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

  const apply = () => {
    const raw = input.value.trim();
    const hits = search(raw);
    const hitSet = hits && new Set(hits);
    const needFn = need === null ? null : NEEDS[need][1];
    let shown = 0;
    if (mode === 'cards') {
      cardsEl.querySelectorAll('.pcard').forEach(el => {
        const c = cards[el.dataset.c];
        const matched = hitSet ? c.items.filter(i => hitSet.has(i)) : null;
        const ok = (!needFn || needFn(c)) && (!matched || matched.length);
        el.hidden = !ok;
        // при поиске в карточке видно, что именно нашлось
        el.querySelector('.pc-hits').innerHTML = ok && matched && !(matched.length === 1 && matched[0] === c.feat)
          ? matched.slice(0, 4).map(i => `<li><span>${esc(i.n)}</span><b>${rub(i.p)}</b></li>`).join('') : '';
        if (ok) shown += matched ? matched.length : 1;
      });
      cardsEl.querySelectorAll('.dir-block').forEach(b => { b.hidden = !b.querySelector('.pcard:not([hidden])'); });
    } else {
      list.querySelectorAll('.svc').forEach(li => {
        const i = ALL[li.dataset.i];
        const c = cards.find(cd => cd.items.includes(i) || cd.addons.includes(i));
        const ok = (!hitSet || hitSet.has(i)) && (!needFn || (c && needFn(c)));
        li.hidden = !ok; shown += ok;
      });
      list.querySelectorAll('.cat').forEach(sec => {
        const n = sec.querySelectorAll('.svc:not([hidden])').length;
        sec.hidden = !n; sec.querySelector('.cat-title > span').textContent = services(n);
      });
      list.querySelectorAll('.grp-block').forEach(b => { b.hidden = !b.querySelector('.cat:not([hidden])'); });
    }
    const visible = new Set([...document.querySelectorAll(mode === 'all' ? '.grp-block:not([hidden])' : '.dir-block:not([hidden])')].map(b => b.dataset.k));
    nav.querySelectorAll('a').forEach(a => { a.parentElement.hidden = !visible.has(a.dataset.k); });
    const filtering = hitSet || needFn;
    found.textContent = filtering && shown ? (mode === 'all' ? 'Найдено: ' + services(shown) : 'Подходящих процедур: ' + cardsEl.querySelectorAll('.pcard:not([hidden])').length) : '';
    empty.hidden = !filtering || shown > 0;
    empty.querySelector('q').textContent = raw || (needFn ? NEEDS[need][0] : '');
    const url = new URL(location.href);
    raw ? url.searchParams.set('q', raw) : url.searchParams.delete('q');
    mode === 'all' ? url.searchParams.set('mode', 'all') : url.searchParams.delete('mode');
    history.replaceState(history.state, '', url);
  };
  input.addEventListener('input', apply);
  empty.querySelector('.btn').addEventListener('click', () => {
    input.value = ''; need = null;
    needsEl.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false'));
    apply(); input.focus();
  });
  const q0 = new URLSearchParams(location.search).get('q');
  if (q0) input.value = q0;
  setMode(mode);
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();

  // Подсветка направления в навигации; прокручиваем только саму навигацию
  const links = [...nav.querySelectorAll('a')];
  const spy = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    const a = links[e.target.dataset.k];
    nav.querySelector('.active')?.classList.remove('active');
    a.classList.add('active');
    nav.scrollTo({ left: a.parentElement.offsetLeft - 16, behavior: 'smooth' });
  }), { rootMargin: '-35% 0px -60% 0px' });
  document.querySelectorAll('.dir-block, .grp-block').forEach(s => spy.observe(s));
}

/* Поиск на главной: подсказки из прайса, Enter — весь список в каталоге */
const find = document.getElementById('find-q');
if (find) {
  const out = document.querySelector('.find-results');
  find.addEventListener('input', () => {
    const raw = find.value.trim();
    const hits = search(raw);
    out.innerHTML = !hits ? '' : hits.slice(0, 6).map(i => `<li><a href="uslugi.html?q=${encodeURIComponent(i.n)}"><span>${esc(i.n)}<small>${esc(i.base)}</small></span><b>${rub(i.p)}</b></a></li>`).join('')
      + (hits.length > 6 ? `<li class="more"><a class="link" href="uslugi.html?q=${encodeURIComponent(raw)}">Показать все: ${services(hits.length)}</a></li>` : '')
      + (!hits.length ? `<li class="none">По запросу <q>${esc(raw)}</q> ничего нет. <button class="link" type="button" data-lead>Оставьте заявку</button> — подскажем.</li>` : '');
  });
}

/* ---------- Переключатель версий первого экрана (только для показа клиенту) ---------- */
const VERSIONS = ['Фото во весь экран', 'Список направлений'];
const switcher = document.createElement('nav');
switcher.className = 'themes';
switcher.setAttribute('aria-label', 'Версия первого экрана');
switcher.innerHTML = VERSIONS.map((name, i) => `<button type="button" data-v="${i + 1}">${i + 1}<span>. ${name}</span></button>`).join('');
document.body.append(switcher);
const markVersion = () => switcher.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === document.documentElement.dataset.v)));
markVersion();
switcher.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const apply = () => { document.documentElement.dataset.v = b.dataset.v; markVersion(); };
  document.startViewTransition ? document.startViewTransition(apply) : apply();
  try { localStorage.setItem('yve-hero', b.dataset.v); } catch { /* приватный режим: версия просто не запомнится */ }
  const url = new URL(location.href);
  url.searchParams.set('v', b.dataset.v);
  history.replaceState(history.state, '', url);
});

/* ---------- Появление блоков при прокрутке ---------- */
const reveal = new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in');
  reveal.unobserve(e.target);
}), { rootMargin: '0px 0px -12% 0px' });
const groups = ['.dir', '.offer', '.step', '.facts > *', '.contacts dl > div', '.svc', '.doc section'];
groups.forEach(sel => document.querySelectorAll(sel).forEach(el => {
  el.classList.add('rv');
  el.style.setProperty('--i', [...el.parentElement.children].indexOf(el) % 8);
}));
document.querySelectorAll('.band .h2, .lead, .cat-title, .contacts-actions, .doctor .role, .offer-foot, .catalog-note, .dark > .wrap > .btn')
  .forEach(el => el.classList.add('rv'));
document.querySelectorAll('.rv').forEach(el => reveal.observe(el));

/* ---------- Шапка уезжает при прокрутке вниз и возвращается при прокрутке вверх ---------- */
let lastY = scrollY;
addEventListener('scroll', () => {
  const y = scrollY;
  header.classList.toggle('away', y > lastY && y > 400 && !header.querySelector('details[open]'));
  lastY = y;
}, { passive: true });
