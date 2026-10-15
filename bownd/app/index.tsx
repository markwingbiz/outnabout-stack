import React from "react";
import { Redirect } from "expo-router";

export default function Index() {
  // Send app root "/" into the tab navigator
  return <Redirect href="/(tabs)" />;
}
