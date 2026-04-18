// Haversine formula to calculate distance between two lat/lon points in miles
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Scale real-world flight distance to a focus duration in minutes
// Short: <500mi = 25min, Medium: 500-2500mi = 50min, Long: 2500-5500mi = 90min, Ultra: >5500mi = 120min
export function distanceToMinutes(miles) {
  if (miles < 500) return 25;
  if (miles < 1500) return 50;
  if (miles < 3000) return 75;
  if (miles < 5500) return 90;
  return 120;
}

export function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function minutesToLabel(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function getFlightClass(miles) {
  if (miles < 500) return 'Regional Hop';
  if (miles < 1500) return 'Short Haul';
  if (miles < 3000) return 'Medium Haul';
  if (miles < 5500) return 'Long Haul';
  return 'Ultra Long Haul';
}
