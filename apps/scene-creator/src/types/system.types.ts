import { Entity, AnimationMixer, AnimationAction } from "@iwsdk/core";
import { BaseDevice } from "../entities";

export interface DeviceRecord {
  entity: Entity;
  device: BaseDevice;
  panelEntity?: Entity;
  graphPanelEntity?: Entity;
  graphPanelVisible?: boolean;
  mixer?: AnimationMixer;
  actions?: AnimationAction[];
}
