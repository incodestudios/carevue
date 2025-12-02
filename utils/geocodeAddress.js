import fetch from 'node-fetch';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

console.log('GOOGLE_MAPS_API_KEY:', GOOGLE_MAPS_API_KEY);

/**
 * Geocode an address string using Google Maps Geocoding API.
 * @param {string} address - Full address string
 * @returns {Promise<{lat: number, lng: number} | null>} - Returns lat/lng or null if not found
 */
export async function geocodeAddress(address) {
  if (!GOOGLE_MAPS_API_KEY) throw new Error('Missing GOOGLE_MAPS_API_KEY in environment');
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch geocoding results');
  const data = await res.json();
  if (data.status !== 'OK' || !data.results.length) return null;
  const loc = data.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng };
}
