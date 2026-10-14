import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import ColorBandCard from "./ColorBandCard";

export type EventItem = {
  id: string;
  title: string;
  venueId: string;
  startISO: string;
  category: "spotlight" | "featured" | "standard";
  vibeTags: string[];
  audienceTags: string[];
  priceLabel?: string;
};

type Props = {
  event: EventItem;
  venueName?: string;
  onPress?: () => void;
  variant?: "spotlight" | "featured";
};

export function EventCard({ event, venueName, onPress, variant = "featured" }: Props) {
  const dt = new Date(event.startISO);
  const time = dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <Pressable onPress={onPress} style={[styles.card, variant === "spotlight" ? styles.big : null]}>
      <ColorBandCard variant={variant} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {venueName ?? event.venueId} • {time}
          {event.priceLabel ? ` • ${event.priceLabel}` : ""}
        </Text>
        <View style={styles.tagRow}>
          {event.vibeTags.slice(0, 2).map((t) => (
            <View key={t} style={styles.tag}>
              <Text style={styles.tagText}>{t}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.65)",
  },
  big: { height: 190 },
  content: {
    padding: 14,
    justifyContent: "flex-end",
    flex: 1,
  },
  title: { fontSize: 18, fontWeight: "900", color: "#ffffff" },
  meta: { marginTop: 6, fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.92)" },
  tagRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  tagText: { color: "#fff", fontWeight: "800", fontSize: 11 },
});

