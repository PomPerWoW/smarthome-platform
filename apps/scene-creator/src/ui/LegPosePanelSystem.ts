import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  UIKit,
} from "@iwsdk/core";

import { latestLegPoseSnapshot } from "../utils/legPoseLogger";

export class LegPosePanelSystem extends createSystem({
  legPosePanels: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/legpose-logger.json")],
  },
}) {
  private textElement: UIKit.Text | null = null;

  init() {
    this.queries.legPosePanels.subscribe("qualify", (entity) => {
      const document = PanelDocument.data.document[
        entity.index
      ] as UIKitDocument;
      if (!document) return;

      const text = document.getElementById("legpose-text") as UIKit.Text;
      if (!text) return;

      this.textElement = text;
      this.updateText();
    });
  }

  private updateText() {
    if (!this.textElement) return;

    const snap = latestLegPoseSnapshot;
    if (!snap) {
      this.textElement.setProperties({ text: "L(-)  R(-)" });
      return;
    }

    const format = (side: typeof snap.left) => {
      if (!side) return "-";
      const { x, y, z } = side.position;
      return `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
    };

    const leftStr = format(snap.left);
    const rightStr = format(snap.right);

    this.textElement.setProperties({
      text: `L(${leftStr})  R(${rightStr})`,
    });
  }

  update(_dt: number): void {
    this.updateText();
  }
}

