/* khan-video-autoplay.js — keeps the looping background/jar videos running without a tap.
   Any <video data-khan-autoplay> is forced muted + inline and played when it scrolls into
   view. If the browser still refuses (iOS Low Power Mode, data saver), the first tap or key
   press anywhere on the page starts them all — nobody has to hit the video itself. */
(function () {
  var SEL = 'video[data-khan-autoplay]';
  var armed = false;
  var io = null;

  function prep(v) {
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
    v.removeAttribute('controls');
  }
  function tryPlay(v) {
    if (!v.paused) return;
    prep(v);
    var p;
    try { p = v.play(); } catch (e) { arm(); return; }
    if (p && typeof p.then === 'function') p.then(disarmIfAllPlaying, arm);
  }
  function all() { return Array.prototype.slice.call(document.querySelectorAll(SEL)); }
  function inView(v) {
    var r = v.getBoundingClientRect();
    return r.width > 0 && r.bottom > -200 && r.top < (window.innerHeight || 0) + 200;
  }
  function kick() { all().forEach(function (v) { if (inView(v)) tryPlay(v); }); }

  function onGesture() { all().forEach(tryPlay); }
  function arm() {
    if (armed) return; armed = true;
    ['touchend', 'click', 'keydown'].forEach(function (t) { document.addEventListener(t, onGesture, true); });
  }
  function disarmIfAllPlaying() {
    if (!armed) return;
    if (all().some(function (v) { return v.paused && inView(v); })) return;
    armed = false;
    ['touchend', 'click', 'keydown'].forEach(function (t) { document.removeEventListener(t, onGesture, true); });
  }

  function watch() {
    var vids = all();
    vids.forEach(prep);
    if ('IntersectionObserver' in window) {
      if (!io) io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) tryPlay(e.target); });
      }, { rootMargin: '200px 0px' });
      vids.forEach(function (v) { if (!v.__khanAp) { v.__khanAp = true; io.observe(v); } });
    }
    vids.forEach(function (v) {
      if (v.__khanApEv) return; v.__khanApEv = true;
      ['loadeddata', 'canplay'].forEach(function (t) { v.addEventListener(t, function () { if (inView(v)) tryPlay(v); }); });
    });
    kick();
  }

  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
  window.addEventListener('pageshow', kick);
  document.addEventListener('shopify:section:load', watch);
  if (document.readyState !== 'loading') watch();
  else document.addEventListener('DOMContentLoaded', watch);
})();
