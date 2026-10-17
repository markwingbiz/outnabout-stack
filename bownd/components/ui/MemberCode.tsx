// bownd/components/ui/MemberCode.tsx
// The signed-in member's REAL code: a QR code plus a Code 128 barcode,
// both derived from the member's Firebase UID. The QR carries the
// bownd://member/<uid> deep link; the barcode carries the bare UID (the
// key a venue scanner resolves against the member's profile).
// Guests see an honest sign-in prompt — never a code for someone who
// is not signed in, never a hardcoded example code.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { Barcode } from "./Barcode";

type Props = {
  uid?: string | null;
  size?: number;
};

export function MemberCode({ uid, size = 160 }: Props) {
  if (!uid) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Sign in to see your member code.</Text>
      </View>
    );
  }
  const qrValue = `bownd://member/${uid}`;
  return (
    <View style={styles.wrap}>
      <View style={styles.qrBox}>
        <QRCode value={qrValue} size={size} color="#111111" backgroundColor="#ffffff" />
      </View>
      <Barcode value={uid} width={260} height={56} />
      <Text style={styles.memberId} numberOfLines={1}>
        Member ID {uid}
      </Text>
      <Text style={styles.note}>Show this code at a venue to identify your Bownd account.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: 12 },
  qrBox: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  memberId: { fontSize: 12, fontWeight: "800", color: "#221c2a" },
  note: { fontSize: 12, color: "#514a5a", fontWeight: "700", textAlign: "center" },
  empty: { paddingVertical: 12, alignItems: "center" },
  emptyText: { fontSize: 13, color: "#514a5a", fontWeight: "700", textAlign: "center" },
});
