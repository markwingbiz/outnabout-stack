export type Venue = {
  id: string; // MUST match EventItem.venueId
  name: string;
  lat: number;
  lng: number;
};

export const VENUES: Venue[] = [
  { id: "Green Lady Lounge", name: "Green Lady Lounge", lat: 39.1039, lng: -94.5886 },
  { id: "Arvest Bank Theatre at The Midland", name: "Arvest Bank Theatre at The Midland", lat: 39.1017, lng: -94.5837 },

  // Common KC areas used in your generated events:
  { id: "City Market", name: "City Market", lat: 39.1106, lng: -94.5796 },
  { id: "Westport", name: "Westport", lat: 39.0526, lng: -94.5906 },
  { id: "Crossroads Arts District", name: "Crossroads Arts District", lat: 39.0912, lng: -94.5835 },
  { id: "Power & Light District", name: "Power & Light District", lat: 39.1024, lng: -94.5842 },
  { id: "Union Station", name: "Union Station", lat: 39.0859, lng: -94.5855 },
  { id: "The Plaza", name: "Country Club Plaza", lat: 39.0436, lng: -94.5923 },

  // The rest referenced by your first 20:
  { id: "Chicken N Pickle", name: "Chicken N Pickle", lat: 39.0317, lng: -94.6473 },
  { id: "The Ship", name: "The Ship", lat: 39.1120, lng: -94.5748 },
  { id: "ROKC Climbing Gym", name: "ROKC Climbing Gym", lat: 39.0547, lng: -94.5837 },
  { id: "Main Event Entertainment", name: "Main Event Entertainment", lat: 38.9533, lng: -94.6322 },
  { id: "Up-Down KC", name: "Up-Down KC", lat: 39.0570, lng: -94.5916 },
  { id: "Country Club Plaza", name: "Country Club Plaza", lat: 39.0436, lng: -94.5923 },
  { id: "Loose Park", name: "Loose Park", lat: 39.0368, lng: -94.5916 },
  { id: "The Comedy Club of Kansas City", name: "The Comedy Club of Kansas City", lat: 39.0335, lng: -94.5938 },
  { id: "The Nelson-Atkins Museum of Art", name: "The Nelson-Atkins Museum of Art", lat: 39.0450, lng: -94.5816 },
  { id: "Science City", name: "Science City", lat: 39.0859, lng: -94.5855 },
  { id: "Sporting KC Training Facility", name: "Sporting KC Training Facility", lat: 39.1217, lng: -94.8249 },
  { id: "Crown Center", name: "Crown Center", lat: 39.0836, lng: -94.5859 },
  { id: "CycleBar", name: "CycleBar", lat: 39.0405, lng: -94.5956 },
  { id: "Taste Buds Kitchen", name: "Taste Buds Kitchen", lat: 39.0997, lng: -94.5786 },
  { id: "YMCA", name: "YMCA", lat: 39.0539, lng: -94.5900 },
  { id: "Berkley Riverfront Park", name: "Berkley Riverfront Park", lat: 39.1153, lng: -94.5711 },
];
