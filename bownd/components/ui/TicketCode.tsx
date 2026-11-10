// bownd/components/ui/TicketCode.tsx
// REUSABLE ticket code — ready for future ticketing. Renders a REAL QR
// code + REAL Code 128 barcode for a ticket id. The QR carries the
// bownd://ticket/<ticketId> deep link; the barcode carries the bare
// ticket id.
//
// NOT MOUNTED anywhere yet: ticketing is not built. Mount this ONLY with
// a real purchased ticket id. NEVER mount it with a fake/example id, and
// never render a ticket that was not actually issued. With no ticket id
// it renders nothing.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { Barcode } from "./Barcode";

type Props = {
  ticketId?: string | null;
  size?: number;
};

export function TicketCode({ ticketId, size = 180 }: Props) {
  const id = (ticketId ?? "").trim();
  if (!id) return null;
  const qrValue = `bownd://ticket/${id}`;
  return (
    <View style={styles.wrap}>
      <View style={styles.qrBox}>
        <QRCode value={qrValue} size={size} color="#111111" backgroundColor="#ffffff" />
      </View>
      <Barcode value={id} width={260} height={56} />
      <Text style={styles.ticketId} numberOfLines={1}>
        Ticket {id}
      </Text>
      <Text style={styles.note}>Show this code at the door for entry.</Text>
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
  ticketId: { fontSize: 12, fontWeight: "800", color: "#221c2a" },
  note: { fontSize: 12, color: "#514a5a", fontWeight: "700", textAlign: "center" },
});
