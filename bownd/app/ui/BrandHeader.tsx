import { View, Image, StyleSheet, Text } from "react-native";

export default function BrandHeader({ tagline }: { tagline?: string }) {
  return (
    <View style={styles.row}>
      <Image
        source={require("../../assets/branding/logo-wordmark.png")}
        resizeMode="contain"
        style={styles.logo}
      />
      {tagline ? <Text style={styles.tagline}>{tagline}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  logo: {
    height: 28,
    width: 160,
    opacity: 0.9,
  },
  tagline: {
    marginTop: 6,
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
});
