import React from "react";
import { Modal, View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  visible: boolean;
  onClose: () => void;
  item: any | null;
};

export function EventDetailsModal({ visible, onClose, item }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <LinearGradient
            colors={["rgba(255,255,255,0.10)", "rgba(0,0,0,0.10)"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.h1}>{String(item?.title ?? "Event")}</Text>
          <Text style={styles.p}>{String(item?.venueId ?? "")}</Text>
          <Text style={styles.p}>{item?.startISO ? new Date(item.startISO).toLocaleString() : ""}</Text>

          <Pressable onPress={onClose} style={styles.btn}>
            <Text style={styles.btnText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  sheet: {
    width: "100%",
    borderRadius: 26,
    padding: 16,
    backgroundColor: "rgba(20, 10, 40, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(210,170,255,0.22)",
    overflow: "hidden",
  },
  h1: { color: "rgba(255,255,255,0.95)", fontWeight: "900", fontSize: 18 },
  p: { marginTop: 10, color: "rgba(255,255,255,0.75)", fontWeight: "700" },
  btn: {
    marginTop: 16,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(155, 90, 230, 0.26)",
    borderWidth: 1,
    borderColor: "rgba(210,170,255,0.35)",
  },
  btnText: { color: "rgba(255,255,255,0.95)", fontWeight: "900" },
});
