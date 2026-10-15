import { View, Text, Pressable, StyleSheet } from "react-native";
import { useState } from "react";

export default function TabsRow() {
  const [activeTab, setActiveTab] = useState("All");

  const tabs = ["All", "Nearby", "Popular"];

  return (
    <View style={styles.tabsContainer}>
      {tabs.map(tab => (
        <Pressable
          key={tab}
          onPress={() => setActiveTab(tab)}
          style={[
            styles.tab,
            activeTab === tab && styles.activeTab
          ]}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === tab && styles.activeTabText
            ]}
          >
            {tab}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    marginBottom: 18,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: "#1f1f1f",
  },
  activeTab: {
    backgroundColor: "#ffffff",
  },
  tabText: {
    color: "#9a9a9a",
    fontSize: 14,
    fontWeight: "500",
  },
  activeTabText: {
    color: "#000000",
    fontWeight: "600",
  },
});
