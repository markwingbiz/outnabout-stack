import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { THEME } from "../../lib/theme";

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <Ionicons
      name={(focused ? name : `${name}-outline`) as any}
      size={24}
      color={focused ? THEME.purpleBright : THEME.textFaint}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#12101F",
          borderTopColor: "rgba(255,255,255,0.08)",
          borderTopWidth: 1,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarActiveTintColor: THEME.purpleBright,
        tabBarInactiveTintColor: THEME.textFaint,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="connections"
        options={{
          title: "Connections",
          tabBarIcon: ({ focused }) => <TabIcon name="people" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="dates"
        options={{
          title: "Dates",
          tabBarIcon: ({ focused }) => <TabIcon name="calendar" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: ({ focused }) => <TabIcon name="stats-chart" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ focused }) => <TabIcon name="settings" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="forge"
        options={{
          title: "Forge",
          tabBarIcon: ({ focused }) => <TabIcon name="flash" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="approvals"
        options={{
          title: "Approvals",
          tabBarIcon: ({ focused }) => <TabIcon name="checkmark-circle" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="funnels"
        options={{
          title: "Funnels",
          tabBarIcon: ({ focused }) => <TabIcon name="filter" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: "Jobs",
          tabBarIcon: ({ focused }) => <TabIcon name="list" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="workers"
        options={{
          title: "Workers",
          tabBarIcon: ({ focused }) => <TabIcon name="construct" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="deliverables"
        options={{
          title: "Deliverables",
          tabBarIcon: ({ focused }) => <TabIcon name="document-text" focused={focused} />,
        }}
      />
      {/* Funnel detail (Phase 8 Slice 3): reachable from the Funnels list,
          hidden from the tab bar. */}
      <Tabs.Screen name="funnel-detail" options={{ href: null }} />
    </Tabs>
  );
}
