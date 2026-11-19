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

test('new flexi desks have hotspots at their updated positions', async () => {
  const { context, elements } = createApp([
    { id: 'F2', type: 'flexi', active: true },
    { id: 'F3', type: 'flexi', active: true },
    { id: 'F4', type: 'flexi', active: true },
    { id: 'S24', type: 'std', active: false },
  ]);
  await vm.runInContext('renderMap()', context);
  const html = elements['main-content'].innerHTML;
  assert.match(html, /data-seat-id="F2" style="[^"]*left:74\.3%;top:50\.3%;width:4\.4%;height:6\.1%/);
  assert.match(html, /data-seat-id="F3" style="[^"]*left:62\.1%;top:87\.6%;width:9\.5%;height:2\.8%/);
  assert.match(html, /data-seat-id="F4" style="[^"]*left:23\.7%;top:32\.1%;width:4\.4%;height:6\.1%/);
  assert.doesNotMatch(html, /class="seat-id">S24|data-seat-id="S24"/);
});
