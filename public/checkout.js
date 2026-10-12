(function () {
  'use strict';

  var buttons = Array.prototype.slice.call(document.querySelectorAll('.buy-btn'));
  var dialog = document.getElementById('checkout-dialog');
  var form = document.getElementById('checkout-form');
  if (!buttons.length || !dialog || !form || typeof dialog.showModal !== 'function') return;

  var errorBox = document.getElementById('co-error');
  var submitBtn = document.getElementById('co-submit');
  var cancelBtn = document.getElementById('co-cancel');
  var packages = {};
  var current = null;
  var opener = null;
  var busy = false;
  var pendingOrderId = null;

  var LABELS = {
    name: 'Ad', surname: 'Soyad', email: 'E-posta',
    phone: 'Telefon', city: 'Şehir', address: 'Adres'
  };
  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var PHONE_RE = /^\+?[0-9 ()\-]{7,20}$/;

  // Integer minor units -> "7.500 ₺" (no floats).
  function formatTL(minor) {
    var major = String(Math.floor(minor / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var rest = minor % 100;
    return major + (rest ? ',' + (rest < 10 ? '0' : '') + rest : '') + ' ₺';
  }

  function setBuyNotes(text) {
    Array.prototype.forEach.call(document.querySelectorAll('.buy-note'), function (el) {
      el.textContent = text;
      el.hidden = !text;
    });
  }

  function disableAll(message) {
    buttons.forEach(function (b) { b.disabled = true; });
    setBuyNotes(message);
  }

  function loadServices() {
    fetch('/api/services?lang=tr', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json();
      })
      .then(function (list) {
        list.forEach(function (svc) {
          var p = svc && svc.package;
          if (p && typeof p.id === 'number' && Number.isInteger(p.price)) {
            packages[svc.slug] = { id: p.id, price: p.price, name: svc.name + ' — ' + p.name };
          }
        });
        buttons.forEach(function (b) {
          if (!packages[b.dataset.slug]) b.disabled = true;
        });
        if (buttons.some(function (b) { return b.disabled; })) {
          setBuyNotes('Paket bilgisi şu anda alınamadı. Lütfen İletişim butonunu kullanın.');
        }
      })
      .catch(function () {
        disableAll('Satın alma şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin veya İletişim butonunu kullanın.');
      });
  }

  function showError(message, field) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    Array.prototype.forEach.call(form.elements, function (el) { el.removeAttribute('aria-invalid'); });
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
  }

  function clearError() {
    errorBox.textContent = '';
    errorBox.hidden = true;
    Array.prototype.forEach.call(form.elements, function (el) { el.removeAttribute('aria-invalid'); });
  }

  function setBusy(state) {
    busy = state;
    submitBtn.disabled = state;
    submitBtn.textContent = state ? 'Yönlendiriliyor…' : 'Ödemeye geç';
  }

  // Backend errors are English; map them to Turkish.
  function turkishError(status, body) {
    if (status === 429) return 'Çok fazla deneme yapıldı. Lütfen bir dakika sonra tekrar deneyin.';
    var msg = body && typeof body.error === 'string' ? body.error : '';
    var m = /^(\w+) is required$/.exec(msg);
    if (m) return (LABELS[m[1]] || 'Gerekli alan') + ' zorunludur.';
    m = /^(\w+) is too long$/.exec(msg);
    if (m) return (LABELS[m[1]] || 'Alan') + ' çok uzun.';
    if (msg === 'email is invalid') return 'Geçerli bir e-posta adresi girin.';
    if (msg === 'phone is invalid') return 'Geçerli bir telefon numarası girin.';
    if (msg === 'package not found' || /^package_id/.test(msg)) return 'Seçilen paket bulunamadı. Sayfayı yenileyip tekrar deneyin.';
    if (status === 400) return 'Girdiğiniz bilgiler geçersiz. Lütfen kontrol edip tekrar deneyin.';
    if (status === 502) return 'Ödeme sayfası şu anda açılamadı. Lütfen daha sonra tekrar deneyin.';
    return 'Bir hata oluştu. Lütfen daha sonra tekrar deneyin.';
  }

  function postJSON(url, payload) {
    var opts = { method: 'POST', headers: { Accept: 'application/json' } };
    if (payload) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(payload);
    }
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (body) {
        if (!res.ok) {
          var err = new Error('http');
          err.userMessage = turkishError(res.status, body);
          throw err;
        }
        return body;
      });
    });
  }

  function openDialog(btn) {
    var pkg = packages[btn.dataset.slug];
    if (!pkg) return;
    current = pkg;
    opener = btn;
    pendingOrderId = null;
    clearError();
    document.getElementById('co-package').textContent = pkg.name;
    document.getElementById('co-total').textContent = formatTL(pkg.price);
    setBusy(false);
    dialog.showModal();
  }

  buttons.forEach(function (b) {
    b.addEventListener('click', function () { openDialog(b); });
  });

  cancelBtn.addEventListener('click', function () { if (!busy) dialog.close(); });
  dialog.addEventListener('cancel', function (e) { if (busy) e.preventDefault(); });
  dialog.addEventListener('close', function () {
    if (opener) opener.focus();
  });
  form.addEventListener('input', function () { pendingOrderId = null; });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy || !current) return;

    var v = {};
    Object.keys(LABELS).forEach(function (k) { v[k] = form.elements[k].value.trim(); });
    clearError();

    var keys = Object.keys(LABELS);
    for (var i = 0; i < keys.length; i++) {
      if (!v[keys[i]]) return showError(LABELS[keys[i]] + ' zorunludur.', form.elements[keys[i]]);
    }
    if (!EMAIL_RE.test(v.email)) return showError('Geçerli bir e-posta adresi girin.', form.elements.email);
    if (!PHONE_RE.test(v.phone)) return showError('Geçerli bir telefon numarası girin.', form.elements.phone);
    if (!form.elements.terms.checked) {
      return showError('Devam etmek için satın alma koşullarını kabul etmelisiniz.', form.elements.terms);
    }

    setBusy(true);
    var orderStep = pendingOrderId
      ? Promise.resolve({ order_id: pendingOrderId })
      : postJSON('/api/orders', {
          package_id: current.id, name: v.name, surname: v.surname, email: v.email,
          phone: v.phone, city: v.city, address: v.address
        });

    orderStep
      .then(function (order) {
        pendingOrderId = order.order_id;
        return postJSON('/api/orders/' + encodeURIComponent(order.order_id) + '/checkout/iyzico');
      })
      .then(function (checkout) {
        var url = checkout && checkout.payment_page_url;
        if (typeof url !== 'string' || url.indexOf('https://') !== 0) {
          throw { userMessage: 'Ödeme sayfası şu anda açılamadı. Lütfen daha sonra tekrar deneyin.' };
        }
        window.location.assign(url);
      })
      .catch(function (err) {
        setBusy(false);
        showError(err && err.userMessage
          ? err.userMessage
          : 'Bağlantı hatası. İnternet bağlantınızı kontrol edip tekrar deneyin.');
      });
  });

  // Back button from the payment page may restore this page with the submit disabled.
  window.addEventListener('pageshow', function (e) { if (e.persisted) setBusy(false); });

  function showTestNotice() {
    var dialogNote = document.createElement('p');
    dialogNote.className = 'test-notice';
    dialogNote.setAttribute('role', 'note');
    dialogNote.textContent = 'Test modu: gerçek ödeme alınmıyor. Deneme için iyzico test kartı: 5890040000000016, son kullanma tarihi gelecekte herhangi bir tarih, CVC 123.';
    dialog.insertBefore(dialogNote, dialog.firstChild);

    var grid = document.querySelector('.pricegrid');
    if (grid && grid.parentNode) {
      var line = document.createElement('p');
      line.className = 'test-notice test-notice-line';
      line.textContent = 'Ödeme sistemi şu an test modundadır; gerçek kartla çekim yapılmaz.';
      grid.parentNode.insertBefore(line, grid.nextSibling);
    }
  }

  function loadConfig() {
    fetch('/api/config', { headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json();
      })
      .then(function (cfg) {
        if (cfg && cfg.test_mode === true) showTestNotice();
      })
      .catch(function () { /* no notice; purchase flow unaffected */ });
  }

  loadServices();
  loadConfig();
})();
