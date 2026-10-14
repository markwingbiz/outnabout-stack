import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import QRCode from "react-native-qrcode-svg";

type Props = {
  value?: string;
  title?: string;
  subtitle?: string;
  size?: number;
  footerLabel?: string;

  /** If your scanner lives at /redeem, leave default. If you moved it, set "/scan" etc. */
  scannerRoute?: string;

  /** Optional secondary action (copy/share/etc) */
  secondaryLabel?: string;
  onPressSecondary?: () => void;
  hideSecondaryButton?: boolean;
  hideScannerButton?: boolean;
};

export default function PersonalQrPanel({
  value,
  title = "Your Personal QR",
  subtitle = "Show this at a venue to redeem your offer or check in.",
  size = 210,
  footerLabel = "Scan to verify",

  scannerRoute = "/redeem", // ✅ IMPORTANT: matches where your scanner lives
  secondaryLabel = "Copy Code",
  onPressSecondary,
  hideSecondaryButton = false,
  hideScannerButton = false,
}: Props) {
  const router = useRouter();
  const [pressedA, setPressedA] = useState(false);
  const [pressedB, setPressedB] = useState(false);

  const qrValue = useMemo(() => {
    return value?.trim() ? value.trim() : "vibekc://qr?code=demo";
  }, [value]);

  const displayCode = useMemo(() => {
    const v = qrValue;
    const chunk = v.split("=").pop() || v.split("/").pop() || v;
    return chunk.length > 18 ? chunk.slice(0, 18) + "…" : chunk;
  }, [qrValue]);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

        <View style={styles.qrFrame}>
          <View style={styles.qrInner}>
            <QRCode value={qrValue} size={size} />
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>{footerLabel}</Text>
          <Text style={styles.metaValue}>{displayCode}</Text>
        </View>

        <View style={styles.btnRow}>
          {!hideScannerButton && (
            <Pressable
              onPress={() => router.push(scannerRoute as any)}
              onPressIn={() => setPressedA(true)}
              onPressOut={() => setPressedA(false)}
              style={[styles.btn, styles.btnPrimary, pressedA && styles.btnPressed]}
            >
              <Text style={styles.btnText}>Open Camera Scanner</Text>
            </Pressable>
          )}

          {!hideSecondaryButton && (
            <Pressable
              onPress={onPressSecondary}
              onPressIn={() => setPressedB(true)}
              onPressOut={() => setPressedB(false)}
              style={[styles.btn, styles.btnSecondary, pressedB && styles.btnPressed]}
            >
              <Text style={styles.btnText}>{secondaryLabel}</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.note}>Tip: Turn up brightness for easier scanning.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", alignItems: "center" },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  title: { color: "white", fontSize: 18, fontWeight: "800" },
  subtitle: {
    marginTop: 6,
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    lineHeight: 18,
  },
  qrFrame: {
    marginTop: 12,
    borderRadius: 16,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.26)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  qrInner: {
    borderRadius: 12,
    padding: 10,
    backgroundColor: "white",
    ...(Platform.OS === "android" ? { overflow: "hidden" } : { overflow: "hidden" }),
  },
  metaRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "700" },
  metaValue: { color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: "800" },

  btnRow: { marginTop: 12, flexDirection: "row", gap: 10 },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  btnPrimary: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.24)",
  },
  btnSecondary: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  btnPressed: { transform: [{ scale: 0.99 }], opacity: 0.95 },
  btnText: { color: "white", fontSize: 13, fontWeight: "900" },

  note: { marginTop: 10, color: "rgba(255,255,255,0.55)", fontSize: 11 },
});
