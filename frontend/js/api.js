// api.js — centralised fetch wrapper with JWT injection

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? `http://${window.location.hostname}:3001/api`
  : '/api';   // same-origin in production

function getToken() {
  return localStorage.getItem('df_token');
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const api = {
  // Auth
  login:          (email, password)           => apiFetch('/auth/login',           { method:'POST', body:{email,password} }),
  register:       (name, email, password, role) => apiFetch('/auth/register',      { method:'POST', body:{name,email,password,role} }),
  me:             ()                           => apiFetch('/auth/me'),
  changePassword: (currentPassword, newPassword) => apiFetch('/auth/change-password',{ method:'POST', body:{currentPassword,newPassword} }),

  // Seats
  getSeats:       (date)                       => apiFetch(`/seats?date=${date}`),

  // Bookings
  createBooking:  (seatId, date, period)        => apiFetch('/bookings',         { method:'POST', body:{seatId,date,period} }),
  cancelBooking:  (bookingId)                  => apiFetch(`/bookings/${bookingId}`,{ method:'DELETE' }),
  myBookings:     ()                           => apiFetch('/bookings/mine'),

  // Absences
  getAbsences:    (weekStart)                  => apiFetch(`/absences?weekStart=${weekStart}`),
  markAbsent:     (date, period)               => apiFetch('/absences',            { method:'POST',   body:{date,period} }),
  removeAbsence: (date, period)                => apiFetch('/absences',                    { method: 'DELETE', body: { date, period } }),

  // Admin
  adminUsers:     ()                           => apiFetch('/admin/users'),
  adminStats:     (date)                       => apiFetch(`/admin/stats?date=${date}`),
};

window.api = api;
