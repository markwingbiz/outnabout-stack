// lib/nearby.ts
// Pure helpers for the What's Around You page (whats-close.tsx).
// - Distances are computed on-device from the viewer's location and the
//   venue coordinates. Location is NEVER stored or sent anywhere.
// - Firestore/store.ts defaults missing coordinates to lat 0 / lng 0
//   (Null Island). hasCoords() treats exactly 0,0 as "no location" so
//   those venues never render as a marker off the coast of Africa.
// - buildMapHtml() is pure (string in → string out) so the map markup is
//   unit-testable without a WebView. Markers post `venue:<id>` back to
//   React Native via window.ReactNativeWebView.postMessage.

export const KC_FALLBACK = { lat: 39.0997, lng: -94.5786 }; // Downtown KC

export type LatLng = { lat: number; lng: number };

export function hasCoords(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false; // store.ts "no coords" sentinel
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

/** Great-circle distance in miles. */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(miles: number): string {
  if (!Number.isFinite(miles)) return "—";
  if (miles < 0.1) return `${Math.max(1, Math.round(miles * 5280))} ft`;
  return `${miles.toFixed(1)} mi`;
}

/** Find a venue's coordinates by Firestore id OR name (ids may be names). */
export function venueCoordFor(
  venueId: string,
  venues: Array<{ id: string; name: string; lat: number; lng: number }>
): LatLng | null {
  const v = venues.find((x) => x.id === venueId || x.name === venueId);
  if (!v || !hasCoords(v.lat, v.lng)) return null;
  return { lat: v.lat, lng: v.lng };
}

export type MapMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  subtitle: string; // e.g. "3 events" — shown in the popup
  badge?: string; // e.g. "Test" / "Sample" — shown in the popup
};

/**
 * Full Leaflet + OpenStreetMap page. Tiles need internet; the lists
 * below the map still work offline. Attribution is required by the
 * OpenStreetMap tile usage policy and stays in the corner.
 */
export function buildMapHtml(args: {
  center: LatLng;
  user: LatLng | null;
  markers: MapMarker[];
}): string {
  const payload = JSON.stringify({
    center: args.center,
    user: args.user,
    markers: args.markers,
  });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0;padding:0;background:#141021;}
.leaflet-popup-content-wrapper{background:#1d1642;color:#fff;border-radius:12px;}
.leaflet-popup-content{margin:12px 14px;font-family:-apple-system,system-ui,sans-serif;}
.leaflet-popup-tip{background:#1d1642;}
.popup-name{font-weight:800;font-size:14px;}
.popup-sub{opacity:.75;font-size:12px;margin-top:2px;}
.popup-badge{color:#f5c36a;font-weight:800;font-size:11px;margin-top:2px;}
.popup-btn{display:block;margin-top:8px;background:#6242bb;color:#fff;text-align:center;
padding:8px 10px;border-radius:999px;font-weight:800;font-size:12px;border:0;width:100%;}
</style></head><body><div id="map"></div><script>
var data = ${payload};
var map = L.map('map').setView([data.center.lat, data.center.lng], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
if (data.user) {
  L.circleMarker([data.user.lat, data.user.lng], { radius: 9, color: '#fff',
    weight: 2, fillColor: '#3b82f6', fillOpacity: 1 }).addTo(map)
    .bindPopup('You are here');
}
data.markers.forEach(function (m) {
  var badge = m.badge ? '<div class="popup-badge">' + m.badge + '</div>' : '';
  var html = '<div class="popup-name">' + m.name + '</div>'
    + '<div class="popup-sub">' + m.subtitle + '</div>' + badge
    + '<button class="popup-btn" onclick="sendVenue(\\'' + m.id + '\\')">See events</button>';
  L.marker([m.lat, m.lng]).addTo(map).bindPopup(html);
});
function sendVenue(id) {
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage('venue:' + id);
  }
}
</script></body></html>`;
}
