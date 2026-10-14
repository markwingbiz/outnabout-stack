export type LatLng = { latitude: number; longitude: number };

export function toRad(n: number) {
  return (n * Math.PI) / 180;
}

// Haversine distance (miles)
export function distanceMiles(a: LatLng, b: LatLng) {
  const R = 3958.8; // miles
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return 2 * R * Math.asin(Math.sqrt(h));
}
