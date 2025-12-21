import { useState } from "react";
import { useGLTF } from "@react-three/drei";
import { Select } from "@react-three/postprocessing";

const devices = {
  "Ceiling Light": {
    type: "Lighting",
    features: ["Voice Control", "Dimmable", "Energy Efficient", "App Control"],
  },
  "Smart TV": {
    type: "Entertainment",
    features: [
      "4K Display",
      "Streaming Apps",
      "Voice Assistant",
      "Screen Mirroring",
    ],
  },
  "Table Lamp": {
    type: "Lighting",
    features: [
      "Touch Control",
      "Adjustable Brightness",
      "USB Charging",
      "Timer",
    ],
  },
  "Smart Sofa": {
    type: "Furniture",
    features: [
      "Built-in Speakers",
      "USB Ports",
      "Massage Function",
      "Reclining",
    ],
  },
};

export function Scene({ onDeviceHover, ...props }) {
  const { nodes, materials } = useGLTF(
    "/models/rooms/cozy_modern_living_room/scene.gltf",
  );
  const [hovered, setHovered] = useState(null);

  const over = (name) => (e) => {
    e.stopPropagation();
    setHovered(name);
    onDeviceHover({
      name: name,
      ...devices[name],
    });
  };

  const out = () => {
    setHovered(null);
    onDeviceHover(null);
  };

  return (
    <group {...props}>
      <group rotation={[-Math.PI / 2, 0, 0]} position={[2, 0, 0]}>
        <mesh
          geometry={nodes.Modern_Living_Room_Structure_Windows_0.geometry}
          material={materials.Structure_Windows}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_1.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_2.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_3.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_4.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_5.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_6.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_7.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_8.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_9.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_10.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_11.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_12.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_13.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_14.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_15.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_16.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_17.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_18.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_19.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_20.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_21.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_22.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_23.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_24.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_25.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_26.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Carpet_0_27.geometry}
          material={materials.Carpet}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_EndTable_0.geometry}
          material={materials.EndTable}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_CoffeeTable_0.geometry}
          material={materials.CoffeeTable}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Bowl_0.geometry}
          material={materials.Bowl}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Pot_0.geometry}
          material={materials.material}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_PlantBranch_0.geometry}
          material={materials.PlantBranch}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_PlantLeaves_0.geometry}
          material={materials.PlantLeaves}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Structure_0.geometry}
          material={materials.Structure}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_EndTable_Glass_0.geometry}
          material={materials.EndTable_Glass}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Backdrop_0.geometry}
          material={materials.Backdrop}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Shelf_0.geometry}
          material={materials.Shelf}
        />
        <mesh
          geometry={nodes.Modern_Living_Room_Painting_0.geometry}
          material={materials.Painting}
        />

        <Select
          enabled={hovered === "Ceiling Light"}
          onPointerOver={over("Ceiling Light")}
          onPointerOut={out}
        >
          <mesh
            geometry={nodes.Modern_Living_Room_Light_0.geometry}
            material={materials.Light}
            castShadow
            receiveShadow
          />
        </Select>

        <Select
          enabled={hovered === "Smart TV"}
          onPointerOver={over("Smart TV")}
          onPointerOut={out}
        >
          <mesh
            geometry={nodes.Modern_Living_Room_TV_0.geometry}
            material={materials.material_14}
            castShadow
            receiveShadow
          />
        </Select>

        <Select
          enabled={hovered === "Table Lamp"}
          onPointerOver={over("Table Lamp")}
          onPointerOut={out}
        >
          <mesh
            geometry={nodes.Modern_Living_Room_Lamp_0.geometry}
            material={materials.Lamp}
            castShadow
            receiveShadow
          />
        </Select>

        <Select
          enabled={hovered === "Smart Sofa"}
          onPointerOver={over("Smart Sofa")}
          onPointerOut={out}
        >
          <mesh
            geometry={nodes.Modern_Living_Room_Sofa_0.geometry}
            material={materials.Sofa}
            castShadow
            receiveShadow
          />
        </Select>
      </group>
    </group>
  );
}

useGLTF.preload("/models/rooms/cozy_modern_living_room/scene.gltf");
