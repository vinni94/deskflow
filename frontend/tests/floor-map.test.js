const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createApp(seats, bookings = []) {
  const elements = {};
  const context = vm.createContext({
    window: {},
    document: {
      addEventListener() {},
      getElementById(id) { return elements[id] ||= { innerHTML: '' }; },
    },
    localStorage: { getItem() { return null; } },
    api: {
      async getSeats() { return seats; },
      async myBookings() { return bookings; },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8'), context);
  vm.runInContext("state.currentUser = { id: 'user' }", context);
  return { context, elements };
}

test('legacy API seats still show in the map and booking history', async () => {
  const { context, elements } = createApp([
    { id: 'F1', type: 'flexi' },
    { id: 'S1', type: 'std' },
  ], [{ id: 'b1', seat_id: 'F1', seat_type: 'flexi', date: '2099-01-05', period: 'full', zone: 'Flexi Zone' }]);
  await vm.runInContext('renderMap()', context);
  assert.match(elements['main-content'].innerHTML, /class="seat-id">F1/);
  assert.match(elements['main-content'].innerHTML, /class="seat-id">S1/);
  assert.match(elements['main-content'].innerHTML, /data-seat-id="F1"/);
  assert.match(elements['main-content'].innerHTML, /data-seat-id="S1"/);
  await vm.runInContext('renderBookingHistory()', context);
  assert.match(elements['main-content'].innerHTML, /data-seat-id="S1"/);
  await vm.runInContext('renderBookings()', context);
  assert.doesNotMatch(elements['main-content'].innerHTML, /has been retired/);
});

test('retired seats are hidden from the map and flagged in bookings', async () => {
  const { context, elements } = createApp([
    { id: 'F1', type: 'flexi', active: true },
    { id: 'S1', type: 'std', active: false },
  ], [{ id: 'b1', seat_id: 'S1', seat_type: 'std', seat_active: false, date: '2099-01-05', period: 'AM', zone: 'Alpha Wing' }]);
  await vm.runInContext('renderMap()', context);
  assert.match(elements['main-content'].innerHTML, /data-seat-id="F1"/);
  assert.doesNotMatch(elements['main-content'].innerHTML, /class="seat-id">S1|data-seat-id="S1"/);
  await vm.runInContext('renderBookingHistory()', context);
  assert.doesNotMatch(elements['main-content'].innerHTML, /data-seat-id="S1"/);
  await vm.runInContext('renderBookings()', context);
  assert.match(elements['main-content'].innerHTML, /has been retired/);
});
