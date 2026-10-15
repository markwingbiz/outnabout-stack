import React from "react";
import { View, Text, StyleSheet } from "react-native";

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
      <Text style={styles.title}>{title}</Text>
      {!!venueName && <Text style={styles.sub}>{venueName}</Text>}
      {!!when && <Text style={styles.meta}>{when}</Text>}
      {!!event?.priceLabel && <Text style={styles.meta}>{String(event.priceLabel)}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(210,170,255,0.22)",
  },
  title: { color: "rgba(255,255,255,0.95)", fontWeight: "900", fontSize: 16 },
  sub: { marginTop: 6, color: "rgba(255,255,255,0.75)", fontWeight: "800" },
  meta: { marginTop: 6, color: "rgba(255,255,255,0.65)", fontWeight: "700", fontSize: 12 },
});
