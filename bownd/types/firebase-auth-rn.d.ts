// Firebase v12 ships React Native persistence in the RN build of
// firebase/auth (resolved by Metro via the `react-native` export
// condition), but the default TypeScript types are the browser build,
// which omits it. This augmentation declares it so `tsc` accepts the
// import; at runtime Metro resolves the real implementation.
export {}; // keep this file a module so `declare module` augments (not replaces)

declare module "firebase/auth" {
  export function getReactNativePersistence(storage: any): any;
}
