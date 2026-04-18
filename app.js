import { createClient } from 'https://esm.sh/@base44/sdk@latest';

const base44 = createClient({ appId: "69e30defd345968f8174a3ce" });
const { Airport, FocusFlight, UserStats } = base44.entities;

// ─── Distance utils ───────────────────────────────────────────────────────────
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}
function distanceToMinutes(miles) {
  if (miles < 500) return 25;
  if (miles < 1500) return 50;
  if (miles < 3000) return 75;
  if (miles < 5500) return 90;
  return 120;
}
function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds/3600), m = Math.floor((totalSeconds%3600)/60), s = totalSeconds%60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
function minutesToLabel(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes/60), m = minutes%60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function getFlightClass(miles) {
  if (miles < 500) return 'Regional Hop';
  if (miles < 1500) return 'Short Haul';
  if (miles < 3000) return 'Medium Haul';
  if (miles < 5500) return 'Long Haul';
  return 'Ultra Long Haul';
}

// ─── Badges ───────────────────────────────────────────────────────────────────
const BADGES = [
  { id: 'first_flight', name: 'First Flight', emoji: '✈️', description: 'Complete your very first focus flight', condition: (s) => s.total_flights >= 1 },
  { id: 'frequent_flyer', name: 'Frequent Flyer', emoji: '🎫', description: 'Complete 10 focus flights', condition: (s) => s.total_flights >= 10 },
  { id: 'airline_elite', name: 'Airline Elite', emoji: '💎', description: 'Complete 50 focus flights', condition: (s) => s.total_flights >= 50 },
  { id: 'first_class', name: 'First Class', emoji: '🥂', description: 'Complete a 90-minute or longer flight', condition: (s,f) => f.some(x => x.duration_minutes >= 90 && x.status === 'landed') },
  { id: 'globe_trotter', name: 'Globe Trotter', emoji: '🌍', description: 'Fly to 5 different destinations', condition: (s,f) => new Set(f.filter(x=>x.status==='landed').map(x=>x.destination_iata)).size >= 5 },
  { id: 'mile_high', name: 'Mile High Club', emoji: '🏔️', description: 'Earn 10,000 flight miles', condition: (s) => s.total_miles >= 10000 },
  { id: 'around_the_world', name: 'Around the World', emoji: '🌐', description: 'Earn 100,000 flight miles', condition: (s) => s.total_miles >= 100000 },
  { id: 'deep_focus', name: 'Deep Focus', emoji: '🧠', description: 'Accumulate 24 total hours of focus time', condition: (s) => s.total_focus_minutes >= 1440 },
  { id: 'streak_3', name: 'Hat Trick', emoji: '🔥', description: '3-day focus streak', condition: (s) => s.streak_days >= 3 },
  { id: 'streak_7', name: 'Weekly Warrior', emoji: '🗓️', description: '7-day focus streak', condition: (s) => s.streak_days >= 7 },
  { id: 'streak_30', name: 'Iron Discipline', emoji: '🏅', description: '30-day focus streak', condition: (s) => s.streak_days >= 30 },
  { id: 'night_owl', name: 'Night Owl', emoji: '🦉', description: 'Complete a flight after midnight', condition: (s,f) => f.some(x => { if(x.status!=='landed') return false; const h=new Date(x.started_at).getHours(); return h>=0&&h<4; }) },
  { id: 'early_bird', name: 'Early Bird', emoji: '🐦', description: 'Complete a flight before 7am', condition: (s,f) => f.some(x => { if(x.status!=='landed') return false; const h=new Date(x.started_at).getHours(); return h>=4&&h<7; }) },
  { id: 'intercontinental', name: 'Intercontinental', emoji: '🗺️', description: 'Complete an ultra-long-haul flight (120 min)', condition: (s,f) => f.some(x=>x.duration_minutes>=120&&x.status==='landed') },
];
function checkNewBadges(stats, flights, existing) {
  return BADGES.filter(b => !existing.includes(b.id) && b.condition(stats, flights));
}

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  page: 'home', airports: [], userStats: null, flights: [],
  booking: { origin: null, destination: null, seatClass: 'Study', tags: [], customMinutes: null },
  activeFlight: null, timerInterval: null, timerSeconds: 0, newBadges: [], lastCompletedFlight: null,
};

async function init() {
  await loadData();
  render();
}

async function loadData() {
  try {
    const [airports, flights, statsArr] = await Promise.all([Airport.list(), FocusFlight.list(), UserStats.list()]);
    state.airports = airports;
    state.flights = flights;
    state.userStats = statsArr[0] || null;
    const active = flights.find(f => f.status === 'in_flight');
    if (active) {
      state.activeFlight = active;
      const elapsed = Math.floor((Date.now() - new Date(active.started_at)) / 1000);
      state.timerSeconds = Math.max(0, active.duration_minutes * 60 - elapsed);
      if (state.timerSeconds > 0) { startTimer(); state.page = 'timer'; }
    }
  } catch(e) { console.error(e); }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
window.navigate = function(page) {
  if (state.activeFlight && state.activeFlight.status === 'in_flight' && page !== 'timer') {
    if (!confirm('Your flight is still active and running in the background. Navigate away?')) return;
  }
  state.page = page; render();
};

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
  const recentFlights = [...state.flights].filter(f=>f.status==='landed').sort((a,b)=>new Date(b.landed_at)-new Date(a.landed_at)).slice(0,3);
  const homeIATA = stats?.home_airport_iata || '???';
  const h = new Date().getHours();
  const greeting = h<5?'Good night ✨':h<12?'Good morning ☀️':h<17?'Good afternoon 🌤':'Good evening 🌙';

  return `<div class="animate-fadeIn p-6 flex flex-col gap-6">
    <div class="flex items-center justify-between pt-4">
      <div><p class="text-blue-300 text-sm font-medium">${greeting}</p><h1 class="font-display text-2xl font-bold text-white">FocusFlight</h1></div>
      <div class="text-right"><div class="text-xs text-blue-300">Home Base</div><div class="font-display font-bold text-white">${homeIATA}</div></div>
    </div>
    ${state.activeFlight?`<div class="card-glass-light rounded-2xl p-4 border border-blue-400/30 cursor-pointer" onclick="navigate('timer')">
      <div class="flex items-center justify-between">
        <div><div class="text-xs text-blue-300 mb-1">✈️ FLIGHT IN PROGRESS</div>
        <div class="font-display font-bold">${state.activeFlight.origin_iata} → ${state.activeFlight.destination_iata}</div>
        <div class="text-sm text-blue-200">${state.activeFlight.seat_class} · ${formatTime(state.timerSeconds)} remaining</div></div>
        <div class="text-3xl animate-float">✈️</div>
      </div></div>`:''}
    <div class="card-glass rounded-2xl p-5" style="background:linear-gradient(135deg,rgba(30,64,175,0.4),rgba(59,130,246,0.2))">
      <div class="flex items-center justify-between mb-3"><span class="text-blue-300 text-sm font-medium">Total Flight Miles</span><span class="text-2xl">🌍</span></div>
      <div class="font-display text-4xl font-bold text-white">${(stats?.total_miles||0).toLocaleString()}</div>
      <div class="text-blue-300 text-sm mt-1">${stats?.total_flights||0} flights · ${minutesToLabel(stats?.total_focus_minutes||0)} focused</div>
      ${stats?.streak_days>0?`<div class="mt-2 text-orange-300 text-sm">🔥 ${stats.streak_days}-day streak</div>`:''}
    </div>
    <div class="grid grid-cols-2 gap-3">
      <button onclick="navigate('book')" class="card-glass-light rounded-2xl p-4 text-left hover:scale-105 transition-transform">
        <div class="text-2xl mb-2">✈️</div><div class="font-semibold text-white text-sm">New Flight</div><div class="text-blue-300 text-xs">Start a focus session</div>
      </button>
      <button onclick="navigate('logbook')" class="card-glass-light rounded-2xl p-4 text-left hover:scale-105 transition-transform">
        <div class="text-2xl mb-2">📒</div><div class="font-semibold text-white text-sm">Logbook</div><div class="text-blue-300 text-xs">${state.flights.filter(f=>f.status==='landed').length} flights logged</div>
      </button>
    </div>
    ${recentFlights.length>0?`<div><h2 class="font-display font-semibold text-white mb-3">Recent Flights</h2><div class="flex flex-col gap-2">
      ${recentFlights.map(f=>`<div class="card-glass rounded-xl p-3 flex items-center gap-3">
        <div class="w-10 h-10 rounded-full flex items-center justify-center" style="background:rgba(96,165,250,0.15)"><span class="text-lg">${f.seat_class==='Study'?'📚':f.seat_class==='Work'?'💼':'🎨'}</span></div>
        <div class="flex-1"><div class="font-semibold text-sm">${f.origin_iata} → ${f.destination_iata}</div><div class="text-xs text-blue-300">${f.seat_class} · ${minutesToLabel(f.duration_minutes)}</div></div>
        <div class="text-right"><div class="text-xs font-semibold text-yellow-400">+${f.miles_earned?.toLocaleString()} mi</div><div class="text-xs text-blue-400">${relDate(f.landed_at)}</div></div>
      </div>`).join('')}</div></div>`:`<div class="card-glass rounded-2xl p-8 text-center">
      <div class="text-5xl mb-3 animate-float">✈️</div>
      <h2 class="font-display font-semibold text-white mb-1">Ready for takeoff?</h2>
      <p class="text-blue-300 text-sm mb-4">Book your first focus flight and start earning miles.</p>
      <button onclick="navigate('book')" class="bg-blue-500 hover:bg-blue-400 text-white font-semibold py-3 px-6 rounded-xl transition-colors">Book a Flight</button>
    </div>`}
  </div>`;
}

// ─── BOOK ─────────────────────────────────────────────────────────────────────
function renderBook() {
  const airports = state.airports;
  const booking = state.booking;
  const stats = state.userStats;
  const origin = booking.origin || airports.find(a=>a.iata_code===stats?.home_airport_iata) || null;
  const dest = booking.destination;
  const distance = origin&&dest ? calculateDistance(origin.latitude,origin.longitude,dest.latitude,dest.longitude) : null;
  const suggestedMinutes = distance ? distanceToMinutes(distance) : null;
  const finalMinutes = booking.customMinutes || suggestedMinutes;
  const continents = [...new Set(airports.map(a=>a.continent))].sort();

  return `<div class="animate-fadeIn p-6 flex flex-col gap-5">
    <div class="pt-4"><h1 class="font-display text-2xl font-bold">Book a Flight</h1><p class="text-blue-300 text-sm">Choose your route and intent</p></div>
    <div>
      <label class="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-2 block">🛫 Departure Airport</label>
      <select id="originSelect" class="w-full border border-white/20 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-400" style="background-color:#0f2744">
        <option value="">Select departure airport...</option>
        ${continents.map(c=>`<optgroup label="${c}">${airports.filter(a=>a.continent===c).sort((a,b)=>a.city.localeCompare(b.city)).map(a=>`<option value="${a.iata_code}" ${origin?.iata_code===a.iata_code?'selected':''}>${a.iata_code} – ${a.city}, ${a.country}</option>`).join('')}</optgroup>`).join('')}
      </select>
    </div>
    <div>
      <label class="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-2 block">🛬 Destination Airport</label>
      <select id="destSelect" class="w-full border border-white/20 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-400" style="background-color:#0f2744">
        <option value="">Select destination...</option>
        ${continents.map(c=>`<optgroup label="${c}">${airports.filter(a=>a.continent===c&&a.iata_code!==origin?.iata_code).sort((a,b)=>a.city.localeCompare(b.city)).map(a=>`<option value="${a.iata_code}" ${dest?.iata_code===a.iata_code?'selected':''}>${a.iata_code} – ${a.city}, ${a.country}</option>`).join('')}</optgroup>`).join('')}
      </select>
    </div>
    ${distance?`<div class="card-glass rounded-xl p-4 animate-slideUp">
      <div class="grid grid-cols-3 gap-2 text-center">
        <div><div class="text-xs text-blue-300">Distance</div><div class="font-bold text-sm">${distance.toLocaleString()} mi</div></div>
        <div><div class="text-xs text-blue-300">Flight Type</div><div class="font-bold text-sm">${getFlightClass(distance)}</div></div>
        <div><div class="text-xs text-blue-300">Focus Time</div><div class="font-bold text-sm text-blue-300">${minutesToLabel(finalMinutes)}</div></div>
      </div></div>`:''}
    ${suggestedMinutes?`<div>
      <div class="flex justify-between items-center mb-2">
        <label class="text-xs font-semibold text-blue-300 uppercase tracking-wide">⏱ Focus Duration</label>
        <span class="font-display font-bold text-white text-lg" id="durationLabel">${minutesToLabel(finalMinutes)}</span>
      </div>
      <input type="range" class="range-slider" id="durationSlider" min="15" max="180" step="5" value="${finalMinutes}" />
      <div class="flex justify-between text-xs text-blue-400 mt-1"><span>15 min</span><span>3 hrs</span></div>
    </div>`:''}
    <div>
      <label class="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-3 block">💺 Choose Your Seat</label>
      <div class="grid grid-cols-3 gap-2">
        ${['Study','Work','Create'].map(cls=>`<button class="seat-btn ${booking.seatClass===cls?'selected':'card-glass'} rounded-xl p-3 text-center border border-white/10" onclick="selectSeat('${cls}')">
          <div class="text-2xl mb-1">${cls==='Study'?'📚':cls==='Work'?'💼':'🎨'}</div><div class="font-semibold text-sm">${cls}</div>
        </button>`).join('')}
      </div>
    </div>
    <div>
      <label class="text-xs font-semibold text-blue-300 uppercase tracking-wide mb-2 block">🏷 Route Tags (optional)</label>
      <div class="flex gap-2 flex-wrap mb-2">
        ${(booking.tags||[]).map(t=>`<span class="bg-blue-500/30 text-blue-200 text-xs px-3 py-1 rounded-full flex items-center gap-1">${t} <button onclick="removeTag('${t}')">×</button></span>`).join('')}
      </div>
      <div class="flex gap-2">
        <input id="tagInput" type="text" placeholder="Add a tag..." class="flex-1 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm placeholder-blue-400 focus:outline-none focus:border-blue-400" />
        <button onclick="addTag()" class="bg-blue-500/30 border border-blue-400/30 text-blue-300 px-4 py-2 rounded-xl text-sm">Add</button>
      </div>
    </div>
    <button id="continueBtn" onclick="goToCheckin()" class="w-full py-4 rounded-2xl font-display font-bold text-lg transition-all ${origin&&dest?'bg-blue-500 hover:bg-blue-400 text-white':'bg-white/10 text-white/40 cursor-not-allowed'}" ${!origin||!dest?'disabled':''}>
      Check In →
    </button>
  </div>`;
}

// ─── CHECKIN ──────────────────────────────────────────────────────────────────
function renderCheckin() {
  const { origin, destination, seatClass, tags, customMinutes } = state.booking;
  const distance = calculateDistance(origin.latitude,origin.longitude,destination.latitude,destination.longitude);
  const minutes = customMinutes || distanceToMinutes(distance);
  const flightNum = `FF${Math.floor(Math.random()*9000)+1000}`;
  const now = new Date();
  return `<div class="animate-fadeIn p-6 flex flex-col gap-6 items-center">
    <div class="pt-4 text-center"><p class="text-blue-300 text-sm">Your boarding pass</p><h1 class="font-display text-2xl font-bold">Ready for Boarding</h1></div>
    <div class="boarding-pass w-full text-gray-800 shadow-2xl">
      <div class="p-5 pb-4">
        <div class="flex items-start justify-between mb-4">
          <div><div class="text-xs text-gray-500 uppercase tracking-wide">Boarding Pass</div><div class="text-xs text-gray-400">FocusFlight Airlines</div></div>
          <div class="text-right"><div class="text-xs text-gray-500">Flight</div><div class="font-display font-bold text-blue-700">${flightNum}</div></div>
        </div>
        <div class="flex items-center justify-between">
          <div class="text-center"><div class="font-display text-4xl font-bold text-gray-800">${origin.iata_code}</div><div class="text-xs text-gray-500 mt-1">${origin.city}</div></div>
          <div class="flex-1 flex flex-col items-center px-4">
            <div class="text-gray-400 text-xs mb-1">${getFlightClass(distance)}</div>
            <div class="flex items-center w-full gap-1"><div class="h-px flex-1 bg-gray-300"></div><span class="text-gray-500">✈️</span><div class="h-px flex-1 bg-gray-300"></div></div>
            <div class="text-gray-400 text-xs mt-1">${distance.toLocaleString()} mi</div>
          </div>
          <div class="text-center"><div class="font-display text-4xl font-bold text-gray-800">${destination.iata_code}</div><div class="text-xs text-gray-500 mt-1">${destination.city}</div></div>
        </div>
      </div>
      <div class="relative mx-4"><div class="border-t-2 border-dashed border-gray-300"></div></div>
      <div class="p-5 pt-4">
        <div class="grid grid-cols-3 gap-3">
          <div><div class="text-xs text-gray-500 uppercase">Duration</div><div class="font-display font-bold text-gray-800">${minutesToLabel(minutes)}</div></div>
          <div><div class="text-xs text-gray-500 uppercase">Class</div><div class="font-display font-bold text-gray-800">${seatClass}</div></div>
          <div><div class="text-xs text-gray-500 uppercase">Miles</div><div class="font-display font-bold text-blue-600">~${distance.toLocaleString()}</div></div>
        </div>
        ${tags?.length>0?`<div class="mt-3 flex gap-1 flex-wrap">${tags.map(t=>`<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">${t}</span>`).join('')}</div>`:''}
        <div class="mt-3 text-xs text-gray-400">${now.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</div>
      </div>
    </div>
    <div class="text-center">
      <p class="text-blue-300 text-sm mb-4">Tear your boarding pass to begin</p>
      <button onclick="tearBoardingPass()" id="tearBtn" class="bg-blue-500 hover:bg-blue-400 text-white font-display font-bold py-4 px-10 rounded-2xl text-lg transition-all hover:scale-105 active:scale-95 shadow-lg" style="box-shadow:0 0 30px rgba(96,165,250,0.4)">
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
  const progress = Math.min(100,(elapsed/total)*100);
  const tips = { Study:['Close distracting tabs.','Summarize what you learned.','Test yourself on the material.'], Work:['One task at a time.','No notifications.','Finish one thing before another.'], Create:["Don't edit — just create.",'Follow the idea.','Volume over perfection.'] };
  const tipsArr = tips[flight.seat_class]||tips.Work;
  const tip = tipsArr[Math.floor(Date.now()/60000)%tipsArr.length];
  const phases = [[10,'🛫','Climbing to cruising altitude...'],[35,'📈','Reaching cruising altitude. Stay focused.'],[65,'✈️',"Smooth skies. You're in the zone."],[85,'🌅','Beginning descent. Almost there!']];
  let phaseEmoji='🛬', phaseMsg='Final stretch!';
  for (const [pct,e,m] of phases) { if (progress<pct){phaseEmoji=e;phaseMsg=m;break;} }

  return `<div class="animate-fadeIn p-6 flex flex-col items-center gap-6 min-h-screen">
    <div class="pt-4 text-center w-full">
      <div class="text-blue-300 text-sm">${flight.seat_class==='Study'?'📚':flight.seat_class==='Work'?'💼':'🎨'} ${flight.seat_class} Mode</div>
      <h1 class="font-display text-xl font-bold">${flight.origin_iata} → ${flight.destination_iata}</h1>
    </div>
    <div class="relative w-full h-24 flex items-center">
      <div class="absolute inset-0 flex items-center"><div class="w-full h-px border-t border-dashed border-white/20"></div></div>
      <div class="absolute transition-all duration-1000" style="left:calc(${progress}% - 20px);top:50%;transform:translateY(-50%)"><div class="text-4xl animate-float">✈️</div></div>
      <div class="absolute left-0 text-xs text-blue-400 bottom-0">${flight.origin_iata}</div>
      <div class="absolute right-0 text-xs text-blue-400 bottom-0">${flight.destination_iata}</div>
    </div>
    <div class="w-full bg-white/10 rounded-full h-2"><div class="flight-progress bg-blue-400 rounded-full h-2" style="width:${progress}%"></div></div>
    <div class="text-center">
      <div class="text-xs text-blue-300 uppercase tracking-widest mb-2">Time Remaining</div>
      <div class="font-display font-bold text-white" style="font-size:4rem;line-height:1" id="timerDisplay">${formatTime(state.timerSeconds)}</div>
    </div>
    <div class="card-glass rounded-2xl p-4 w-full text-center">
      <div class="text-2xl mb-2">${phaseEmoji}</div>
      <div class="font-semibold text-sm">${phaseMsg}</div>
      <div class="text-blue-300 text-xs mt-1">${tip}</div>
    </div>
    <button onclick="confirmAbort()" class="text-red-400/60 text-sm hover:text-red-400 transition-colors mt-auto">Emergency Landing (Abort)</button>
  </div>`;
}

// ─── LANDING ──────────────────────────────────────────────────────────────────
function renderLanding() {
  const flight = state.lastCompletedFlight;
  if (!flight) { navigate('home'); return ''; }
  return `<div class="animate-fadeIn p-6 flex flex-col items-center gap-6 text-center">
    <div class="pt-8"><div class="text-7xl mb-4 animate-float">🎉</div><h1 class="font-display text-3xl font-bold">Landed!</h1><p class="text-blue-300 mt-2">Flight completed successfully</p></div>
    <div class="card-glass-light rounded-2xl p-6 w-full">
      <div class="text-2xl font-display font-bold mb-1">${flight.origin_iata} → ${flight.destination_iata}</div>
      <div class="grid grid-cols-3 gap-4 mt-3">
        <div><div class="text-2xl font-bold text-yellow-400">+${flight.miles_earned?.toLocaleString()}</div><div class="text-xs text-blue-300">miles</div></div>
        <div><div class="text-2xl font-bold">${minutesToLabel(flight.duration_minutes)}</div><div class="text-xs text-blue-300">focused</div></div>
        <div><div class="text-2xl font-bold">${flight.seat_class==='Study'?'📚':flight.seat_class==='Work'?'💼':'🎨'}</div><div class="text-xs text-blue-300">${flight.seat_class}</div></div>
      </div>
    </div>
    ${state.newBadges?.length>0?`<div class="w-full"><div class="text-sm font-semibold text-yellow-400 mb-3">🏅 New Badge${state.newBadges.length>1?'s':''} Unlocked!</div>
      ${state.newBadges.map(b=>`<div class="badge-glow card-glass-light rounded-xl p-3 flex items-center gap-3 mb-2"><div class="text-3xl">${b.emoji}</div><div class="text-left"><div class="font-semibold text-sm">${b.name}</div><div class="text-xs text-blue-300">${b.description}</div></div></div>`).join('')}</div>`:''}
    <div class="w-full">
      <label class="text-xs text-blue-300 uppercase tracking-wide mb-2 block text-left">Flight Notes (optional)</label>
      <textarea id="flightNotes" placeholder="How did the session go?" rows="3" class="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white text-sm placeholder-blue-400 focus:outline-none focus:border-blue-400 resize-none"></textarea>
    </div>
    <div class="flex gap-3 w-full">
      <button onclick="saveNotesAndGoHome()" class="flex-1 bg-blue-500 hover:bg-blue-400 text-white font-display font-bold py-4 rounded-2xl">Back to Home</button>
      <button onclick="bookAnother()" class="flex-1 card-glass-light border border-white/20 font-display font-bold py-4 rounded-2xl hover:bg-white/10">Book Another ✈️</button>
    </div>
  </div>`;
}

// ─── LOGBOOK ──────────────────────────────────────────────────────────────────
function renderLogbook() {
  const landed = [...state.flights].filter(f=>f.status==='landed').sort((a,b)=>new Date(b.landed_at)-new Date(a.landed_at));
  return `<div class="animate-fadeIn p-6 flex flex-col gap-4">
    <div class="pt-4"><h1 class="font-display text-2xl font-bold">Flight Logbook</h1><p class="text-blue-300 text-sm">${landed.length} flights completed</p></div>
    ${landed.length===0?`<div class="card-glass rounded-2xl p-10 text-center mt-8"><div class="text-5xl mb-3">📒</div><h2 class="font-semibold">Empty Logbook</h2><p class="text-blue-300 text-sm">Complete your first flight to see it here.</p></div>`:`
    <div class="flex flex-col gap-3">${landed.map(f=>`<div class="card-glass rounded-xl p-4">
      <div class="flex items-start justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="text-xl">${f.seat_class==='Study'?'📚':f.seat_class==='Work'?'💼':'🎨'}</span>
          <div><div class="font-display font-bold">${f.origin_iata} → ${f.destination_iata}</div><div class="text-xs text-blue-300">${f.seat_class} · ${minutesToLabel(f.duration_minutes)}</div></div>
        </div>
        <div class="text-right"><div class="text-yellow-400 text-sm font-bold">+${f.miles_earned?.toLocaleString()} mi</div><div class="text-xs text-blue-400">${relDate(f.landed_at)}</div></div>
      </div>
      <div class="flex gap-2 flex-wrap mt-1">${(f.tags||[]).map(t=>`<span class="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full">${t}</span>`).join('')}</div>
      ${f.notes?`<div class="text-xs text-blue-300 mt-2 italic">"${f.notes}"</div>`:''}
    </div>`).join('')}</div>`}
  </div>`;
}

// ─── STATS ────────────────────────────────────────────────────────────────────
function renderStats() {
  const stats = state.userStats;
  const flights = state.flights.filter(f=>f.status==='landed');
  const breakdown = {Study:0,Work:0,Create:0};
  flights.forEach(f=>{ if(breakdown[f.seat_class]!==undefined) breakdown[f.seat_class]++; });
  const avgMin = flights.length>0 ? Math.round(flights.reduce((s,f)=>s+f.duration_minutes,0)/flights.length) : 0;
  const dests = new Set(flights.map(f=>f.destination_iata)).size;
  return `<div class="animate-fadeIn p-6 flex flex-col gap-5">
    <div class="pt-4"><h1 class="font-display text-2xl font-bold">Flight Statistics</h1></div>
    <div class="grid grid-cols-2 gap-3">
      <div class="card-glass rounded-xl p-4"><div class="text-3xl font-display font-bold">${(stats?.total_miles||0).toLocaleString()}</div><div class="text-blue-300 text-xs mt-1">Total Miles</div></div>
      <div class="card-glass rounded-xl p-4"><div class="text-3xl font-display font-bold">${flights.length}</div><div class="text-blue-300 text-xs mt-1">Flights Completed</div></div>
      <div class="card-glass rounded-xl p-4"><div class="text-3xl font-display font-bold">${minutesToLabel(stats?.total_focus_minutes||0)}</div><div class="text-blue-300 text-xs mt-1">Total Focus Time</div></div>
      <div class="card-glass rounded-xl p-4"><div class="text-3xl font-display font-bold text-orange-400">${stats?.streak_days||0}</div><div class="text-blue-300 text-xs mt-1">🔥 Day Streak</div></div>
    </div>
    <div class="card-glass rounded-xl p-4 grid grid-cols-2 gap-3 text-center">
      <div><div class="font-bold text-lg">${dests}</div><div class="text-xs text-blue-300">Destinations</div></div>
      <div><div class="font-bold text-lg">${minutesToLabel(avgMin)}</div><div class="text-xs text-blue-300">Avg Duration</div></div>
    </div>
    ${flights.length>0?`<div class="card-glass rounded-xl p-4">
      <h3 class="font-semibold text-sm mb-3">Focus Type Breakdown</h3>
      ${['Study','Work','Create'].map(cls=>{
        const count=breakdown[cls], pct=flights.length>0?Math.round((count/flights.length)*100):0;
        return `<div class="mb-3"><div class="flex justify-between text-xs mb-1"><span>${cls==='Study'?'📚':cls==='Work'?'💼':'🎨'} ${cls}</span><span class="text-blue-300">${count} (${pct}%)</span></div>
        <div class="bg-white/10 rounded-full h-2"><div class="h-2 rounded-full" style="width:${pct}%;background:${cls==='Study'?'#60a5fa':cls==='Work'?'#a78bfa':'#34d399'}"></div></div></div>`;
      }).join('')}
    </div>`:``}
    ${flights.length===0?`<div class="card-glass rounded-2xl p-10 text-center"><div class="text-5xl mb-3">📊</div><p class="text-blue-300 text-sm">Complete flights to see stats</p></div>`:''}
  </div>`;
}

// ─── BADGES ───────────────────────────────────────────────────────────────────
function renderBadges() {
  const earnedIds = state.userStats?.badges || [];
  return `<div class="animate-fadeIn p-6 flex flex-col gap-4">
    <div class="pt-4"><h1 class="font-display text-2xl font-bold">Badges</h1><p class="text-blue-300 text-sm">${earnedIds.length} / ${BADGES.length} earned</p></div>
    <div class="grid grid-cols-1 gap-3">${BADGES.map(b=>{
      const earned=earnedIds.includes(b.id);
      return `<div class="${earned?'card-glass-light border border-yellow-400/20':'card-glass'} rounded-xl p-4 flex items-center gap-4">
        <div class="text-3xl ${!earned?'grayscale opacity-40':''}">${b.emoji}</div>
        <div class="flex-1"><div class="font-semibold text-sm ${!earned?'text-white/40':''}">${b.name}</div><div class="text-xs ${earned?'text-blue-300':'text-white/30'} mt-0.5">${b.description}</div></div>
        ${earned?'<div class="text-yellow-400 text-lg">✓</div>':'<div class="text-white/20 text-lg">🔒</div>'}
      </div>`;
    }).join('')}</div>
  </div>`;
}

// ─── Actions ──────────────────────────────────────────────────────────────────
window.selectSeat = s => { state.booking.seatClass=s; render(); };
window.addTag = () => {
  const i=document.getElementById('tagInput'), v=i?.value.trim();
  if(v&&!state.booking.tags.includes(v)){state.booking.tags.push(v); render();}
};
window.removeTag = t => { state.booking.tags=state.booking.tags.filter(x=>x!==t); render(); };

window.goToCheckin = () => {
  const origin=state.airports.find(a=>a.iata_code===document.getElementById('originSelect')?.value);
  const dest=state.airports.find(a=>a.iata_code===document.getElementById('destSelect')?.value);
  if(!origin||!dest) return;
  state.booking.origin=origin; state.booking.destination=dest;
  state.booking.customMinutes=parseInt(document.getElementById('durationSlider')?.value)||null;
  if(!state.userStats?.home_airport_iata) setHomeAirport(origin);
  state.page='checkin'; render();
};

async function setHomeAirport(airport) {
  try {
    if(state.userStats){
      await UserStats.update(state.userStats.id,{home_airport_iata:airport.iata_code,home_airport_name:airport.name});
      state.userStats.home_airport_iata=airport.iata_code;
    } else {
      state.userStats=await UserStats.create({home_airport_iata:airport.iata_code,home_airport_name:airport.name,total_miles:0,total_flights:0,total_focus_minutes:0,badges:[],streak_days:0});
    }
  } catch(e){console.error(e);}
}

window.tearBoardingPass = async () => {
  const btn=document.getElementById('tearBtn');
  if(btn){btn.textContent='🛫 Taking off...';btn.disabled=true;}
  const {origin,destination,seatClass,tags,customMinutes}=state.booking;
  const distance=calculateDistance(origin.latitude,origin.longitude,destination.latitude,destination.longitude);
  const minutes=customMinutes||distanceToMinutes(distance);
  try {
    const flight=await FocusFlight.create({origin_iata:origin.iata_code,origin_name:origin.name,destination_iata:destination.iata_code,destination_name:destination.name,seat_class:seatClass,duration_minutes:minutes,miles_earned:distance,tags:tags||[],status:'in_flight',started_at:new Date().toISOString()});
    state.activeFlight=flight; state.timerSeconds=minutes*60; state.flights.push(flight);
    startTimer(); state.page='timer'; render();
  } catch(e){console.error(e);if(btn){btn.textContent='✂️ Tear & Take Off';btn.disabled=false;}}
};

function startTimer() {
  if(state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval=setInterval(async()=>{
    state.timerSeconds--;
    const d=document.getElementById('timerDisplay');
    if(d) d.textContent=formatTime(state.timerSeconds);
    const flight=state.activeFlight;
    if(flight){
      const total=flight.duration_minutes*60, elapsed=total-state.timerSeconds, pct=Math.min(100,(elapsed/total)*100);
      const bar=document.querySelector('.flight-progress'); if(bar) bar.style.width=pct+'%';
      const plane=document.querySelector('.absolute.transition-all.duration-1000'); if(plane) plane.style.left=`calc(${pct}% - 20px)`;
    }
    if(state.timerSeconds<=0){clearInterval(state.timerInterval);await completeFlight();}
  },1000);
}

async function completeFlight() {
  const flight=state.activeFlight; if(!flight) return;
  try {
    const updated=await FocusFlight.update(flight.id,{status:'landed',landed_at:new Date().toISOString()});
    state.lastCompletedFlight={...flight,...updated};
    const idx=state.flights.findIndex(f=>f.id===flight.id);
    if(idx>=0) state.flights[idx]=state.lastCompletedFlight;
    const old=state.userStats;
    const newMiles=(old?.total_miles||0)+flight.miles_earned;
    const newFlights=(old?.total_flights||0)+1;
    const newMins=(old?.total_focus_minutes||0)+flight.duration_minutes;
    const today=new Date().toDateString(), last=old?.last_flight_date?new Date(old.last_flight_date).toDateString():null, yest=new Date(Date.now()-86400000).toDateString();
    let streak=old?.streak_days||0;
    if(last===today){}else if(last===yest){streak++;}else{streak=1;}
    const existing=old?.badges||[];
    const tempStats={total_miles:newMiles,total_flights:newFlights,streak_days:streak};
    const newBadges=checkNewBadges(tempStats,state.flights,existing);
    const allBadges=[...existing,...newBadges.map(b=>b.id)];
    const update={total_miles:newMiles,total_flights:newFlights,total_focus_minutes:newMins,streak_days:streak,last_flight_date:new Date().toISOString(),badges:allBadges};
    if(old){state.userStats={...old,...await UserStats.update(old.id,update)};}
    else{state.userStats=await UserStats.create({...update,home_airport_iata:'',home_airport_name:''});}
    state.newBadges=newBadges; state.activeFlight=null; state.page='landing'; render();
  } catch(e){console.error(e);}
}

window.confirmAbort=()=>{ if(confirm('Abort flight?')) abortFlight(); };
async function abortFlight(){
  const f=state.activeFlight; clearInterval(state.timerInterval);
  if(f){try{await FocusFlight.update(f.id,{status:'aborted'});}catch(e){}
    const i=state.flights.findIndex(x=>x.id===f.id); if(i>=0) state.flights[i].status='aborted';}
  state.activeFlight=null; state.page='home'; render();
}

window.saveNotesAndGoHome=async()=>{
  const notes=document.getElementById('flightNotes')?.value;
  if(notes&&state.lastCompletedFlight) try{await FocusFlight.update(state.lastCompletedFlight.id,{notes});}catch(e){}
  state.newBadges=[]; state.page='home'; render();
};
window.bookAnother=()=>{ state.booking={origin:state.booking.origin,destination:null,seatClass:'Study',tags:[],customMinutes:null}; state.newBadges=[]; state.page='book'; render(); };

function attachListeners(){
  const o=document.getElementById('originSelect'), d=document.getElementById('destSelect'), s=document.getElementById('durationSlider');
  if(o) o.addEventListener('change',()=>{ state.booking.origin=state.airports.find(a=>a.iata_code===o.value)||null; state.booking.customMinutes=null; render(); });
  if(d) d.addEventListener('change',()=>{ state.booking.destination=state.airports.find(a=>a.iata_code===d.value)||null; state.booking.customMinutes=null; render(); });
  if(s) s.addEventListener('input',()=>{ state.booking.customMinutes=parseInt(s.value); const l=document.getElementById('durationLabel'); if(l) l.textContent=minutesToLabel(parseInt(s.value)); });
  const t=document.getElementById('tagInput'); if(t) t.addEventListener('keydown',e=>{ if(e.key==='Enter') window.addTag(); });
}

function relDate(iso){
  if(!iso) return '';
  const d=new Date(iso), diff=Math.floor((new Date()-d)/86400000);
  if(diff===0) return 'Today'; if(diff===1) return 'Yesterday'; if(diff<7) return `${diff}d ago`;
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

init();
