// app/personal.tsx
// Root-level "Personal" route. The top navigation in app/events.tsx
// (TopTabs) and app/(tabs)/events.tsx links to "/personal" — this file
// makes that route resolve by re-exporting the canonical Personal screen
// from the (tabs) group. Declared as <Stack.Screen name="personal" /> in
// app/_layout.tsx.
export { default } from "./(tabs)/personal";
