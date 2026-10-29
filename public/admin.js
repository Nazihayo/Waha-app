// Waha admin page: review pilot opinions. Talks only to
// /.netlify/functions/feedback; the key stays in this tab (sessionStorage).
(function () {
  const API = '/.netlify/functions/feedback';
  const LABEL = { pending: 'بانتظار المراجعة', approved: 'منشور', hidden: 'نص مخفي', spam: 'مزعج' };
  let key = '';
  let items = [];
  let filter = 'pending';
  const $ = (id) => document.getElementById(id);
  try { key = sessionStorage.getItem('waha_admin_key') || ''; } catch (e) {}

  function call(body) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ key }, body)) })
      .then((r) => r.json().then((d) => ({ ok: r.ok, status: r.status, d })));
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  function render(data) {
    items = data.items || [];
    const s = data.stats || {};
    const st = $('stats'); st.textContent = '';
    const box = (big, small) => { const b = el('div', 'stat'); b.appendChild(el('b', '', big)); b.appendChild(el('span', '', small)); st.appendChild(b); };
    box(s.average === null || s.average === undefined ? '—' : '★ ' + s.average, 'متوسط التقييم (كل التقييمات الحقيقية)');
    box(String(s.count || 0), 'عدد التقييمات المحسوبة');
    box(String(items.filter((i) => i.status === 'pending').length), 'بانتظار مراجعتك');
    const u = data.usage || {}, a = u.averages || {};
    $('usage').textContent = u.people
      ? `أرقام الاستخدام (متوسط ${u.people} شخصاً أرفقوها): أيام الاستخدام ${a.daysActive ?? '—'} · رسائل المحادثة ${a.chatMessages ?? '—'} · خطط اليوم ${a.plansMade ?? '—'} · خطوات «ساعدتني» ${a.stepsHelped ?? '—'} · تمارين مكتملة ${a.exercisesDone ?? '—'} · تسجيلات المزاج ${a.moodLogs ?? '—'}`
      : 'لم يرفق أحد أرقام استخدامه بعد.';
    renderList();
  }
  function renderList() {
    const list = $('list'); list.textContent = '';
    const shown = items.filter((i) => filter === 'all' || i.status === filter);
    if (!shown.length) { list.appendChild(el('p', 'empty-list', 'لا يوجد شيء هنا.')); return; }
    shown.forEach((i) => {
      const card = el('div', 'item' + (i.flag === 'crisis' ? ' crisis' : ''));
      const meta = el('div', 'meta');
      meta.appendChild(el('span', 'stars', '★'.repeat(i.rating) + '☆'.repeat(5 - i.rating)));
      meta.appendChild(el('span', '', new Date(i.ts).toLocaleString('ar')));
      meta.appendChild(el('span', '', i.pilot ? 'مشارك: ' + i.pilot : 'زائر'));
      meta.appendChild(el('span', 'badge', LABEL[i.status] || i.status));
      card.appendChild(meta);
      if (i.flag === 'crisis') card.appendChild(el('div', 'warn', '⚠️ هذا الرأي فيه كلام مقلق. لا يُنشر أبداً. تواصل مع هذا الشخص اليوم بلطف (رمزه أعلاه)، وأعطه أرقام المساعدة: TelefonSeelsorge 0800 111 0 111، وفي الخطر المباشر 112.'));
      card.appendChild(el('div', 'text' + (i.text ? '' : ' empty'), i.text || '(تقييم بدون نص)'));
      card.appendChild(el('div', 'note', i.publicOk ? 'وافق صاحبه على نشر رأيه بدون اسمه.' : 'لم يوافق صاحبه على النشر: يبقى خاصاً.'));
      const act = el('div', 'actions');
      const btn = (label, status, cls, disabled) => { const b = el('button', cls || '', label); b.type = 'button'; b.disabled = !!disabled || i.status === status; b.addEventListener('click', () => moderate(i.id, status)); act.appendChild(b); };
      btn('نشر', 'approved', 'approve', !i.publicOk || i.flag === 'crisis' || !i.text);
      btn('إخفاء النص', 'hidden');
      btn('مزعج', 'spam');
      btn('إرجاع للمراجعة', 'pending');
      card.appendChild(act);
      list.appendChild(card);
    });
  }
  function moderate(id, status) {
    call({ action: 'moderate', id, status }).then(({ ok, d }) => { if (ok) render(d); else alert(d.error === 'This opinion cannot be published' ? 'لا يمكن نشر هذا الرأي.' : 'حدث خطأ، حاول مرة أخرى.'); });
  }
  function login() {
    $('loginMsg').textContent = '';
    call({ action: 'admin_list' }).then(({ ok, status, d }) => {
      if (!ok) { $('loginMsg').textContent = status === 403 ? 'كلمة السر غير صحيحة.' : 'تعذّر الاتصال، حاول لاحقاً.'; return; }
      try { sessionStorage.setItem('waha_admin_key', key); } catch (e) {}
      $('login').hidden = true; $('panel').hidden = false;
      render(d);
    }).catch(() => { $('loginMsg').textContent = 'تعذّر الاتصال، حاول لاحقاً.'; });
  }
  $('login').addEventListener('submit', (e) => { e.preventDefault(); key = $('key').value.trim(); login(); });
  document.querySelectorAll('.filters button').forEach((b) => b.addEventListener('click', () => {
    filter = b.getAttribute('data-f');
    document.querySelectorAll('.filters button').forEach((x) => x.classList.toggle('on', x === b));
    renderList();
  }));
  if (key) login();
})();
