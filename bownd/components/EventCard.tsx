import React from "react";
import { View, Text, StyleSheet, ImageBackground } from "react-native";

import { resolveEventCardImage } from "../lib/placeholders";

type Props = {
  event: any;
  venue?: any;
};

export default function EventCard({ event, venue }: Props) {
  const title = String(event?.title ?? "Event");
  const when = event?.startISO ? new Date(event.startISO).toLocaleString() : "";
  const venueName = String(venue?.name ?? event?.venueId ?? "");

  return (
    <View style={styles.card}>
      <ImageBackground
        source={resolveEventCardImage(event?.photoUrl)}
        style={styles.bg}
        resizeMode="cover"
      >
        <View style={styles.scrim}>
          <Text style={styles.title}>{title}</Text>
          {!!venueName && <Text style={styles.sub}>{venueName}</Text>}
          {!!when && <Text style={styles.meta}>{when}</Text>}
          {!!event?.priceLabel && <Text style={styles.meta}>{String(event.priceLabel)}</Text>}
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(210,170,255,0.22)",
  },
  bg: { flex: 1 },
  // Darkens the image so the title text stays readable.
  scrim: { flex: 1, padding: 14, backgroundColor: "rgba(8,5,18,0.42)" },
  title: { color: "rgba(255,255,255,0.95)", fontWeight: "900", fontSize: 16 },
  sub: { marginTop: 6, color: "rgba(255,255,255,0.75)", fontWeight: "800" },
  meta: { marginTop: 6, color: "rgba(255,255,255,0.65)", fontWeight: "700", fontSize: 12 },
});
