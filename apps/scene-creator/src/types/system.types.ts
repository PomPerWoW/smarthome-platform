import { Entity } from "@iwsdk/core";
import { BaseDevice } from "../entities";

export interface DeviceRecord {
  entity: Entity;
  device: BaseDevice;
}
