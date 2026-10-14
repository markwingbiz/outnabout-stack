// app/qr.tsx
// Legacy duplicate of the scanner. The canonical scanner is /scan
// (which validates codes against Firestore). This route redirects there
// so old links keep working without maintaining two scanner screens.
import { Redirect } from "expo-router";

export default function QRScreen() {
  return <Redirect href="/scan" />;
}
