import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

type Venue = {
  id?: string;
  name: string;
};

type Props = {
  title: string;
  venues: Venue[];
};

export default function VenueAvatarsRow({ title, venues }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.chev}>›</Text>
      </View>

      <FlatList
        data={venues}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(v, i) => (v.id ? String(v.id) : `${v.name}-${i}`)}
        contentContainerStyle={{ gap: 12, paddingVertical: 6 }}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <View style={styles.circle} />
            <Text style={styles.label} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  title: { fontSize: 16, fontWeight: "800", color: "#2A2A2A" },
  chev: { fontSize: 22, fontWeight: "800", color: "rgba(0,0,0,0.25)" },
  item: { width: 70, alignItems: "center" },
  circle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.65)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
  },
  label: { marginTop: 6, fontSize: 11, color: "#333", maxWidth: 70 },
});
