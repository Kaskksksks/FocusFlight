export const BADGES = [
  { id: 'first_flight', name: 'First Flight', emoji: '✈️', description: 'Complete your very first focus flight', condition: (stats) => stats.total_flights >= 1 },
  { id: 'frequent_flyer', name: 'Frequent Flyer', emoji: '🎫', description: 'Complete 10 focus flights', condition: (stats) => stats.total_flights >= 10 },
  { id: 'airline_elite', name: 'Airline Elite', emoji: '💎', description: 'Complete 50 focus flights', condition: (stats) => stats.total_flights >= 50 },
  { id: 'first_class', name: 'First Class', emoji: '🥂', description: 'Complete a 90-minute or longer flight', condition: (_, flights) => flights.some(f => f.duration_minutes >= 90 && f.status === 'landed') },
  { id: 'globe_trotter', name: 'Globe Trotter', emoji: '🌍', description: 'Fly to 5 different destinations', condition: (_, flights) => new Set(flights.filter(f => f.status === 'landed').map(f => f.destination_iata)).size >= 5 },
  { id: 'mile_high', name: 'Mile High Club', emoji: '🏔️', description: 'Earn 10,000 flight miles', condition: (stats) => stats.total_miles >= 10000 },
  { id: 'around_the_world', name: 'Around the World', emoji: '🌐', description: 'Earn 100,000 flight miles', condition: (stats) => stats.total_miles >= 100000 },
  { id: 'deep_focus', name: 'Deep Focus', emoji: '🧠', description: 'Accumulate 24 total hours of focus time', condition: (stats) => stats.total_focus_minutes >= 1440 },
  { id: 'streak_3', name: 'Hat Trick', emoji: '🔥', description: '3-day focus streak', condition: (stats) => stats.streak_days >= 3 },
  { id: 'streak_7', name: 'Weekly Warrior', emoji: '🗓️', description: '7-day focus streak', condition: (stats) => stats.streak_days >= 7 },
  { id: 'streak_30', name: 'Iron Discipline', emoji: '🏅', description: '30-day focus streak', condition: (stats) => stats.streak_days >= 30 },
  { id: 'night_owl', name: 'Night Owl', emoji: '🦉', description: 'Complete a flight after midnight', condition: (_, flights) => flights.some(f => { if (f.status !== 'landed') return false; const h = new Date(f.started_at).getHours(); return h >= 0 && h < 4; }) },
  { id: 'early_bird', name: 'Early Bird', emoji: '🐦', description: 'Complete a flight before 7am', condition: (_, flights) => flights.some(f => { if (f.status !== 'landed') return false; const h = new Date(f.started_at).getHours(); return h >= 4 && h < 7; }) },
  { id: 'intercontinental', name: 'Intercontinental', emoji: '🗺️', description: 'Complete an ultra-long-haul flight (120 min)', condition: (_, flights) => flights.some(f => f.duration_minutes >= 120 && f.status === 'landed') },
];

export function checkNewBadges(stats, flights, existingBadgeIds) {
  return BADGES.filter(
    b => !existingBadgeIds.includes(b.id) && b.condition(stats, flights)
  );
}
