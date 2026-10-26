// Версия первого экрана выставляется до первой отрисовки: ?v=1 или ?v=2 в адресе, иначе последняя выбранная.
// Переключатель — только для показа клиенту; при запуске оставить одну версию и убрать выбор.
(function () {
  var d = document.documentElement;
  var v = new URLSearchParams(location.search).get('v');
  try { v = v || localStorage.getItem('yve-hero'); } catch (e) { /* хранилище закрыто (приватный режим) — версия 1 */ }
  d.dataset.v = v === '2' ? '2' : '1';
  d.classList.add('js');
  // Заставка — один раз за сессию
  try {
    if (sessionStorage.getItem('yve-intro')) d.classList.add('no-intro');
    sessionStorage.setItem('yve-intro', '1');
  } catch (e) { d.classList.add('no-intro'); }
})();
