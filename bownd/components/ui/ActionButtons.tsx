import { View, Text, Pressable, StyleSheet } from "react-native";

export default function ActionButtons() {
  return (
    <View style={styles.container}>
      <Pressable style={styles.button}>
        <Text style={styles.text}>Eat</Text>
      </Pressable>

      <Pressable style={styles.button}>
        <Text style={styles.text}>Drink</Text>
      </Pressable>

      <Pressable style={styles.button}>
        <Text style={styles.text}>Explore</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
  },
  button: {
    width: 104,
    height: 104,
    borderRadius: 18,
    backgroundColor: "#1f1f1f",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
