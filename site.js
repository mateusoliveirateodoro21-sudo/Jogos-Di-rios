/* Aviso de cookies, Google Tag Manager e AdSense (só carregam se configurados). */
(function () {
  var S = window.SITE || {}, KEY = 'jd_consent';
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function loadGTM() {
    if (!S.GTM_ID || window.__gtmLoaded) return; window.__gtmLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    var s = document.createElement('script'); s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(S.GTM_ID);
    document.head.appendChild(s);
  }
  function loadAds(personalized) {
    if (!S.ADSENSE_CLIENT || window.__adsLoaded) return; window.__adsLoaded = true;
    window.adsbygoogle = window.adsbygoogle || [];
    if (!personalized) window.adsbygoogle.requestNonPersonalizedAds = 1;
    var s = document.createElement('script'); s.async = true; s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(S.ADSENSE_CLIENT);
    document.head.appendChild(s);
    window.SiteAds.refresh(document);
  }

  /* Preenche um .ad-slot[data-slot] com o bloco do AdSense (se houver ID configurado). */
  window.SiteAds = {
    refresh: function (root) {
      if (!S.ADSENSE_CLIENT) return;
      var nodes = (root || document).querySelectorAll('.ad-slot[data-slot]');
      Array.prototype.forEach.call(nodes, function (el) {
        var id = S.AD_SLOTS && S.AD_SLOTS[el.getAttribute('data-slot')];
        if (!id || el.getAttribute('data-filled')) return;
        el.setAttribute('data-filled', '1');
        var ins = document.createElement('ins');
        ins.className = 'adsbygoogle'; ins.style.display = 'block';
        ins.setAttribute('data-ad-client', S.ADSENSE_CLIENT);
        ins.setAttribute('data-ad-slot', id);
        ins.setAttribute('data-ad-format', 'auto');
        ins.setAttribute('data-full-width-responsive', 'true');
        el.appendChild(ins);
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
      });
    }
  };

  function apply(c) { if (c === 'all') loadGTM(); loadAds(c === 'all'); }

  function banner() {
    var b = document.createElement('div'); b.className = 'cookie'; b.setAttribute('role', 'dialog');
    b.innerHTML = '<p>Usamos cookies e armazenamento local para salvar seu progresso e, se você permitir, para estatísticas e anúncios personalizados. ' +
      '<a href="' + rootPath() + 'privacidade/">Saiba mais</a>.</p>' +
      '<div><button class="btn btn-ghost" data-c="min">Só o essencial</button> <button class="btn" data-c="all">Aceitar tudo</button></div>';
    b.addEventListener('click', function (e) {
      var c = e.target && e.target.getAttribute('data-c'); if (!c) return;
      set(c); b.remove(); apply(c);
    });
    document.body.appendChild(b);
  }
  function rootPath() {
    var el = document.querySelector('script[src$="assets/js/site.js"]');
    var src = el ? el.getAttribute('src') : 'assets/js/site.js';
    return src.replace('assets/js/site.js', '');
  }

  document.addEventListener('DOMContentLoaded', function () {
    Array.prototype.forEach.call(document.querySelectorAll('[data-site]'), function (el) {
      var k = el.getAttribute('data-site'); if (S[k]) el.textContent = S[k];
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-site-mail]'), function (el) {
      el.textContent = S.CONTACT_EMAIL; el.setAttribute('href', 'mailto:' + S.CONTACT_EMAIL);
    });
    var c = get();
    if (c) apply(c); else { banner(); loadAds(false); }
  });
})();
