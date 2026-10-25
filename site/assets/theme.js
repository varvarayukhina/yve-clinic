// Версия дизайна выставляется до первой отрисовки: ?v=1…5 в адресе, иначе последняя выбранная.
// Переключатель версий — только для показа клиенту; при запуске оставить одну тему и удалить этот файл.
(function () {
  var d = document.documentElement;
  var v = new URLSearchParams(location.search).get('v');
  try { v = v || localStorage.getItem('yve-v'); } catch (e) { /* хранилище закрыто (приватный режим) — берём v1 */ }
  d.dataset.theme = /^[1-5]$/.test(v) ? 'v' + v : 'v1';
  d.classList.add('js');
  // Заставка — один раз за сессию
  try {
    if (sessionStorage.getItem('yve-intro')) d.classList.add('no-intro');
    sessionStorage.setItem('yve-intro', '1');
  } catch (e) { d.classList.add('no-intro'); }
})();
