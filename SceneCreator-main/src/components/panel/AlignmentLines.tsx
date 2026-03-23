import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

interface AlignmentLinesProps {
  enabled: boolean;
  cornerPosition: THREE.Vector3 | null;
  onPositionUpdate?: (position: THREE.Vector3, depth: number) => void;
  lineLength?: number;
  lineColor?: string;
}

export function AlignmentLines({
  enabled,
  cornerPosition,
  onPositionUpdate,
  lineLength = 0.5,
  lineColor = "#00ff00",
}: AlignmentLinesProps) {
  const groupRef = React.useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);

  // Create corner lines geometry
  React.useEffect(() => {
    if (!groupRef.current) return;

    // Clear existing lines
    while (groupRef.current.children.length > 0) {
      groupRef.current.remove(groupRef.current.children[0]);
    }

    if (!enabled || !cornerPosition) return;

    // Create two perpendicular lines forming an L-shape (corner)
    const line1Geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(lineLength, 0, 0),
    ]);

    const line2Geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, lineLength),
    ]);

    const lineMaterial = new THREE.LineBasicMaterial({
      color: lineColor,
      linewidth: 3,
    });

    const line1 = new THREE.Line(line1Geometry, lineMaterial);
    const line2 = new THREE.Line(line2Geometry, lineMaterial);

    groupRef.current.add(line1);
    groupRef.current.add(line2);
  }, [enabled, cornerPosition, lineLength, lineColor]);

  useFrame(() => {
    if (!enabled || !cornerPosition || !groupRef.current) return;

    // Get camera position and direction
    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);

    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    // Calculate distance from camera to corner position
    const toCorner = new THREE.Vector3().subVectors(cornerPosition, cameraPosition);
    const distance = toCorner.length();

    // Project corner position onto camera's view plane
    // We want the lines to appear at the same depth as the real-world corner
    const depth = distance;
    
    // Position the lines at the corner position, but aligned with camera view
    groupRef.current.position.copy(cornerPosition);

    // Reset camera direction for next calculation
    camera.getWorldDirection(cameraDirection);
    
    // Align lines to be horizontal (along X) and forward (along Z) relative to camera
    const cameraRight = new THREE.Vector3();
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    
    const cameraForward = new THREE.Vector3();
    cameraForward.setFromMatrixColumn(camera.matrixWorld, 2).normalize();

    // Create a rotation that aligns with the camera's horizontal plane
    const up = new THREE.Vector3(0, 1, 0);
    groupRef.current.lookAt(
      groupRef.current.position.clone().add(up)
    );
    
    // Rotate to align with camera's forward/right directions
    const targetForward = cameraForward.clone();
    targetForward.y = 0;
    targetForward.normalize();
    
    if (targetForward.length() > 0.1) {
      const angle = Math.atan2(targetForward.x, targetForward.z);
      groupRef.current.rotation.y = angle;
    }

    // Update position callback
    onPositionUpdate?.(groupRef.current.position.clone(), depth);
  });

  if (!enabled) return null;

  return <group ref={groupRef} />;
}

