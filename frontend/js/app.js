// app.js — DeskFlow frontend application

// ── STATE ────────────────────────────────────────────────────
const state = {
  currentUser:  null,
  view:         'map',
  selectedDate: (() => { const d = new Date(); if (d.getDay()===0) d.setDate(d.getDate()+1); if (d.getDay()===6) d.setDate(d.getDate()+2); return d; })(),

  // Calendar popover
  calendarOpen:  false,
  calPopYear:    null,  // month being browsed in the popover (initialised on open)
  calPopMonth:   null,

  // Cached data (keyed by date string or 'current')
  seatsCache:    {},    // { [dateKey]: [...seats] }
  bookingsCache: null,  // array from /bookings/mine
  absencesCache: {},    // { [weekStart]: [...absences] }
};

// ── HELPERS ──────────────────────────────────────────────────
function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function fmtDate(d) {
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }
function getWeekDays(d) {
  const days = []; const copy = new Date(d);
  // Find Monday of the week containing d
  const dow = copy.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  copy.setDate(copy.getDate() + diff);
  for (let i = 0; i < 5; i++) { days.push(new Date(copy)); copy.setDate(copy.getDate()+1); }
  return days;
}
// function getWeekDays(d){A
//   const days = [];
//   const copy = new Date(d);
//   const dow = copy.getDay();
//   const diff = dow === 0 ? -6 : 1 - dow;   // Monday-based week
//   copy.setDate(copy.getDate() + diff);
//   for(let i = 0; i < 5; i++){
//     days.push(new Date(copy));
//     copy.setDate(copy.getDate() + 1);
//   }
//   return days;
// }
function weekStart(d) {
  const copy = new Date(d);
  const dow = copy.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  copy.setDate(copy.getDate() + diff);
  return dateKey(copy);
}
function el(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── TOKEN / SESSION ──────────────────────────────────────────
function saveToken(token) { localStorage.setItem('df_token', token); }
function clearToken()     { localStorage.removeItem('df_token'); }

// ── TOAST ────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const area = el('toast-area');
  const t = document.createElement('div');
  t.className = 'toast';
  const icons = { success:'✓', error:'✕', warn:'⚠' };
  const colors = { success:'var(--green)', error:'var(--red)', warn:'var(--amber)' };
  t.innerHTML = `<span style="color:${colors[type]||colors.success}">${icons[type]||icons.success}</span>${esc(msg)}`;
  area.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ── MODAL (fixed: use window-scoped named functions, not serialised lambdas) ──
let _modalActions = {};
function showModal({ title, sub, actions }) {
  _modalActions = {};
  let btns = actions.map((a, i) => {
    _modalActions[`ma_${i}`] = a.fn;
    return `<button class="btn ${a.cls}" onclick="_modalActions.ma_${i}()">${esc(a.label)}</button>`;
  }).join('');

  el('modal-area').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-title">${title}</div>
        <div class="modal-sub">${sub}</div>
        <div class="modal-actions">${btns}</div>
      </div>
    </div>`;
}
function closeModal() { el('modal-area').innerHTML = ''; _modalActions = {}; }

// ── AUTH SCREEN ──────────────────────────────────────────────
let authMode = 'login';
let authRole = 'user';

function renderAuth() {
  if (authMode === 'login') {
    el('auth-form-area').innerHTML = `
      <div class="auth-title">Welcome back</div>
      <div class="auth-sub">Sign in to book your workspace</div>
      <div id="auth-err" class="auth-error" style="display:none"></div>
      <div class="field"><label>Email</label><input id="a-email" type="email" placeholder="you@example.com" autocomplete="email"></div>
      <div class="field"><label>Password</label>
        <div class="pw-wrap">
          <input id="a-pass" type="password" placeholder="••••••••" autocomplete="current-password">
          <button type="button" class="pw-toggle" onclick="togglePw('a-pass',this)">👁</button>
        </div>
      </div>
      <button class="auth-btn" onclick="doLogin()">Sign in →</button>
      <div class="auth-switch">No account? <span onclick="setAuthMode('signup')">Create one</span></div>
      <div class="demo-hint">Demo: vinayak@kuleuven.be / test123 &nbsp;·&nbsp; Admin: lars@kuleuven.be / test123</div>`;
  } else {
    el('auth-form-area').innerHTML = `
      <div class="auth-title">Create account</div>
      <div class="auth-sub">Join your team on DeskFlow</div>
      <div id="auth-err" class="auth-error" style="display:none"></div>
      <div class="field"><label>Full name</label><input id="a-name" type="text" placeholder="Your name" autocomplete="name"></div>
      <div class="field"><label>Email</label><input id="a-email" type="email" placeholder="you@example.com" autocomplete="email"></div>
      <div class="field"><label>Password</label>
        <div class="pw-wrap">
          <input id="a-pass" type="password" placeholder="Min. 6 characters" autocomplete="new-password">
          <button type="button" class="pw-toggle" onclick="togglePw('a-pass',this)">👁</button>
        </div>
      </div>
      <button class="auth-btn" onclick="doSignup()">Create account →</button>
      <div class="auth-switch">Already have an account? <span onclick="setAuthMode('login')">Sign in</span></div>`;
  }
  // Allow pressing Enter to submit
  el('auth-form-area').onkeydown = (e) => {
    if (e.key === 'Enter') authMode === 'login' ? doLogin() : doSignup();
  };
}

function togglePw(inputId, btn) {
  const inp = el(inputId);
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.textContent = inp.type === 'password' ? '👁' : '🔒';
}

function setAuthMode(m) { authMode = m; authRole = 'user'; renderAuth(); }
function selRole(r, el) {
  authRole = r;
  document.querySelectorAll('.role-opt').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
}
function showAuthErr(msg) {
  const e = el('auth-err');
  e.textContent = msg;
  e.style.display = 'block';
}

async function doLogin() {
  const email = el('a-email').value.trim();
  const pass  = el('a-pass').value;
  if (!email || !pass) { showAuthErr('Please enter email and password'); return; }
  const btn = document.querySelector('.auth-btn');
  btn.textContent = 'Signing in…'; btn.disabled = true;
  try {
    const { token, user } = await api.login(email, pass);
    saveToken(token);
    loginSuccess(user);
  } catch (err) {
    showAuthErr(err.message);
    btn.textContent = 'Sign in →'; btn.disabled = false;
  }
}

async function doSignup() {
  const name  = el('a-name').value.trim();
  const email = el('a-email').value.trim();
  const pass  = el('a-pass').value;
  if (!name || !email || !pass) { showAuthErr('Please fill all fields'); return; }
  if (pass.length < 6) { showAuthErr('Password must be at least 6 characters'); return; }
  const btn = document.querySelector('.auth-btn');
  btn.textContent = 'Creating…'; btn.disabled = true;
  try {
    const { token, user } = await api.register(name, email, pass, 'user');
    saveToken(token);
    loginSuccess(user);
  } catch (err) {
    showAuthErr(err.message);
    btn.textContent = 'Create account →'; btn.disabled = false;
  }
}

function loginSuccess(user) {
  state.currentUser = user;
  el('auth-screen').style.display = 'none';
  el('app').style.display = 'flex';
  el('sidebar-avatar').textContent = user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  el('sidebar-name').textContent = user.name;
  el('sidebar-role').textContent = user.role === 'admin' ? 'Administrator' : 'Employee';
  if (user.role === 'admin') el('admin-nav').style.display = 'block';
  setView('map');
}

function logout() {
  clearToken();
  state.currentUser = null;
  state.seatsCache  = {};
  state.bookingsCache = null;
  state.absencesCache = {};
  el('app').style.display = 'none';
  el('admin-nav').style.display = 'none';
  el('auth-screen').style.display = 'flex';
  authMode = 'login';
  renderAuth();
}

// ── NAVIGATION ────────────────────────────────────────────────
function setView(v) {
  state.view = v;
  document.querySelectorAll('.nav-item').forEach(e => e.classList.toggle('active', e.dataset.view === v));
  const titles = { map:'Floor Map', absence:'My Absences', bookings:'My Bookings', admin:'Admin Dashboard' };
  el('topbar-title').textContent = titles[v] || v;
  const showDateNav = v === 'map' || v === 'absence';
  el('date-nav').style.display = showDateNav ? 'flex' : 'none';
  renderView();
}

// ── DATE NAV ─────────────────────────────────────────────────
function changeDay(delta) {
  const d = new Date(state.selectedDate);
  d.setDate(d.getDate() + delta);
  // Skip weekends
  while (isWeekend(d)) d.setDate(d.getDate() + (delta >= 0 ? 1 : -1));
  state.selectedDate = d;
  state.seatsCache = {};   // invalidate cache on date change
  renderView();
}

// ── CALENDAR POPOVER (BUG 1 FIX: month navigation now updates calPopYear/Month) ──
function openCalendar() {
  state.calendarOpen = true;
  // Initialise to the currently selected date's month
  state.calPopYear  = state.selectedDate.getFullYear();
  state.calPopMonth = state.selectedDate.getMonth();
  renderCalendarPopover();
  el('calendar-popover').classList.add('open');
}
function closeCalendar() {
  state.calendarOpen = false;
  el('calendar-popover').classList.remove('open');
}
function toggleCalendar() {
  state.calendarOpen ? closeCalendar() : openCalendar();
}

// BUG 1 FIX: month navigation now modifies state.calPopYear / calPopMonth
// and calls renderCalendarPopover() to re-draw — it no longer touches selectedDate.
function calPrevMonth() {
  if (state.calPopMonth === 0) { state.calPopYear--; state.calPopMonth = 11; }
  else state.calPopMonth--;
  renderCalendarPopover();
}
function calNextMonth() {
  if (state.calPopMonth === 11) { state.calPopYear++; state.calPopMonth = 0; }
  else state.calPopMonth++;
  renderCalendarPopover();
}

function renderCalendarPopover() {
  const pop = el('calendar-popover');
  if (!pop) return;
  const year = state.calPopYear, month = state.calPopMonth;
  const MONTHS = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const DAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];
  const selDk = dateKey(state.selectedDate);
  const todayDk = dateKey(new Date());

  // First day of month (0=Sun…6=Sat), converted to Mon-start index
  const firstDow = new Date(year, month, 1).getDay();
  const startOffset = (firstDow === 0) ? 6 : firstDow - 1;
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();

  let cells = '';
  // Leading days from previous month
  for (let i = startOffset - 1; i >= 0; i--) {
    cells += `<div class="calendar-day muted disabled">${daysInPrev - i}</div>`;
  }
  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dt  = new Date(year, month, d);
    const dk  = dateKey(dt);
    const wkd = dt.getDay();
    const isSat = wkd === 6, isSun = wkd === 0;
    const isSel = dk === selDk;
    const isToday = dk === todayDk;
    const today = new Date();
    today.setHours(0,0,0,0);

    const isPast = dt < today;
    const cls = [
      'calendar-day',
      isSat || isSun || isPast ? 'weekend disabled' : '',
      isSel ? 'selected' : '',
      isToday ? 'today' : ''
    ].filter(Boolean).join(' ');
    const onclick = (isSat || isSun) ? '' : `onclick="selectCalDay(${year},${month},${d})"`;
    cells += `<div class="${cls}" ${onclick}>${d}</div>`;
  }
  // Trailing days to fill last row
  const total = startOffset + daysInMonth;
  const trailing = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= trailing; d++) {
    cells += `<div class="calendar-day muted disabled">${d}</div>`;
  }

  pop.innerHTML = `
    <div class="calendar-head">
      <button class="calendar-month-btn" onclick="calPrevMonth()">‹</button>
      <span class="calendar-month-label">${MONTHS[month]} ${year}</span>
      <button class="calendar-month-btn" onclick="calNextMonth()">›</button>
    </div>
    <div class="calendar-weekdays">${DAYS.map(d=>`<div class="calendar-weekday">${d}</div>`).join('')}</div>
    <div class="calendar-grid">${cells}</div>
    <div class="calendar-foot">
      <button class="btn btn-ghost" onclick="selectCalToday()">Today</button>
      <button class="btn btn-primary" onclick="closeCalendar()">Done</button>
    </div>`;
}

function selectCalDay(year, month, day) {
  const d = new Date(year, month, day);
  if (isWeekend(d)) return;
  state.selectedDate = d;
  state.seatsCache   = {};
  closeCalendar();
  renderView();
}
function selectCalToday() {
  const d = new Date();
  if (isWeekend(d)) { d.setDate(d.getDate() + (d.getDay() === 6 ? 2 : 1)); }
  selectCalDay(d.getFullYear(), d.getMonth(), d.getDate());
}

document.addEventListener('click', e => {
  const nav = el('date-nav');
  if (!nav) return;
  if (state.calendarOpen && !nav.contains(e.target)) closeCalendar();
});

// ── RENDER DISPATCHER ─────────────────────────────────────────
function renderView() {
  const lbl = el('date-label');
  if (lbl) lbl.textContent = fmtDate(state.selectedDate);

  const c = el('main-content');
  c.innerHTML = `<div class="loading-spinner"><div class="spinner"></div></div>`;

  if      (state.view === 'map')      renderMap();
  else if (state.view === 'absence')  renderAbsence();
  else if (state.view === 'bookings') renderBookings();
  else if (state.view === 'admin')    renderAdmin();
}

// ── FLOOR MAP ─────────────────────────────────────────────────
async function renderMap() {
  const dk = dateKey(state.selectedDate);
  try {
    const seats = await loadSeats(dk);
    const u = state.currentUser;

    const seatsByType = (type) => seats.filter(s => s.type === type);
    const mkSeat = (s) => {
      const cls  = getSeatClass(s, u);
      const icon = getSeatIcon(cls);
      return `<div class="seat ${cls}"
        onmouseenter="showTooltipForSeat(event,'${esc(s.id)}','${dk}')"
        onmouseleave="hideTooltip()"
        onclick="onSeatClick('${esc(s.id)}','${dk}')">
        <div class="seat-icon">${icon}</div>
        <div class="seat-id">${esc(s.id)}</div>
      </div>`;
    };

    const flexiHTML = seatsByType('flexi').map(mkSeat).join('');
    const stdHTML   = seatsByType('std').map(mkSeat).join('');
    const empty     = Math.max(0, 16 - seatsByType('std').length);
    const emptyHTML = `<div class="seat empty"></div>`.repeat(empty);

    el('main-content').innerHTML = `
      <div class="map-container">
        <div class="map-header">
          <div class="map-header-title">Floor Plan — ${fmtDate(state.selectedDate)}</div>
          <div class="map-legend">
            <div class="legend-item"><div class="legend-dot" style="background:var(--blue)"></div>Flexi (free)</div>
            <div class="legend-item"><div class="legend-dot" style="background:var(--accent)"></div>Standard (yours)</div>
            <div class="legend-item"><div class="legend-dot" style="background:var(--green)"></div>Standard (bookable)</div>
            <div class="legend-item"><div class="legend-dot" style="background:var(--text3)"></div>Occupied</div>
          </div>
        </div>
        <div class="floor-grid">
          <div class="area-label" style="grid-column:span 8">FLEXI ZONE <div class="area-divider"></div></div>
          ${flexiHTML}
          <div style="grid-column:span 8;height:8px"></div>
          <div class="area-label" style="grid-column:span 8">STANDARD DESKS <div class="area-divider"></div></div>
          ${stdHTML}${emptyHTML}
        </div>
        <img src="Toren2.png" alt="Office Floor Plan" style="width:100%;max-width:700px;margin-top:24px;border-radius:10px;border:1px solid var(--border);display:block;" />
      </div>`;
  } catch (err) {
    showErrorState(err.message);
  }
}

async function loadSeats(dk) {
  if (state.seatsCache[dk]) return state.seatsCache[dk];
  const seats = await api.getSeats(dk);
  state.seatsCache[dk] = seats;
  return seats;
}

function getSeatClass(s, u) {
  const isMyBooking    = s.booked_by_id === u.id;
  const isOtherBooking = s.booked_by_id && s.booked_by_id !== u.id;
  if (s.type === 'flexi') {
    if (isMyBooking)    return 'flexi-mine';
    if (isOtherBooking) return 'flexi-booked';
    return 'flexi-free';
  }
  if (!s.owner_id) return 'std-occupied';
  if (s.owner_id === u.id) {
    return isOtherBooking ? 'std-mine-booked' : 'std-owner';
  }
  const isAbsent = s.absent_periods && s.absent_periods.length > 0;
  if (isAbsent && !s.booked_by_id) return 'std-free';
  return 'std-occupied';
}

function getSeatIcon(cls) {
  return { 'flexi-free':'🪑','flexi-mine':'✅','flexi-booked':'🚫',
           'std-owner':'👤','std-free':'🟢','std-occupied':'🔒','std-mine-booked':'📌' }[cls] || '🪑';
}

// ── TOOLTIP ───────────────────────────────────────────────────
let _tooltipSeats = {};    // cache from last loadSeats for tooltip use

async function showTooltipForSeat(e, seatId, dk) {
  if (_hideTooltipTimer) { clearTimeout(_hideTooltipTimer); _hideTooltipTimer = null; }
  const seats = await loadSeats(dk);
  const s     = seats.find(x => x.id === seatId);
  const u     = state.currentUser;
  if (!s) return;

  const tt = el('tooltip');
  let html = `<div class="tooltip-title">${esc(s.id)} — ${s.type==='flexi'?'Flexi Desk':'Standard Desk'}</div>`;

  if (s.type === 'flexi') {
    const myBooked = s.booked_by_id === u.id;
    html += `<div class="tooltip-row"><span class="tooltip-label">Status</span>
             <span class="tooltip-val ${s.booked_by_id?'t-red':'t-blue'}">${s.booked_by_id?'Booked':'Available'}</span></div>`;
    if (s.booked_by_id) html += `<div class="tooltip-row"><span class="tooltip-label">By</span>
      <span class="tooltip-val">${myBooked?'You':esc(s.booked_by_name)}</span></div>`;
    html += `<div style="margin-top:8px;font-size:11px;color:var(--text3)">${myBooked?'Click to cancel':'Click to book'}</div>`;
  } else {
    const amAbs = s.absent_periods?.includes('AM');
    const pmAbs = s.absent_periods?.includes('PM');
    html += `<div class="tooltip-row"><span class="tooltip-label">Assigned to</span>
             <span class="tooltip-val">${s.owner_id ? esc(s.owner_name) : 'Unassigned'}</span></div>`;
    if (s.owner_id === u.id) {
      html += `<div style="margin-top:8px;font-size:11px;color:var(--text3)">Your seat. Mark absent to release.</div>`;
    } else if (s.owner_id) {
      html += `<div class="tooltip-row"><span class="tooltip-label">AM</span><span class="tooltip-val ${amAbs?'t-green':'t-red'}">${amAbs?'Free':'In office'}</span></div>`;
      html += `<div class="tooltip-row"><span class="tooltip-label">PM</span><span class="tooltip-val ${pmAbs?'t-green':'t-red'}">${pmAbs?'Free':'In office'}</span></div>`;
      if (s.booked_by_id && s.booked_by_id !== u.id) html += `<div class="tooltip-row"><span class="tooltip-label">Booked by</span><span class="tooltip-val">${esc(s.booked_by_name)}</span></div>`;
      const canBook = amAbs || pmAbs;
      html += `<div style="margin-top:8px;font-size:11px;color:var(--text3)">${canBook&&!s.booked_by_id?'Click to book':'Not available today'}</div>`;
    }
  }

  tt.innerHTML = html;
  tt.style.display = 'block';
  tt.style.opacity = '1';
  let x = e.clientX+14, y = e.clientY+14;
  if (x + 210 > window.innerWidth)  x = e.clientX - 210;
  if (y + 180 > window.innerHeight) y = e.clientY - 180;
  tt.style.left = x + 'px'; tt.style.top = y + 'px';
}

let _hideTooltipTimer = null;

function hideTooltip() {
  _hideTooltipTimer = setTimeout(() => {
    const tt = el('tooltip');
    tt.style.opacity = '0';
    setTimeout(() => { tt.style.display = 'none'; }, 100);
  }, 120);
}

// ── SEAT CLICK (BUG 2 FIX) ───────────────────────────────────
// The old showModal serialised arrow functions via .toString() which breaks
// closures. Now we use _modalActions registry (set in showModal above) so
// the actual closure executes correctly.
async function onSeatClick(seatId, dk) {
  const today = new Date();
  today.setHours(0,0,0,0);

  const selected = new Date(dk);
  selected.setHours(0,0,0,0);

  if (selected < today) {
    showToast("You can't book past dates", "warn");
    return;
  }
  const seats = await loadSeats(dk);
  const s     = seats.find(x => x.id === seatId);
  const u     = state.currentUser;
  if (!s) return;

  if (s.type === 'flexi') {
    const myBooked    = s.booked_by_id === u.id;
    const otherBooked = s.booked_by_id && !myBooked;
    if (otherBooked) { showToast('This desk is already booked', 'warn'); return; }

    if (myBooked) {
      showModal({
        title: 'Cancel booking?',
        sub:   `Release flexi desk <b>${esc(s.id)}</b> for ${fmtDate(state.selectedDate)}?`,
        actions: [
          { label:'Cancel booking', cls:'btn-danger', fn: async () => {
              closeModal();
              try {
                await api.cancelBooking(s.booking_id);
                delete state.seatsCache[dk];
                showToast('Booking cancelled');
                renderView();
              } catch(e){ showToast(e.message,'error'); }
          }},
          { label:'Keep it', cls:'btn-ghost', fn: closeModal }
        ]
      });
    } else {
      try {
        await api.createBooking(s.id, dk);
        delete state.seatsCache[dk];
        showToast(`✅ Desk ${s.id} booked for ${fmtDate(state.selectedDate)}`);
        renderView();
      } catch(e) { showToast(e.message, 'error'); }
    }

  } else {
    if (!s.owner_id) return;
    if (s.owner_id === u.id) {
      showToast('This is your assigned seat. Mark absence in "My Absences" to free it.', 'warn');
      return;
    }
    const canBook = s.absent_periods && s.absent_periods.length > 0;
    if (!canBook) return;

    if (s.booked_by_id === u.id) {
      showModal({
        title: 'Cancel booking?',
        sub:   `Release <b>${esc(s.owner_name)}'s</b> desk (${esc(s.id)}) on ${fmtDate(state.selectedDate)}?`,
        actions: [
          { label:'Cancel booking', cls:'btn-danger', fn: async () => {
              closeModal();
              try {
                await api.cancelBooking(s.booking_id);
                delete state.seatsCache[dk];
                showToast('Booking cancelled');
                renderView();
              } catch(e){ showToast(e.message,'error'); }
          }},
          { label:'Keep it', cls:'btn-ghost', fn: closeModal }
        ]
      });
    } else if (!s.booked_by_id) {
      const periods = [...(s.absent_periods||[])].sort().map(p => p==='AM'?'Morning':'Afternoon');
      showModal({
        title: `Book desk ${s.id}?`,
        sub:   `<b>${esc(s.owner_name)}</b> is away on ${fmtDate(state.selectedDate)} (${periods.join(' & ')}). Book their standard desk?`,
        actions: [
          { label:'Book this desk', cls:'btn-green', fn: async () => {
              closeModal();
              try {
                await api.createBooking(s.id, dk);
                delete state.seatsCache[dk];
                showToast(`✅ Desk ${s.id} booked!`);
                renderView();
              } catch(e){ showToast(e.message,'error'); }
          }},
          { label:'Cancel', cls:'btn-ghost', fn: closeModal }
        ]
      });
    }
  }
}

// ── ABSENCES ──────────────────────────────────────────────────
async function renderAbsence() {
  const today = new Date();
  const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0);

  // Remaining days this week + all of next week
  const thisWeek = getWeekDays(today);
  const nextMonday = new Date(todayMidnight);
  const dow = nextMonday.getDay() || 7;
  nextMonday.setDate(nextMonday.getDate() + (8 - dow));
  const nextWeek = getWeekDays(nextMonday);
  const allDays = [...thisWeek.filter(d => d >= todayMidnight), ...nextWeek];

  const ws1 = weekStart(today);
  const ws2 = weekStart(nextMonday);
  try {
    for (const ws of [ws1, ws2]) {
      if (!state.absencesCache[ws]) {
        state.absencesCache[ws] = await api.getAbsences(ws);
      }
    }
    const absMap = {};
    [...(state.absencesCache[ws1]||[]), ...(state.absencesCache[ws2]||[])].forEach(a => {
      const dk = dateKey(new Date(a.date));
      if (!absMap[dk]) absMap[dk] = {};
      absMap[dk][a.period] = true;
    });

    const u = state.currentUser;
    let html = `<div class="week-grid">`;
    allDays.forEach(day => {
      const dk      = dateKey(day);
      const isToday = dateKey(today) === dk;
      const abs     = absMap[dk] || {};
      html += `<div class="day-card ${isToday?'today':''}">
        <div class="day-name">${['Mon','Tue','Wed','Thu','Fri'][day.getDay()-1]}</div>
        <div class="day-num">${day.getDate()}</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:10px">${day.toLocaleDateString('en',{month:'short'})}</div>
        <div class="time-blocks">
          ${timeBl('AM', !!abs['AM'], dk)}
          ${timeBl('PM', !!abs['PM'], dk)}
        </div>
      </div>`;
    });
    html += `</div>
      <div class="info-banner">
        <b style="color:var(--text)">How it works:</b> Mark AM/PM absence to release your standard desk
        (${esc(u.seat||'none assigned')}) for others to book. Your desk stays locked when you're in office.
      </div>`;
    el('main-content').innerHTML = html;
  } catch(err) { showErrorState(err.message); }
}

function timeBl(period, absent, dk) {
  return `<div class="time-block ${absent?'absent':''}" onclick="toggleAbsence('${dk}','${period}',this)">
    <span class="time-label">${period==='AM'?'09:00–13:00':'13:00–18:00'}</span>
    <span class="time-status">
      <span class="status-dot" style="background:${absent?'var(--red)':'var(--green)'}"></span>
      ${absent?'Absent':'In office'}
    </span>
  </div>`;
}

// async function toggleAbsence(dk, period) {
//   const ws = weekStart(new Date(dk));
//   let abs  = state.absencesCache[ws];
//   const absMap = {};
//   (abs||[]).forEach(a => { if (!absMap[a.date]) absMap[a.date]={}; absMap[a.date][a.period]=true; });
//   const isAbsent = absMap[dk] && absMap[dk][period];

//   try {
//     if (isAbsent) {
//       await api.removeAbsence(dk, period);
//       showToast(`✅ Marked in office — ${period} on ${dk}`);
//     } else {
//       await api.markAbsent(dk, period);
//       showToast(`🏠 Marked absent — ${period} on ${dk}`);
//     }
//     delete state.absencesCache[ws];
//     delete state.seatsCache[dk];
//     renderView();
//   } catch(e) { showToast(e.message, 'error'); }
// }

async function toggleAbsence(dk, period, blockEl) {
  const isAbsent = !!(blockEl && blockEl.classList.contains('absent'));
  const ws = weekStart(new Date(dk));

  try {
    if (isAbsent) {
      await api.removeAbsence(dk, period);
      showToast(`✅ Marked in office — ${period} on ${dk}`);
    } else {
      await api.markAbsent(dk, period);
      showToast(`🏠 Marked absent — ${period} on ${dk}`);
    }

    delete state.absencesCache[ws];
    delete state.seatsCache[dk];
    await renderAbsence();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
// ── MY BOOKINGS ───────────────────────────────────────────────
async function renderBookings() {
  try {
    const bookings = await api.myBookings();
    state.bookingsCache = bookings;

    if (!bookings.length) {
      el('main-content').innerHTML = `<div class="empty-state">
        <div style="font-size:40px;margin-bottom:12px">🗓️</div>
        <div style="font-size:15px;font-weight:500">No bookings yet</div>
        <div style="font-size:13px;margin-top:6px;color:var(--text2)">Go to the Floor Map and book a desk</div>
      </div>`; return;
    }

    let html = `<div class="bookings-list">`;
    bookings.forEach(b => {
      const d      = new Date(b.date);
      const isFlex = b.seat_type === 'flexi';
      html += `<div class="booking-card">
        <div class="booking-info">
          <div class="booking-icon">${isFlex?'🪑':'🖥️'}</div>
          <div class="booking-detail">
            <div class="booking-seat">Desk ${esc(b.seat_id)} <span class="badge ${isFlex?'badge-flexi':'badge-std'}">${isFlex?'Flexi':'Standard'}</span></div>
            <div class="booking-meta">${fmtDate(d)} · ${esc(b.zone)}</div>
          </div>
        </div>
        <button class="btn btn-ghost" style="font-size:12px;padding:7px 14px"
          onclick="cancelMyBooking('${esc(b.id)}')">Cancel</button>
      </div>`;
    });
    html += `</div>`;
    el('main-content').innerHTML = html;
  } catch(err) { showErrorState(err.message); }
}

async function cancelMyBooking(bookingId) {
  showModal({
    title: 'Cancel booking?',
    sub:   'Are you sure you want to cancel this booking?',
    actions: [
      { label:'Yes, cancel', cls:'btn-danger', fn: async () => {
          closeModal();
          try {
            await api.cancelBooking(bookingId);
            state.seatsCache = {};
            showToast('Booking cancelled');
            renderView();
          } catch(e){ showToast(e.message,'error'); }
      }},
      { label:'Keep it', cls:'btn-ghost', fn: closeModal }
    ]
  });
}

// ── ADMIN ─────────────────────────────────────────────────────
async function renderAdmin() {
  const dk = dateKey(state.selectedDate);
  try {
    const [stats, users] = await Promise.all([api.adminStats(dk), api.adminUsers()]);

    const occupancyPct = users.length
      ? Math.round((users.length - stats.absentsToday) / users.length * 100) : 0;

    let html = `
      <div class="admin-stats">
        <div class="stat-card"><div class="stat-label">Total Desks</div><div class="stat-val">${stats.totalSeats}</div><div class="stat-sub">${stats.flexiSeats} flexi, ${stats.stdSeats} standard</div></div>
        <div class="stat-card"><div class="stat-label">Users</div><div class="stat-val">${stats.totalUsers}</div></div>
        <div class="stat-card"><div class="stat-label">Bookings Today</div><div class="stat-val">${stats.bookingsToday}</div><div class="stat-sub">${fmtDate(state.selectedDate)}</div></div>
        <div class="stat-card"><div class="stat-label">In Office</div><div class="stat-val">${occupancyPct}%</div><div class="stat-sub">${stats.absentsToday} absent today</div></div>
      </div>
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r2);overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);font-size:14px;font-weight:600">Team Members</div>
        <table class="users-table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Desk</th></tr></thead>
          <tbody>`;
    users.forEach(u => {
      html += `<tr>
        <td style="font-weight:500">${esc(u.name)}</td>
        <td style="color:var(--text2);font-size:12px">${esc(u.email)}</td>
        <td><span class="badge ${u.role==='admin'?'badge-std':'badge-flexi'}">${esc(u.role)}</span></td>
        <td style="font-family:monospace;font-size:12px">${u.seat_id||'—'}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    el('main-content').innerHTML = html;
  } catch(err) { showErrorState(err.message); }
}

// ── CHANGE PASSWORD MODAL ─────────────────────────────────────
function showChangePassword() {
  el('modal-area').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-title">Change Password</div>
        <div class="field" style="margin-top:16px"><label>Current password</label><input id="cp-cur" type="password" placeholder="••••••••"></div>
        <div class="field"><label>New password</label><input id="cp-new" type="password" placeholder="Min. 6 characters"></div>
        <div class="field"><label>Confirm new password</label><input id="cp-con" type="password" placeholder="••••••••"></div>
        <div id="cp-err" class="auth-error" style="display:none;margin-top:8px"></div>
        <div class="modal-actions">
          <button class="btn btn-primary" onclick="submitChangePassword()">Update</button>
          <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        </div>
      </div>
    </div>`;
}
async function submitChangePassword() {
  const cur = el('cp-cur').value, nw = el('cp-new').value, con = el('cp-con').value;
  const err = el('cp-err');
  if (!cur || !nw) { err.textContent='Fill all fields'; err.style.display='block'; return; }
  if (nw !== con)  { err.textContent='New passwords do not match'; err.style.display='block'; return; }
  if (nw.length < 6){ err.textContent='Password must be at least 6 characters'; err.style.display='block'; return; }
  try {
    await api.changePassword(cur, nw);
    closeModal();
    showToast('Password updated successfully');
  } catch(e){ err.textContent=e.message; err.style.display='block'; }
}

// ── HELPERS ───────────────────────────────────────────────────
function showErrorState(msg) {
  el('main-content').innerHTML = `<div class="empty-state">
    <div style="font-size:36px;margin-bottom:10px">⚠️</div>
    <div style="font-size:14px;font-weight:500">Failed to load</div>
    <div style="font-size:12px;color:var(--text2);margin-top:6px">${esc(msg)}</div>
    <button class="btn btn-ghost" style="margin-top:16px" onclick="renderView()">Retry</button>
  </div>`;
}

// ── AUTO-LOGIN (if token in localStorage) ────────────────────
async function init() {
  const token = localStorage.getItem('df_token');
  if (token) {
    try {
      const user = await api.me();
      loginSuccess(user);
    } catch(e) {
      clearToken();
      renderAuth();
    }
  } else {
    renderAuth();
  }
}

init();
