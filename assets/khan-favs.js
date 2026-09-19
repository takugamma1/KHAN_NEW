/* khan-favs.js — theme favourites (wishlist). No account needed.
   Stored in the browser (localStorage) and backed up on the visitor's Shopify cart as the
   cart attribute "khan_favs" (product handles). The cart cookie is set by Shopify's server, so
   the backup survives the browser wiping script storage (Safari does that after 7 idle days);
   on the next visit the list is restored from it. Same browser/device only.
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
  function write(list, opts) {
    try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
    document.dispatchEvent(new CustomEvent('khan:favs:change'));
    if (!opts || !opts.local) pushRemote();
  }

  /* ---------- server backup on the Shopify cart ---------- */
  var ATTR = 'khan_favs';
  var pushTimer = 0;
  function root() { return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/'; }
  function handlesOf(list) { return list.map(function (p) { return p.handle; }).join(','); }
  function pushRemote() {
    if (!window.fetch) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      var attrs = {}; attrs[ATTR] = handlesOf(read());
      fetch(root() + 'cart/update.js', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ attributes: attrs })
      }).catch(function () {});
    }, 500);
  }
  function money(cents, currency) {
    try {
      return new Intl.NumberFormat(document.documentElement.lang || 'bg', { style: 'currency', currency: currency }).format(cents / 100);
    } catch (e) { return (cents / 100).toFixed(2); }
  }
  function fetchProduct(handle) {
    return fetch(root() + 'products/' + encodeURIComponent(handle) + '.js', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (p) {
        if (!p) return null;
        var cur = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'EUR';
        var img = p.featured_image || (p.images && p.images[0]) || '';
        if (img && img.indexOf('//') === 0) img = 'https:' + img;
        return { handle: p.handle, title: p.title, price: money(p.price, cur), image: img, url: p.url || (root() + 'products/' + p.handle) };
      })
      .catch(function () { return null; });
  }
  /* once per page load: restore an emptied browser list from the cart, or bring the cart up to date */
  function syncRemote() {
    if (!window.fetch) return;
    fetch(root() + 'cart.js', { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (cart) {
        if (!cart) return;
        var remote = (cart.attributes && cart.attributes[ATTR]) || '';
        var local = read();
        if (!local.length && remote) {
          var handles = remote.split(',').filter(Boolean);
          return Promise.all(handles.map(fetchProduct)).then(function (items) {
            items = items.filter(Boolean);
            if (items.length && !read().length) write(items, { local: true });
          });
        }
        if (handlesOf(local) !== remote) pushRemote();
      })
      .catch(function () {});
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
  syncRemote();
})();
