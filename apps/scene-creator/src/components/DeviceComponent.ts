import { Types, createComponent } from "@iwsdk/core";

export const DeviceComponent = createComponent("DeviceComponent", {
  deviceId: { type: Types.String, default: "" },
  deviceType: { type: Types.String, default: "" },
  isOn: { type: Types.Boolean, default: false },
  properties: { type: Types.String, default: "{}" },
});
