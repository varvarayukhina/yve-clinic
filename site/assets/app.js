// Контакты клиники: меняются здесь — меняются на всех страницах. Пустое значение = кнопка скрыта.
const CONFIG = {
  booking: 'https://n1676841.yclients.ru/company/1501872/personal/menu?o=',
  telegram: '', // ссылка на бота WaHelp, например https://t.me/yve_clinic_bot
  phone: '',    // +74950000000
  lead: '',     // адрес приёма заявок (POST, FormData: name, phone, via, topic); пусто — черновик, заявка никуда не уходит
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

/* Заявка «Помочь с выбором» */
const lead = panel('book lead', `<div class="book-bar"><b id="lead-title">Помочь с выбором</b><button class="book-close" type="button" aria-label="Закрыть">${closeIcon}</button></div>
  <form class="lead-form">
    <p class="lead-intro">Не можете выбрать процедуру? Мы понимаем: их больше ста. Оставьте телефон — администратор перезвонит, ответит на вопросы и запишет на консультацию к врачу.</p>
    <label class="field">Имя<input name="name" autocomplete="given-name" required></label>
    <label class="field">Телефон<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 900 000-00-00" required minlength="10"></label>
    <fieldset><legend>Как удобнее связаться</legend>
      ${['Звонок', 'WhatsApp', 'Telegram'].map((v, i) => `<label class="chip"><input type="radio" name="via" value="${v}"${i ? '' : ' checked'}><span>${v}</span></label>`).join('')}
    </fieldset>
    <fieldset><legend>Что интересует <small>— если знаете</small></legend>
      ${['Лицо', 'Тело', 'Волосы', 'Пока не знаю'].map(v => `<label class="chip"><input type="checkbox" name="topic" value="${v}"><span>${v}</span></label>`).join('')}
    </fieldset>
    <label class="consent"><input type="checkbox" name="consent" required><span>Даю <a class="link" href="svedeniya.html#soglasie" target="_blank">согласие на обработку персональных данных</a></span></label>
    <button class="btn btn-solid" type="submit">Отправить заявку</button>
    <p class="lead-status" role="status"></p>
  </form>`);
lead.setAttribute('aria-labelledby', 'lead-title');
const tab = document.createElement('button');
tab.className = 'lead-tab';
tab.type = 'button';
tab.dataset.lead = '';
tab.textContent = 'Помочь с выбором';
document.body.append(tab);
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
    form.innerHTML = '<div class="lead-done"><p class="h3">Заявка принята</p><p>Администратор свяжется с вами в рабочее время клиники. А пока можно посмотреть <a class="link" href="uslugi.html">услуги и цены</a>.</p>'
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

/* Программы сезона на главной */
document.querySelectorAll('.offer-list[data-cat]').forEach(ul => {
  ul.innerHTML = (byId[ul.dataset.cat]?.items || []).map(i =>
    `<li class="offer"><div><h3>${esc(i.n)}</h3><p>${esc(i.d)}</p></div><div class="price">${rub(i.p)}<small>${esc(i.t)}</small><a class="link" href="${CONFIG.booking}" data-book data-svc="${esc(i.n)}">Записаться<span class="visually-hidden">: ${esc(i.n)}</span></a></div></li>`).join('');
});

/* ---------- Каталог ---------- */
const list = document.getElementById('catalog-list');
if (list) {
  const nav = document.getElementById('cat-nav');
  const input = document.getElementById('q');
  const empty = document.getElementById('empty');
  const found = document.getElementById('found');
  const SERUM = 'Сыворотка не входит в стоимость.';

  nav.innerHTML = '<ul>' + GROUPS.map((g, k) => `<li class="grp" data-g="${k}">${esc(g.name)}</li>` + g.cats.map(c =>
    `<li data-g="${k}"><a href="#${c.id}">${esc(splitTitle(c)[0])}<span>${c.items.length}</span></a></li>`).join('')).join('') + '</ul>';

  list.innerHTML = GROUPS.map(g => `
    <div class="grp-block"><h2 class="grp-title">${esc(g.name)}</h2>${g.cats.map(c => {
      const [base, dev] = splitTitle(c);
      // Сыворотки к лазеру — отдельные строки прайса; показываем их цену прямо у процедуры
      const serum = Math.min(...c.items.filter(i => i.n.startsWith('Сыворотка')).map(i => i.p));
      return `
      <section class="cat" id="${c.id}" aria-labelledby="h-${c.id}">
        <div class="cat-title"><h3 id="h-${c.id}">${esc(base)}${dev ? ` <small>${esc(dev)}</small>` : ''}</h3><span>${services(c.items.length)}</span></div>
        <ul class="svc-list">${c.items.map(i => {
          const extra = i.d.startsWith(SERUM) && Number.isFinite(serum);
          const d = extra ? i.d.slice(SERUM.length).trim() : i.d;
          return `
          <li class="svc">
            <div><h4>${esc(i.n)}</h4>${d ? `<p>${esc(d)}</p>` : ''}</div>
            <span class="dur">${esc(i.t)}</span>
            <span class="price">${rub(i.p)}${extra ? `<small>+ сыворотка от ${rub(serum)}</small>` : ''}</span>
            <a class="book-btn link" href="${CONFIG.booking}" data-book data-svc="${esc(i.n)}">Записаться<span class="visually-hidden">: ${esc(i.n)}</span></a>
          </li>`;
        }).join('')}
        </ul>
      </section>`;
    }).join('')}</div>`).join('');
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();

  const rows = [...list.querySelectorAll('.svc')]; // в том же порядке, что ALL
  const apply = () => {
    const raw = input.value.trim();
    const hits = search(raw);
    const set = hits && new Set(hits);
    rows.forEach((li, k) => { li.hidden = set ? !set.has(ALL[k]) : false; });
    list.querySelectorAll('.cat').forEach(sec => {
      const n = sec.querySelectorAll('.svc:not([hidden])').length;
      const a = nav.querySelector(`a[href="#${sec.id}"]`);
      sec.hidden = !n;
      sec.querySelector('.cat-title > span').textContent = services(n);
      a.parentElement.hidden = !n;
      a.querySelector('span').textContent = n;
    });
    list.querySelectorAll('.grp-block').forEach(b => { b.hidden = !b.querySelector('.cat:not([hidden])'); });
    nav.querySelectorAll('.grp').forEach(g => { g.hidden = !nav.querySelector(`li[data-g="${g.dataset.g}"]:not(.grp):not([hidden])`); });
    found.textContent = set && hits.length ? 'Найдено: ' + services(hits.length) : '';
    empty.hidden = !set || hits.length > 0;
    empty.querySelector('q').textContent = raw;
    const url = new URL(location.href);
    raw ? url.searchParams.set('q', raw) : url.searchParams.delete('q');
    history.replaceState(history.state, '', url);
  };
  input.addEventListener('input', apply);
  empty.querySelector('.btn').addEventListener('click', () => { input.value = ''; apply(); input.focus(); });
  const q0 = new URLSearchParams(location.search).get('q');
  if (q0) { input.value = q0; apply(); }

  // Подсветка раздела в навигации; прокручиваем только саму навигацию, не страницу
  const links = Object.fromEntries([...nav.querySelectorAll('a')].map(a => [a.hash.slice(1), a]));
  const spy = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    const a = links[e.target.id];
    nav.querySelector('.active')?.classList.remove('active');
    a.classList.add('active');
    nav.scrollTo({ left: a.parentElement.offsetLeft - 16, top: a.parentElement.offsetTop - nav.clientHeight / 2, behavior: 'smooth' });
  }), { rootMargin: '-35% 0px -60% 0px' });
  list.querySelectorAll('.cat').forEach(s => spy.observe(s));
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

/* ---------- Переключатель версий дизайна (только для показа клиенту) ---------- */
const THEMES = ['Олива', 'Белая клиника', 'Old money', 'Мягкий модерн', 'Леопард'];
const switcher = document.createElement('nav');
switcher.className = 'themes';
switcher.setAttribute('aria-label', 'Версия дизайна');
switcher.innerHTML = THEMES.map((name, i) => `<button type="button" data-v="${i + 1}" title="${name}">${i + 1}<span>. ${name}</span></button>`).join('');
document.body.append(switcher);
const markTheme = () => switcher.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String('v' + b.dataset.v === document.documentElement.dataset.theme)));
markTheme();
switcher.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const apply = () => { document.documentElement.dataset.theme = 'v' + b.dataset.v; markTheme(); };
  document.startViewTransition ? document.startViewTransition(apply) : apply();
  try { localStorage.setItem('yve-v', b.dataset.v); } catch { /* приватный режим: версия просто не запомнится */ }
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
document.querySelectorAll('.band .h2, .lead, .cat-title, .award, .contacts-actions, .doctor .role, .offer-foot, .catalog-note, .dark > .wrap > .btn')
  .forEach(el => el.classList.add('rv'));
document.querySelectorAll('.rv').forEach(el => reveal.observe(el));

/* ---------- Шапка уезжает при прокрутке вниз и возвращается при прокрутке вверх ---------- */
let lastY = scrollY;
addEventListener('scroll', () => {
  const y = scrollY;
  header.classList.toggle('away', y > lastY && y > 400 && !header.querySelector('details[open]'));
  lastY = y;
}, { passive: true });
