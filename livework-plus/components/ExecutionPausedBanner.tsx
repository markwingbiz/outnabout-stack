// "Execution paused" banner (Phase 8 Slice 4, audit §1 / design Phase B item 1).
//
// The LLM provider is not configured (Phase B not built; provider/model is
// still an open Mark decision), so jobs can be planned and approved but
// NOT executed. The UI must say so instead of showing fake progress.
// This banner is a static truthful statement, not a live provider check:
// it is removed when Phase B lands, together with the comment below.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { THEME } from "../lib/theme";

export default function ExecutionPausedBanner() {
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>
        Execution paused: provider not configured — jobs can be planned and approved, but nothing
        executes until the LLM provider is set up (Phase B).
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "rgba(255,170,0,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,170,0,0.45)",
    borderRadius: 12,
    padding: 12,
  },
  bannerText: { color: "#FFC76B", fontSize: 13, lineHeight: 18, fontWeight: "700" },
});
