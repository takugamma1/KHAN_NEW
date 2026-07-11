/* khan-favs.js — theme favourites (wishlist), stored in the browser (localStorage).
   API: window.KHANFavs { list, has, add, remove, toggle }. Fires 'khan:favs:change'.
   Wiring (all automatic, works after section reloads):
   - [data-khan-fav data-handle data-title data-price data-image data-url]  -> toggle button (gets .is-fav + aria-pressed)
   - [data-khan-favs-count]  -> live count badge (hidden at 0)
   - [data-khan-favs-list]   -> rendered list of favourites (rows with image/title/price/remove)
   - [data-khan-favs-empty]  -> shown when the list is empty */
(function () {
  var KEY = 'khan:favs';

  function read() {
    try { return JSON.parse(window.localStorage.getItem(KEY)) || []; } catch (e) { return []; }
  }
  function write(list) {
    try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
    document.dispatchEvent(new CustomEvent('khan:favs:change'));
  }

  var api = {
    list: read,
    has: function (handle) { return read().some(function (p) { return p.handle === handle; }); },
    add: function (p) {
      if (!p || !p.handle) return;
      var l = read();
      if (!l.some(function (x) { return x.handle === p.handle; })) { l.push(p); write(l); }
    },
    remove: function (handle) {
      write(read().filter(function (p) { return p.handle !== handle; }));
    },
    toggle: function (p) {
      if (api.has(p.handle)) { api.remove(p.handle); return false; }
      api.add(p); return true;
    }
  };
  window.KHANFavs = api;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function syncButtons() {
    var l = read();
    var els = document.querySelectorAll('[data-khan-fav]');
    for (var i = 0; i < els.length; i++) {
      var b = els[i];
      var on = l.some(function (p) { return p.handle === b.getAttribute('data-handle'); });
      b.classList.toggle('is-fav', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
  function syncCounts() {
    var n = read().length;
    var els = document.querySelectorAll('[data-khan-favs-count]');
    for (var i = 0; i < els.length; i++) { els[i].textContent = n; els[i].hidden = n === 0; }
  }
  function renderLists() {
    var l = read();
    var lists = document.querySelectorAll('[data-khan-favs-list]');
    for (var i = 0; i < lists.length; i++) {
      var box = lists[i];
      var wrap = box.parentElement;
      var empty = wrap ? wrap.querySelector('[data-khan-favs-empty]') : null;
      if (empty) empty.hidden = l.length > 0;
      box.innerHTML = l.map(function (p) {
        return '<div class="khan-favs__row">' +
          '<a class="khan-favs__img" href="' + esc(p.url) + '">' +
            (p.image ? '<img src="' + esc(p.image) + '" alt="" loading="lazy">' : '') +
          '</a>' +
          '<a class="khan-favs__meta" href="' + esc(p.url) + '">' +
            '<span class="khan-favs__title">' + esc(p.title) + '</span>' +
            (p.price ? '<span class="khan-favs__price">' + esc(p.price) + '</span>' : '') +
          '</a>' +
          '<button type="button" class="khan-favs__rm" data-khan-fav-rm="' + esc(p.handle) + '" aria-label="Премахни">&times;</button>' +
        '</div>';
      }).join('');
    }
  }
  function refresh() { syncButtons(); syncCounts(); renderLists(); }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var b = t.closest ? t.closest('[data-khan-fav]') : null;
    if (b) {
      e.preventDefault();
      e.stopPropagation();
      api.toggle({
        handle: b.getAttribute('data-handle'),
        title: b.getAttribute('data-title'),
        price: b.getAttribute('data-price'),
        image: b.getAttribute('data-image'),
        url: b.getAttribute('data-url')
      });
      return;
    }
    var rm = t.closest ? t.closest('[data-khan-fav-rm]') : null;
    if (rm) { e.preventDefault(); api.remove(rm.getAttribute('data-khan-fav-rm')); }
  });

  document.addEventListener('khan:favs:change', refresh);
  document.addEventListener('shopify:section:load', refresh);
  if (document.readyState !== 'loading') refresh();
  else document.addEventListener('DOMContentLoaded', refresh);
})();
