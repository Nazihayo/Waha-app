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
      $('login').hidden = true; $('panel').hidden = false; $('tabs').hidden = false;
      render(d);
      loadUsage();
    }).catch(() => { $('loginMsg').textContent = 'تعذّر الاتصال، حاول لاحقاً.'; });
  }
  $('login').addEventListener('submit', (e) => { e.preventDefault(); key = $('key').value.trim(); login(); });
  document.querySelectorAll('.filters button').forEach((b) => b.addEventListener('click', () => {
    filter = b.getAttribute('data-f');
    document.querySelectorAll('.filters button').forEach((x) => x.classList.toggle('on', x === b));
    renderList();
  }));
  // ---- usage tab (anonymous totals from /.netlify/functions/stats) ----
  const FEATURE_AR = { chat_message: 'رسائل المحادثة', agent_plan: 'خطط اليوم', agent_feedback: 'تقييم خطوات الخطة', exercise_completion: 'تمارين مكتملة', mood_log: 'تسجيل المزاج', health_log: 'تسجيل النوم والصحة', agent_calendar_export: 'إضافة للتقويم', chat_action_started: 'تمارين بدأت من المحادثة', opinion_sent: 'آراء مرسلة', habit_completion: 'عادات مكتملة' };
  const LANG_AR = { ar: 'العربية', en: 'الإنجليزية', de: 'الألمانية', fr: 'الفرنسية', tr: 'التركية', ku: 'الكردية', es: 'الإسبانية', fa: 'الفارسية', ur: 'الأردية', ru: 'الروسية', pt: 'البرتغالية', it: 'الإيطالية', other: 'أخرى' };
  function table(head, rows) {
    const t = el('table', 't'); const tr = el('tr'); head.forEach((h) => tr.appendChild(el('th', '', h))); t.appendChild(tr);
    rows.forEach((r) => { const row = el('tr'); r.forEach((c) => row.appendChild(el('td', '', String(c)))); t.appendChild(row); });
    return t;
  }
  function loadUsage() {
    fetch('/.netlify/functions/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'admin_stats', key }) })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!ok) { $('uMsg').textContent = 'تعذّر تحميل أرقام الاستخدام.'; return; } renderUsage(d); })
      .catch(() => { $('uMsg').textContent = 'تعذّر تحميل أرقام الاستخدام.'; });
  }
  function renderUsage(d) {
    const days = d.days || [];
    const todayRow = days.find((x) => x.date === d.today);
    const last7 = days.slice(-7);
    const avg7 = last7.length ? Math.round(last7.reduce((s, x) => s + x.active, 0) / last7.length * 10) / 10 : 0;
    const st = $('uStats'); st.textContent = '';
    const box = (big, small) => { const b = el('div', 'stat'); b.appendChild(el('b', '', big)); b.appendChild(el('span', '', small)); st.appendChild(b); };
    box(String(d.optedIn || 0), 'شخصاً وافقوا على القياس');
    box(String(todayRow ? todayRow.active : 0), 'نشطون اليوم');
    box(String(avg7), 'متوسط النشطين يومياً (آخر 7 أيام)');
    const r7 = d.retention && d.retention.d7;
    box(r7 && r7.percent !== null ? r7.percent + '%' : '—', 'عادوا بعد 7 أيام');

    const bars = $('uBars'); bars.textContent = '';
    const max = Math.max(1, ...days.map((x) => x.active));
    if (!days.length) bars.appendChild(el('p', 'small', 'لا توجد أرقام بعد.'));
    days.forEach((x) => { const b = el('div', 'bar'); b.style.height = Math.max(3, Math.round(x.active / max * 118)) + 'px'; b.title = x.date + ': ' + x.active; b.appendChild(el('span', '', String(x.active))); bars.appendChild(b); });
    const axis = $('uBars').nextElementSibling && $('uBars').nextElementSibling.classList.contains('bars-axis') ? $('uBars').nextElementSibling : null;
    if (axis) axis.remove();
    if (days.length) { const a = el('div', 'bars-axis'); a.appendChild(el('span', '', days[0].date)); a.appendChild(el('span', '', days[days.length - 1].date)); bars.after(a); }

    const ret = $('uRet'); ret.textContent = '';
    const rr = d.retention || {};
    ret.appendChild(table(['بعد', 'بدأوا', 'عادوا', 'النسبة'], [['يوم واحد', 'd1'], ['3 أيام', 'd3'], ['7 أيام', 'd7'], ['14 يوماً', 'd14'], ['30 يوماً', 'd30']]
      .map(([label, k]) => { const v = rr[k] || {}; return [label, v.started || 0, v.returned || 0, v.percent === null || v.percent === undefined ? '—' : v.percent + '%']; })));
    ret.appendChild(el('p', 'small', 'تُحسب فقط مجموعات الأشخاص الذين مرّ على بدئهم الوقت الكافي. الأرقام تقريبية لأنها مجهولة تماماً.'));

    const feat = $('uFeat'); feat.textContent = '';
    const ft = d.featureTotals || {}, fu = d.featureUsers || {};
    const rows = Object.keys(ft).sort((a, b) => ft[b] - ft[a]).map((f) => [FEATURE_AR[f] || f, ft[f], fu[f] || 0]);
    feat.appendChild(rows.length ? table(['الميزة', 'مرات الاستخدام', 'أيام-أشخاص استخدموها'], rows) : el('p', 'small', 'لا توجد أرقام بعد.'));

    const lang = $('uLang'); lang.textContent = '';
    const lt = d.langTotals || {};
    const lrows = Object.keys(lt).sort((a, b) => lt[b] - lt[a]).map((l) => [LANG_AR[l] || l, lt[l]]);
    lang.appendChild(lrows.length ? table(['اللغة', 'أيام-أشخاص'], lrows) : el('p', 'small', 'لا توجد أرقام بعد.'));
  }
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
    $('panel').hidden = b.getAttribute('data-tab') !== 'panel';
    $('usagePanel').hidden = b.getAttribute('data-tab') !== 'usagePanel';
  }));

  if (key) login();
})();
