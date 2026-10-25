// Контакты клиники: меняются здесь — меняются на всех страницах. Пустое значение = кнопка скрыта.
const CONFIG = {
  booking: 'https://n1676841.yclients.ru/company/1501872/personal/menu?o=',
  telegram: '', // ссылка на бота WaHelp, например https://t.me/yve_clinic_bot
  phone: '',    // +74950000000
};

const CATALOG = window.CATALOG || [];
const byId = Object.fromEntries(CATALOG.map(c => [c.id, c]));
const rub = n => n.toLocaleString('ru-RU') + ' ₽';
const esc = s => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const pr = new Intl.PluralRules('ru');
const services = n => `${n} ${{ one: 'услуга', few: 'услуги', many: 'услуг' }[pr.select(n)]}`;
// «1 единица», «1 линия» и сыворотки-добавки — не процедуры, в «от … ₽» их не считаем
const isAddon = i => /(^|\s)1 (линия|единица)/i.test(i.n) || i.n.startsWith('Сыворотка');

/* Контакты */
document.querySelectorAll('[data-tg]').forEach(a => { if (CONFIG.telegram) a.href = CONFIG.telegram; else a.hidden = true; });
document.querySelectorAll('[data-phone]').forEach(a => {
  if (!CONFIG.phone) return a.removeAttribute('href');
  a.href = 'tel:' + CONFIG.phone;
  a.textContent = CONFIG.phone.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, '+7 ($1) $2-$3-$4');
});

/* Онлайн-запись: YCLIENTS в выезжающей панели. Без JS ссылка просто открывает YCLIENTS. */
const dlg = document.createElement('dialog');
dlg.className = 'book';
dlg.setAttribute('aria-label', 'Онлайн-запись');
dlg.innerHTML = '<div class="book-bar"><b>Онлайн-запись</b><button class="book-close" type="button" aria-label="Закрыть">×</button></div><iframe title="Онлайн-запись YCLIENTS"></iframe>';
document.body.append(dlg);
const frame = dlg.querySelector('iframe');
dlg.querySelector('.book-close').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
document.addEventListener('click', e => {
  const a = e.target.closest('[data-book]');
  if (!a) return;
  e.preventDefault();
  if (!frame.src) frame.src = CONFIG.booking;
  dlg.showModal();
});

/* Шапка прозрачная, пока под ней первый экран */
const header = document.querySelector('.header');
const hero = document.querySelector('.hero');
if (hero) new IntersectionObserver(([e]) => header.classList.toggle('on-hero', e.isIntersecting), { rootMargin: '-76px 0px 0px 0px' }).observe(hero);

/* Направления: «от … ₽» из прайса + картинка за курсором */
document.querySelectorAll('.dir').forEach(li => {
  const items = li.dataset.cats.split(' ').flatMap(id => byId[id]?.items || []).filter(i => !isAddon(i));
  if (items.length) li.querySelector('.price').textContent = 'от ' + rub(Math.min(...items.map(i => i.p)));
});
if (document.querySelector('.dir') && matchMedia('(hover: hover) and (pointer: fine)').matches) {
  const peek = document.createElement('div');
  peek.className = 'peek';
  peek.setAttribute('aria-hidden', 'true');
  document.body.append(peek);
  document.querySelectorAll('.dir').forEach(li => {
    li.addEventListener('mouseenter', () => {
      peek.style.backgroundImage = `url(${li.dataset.img}), linear-gradient(160deg, #b6b28f, #47452e)`;
      peek.classList.add('show');
    });
    li.addEventListener('mouseleave', () => peek.classList.remove('show'));
  });
  let x = 0, y = 0, raf = 0;
  addEventListener('mousemove', e => {
    x = e.clientX; y = e.clientY;
    raf ||= requestAnimationFrame(() => { peek.style.translate = `${x + 32}px ${y - 170}px`; raf = 0; });
  });
}

/* Комплексы на главной */
document.querySelectorAll('.offer-list[data-cat]').forEach(ul => {
  ul.innerHTML = (byId[ul.dataset.cat]?.items || []).map(i =>
    `<li class="offer"><div><h3>${esc(i.n)}</h3><p>${esc(i.d)}</p></div><div class="price">${rub(i.p)}<small>${esc(i.t)}</small></div></li>`).join('');
});

/* Каталог: список, поиск, подсветка раздела в навигации */
const list = document.getElementById('catalog-list');
if (list) {
  const nav = document.getElementById('cat-nav');
  const input = document.getElementById('q');
  const empty = document.getElementById('empty');
  const norm = s => s.toLowerCase().replaceAll('ё', 'е');

  nav.innerHTML = '<ul>' + CATALOG.map(c => `<li><a href="#${c.id}">${esc(c.title)}<span>${c.items.length}</span></a></li>`).join('') + '</ul>';
  list.innerHTML = CATALOG.map(c => `
    <section class="cat" id="${c.id}" aria-labelledby="h-${c.id}">
      <div class="cat-title"><h2 id="h-${c.id}">${esc(c.title)}</h2><span>${services(c.items.length)}</span></div>
      <ul class="svc-list">${c.items.map(i => `
        <li class="svc" data-q="${esc(norm(`${i.n} ${i.d} ${c.title}`))}">
          <div><h3>${esc(i.n)}</h3>${i.d ? `<p>${esc(i.d)}</p>` : ''}</div>
          <span class="dur">${esc(i.t)}</span>
          <span class="price">${rub(i.p)}</span>
          <a class="book-btn link" href="${CONFIG.booking}" data-book>Записаться</a>
        </li>`).join('')}
      </ul>
    </section>`).join('');
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();

  input.addEventListener('input', () => {
    const q = norm(input.value.trim());
    let total = 0;
    list.querySelectorAll('.cat').forEach(sec => {
      let n = 0;
      sec.querySelectorAll('.svc').forEach(li => { const hit = li.dataset.q.includes(q); li.hidden = !hit; n += hit; });
      sec.hidden = !n;
      sec.querySelector('.cat-title span').textContent = services(n);
      nav.querySelector(`a[href="#${sec.id}"]`).parentElement.hidden = !n;
      total += n;
    });
    empty.hidden = total > 0;
    empty.querySelector('q').textContent = input.value.trim();
  });
  empty.querySelector('button').addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); });

  const links = Object.fromEntries([...nav.querySelectorAll('a')].map(a => [a.hash.slice(1), a]));
  const spy = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    nav.querySelector('.active')?.classList.remove('active');
    links[e.target.id].classList.add('active');
    links[e.target.id].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }), { rootMargin: '-35% 0px -60% 0px' });
  list.querySelectorAll('.cat').forEach(s => spy.observe(s));
}
