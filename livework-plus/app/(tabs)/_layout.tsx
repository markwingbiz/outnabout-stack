import React, { useCallback, useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { THEME } from "../../lib/theme";
import { supabase } from "../../lib/supabase";
import { POLL_INTERVAL_MS, usePolling } from "../../lib/forge";

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
  // Pending-approval badge on the Approvals tab (Phase 8 Slice 4, §12).
  // Count query only; a failed count leaves the badge unchanged.
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    if (!supabase) return;
    const { count, error } = await supabase
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (!error && typeof count === "number") setPendingCount(count);
  }, []);

  useEffect(() => {
    void refreshPendingCount();
  }, [refreshPendingCount]);

  usePolling(() => void refreshPendingCount(), POLL_INTERVAL_MS);

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
      {/* Phase 8 Slice 5: Connections is the relationship-maintenance side
          (check-ins + gift ideas + little things she says). Same route,
          repurposed content. */}
      <Tabs.Screen
        name="connections"
        options={{
          title: "Connection",
          tabBarIcon: ({ focused }) => <TabIcon name="heart" focused={focused} />,
        }}
      />
      {/* Phase 8 Slice 5: Dates is the date-planning side (out + thoughtful
          dates, alternating every other week). Same route, repurposed content. */}
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
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
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
      <Tabs.Screen
        name="audit-log"
        options={{
          title: "Audit Log",
          tabBarIcon: ({ focused }) => <TabIcon name="shield-check" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="bownd"
        options={{
          title: "Bownd",
          tabBarIcon: ({ focused }) => <TabIcon name="storefront" focused={focused} />,
        }}
      />
      {/* Phase 8 Slice 5: Forge Suggestions (revenue / internet-scan /
          data-scan), operator-gated. */}
      <Tabs.Screen
        name="suggestions"
        options={{
          title: "Suggestions",
          tabBarIcon: ({ focused }) => <TabIcon name="bulb" focused={focused} />,
        }}
      />
      {/* Funnel detail (Phase 8 Slice 3): reachable from the Funnels list,
          hidden from the tab bar. */}
      <Tabs.Screen name="funnel-detail" options={{ href: null }} />
      {/* Slice 4 detail screens: reachable from their list screens,
          hidden from the tab bar. */}
      <Tabs.Screen name="thread-detail" options={{ href: null }} />
      <Tabs.Screen name="job-detail" options={{ href: null }} />
      <Tabs.Screen name="approval-detail" options={{ href: null }} />
    </Tabs>
  );
}
