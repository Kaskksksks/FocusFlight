import { Airport, FocusFlight, UserStats } from './api/entities.js';
import { calculateDistance, distanceToMinutes, formatTime, minutesToLabel, getFlightClass } from './utils/distance.js';
import { BADGES, checkNewBadges } from './utils/badges.js';

// ─── Global State ────────────────────────────────────────────────────────────
let state = {
  page: 'home',
  airports: [],
  userStats: null,
  flights: [],
  booking: { origin: null, destination: null, seatClass: 'Study', tags: [], customMinutes: null },
  activeFlight: null,
  timerInterval: null,
  timerSeconds: 0,
  newBadges: [],
};

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await loadData();
  render();
}

async function loadData() {
  try {
    const [airports, flights, statsArr] = await Promise.all([
      Airport.list(),
      FocusFlight.list(),
      UserStats.list(),
    ]);
    state.airports = airports;
    state.flights = flights;
    state.userStats = statsArr[0] || null;
    // Check for active in-flight session
    const active = flights.find(f => f.status === 'in_flight');
    if (active) {
      state.activeFlight = active;
      const elapsed = Math.floor((Date.now() - new Date(active.started_at)) / 1000);
      const total = active.duration_minutes * 60;
      state.timerSeconds = Math.max(0, total - elapsed);
      if (state.timerSeconds > 0) {
        startTimer();
        state.page = 'timer';
      }
    }
  } catch (e) {
    console.error('Load error', e);
  }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
window.navigate = function(page) {
  if (state.activeFlight && state.activeFlight.status === 'in_flight' && page !== 'timer') {
    if (!confirm('⚠️ Your flight is still active. Navigating away will NOT abort it — it continues in the background. Continue?')) return;
  }
  state.page = page;
  render();
};

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const navEl = document.getElementById(`nav-${state.page}`);
  if (navEl) navEl.classList.add('active');
  app.innerHTML = getPage(state.page);
  attachListeners();
}

function getPage(page) {
  switch(page) {
    case 'home': return renderHome();
    case 'book': return renderBook();
    case 'checkin': return renderCheckin();
    case 'timer': return renderTimer();
    case 'landing': return renderLanding();
    case 'logbook': return renderLogbook();
    case 'stats': return renderStats();
    case 'badges': return renderBadges();
    default: return renderHome();
  }
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
function renderHome() {
  const stats = state.userStats;
  const recentFlights = [...state.flights].filter(f => f.status === 'landed').sort((a,b) => new Date(b.landed_at) - new Date(a.landed_at)).slice(0, 3);
  const homeAirport = stats?.home_airport_name || 'No home airport set';
  const homeIATA = stats?.home_airport_iata || '???';
  const greeting = getGreeting();

  return `
  <div class="animate-fadeIn p-6 flex flex-col gap-6">
    <!-- Header -->
    <div class="flex items-center justify-between pt-4">
      <div>
        <p class="text-blue-300 text-sm font-medium">${greeting}</p>
        <h1 class="font-display text-2xl font-bold text-white">FocusFlight</h1>
      </div>
      <div class="text-right">
        <div class="text-xs text-blue-300">Home Base</div>
        <div class="font-display font-bold text-white">${homeIATA}</div>
      </div>
    </div>

    <!-- Active Flight Banner -->
    ${state.activeFlight ? `
    <div class="card-glass-light rounded-2xl p-4 border border-blue-400/30 cursor-pointer" onclick="navigate('timer')">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-xs text-blue-300 mb-1">✈️ FLIGHT IN PROGRESS</div>
          <div class="font-display font-bold">${state.activeFlight.origin_iata} → ${state.activeFlight.destination_iata}</div>
          <div class="text-sm text-blue-200">${state.activeFlight.seat_class} · ${formatTime(state.timerSeconds)} remaining</div>
        </div>
        <div class="text-3xl animate-float">✈️</div>
      </div>
    </div>` : ''}

    <!-- Miles Card -->
    <div class="card-glass rounded-2xl p-5" style="background: linear-gradient(135deg, rgba(30,64,175,0.4), rgba(59,130,246,0.2));">
      <div class="flex items-center justify-between mb-3">
        <span class="text-blue-300 text-sm font-medium">Total Flight Miles</span>
        <span class="text-2xl">🌍</span>
      </div>
      <div class="font-display text-4xl font-bold text-white">${(stats?.total_miles || 0).toLocaleString()}</div>
      <div class="text-blue-300 text-sm mt-1">${stats?.total_flights || 0} flights · ${minutesToLabel(stats?.total_focus_minutes || 0)} focused</div>
      ${stats?.streak_days > 0 ? `<div class="mt-2 text-orange-300 text-sm">🔥 ${stats.streak_days}-day streak</div>` : ''}
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-2 gap-3">
      <button onclick="navigate('book')" class="card-glass-light rounded-2xl p-4 text-left hover:scale-105 transition-transform">
        <div class="text-2xl mb-2">✈️</div>
        <div class="font-semibold text-white text-sm">New Flight</div>
        <div class="text-blue-300 text-xs">Start a focus session</div>
      </button>
      <button onclick="navigate('logbook')" class="card-glass-light rounded-2xl p-4 text-left hover:scale-105 transition-transform">
        <div class="text-2xl mb-2">📒</div>
        <div class="font-semibold text-white text-sm">Logbook</div>
        <div class="text-blue-300 text-xs">${state.flights.filter(f=>f.status==='landed').length} flights logged</div>
      </button>
    </div>

    <!-- Recent Flights -->
    ${recentFlights.length > 0 ? `
    <div>
      <h2 class="font-display font-semibold text-white mb-3">Recent Flights</h2>
      <div class="flex flex-col gap-2">
        ${recentFlights.map(f => `
        <div class="card-glass rounded-xl p-3 flex items-center gap-3">
          <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background: rgba(96,165,250,0.15);">
            <span class="text-lg">${f.seat_class === 'Study' ? '📚' : f.seat_class === 'Work' ? '💼' : '🎨'}</span>
          </div>
          <div class="flex-1">
            <div class="font-semibold text-sm">${f.origin_iata} → ${f.destination_iata}</div>
            <div class="text-xs text-blue-300">${f.seat_class} · ${minutesToLabel(f.duration_minutes)}</div>
          </div>
          <div class="text-right">
            <div class="text-xs font-semibold text-yellow-400">+${f.miles_earned?.toLocaleString()} mi</div>
            <div class="text-xs text-blue-400">${formatRelativeDate(f.landed_at)}</div>
          </div>
        </div>`).join('')}
      </div>
    </div>` : `
    <div class="card-glass rounded-2xl p-8 text-center">
      <div class="text-5xl mb-3 animate-float">✈️</div>
      <h2 class="font-display font-semibold text-white mb-1">Ready for takeoff?</h2>
      <p class="text-blue-300 text-sm mb-4">Book your first focus flight and start earning miles.</p>
      <button onclick="navigate('book')" class="bg-blue-500 hover:bg-blue-400 text-white font-semibold py-3 px-6 rounded-xl transition-colors">Book a Flight</button>
    </div>`}

    ${!stats?.home_airport_iata ? `
    <div class="card-glass rounded-2xl p-4 border border-yellow-400/30">
      <div class="flex items-center gap-3">
        <span class="text-2xl">🏠</span>
        <div>
          <div class="font-semibold text-sm">Set Your Home Airport</div>
          <div class="text-blue-300 text-xs">Choose where every journey begins</div>
        </div>
        <button onclick="navigate('book')" class="ml-auto text-blue-400 text-sm font-semibold">Set →</button>
      </div>
    </div>` : ''}
  </div>`;
}

// ─── BOOK ─────────────────────────────────────────────────────────────────────
function renderBook() {
  const airports = state.airports;
  const booking = state.booking;
  const stats = state.userStats;

  const origin = booking.origin || airports.find(a => a.iata_code === stats?.home_airport_iata) || null;
  const dest = booking.destination;
  const distance = origin && dest ? calculateDistance(origin.latitude, origin.longitude, dest.latitude, dest.longitude) : null;
  const suggestedMinutes = distance ? distanceToMinutes(distance) : null;
  const flightClass = distance ? getFlightClass(distance) : null;
  const finalMinutes = booking.customMinutes || suggestedMinutes;

  const continents = [...new Set(airports.map(a => a.continent))].sort();

  return `
  <div class="animate-fadeIn p-6 flex flex-col gap-5">
    <div class="pt-4">
      <h1 class="font-display text-2xl font-bold">Book a Flight</h1>
      <p class="text-blue-300 text-sm">Choose your route and intent</p>
    </div>

    <!-- Origin -->
    <div>
      <label class="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-2 block">🛫 Departure Airport</label>
      <select id="originSelect" class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-400" style="background-color: #0f2744;">
        <option value="">Select departure airport...</option>
        ${continents.map(c => `
        <optgroup label="${c}">
          ${airports.filter(a => a.continent === c).sort((a,b) => a.city.localeCompare(b.city)).map(a =>
          `<option value="${a.iata_code}" ${origin?.iata_code === a.iata_code ? 'selected' : ''}>${a.iata_code} – ${a.city}, ${a.country}</option>`
        ).join('')}
        </optgroup>`).join('')}
      </select>
    </div>

    <!-- Destination -->
    <div>
      <label class="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-2 block">🛬 Destination Airport</label>
      <select id="destSelect" class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-400" style="background-color: #0f2744;">
        <option value="">Select destination...</option>
        ${continents.map(c => `
        <optgroup label="${c}">
          ${airports.filter(a => a.continent === c && a.iata_code !== origin?.iata_code).sort((a,b) => a.city.localeCompare(b.city)).map(a =>
          `<option value="${a.iata_code}" ${dest?.iata_code === a.iata_code ? 'selected' : ''}>${a.iata_code} – ${a.city}, ${a.country}</option>`
        ).join('')}
        </optgroup>`).join('')}
      </select>
    </div>

    <!-- Flight Info -->
    ${distance ? `
    <div class="card-glass rounded-xl p-4 animate-slideUp">
      <div class="grid grid-cols-3 gap-2 text-center">
        <div>
          <div class="text-xs text-blue-300">Distance</div>
          <div class="font-bold text-sm">${distance.toLocaleString()} mi</div>
        </div>
        <div>
          <div class="text-xs text-blue-300">Flight Type</div>
          <div class="font-bold text-sm">${flightClass}</div>
        </div>
        <div>
          <div class="text-xs text-blue-300">Focus Time</div>
          <div class="font-bold text-sm text-blue-300">${minutesToLabel(finalMinutes)}</div>
        </div>
      </div>
    </div>` : ''}

    <!-- Duration Slider -->
    ${suggestedMinutes ? `
    <div>
      <div class="flex justify-between items-center mb-2">
        <label class="text-xs font-semibold text-blue-300 uppercase tracking-wide">⏱ Focus Duration</label>
        <span class="font-display font-bold text-white text-lg" id="durationLabel">${minutesToLabel(finalMinutes)}</span>
      </div>
      <input type="range" class="range-slider" id="durationSlider"
        min="15" max="180" step="5" value="${finalMinutes}"
      />
      <div class="flex justify-between text-xs text-blue-400 mt-1">
        <span>15 min</span><span>3 hrs</span>
      </div>
    </div>` : ''}

    <!-- Seat Class -->
    <div>
      <label class="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-3 block">💺 Choose Your Seat</label>
      <div class="grid grid-cols-3 gap-2">
        ${['Study', 'Work', 'Create'].map(cls => `
        <button class="seat-btn ${booking.seatClass === cls ? 'selected' : 'card-glass'} rounded-xl p-3 text-center border border-white/10" onclick="selectSeat('${cls}')">
          <div class="text-2xl mb-1">${cls === 'Study' ? '📚' : cls === 'Work' ? '💼' : '🎨'}</div>
          <div class="font-semibold text-sm">${cls}</div>
        </button>`).join('')}
      </div>
    </div>

    <!-- Tags -->
    <div>
      <label class="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-2 block">🏷 Route Tags (optional)</label>
      <div class="flex gap-2 flex-wrap mb-2" id="tagContainer">
        ${(booking.tags || []).map(t => `<span class="bg-blue-500/30 text-blue-200 text-xs px-3 py-1 rounded-full flex items-center gap-1">${t} <button onclick="removeTag('${t}')">×</button></span>`).join('')}
      </div>
      <div class="flex gap-2">
        <input id="tagInput" type="text" placeholder="Add a tag (e.g. Math, Chapter 3...)" class="flex-1 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm placeholder-blue-400 focus:outline-none focus:border-blue-400" />
        <button onclick="addTag()" class="bg-blue-500/30 border border-blue-400/30 text-blue-300 px-4 py-2 rounded-xl text-sm">Add</button>
      </div>
    </div>

    <!-- Continue Button -->
    <button id="continueBtn" onclick="goToCheckin()"
      class="w-full py-4 rounded-2xl font-display font-bold text-lg transition-all ${origin && dest ? 'bg-blue-500 hover:bg-blue-400 text-white' : 'bg-white/10 text-white/40 cursor-not-allowed'}"
      ${!origin || !dest ? 'disabled' : ''}>
      Check In →
    </button>
  </div>`;
}

// ─── CHECK-IN ─────────────────────────────────────────────────────────────────
function renderCheckin() {
  const { origin, destination, seatClass, tags, customMinutes } = state.booking;
  const distance = calculateDistance(origin.latitude, origin.longitude, destination.latitude, destination.longitude);
  const minutes = customMinutes || distanceToMinutes(distance);
  const miles = distance;
  const flightClass = getFlightClass(distance);
  const now = new Date();
  const flightNum = `FF${Math.floor(Math.random() * 9000) + 1000}`;

  return `
  <div class="animate-fadeIn p-6 flex flex-col gap-6 items-center">
    <div class="pt-4 text-center">
      <p class="text-blue-300 text-sm">Your boarding pass</p>
      <h1 class="font-display text-2xl font-bold">Ready for Boarding</h1>
    </div>

    <!-- Boarding Pass -->
    <div class="boarding-pass w-full text-gray-800 shadow-2xl mx-4" style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);">
      <!-- Top section -->
      <div class="p-5 pb-4">
        <div class="flex items-start justify-between mb-4">
          <div>
            <div class="text-xs text-gray-500 uppercase tracking-wide">Boarding Pass</div>
            <div class="text-xs text-gray-400">FocusFlight Airlines</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-gray-500">Flight</div>
            <div class="font-display font-bold text-blue-700">${flightNum}</div>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <div class="text-center">
            <div class="font-display text-4xl font-bold text-gray-800">${origin.iata_code}</div>
            <div class="text-xs text-gray-500 mt-1">${origin.city}</div>
          </div>
          <div class="flex-1 flex flex-col items-center px-4">
            <div class="text-gray-400 text-xs mb-1">${flightClass}</div>
            <div class="flex items-center w-full gap-1">
              <div class="h-px flex-1 bg-gray-300"></div>
              <span class="text-gray-500">✈️</span>
              <div class="h-px flex-1 bg-gray-300"></div>
            </div>
            <div class="text-gray-400 text-xs mt-1">${distance.toLocaleString()} mi</div>
          </div>
          <div class="text-center">
            <div class="font-display text-4xl font-bold text-gray-800">${destination.iata_code}</div>
            <div class="text-xs text-gray-500 mt-1">${destination.city}</div>
          </div>
        </div>
      </div>

      <!-- Dashed separator -->
      <div class="relative mx-4">
        <div class="border-t-2 border-dashed border-gray-300"></div>
      </div>

      <!-- Bottom section -->
      <div class="p-5 pt-4">
        <div class="grid grid-cols-3 gap-3">
          <div>
            <div class="text-xs text-gray-500 uppercase tracking-wide">Duration</div>
            <div class="font-display font-bold text-gray-800">${minutesToLabel(minutes)}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 uppercase tracking-wide">Class</div>
            <div class="font-display font-bold text-gray-800">${seatClass}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500 uppercase tracking-wide">Miles</div>
            <div class="font-display font-bold text-blue-600">~${miles.toLocaleString()}</div>
          </div>
        </div>

        ${tags?.length > 0 ? `
        <div class="mt-3 flex gap-1 flex-wrap">
          ${tags.map(t => `<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">${t}</span>`).join('')}
        </div>` : ''}

        <div class="mt-3 text-xs text-gray-400">${now.toLocaleDateString('en-US', {weekday:'long', year:'numeric', month:'long', day:'numeric'})}</div>
      </div>
    </div>

    <!-- Tear boarding pass button -->
    <div class="text-center">
      <p class="text-blue-300 text-sm mb-4">Tear your boarding pass to begin your flight</p>
      <button onclick="tearBoardingPass()" id="tearBtn"
        class="relative overflow-hidden bg-blue-500 hover:bg-blue-400 text-white font-display font-bold py-4 px-10 rounded-2xl text-lg transition-all hover:scale-105 active:scale-95 shadow-lg"
        style="box-shadow: 0 0 30px rgba(96,165,250,0.4);">
        ✂️ Tear & Take Off
      </button>
    </div>

    <button onclick="navigate('book')" class="text-blue-400 text-sm">← Change Flight</button>
  </div>`;
}

// ─── TIMER ────────────────────────────────────────────────────────────────────
function renderTimer() {
  const flight = state.activeFlight;
  if (!flight) { navigate('home'); return ''; }
  const total = flight.duration_minutes * 60;
  const elapsed = total - state.timerSeconds;
  const progress = Math.min(100, (elapsed / total) * 100);
  const distance = calculateDistance(
    state.airports.find(a=>a.iata_code===flight.origin_iata)?.latitude || 0,
    state.airports.find(a=>a.iata_code===flight.origin_iata)?.longitude || 0,
    state.airports.find(a=>a.iata_code===flight.destination_iata)?.latitude || 0,
    state.airports.find(a=>a.iata_code===flight.destination_iata)?.longitude || 0,
  );

  return `
  <div class="animate-fadeIn p-6 flex flex-col items-center gap-6 min-h-screen">
    <div class="pt-4 text-center w-full">
      <div class="text-blue-300 text-sm">${flight.seat_class === 'Study' ? '📚' : flight.seat_class === 'Work' ? '💼' : '🎨'} ${flight.seat_class} Mode</div>
      <h1 class="font-display text-xl font-bold">${flight.origin_iata} → ${flight.destination_iata}</h1>
    </div>

    <!-- Plane animation area -->
    <div class="relative w-full h-24 flex items-center">
      <div class="absolute inset-0 flex items-center">
        <div class="w-full h-px bg-white/10 border-t border-dashed border-white/20"></div>
      </div>
      <div class="absolute transition-all duration-1000" style="left: calc(${progress}% - 20px); top: 50%; transform: translateY(-50%);">
        <div class="text-4xl animate-float">✈️</div>
      </div>
      <div class="absolute left-0 text-xs text-blue-400 bottom-0">${flight.origin_iata}</div>
      <div class="absolute right-0 text-xs text-blue-400 bottom-0">${flight.destination_iata}</div>
    </div>

    <!-- Progress bar -->
    <div class="w-full bg-white/10 rounded-full h-2">
      <div class="flight-progress bg-blue-400 rounded-full h-2" style="width: ${progress}%;"></div>
    </div>

    <!-- Timer Display -->
    <div class="text-center">
      <div class="text-xs text-blue-300 uppercase tracking-widest mb-2">Time Remaining</div>
      <div class="font-display font-bold text-white" style="font-size: 4rem; line-height: 1;" id="timerDisplay">
        ${formatTime(state.timerSeconds)}
      </div>
      <div class="text-blue-300 text-sm mt-2">${minutesToLabel(Math.ceil(state.timerSeconds / 60))} left · ${distance.toLocaleString()} miles</div>
    </div>

    <!-- Status messages -->
    <div class="card-glass rounded-2xl p-4 w-full text-center">
      <div class="text-2xl mb-2">${getFlightPhaseEmoji(progress)}</div>
      <div class="font-semibold text-sm">${getFlightPhaseMessage(progress)}</div>
      <div class="text-blue-300 text-xs mt-1">${getFlightPhaseTip(flight.seat_class)}</div>
    </div>

    <!-- Tags -->
    ${flight.tags?.length > 0 ? `
    <div class="flex gap-2 flex-wrap justify-center">
      ${flight.tags.map(t => `<span class="bg-blue-500/20 text-blue-300 text-xs px-3 py-1 rounded-full">${t}</span>`).join('')}
    </div>` : ''}

    <!-- Abort -->
    <button onclick="confirmAbort()" class="text-red-400/60 text-sm hover:text-red-400 transition-colors mt-auto">
      Emergency Landing (Abort)
    </button>
  </div>`;
}

// ─── LANDING ──────────────────────────────────────────────────────────────────
function renderLanding() {
  const flight = state.lastCompletedFlight;
  if (!flight) { navigate('home'); return ''; }

  return `
  <div class="animate-fadeIn p-6 flex flex-col items-center gap-6 text-center">
    <div class="pt-8">
      <div class="text-7xl mb-4 animate-float">🎉</div>
      <h1 class="font-display text-3xl font-bold">Landed!</h1>
      <p class="text-blue-300 mt-2">Flight completed successfully</p>
    </div>

    <!-- Summary Card -->
    <div class="card-glass-light rounded-2xl p-6 w-full">
      <div class="text-2xl font-display font-bold mb-1">${flight.origin_iata} → ${flight.destination_iata}</div>
      <div class="text-blue-300 text-sm mb-4">${flight.origin_name?.split(' ').slice(0,2).join(' ')} → ${flight.destination_name?.split(' ').slice(0,2).join(' ')}</div>
      <div class="grid grid-cols-3 gap-4">
        <div>
          <div class="text-2xl font-bold text-yellow-400">+${flight.miles_earned?.toLocaleString()}</div>
          <div class="text-xs text-blue-300">miles earned</div>
        </div>
        <div>
          <div class="text-2xl font-bold">${minutesToLabel(flight.duration_minutes)}</div>
          <div class="text-xs text-blue-300">focused</div>
        </div>
        <div>
          <div class="text-2xl font-bold">${flight.seat_class === 'Study' ? '📚' : flight.seat_class === 'Work' ? '💼' : '🎨'}</div>
          <div class="text-xs text-blue-300">${flight.seat_class}</div>
        </div>
      </div>
    </div>

    <!-- New Badges -->
    ${state.newBadges?.length > 0 ? `
    <div class="w-full">
      <div class="text-sm font-semibold text-yellow-400 mb-3">🏅 New Badge${state.newBadges.length > 1 ? 's' : ''} Unlocked!</div>
      ${state.newBadges.map(b => `
      <div class="badge-glow card-glass-light rounded-xl p-3 flex items-center gap-3 mb-2">
        <div class="text-3xl">${b.emoji}</div>
        <div class="text-left">
          <div class="font-semibold text-sm">${b.name}</div>
          <div class="text-xs text-blue-300">${b.description}</div>
        </div>
      </div>`).join('')}
    </div>` : ''}

    <!-- Notes -->
    <div class="w-full">
      <label class="text-xs text-blue-300 uppercase tracking-wide mb-2 block text-left">Flight Notes (optional)</label>
      <textarea id="flightNotes" placeholder="How did this session go? What did you accomplish?" rows="3"
        class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white text-sm placeholder-blue-400 focus:outline-none focus:border-blue-400 resize-none"></textarea>
    </div>

    <div class="flex gap-3 w-full">
      <button onclick="saveNotesAndGoHome()" class="flex-1 bg-blue-500 hover:bg-blue-400 text-white font-display font-bold py-4 rounded-2xl transition-colors">
        Back to Home
      </button>
      <button onclick="bookAnother()" class="flex-1 card-glass-light border border-white/20 font-display font-bold py-4 rounded-2xl transition-colors hover:bg-white/10">
        Book Another ✈️
      </button>
    </div>
  </div>`;
}

// ─── LOGBOOK ──────────────────────────────────────────────────────────────────
function renderLogbook() {
  const landed = [...state.flights].filter(f => f.status === 'landed').sort((a,b) => new Date(b.landed_at) - new Date(a.landed_at));
  return `
  <div class="animate-fadeIn p-6 flex flex-col gap-4">
    <div class="pt-4">
      <h1 class="font-display text-2xl font-bold">Flight Logbook</h1>
      <p class="text-blue-300 text-sm">${landed.length} flights completed</p>
    </div>

    ${landed.length === 0 ? `
    <div class="card-glass rounded-2xl p-10 text-center mt-8">
      <div class="text-5xl mb-3">📒</div>
      <h2 class="font-semibold text-white mb-1">Empty Logbook</h2>
      <p class="text-blue-300 text-sm">Complete your first flight to see it here.</p>
    </div>` : `
    <div class="flex flex-col gap-3">
      ${landed.map(f => `
      <div class="card-glass rounded-xl p-4">
        <div class="flex items-start justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="text-xl">${f.seat_class === 'Study' ? '📚' : f.seat_class === 'Work' ? '💼' : '🎨'}</span>
            <div>
              <div class="font-display font-bold">${f.origin_iata} → ${f.destination_iata}</div>
              <div class="text-xs text-blue-300">${f.origin_name?.split(',')[0] || f.origin_iata} → ${f.destination_name?.split(',')[0] || f.destination_iata}</div>
            </div>
          </div>
          <div class="text-right">
            <div class="text-yellow-400 text-sm font-bold">+${f.miles_earned?.toLocaleString()} mi</div>
            <div class="text-xs text-blue-400">${formatRelativeDate(f.landed_at)}</div>
          </div>
        </div>
        <div class="flex gap-2 items-center flex-wrap mt-2">
          <span class="text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full">${f.seat_class}</span>
          <span class="text-xs bg-white/10 text-blue-300 px-2 py-0.5 rounded-full">⏱ ${minutesToLabel(f.duration_minutes)}</span>
          ${(f.tags || []).map(t => `<span class="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full">${t}</span>`).join('')}
        </div>
        ${f.notes ? `<div class="text-xs text-blue-300 mt-2 italic">"${f.notes}"</div>` : ''}
      </div>`).join('')}
    </div>`}
  </div>`;
}

// ─── STATS ────────────────────────────────────────────────────────────────────
function renderStats() {
  const stats = state.userStats;
  const flights = state.flights.filter(f => f.status === 'landed');

  const seatBreakdown = { Study: 0, Work: 0, Create: 0 };
  flights.forEach(f => { if (seatBreakdown[f.seat_class] !== undefined) seatBreakdown[f.seat_class]++; });

  const dayCount = {};
  flights.forEach(f => {
    const day = new Date(f.landed_at).toLocaleDateString('en-US', {weekday: 'long'});
    dayCount[day] = (dayCount[day] || 0) + 1;
  });
  const bestDay = Object.entries(dayCount).sort((a,b) => b[1]-a[1])[0];

  const uniqueDests = new Set(flights.map(f => f.destination_iata)).size;
  const avgMinutes = flights.length > 0 ? Math.round(flights.reduce((s,f) => s + f.duration_minutes, 0) / flights.length) : 0;

  return `
  <div class="animate-fadeIn p-6 flex flex-col gap-5">
    <div class="pt-4">
      <h1 class="font-display text-2xl font-bold">Flight Statistics</h1>
      <p class="text-blue-300 text-sm">Your focus journey at a glance</p>
    </div>

    <!-- Key Stats Grid -->
    <div class="grid grid-cols-2 gap-3">
      <div class="card-glass rounded-xl p-4">
        <div class="text-3xl font-display font-bold text-white">${(stats?.total_miles || 0).toLocaleString()}</div>
        <div class="text-blue-300 text-xs mt-1">Total Miles</div>
      </div>
      <div class="card-glass rounded-xl p-4">
        <div class="text-3xl font-display font-bold text-white">${flights.length}</div>
        <div class="text-blue-300 text-xs mt-1">Flights Completed</div>
      </div>
      <div class="card-glass rounded-xl p-4">
        <div class="text-3xl font-display font-bold text-white">${minutesToLabel(stats?.total_focus_minutes || 0)}</div>
        <div class="text-blue-300 text-xs mt-1">Total Focus Time</div>
      </div>
      <div class="card-glass rounded-xl p-4">
        <div class="text-3xl font-display font-bold text-orange-400">${stats?.streak_days || 0}</div>
        <div class="text-blue-300 text-xs mt-1">🔥 Day Streak</div>
      </div>
    </div>

    <!-- Secondary Stats -->
    <div class="card-glass rounded-xl p-4 grid grid-cols-3 gap-3 text-center">
      <div>
        <div class="font-bold text-lg">${uniqueDests}</div>
        <div class="text-xs text-blue-300">Destinations</div>
      </div>
      <div>
        <div class="font-bold text-lg">${minutesToLabel(avgMinutes)}</div>
        <div class="text-xs text-blue-300">Avg Duration</div>
      </div>
      <div>
        <div class="font-bold text-lg">${bestDay ? bestDay[0].slice(0,3) : '—'}</div>
        <div class="text-xs text-blue-300">Best Day</div>
      </div>
    </div>

    <!-- Seat Class Breakdown -->
    ${flights.length > 0 ? `
    <div class="card-glass rounded-xl p-4">
      <h3 class="font-semibold text-sm mb-3">Focus Type Breakdown</h3>
      ${['Study', 'Work', 'Create'].map(cls => {
        const count = seatBreakdown[cls];
        const pct = flights.length > 0 ? Math.round((count / flights.length) * 100) : 0;
        return `
        <div class="mb-3">
          <div class="flex justify-between text-xs mb-1">
            <span>${cls === 'Study' ? '📚' : cls === 'Work' ? '💼' : '🎨'} ${cls}</span>
            <span class="text-blue-300">${count} flights (${pct}%)</span>
          </div>
          <div class="bg-white/10 rounded-full h-2">
            <div class="h-2 rounded-full transition-all duration-500" style="width: ${pct}%; background: ${cls === 'Study' ? '#60a5fa' : cls === 'Work' ? '#a78bfa' : '#34d399'};"></div>
          </div>
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- Top Routes -->
    ${flights.length > 0 ? `
    <div class="card-glass rounded-xl p-4">
      <h3 class="font-semibold text-sm mb-3">Top Routes</h3>
      ${getTopRoutes(flights).map(r => `
      <div class="flex justify-between items-center py-1.5 border-b border-white/5">
        <span class="text-sm font-medium">${r.route}</span>
        <span class="text-xs text-blue-300">${r.count}x · ${(r.miles).toLocaleString()} mi</span>
      </div>`).join('')}
    </div>` : ''}

    ${flights.length === 0 ? `
    <div class="card-glass rounded-2xl p-10 text-center">
      <div class="text-5xl mb-3">📊</div>
      <h2 class="font-semibold">No data yet</h2>
      <p class="text-blue-300 text-sm mt-1">Complete flights to see your statistics</p>
    </div>` : ''}
  </div>`;
}

// ─── BADGES ───────────────────────────────────────────────────────────────────
function renderBadges() {
  const earnedIds = state.userStats?.badges || [];
  const stats = state.userStats || {};
  const flights = state.flights;

  return `
  <div class="animate-fadeIn p-6 flex flex-col gap-4">
    <div class="pt-4">
      <h1 class="font-display text-2xl font-bold">Badges</h1>
      <p class="text-blue-300 text-sm">${earnedIds.length} / ${BADGES.length} earned</p>
    </div>

    <div class="grid grid-cols-1 gap-3">
      ${BADGES.map(b => {
        const earned = earnedIds.includes(b.id);
        return `
        <div class="${earned ? 'card-glass-light border border-yellow-400/20' : 'card-glass'} rounded-xl p-4 flex items-center gap-4 transition-all">
          <div class="text-3xl ${!earned ? 'grayscale opacity-40' : ''}">${b.emoji}</div>
          <div class="flex-1">
            <div class="font-semibold text-sm ${!earned ? 'text-white/40' : ''}">${b.name}</div>
            <div class="text-xs ${earned ? 'text-blue-300' : 'text-white/30'} mt-0.5">${b.description}</div>
          </div>
          ${earned ? '<div class="text-yellow-400 text-lg">✓</div>' : '<div class="text-white/20 text-lg">🔒</div>'}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

// ─── Actions ──────────────────────────────────────────────────────────────────
window.selectSeat = function(cls) {
  state.booking.seatClass = cls;
  render();
};

window.addTag = function() {
  const input = document.getElementById('tagInput');
  const val = input.value.trim();
  if (val && !state.booking.tags.includes(val)) {
    state.booking.tags.push(val);
    render();
  }
};

window.removeTag = function(tag) {
  state.booking.tags = state.booking.tags.filter(t => t !== tag);
  render();
};

window.goToCheckin = function() {
  const origin = state.airports.find(a => a.iata_code === document.getElementById('originSelect')?.value);
  const dest = state.airports.find(a => a.iata_code === document.getElementById('destSelect')?.value);
  if (!origin || !dest) return;
  const mins = parseInt(document.getElementById('durationSlider')?.value);
  state.booking.origin = origin;
  state.booking.destination = dest;
  state.booking.customMinutes = mins;

  // Save home airport if not set
  if (!state.userStats?.home_airport_iata) {
    setHomeAirport(origin);
  }
  state.page = 'checkin';
  render();
};

async function setHomeAirport(airport) {
  try {
    if (state.userStats) {
      await UserStats.update(state.userStats.id, { home_airport_iata: airport.iata_code, home_airport_name: airport.name });
      state.userStats.home_airport_iata = airport.iata_code;
      state.userStats.home_airport_name = airport.name;
    } else {
      const created = await UserStats.create({ home_airport_iata: airport.iata_code, home_airport_name: airport.name, total_miles: 0, total_flights: 0, total_focus_minutes: 0, badges: [], streak_days: 0 });
      state.userStats = created;
    }
  } catch (e) { console.error(e); }
}

window.tearBoardingPass = async function() {
  const btn = document.getElementById('tearBtn');
  if (btn) { btn.textContent = '🛫 Taking off...'; btn.disabled = true; }
  const { origin, destination, seatClass, tags, customMinutes } = state.booking;
  const distance = calculateDistance(origin.latitude, origin.longitude, destination.latitude, destination.longitude);
  const minutes = customMinutes || distanceToMinutes(distance);
  try {
    const flight = await FocusFlight.create({
      origin_iata: origin.iata_code, origin_name: origin.name,
      destination_iata: destination.iata_code, destination_name: destination.name,
      seat_class: seatClass, duration_minutes: minutes,
      miles_earned: distance, tags: tags || [], status: 'in_flight',
      started_at: new Date().toISOString(),
    });
    state.activeFlight = flight;
    state.timerSeconds = minutes * 60;
    state.flights.push(flight);
    startTimer();
    state.page = 'timer';
    render();
  } catch (e) {
    console.error(e);
    if (btn) { btn.textContent = '✂️ Tear & Take Off'; btn.disabled = false; }
  }
};

function startTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(async () => {
    state.timerSeconds--;
    const display = document.getElementById('timerDisplay');
    if (display) display.textContent = formatTime(state.timerSeconds);
    // Update progress bar and plane
    const flight = state.activeFlight;
    if (flight) {
      const total = flight.duration_minutes * 60;
      const elapsed = total - state.timerSeconds;
      const progress = Math.min(100, (elapsed / total) * 100);
      const bar = document.querySelector('.flight-progress');
      if (bar) bar.style.width = progress + '%';
      const plane = document.querySelector('.transition-all.duration-1000');
      if (plane) plane.style.left = `calc(${progress}% - 20px)`;
    }
    if (state.timerSeconds <= 0) {
      clearInterval(state.timerInterval);
      await completeFlight();
    }
  }, 1000);
}

async function completeFlight() {
  const flight = state.activeFlight;
  if (!flight) return;
  try {
    const updated = await FocusFlight.update(flight.id, { status: 'landed', landed_at: new Date().toISOString() });
    state.lastCompletedFlight = { ...flight, ...updated };
    // Update flights array
    const idx = state.flights.findIndex(f => f.id === flight.id);
    if (idx >= 0) state.flights[idx] = state.lastCompletedFlight;

    // Update user stats
    const oldStats = state.userStats;
    const newMiles = (oldStats?.total_miles || 0) + flight.miles_earned;
    const newFlights = (oldStats?.total_flights || 0) + 1;
    const newMinutes = (oldStats?.total_focus_minutes || 0) + flight.duration_minutes;
    const today = new Date().toDateString();
    const lastDay = oldStats?.last_flight_date ? new Date(oldStats.last_flight_date).toDateString() : null;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    let streak = oldStats?.streak_days || 0;
    if (lastDay === today) { /* same day, no change */ }
    else if (lastDay === yesterday) { streak++; }
    else { streak = 1; }

    const existingBadges = oldStats?.badges || [];
    const tempStats = { total_miles: newMiles, total_flights: newFlights, streak_days: streak };
    const newBadges = checkNewBadges(tempStats, state.flights, existingBadges);
    const allBadges = [...existingBadges, ...newBadges.map(b => b.id)];

    const statsUpdate = { total_miles: newMiles, total_flights: newFlights, total_focus_minutes: newMinutes, streak_days: streak, last_flight_date: new Date().toISOString(), badges: allBadges };

    if (oldStats) {
      const s = await UserStats.update(oldStats.id, statsUpdate);
      state.userStats = { ...oldStats, ...s };
    } else {
      const s = await UserStats.create({ ...statsUpdate, home_airport_iata: '', home_airport_name: '' });
      state.userStats = s;
    }
    state.newBadges = newBadges;
    state.activeFlight = null;
    state.page = 'landing';
    render();
  } catch(e) { console.error(e); }
}

window.confirmAbort = function() {
  if (confirm('Abort flight? Your progress will not be saved.')) {
    abortFlight();
  }
};

async function abortFlight() {
  const flight = state.activeFlight;
  if (flight) {
    clearInterval(state.timerInterval);
    try { await FocusFlight.update(flight.id, { status: 'aborted' }); } catch(e) {}
    const idx = state.flights.findIndex(f => f.id === flight.id);
    if (idx >= 0) state.flights[idx].status = 'aborted';
  }
  state.activeFlight = null;
  state.page = 'home';
  render();
}

window.saveNotesAndGoHome = async function() {
  const notes = document.getElementById('flightNotes')?.value;
  if (notes && state.lastCompletedFlight) {
    try { await FocusFlight.update(state.lastCompletedFlight.id, { notes }); } catch(e) {}
  }
  state.newBadges = [];
  state.page = 'home';
  render();
};

window.bookAnother = function() {
  state.booking = { origin: state.booking.origin, destination: null, seatClass: 'Study', tags: [], customMinutes: null };
  state.newBadges = [];
  state.page = 'book';
  render();
};

// ─── Listeners ────────────────────────────────────────────────────────────────
function attachListeners() {
  const originSel = document.getElementById('originSelect');
  const destSel = document.getElementById('destSelect');
  const slider = document.getElementById('durationSlider');

  if (originSel) {
    originSel.addEventListener('change', () => {
      const airport = state.airports.find(a => a.iata_code === originSel.value);
      state.booking.origin = airport || null;
      state.booking.customMinutes = null;
      render();
    });
  }
  if (destSel) {
    destSel.addEventListener('change', () => {
      const airport = state.airports.find(a => a.iata_code === destSel.value);
      state.booking.destination = airport || null;
      state.booking.customMinutes = null;
      render();
    });
  }
  if (slider) {
    slider.addEventListener('input', () => {
      state.booking.customMinutes = parseInt(slider.value);
      const label = document.getElementById('durationLabel');
      if (label) label.textContent = minutesToLabel(parseInt(slider.value));
    });
  }
  const tagInput = document.getElementById('tagInput');
  if (tagInput) {
    tagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.addTag(); });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Good night ✨';
  if (h < 12) return 'Good morning ☀️';
  if (h < 17) return 'Good afternoon 🌤';
  return 'Good evening 🌙';
}

function formatRelativeDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getFlightPhaseEmoji(pct) {
  if (pct < 10) return '🛫';
  if (pct < 35) return '📈';
  if (pct < 65) return '✈️';
  if (pct < 85) return '🌅';
  return '🛬';
}

function getFlightPhaseMessage(pct) {
  if (pct < 10) return 'Climbing to cruising altitude...';
  if (pct < 35) return 'Reaching cruising altitude. Stay focused.';
  if (pct < 65) return 'Smooth skies ahead. You\'re in the zone.';
  if (pct < 85) return 'Beginning descent. Almost there!';
  return 'Approach sequence active. Final stretch!';
}

function getFlightPhaseTip(seatClass) {
  const tips = {
    Study: ['Close all distracting tabs.', 'Summarize what you just learned.', 'Draw a quick concept map.', 'Test yourself on the material.'],
    Work: ['Focus on your single most important task.', 'No notifications. Deep work only.', 'Write down your next action if distracted.', 'Finish one thing before starting another.'],
    Create: ['Don\'t edit — just create.', 'Follow the idea wherever it leads.', 'Ignore the inner critic.', 'Volume over perfection right now.'],
  };
  const arr = tips[seatClass] || tips.Work;
  return arr[Math.floor(Math.random() * arr.length)];
}

function getTopRoutes(flights) {
  const routes = {};
  flights.forEach(f => {
    const key = `${f.origin_iata}→${f.destination_iata}`;
    if (!routes[key]) routes[key] = { route: key, count: 0, miles: f.miles_earned || 0 };
    routes[key].count++;
  });
  return Object.values(routes).sort((a,b) => b.count - a.count).slice(0, 4);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
init();
