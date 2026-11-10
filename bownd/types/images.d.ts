// Image asset module declarations (bundled card placeholder art).
import type { ImageSourcePropType } from "react-native";

declare module "*.jpg" {
  const value: ImageSourcePropType;
  export default value;
}
declare module "*.jpeg" {
  const value: ImageSourcePropType;
  export default value;
}
declare module "*.png" {
  const value: ImageSourcePropType;
  export default value;
}
declare module "*.gif" {
  const value: ImageSourcePropType;
  export default value;
}
declare module "*.webp" {
  const value: ImageSourcePropType;
  export default value;
}
