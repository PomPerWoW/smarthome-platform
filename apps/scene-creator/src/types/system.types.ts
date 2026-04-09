import { Entity } from "@iwsdk/core";
import { AnimationMixer, AnimationAction } from "three";
import { BaseDevice } from "../entities";

export interface DeviceRecord {
  entity: Entity;
  device: BaseDevice;
  panelEntity?: Entity;
  graphPanelEntity?: Entity;
  graphPanelVisible?: boolean;
  chartEntity?: Entity;
  activeChartType?: string;
  mixer?: AnimationMixer;
  actions?: AnimationAction[];
}
