import * as React from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import { Text } from "@react-three/drei";

interface AlignmentLineVisualizationProps {
  visible: boolean;
  targetDepth: number;
  onConfirm: () => void;
  instruction: string;
  onHitPointUpdate?: (hitPoint: THREE.Vector3 | null) => void;
}

export function AlignmentLineVisualization({
  visible,
  targetDepth,
  onConfirm: _onConfirm,
  instruction,
  onHitPointUpdate,
}: AlignmentLineVisualizationProps) {
  const lineGroupRef = React.useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const [_currentDepth, setCurrentDepth] = React.useState(targetDepth);
  const [_hitPoint, setHitPoint] = React.useState<THREE.Vector3 | null>(null);
  const hitTestSourceRef = React.useRef<XRHitTestSource | null>(null);
  const viewerSpaceRef = React.useRef<XRReferenceSpace | null>(null);
  const xr = useXR();

  // Initialize AR hit test source
  React.useEffect(() => {
    if (!visible || !xr.session) {
      if (hitTestSourceRef.current) {
        hitTestSourceRef.current.cancel();
        hitTestSourceRef.current = null;
      }
      viewerSpaceRef.current = null;
      return;
    }

    const initializeHitTest = async () => {
      try {
        const session = xr.session;
        if (session && (session as any).mode === 'immersive-ar') {
          viewerSpaceRef.current = await (session as any).requestReferenceSpace('viewer');
          hitTestSourceRef.current = await (session as any).requestHitTestSource({ 
            space: viewerSpaceRef.current 
          });
        }
      } catch (err) {
        console.warn('Failed to initialize AR hit test:', err);
      }
    };

    initializeHitTest();

    return () => {
      if (hitTestSourceRef.current) {
        hitTestSourceRef.current.cancel();
        hitTestSourceRef.current = null;
      }
      viewerSpaceRef.current = null;
    };
  }, [visible, xr.session]);

  useFrame((_state, _delta, frame?: XRFrame) => {
    if (!visible || !lineGroupRef.current) return;

    const cameraPosition = new THREE.Vector3();
    camera.getWorldPosition(cameraPosition);
    
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);

    let depth = targetDepth;
    let currentHitPoint: THREE.Vector3 | null = null;

    if (xr.session && frame && hitTestSourceRef.current && viewerSpaceRef.current && 
        (xr.session as any).mode === 'immersive-ar') {
      try {
        const hitTestResults = frame.getHitTestResults(hitTestSourceRef.current);
        
        if (hitTestResults && hitTestResults.length > 0) {
          const hit = hitTestResults[0];
          const referenceSpace = gl.xr.getReferenceSpace();
          const pose = referenceSpace ? hit.getPose(referenceSpace) : hit.getPose(viewerSpaceRef.current);
          
          if (pose) {
            const xrMatrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
            currentHitPoint = new THREE.Vector3().setFromMatrixPosition(xrMatrix);
            depth = cameraPosition.distanceTo(currentHitPoint);
            
            setHitPoint(currentHitPoint);
            setCurrentDepth(depth);
            onHitPointUpdate?.(currentHitPoint);
            
            lineGroupRef.current.position.copy(currentHitPoint);
            lineGroupRef.current.lookAt(cameraPosition);
            return;
          }
        }
      } catch (err) {
        console.warn('AR hit test error:', err);
      }
    }
    
    depth = targetDepth;
    const linePosition = cameraPosition.clone().addScaledVector(cameraDirection, depth);
    lineGroupRef.current.position.copy(linePosition);
    lineGroupRef.current.lookAt(cameraPosition);
  });

  if (!visible) return null;

  const lineLength = 0.5;
  const lineThickness = 0.02;

  return (
    <group ref={lineGroupRef}>
      {/* Horizontal line (top of corner) */}
      <mesh rotation={[0, 0, 0]}>
        <boxGeometry args={[lineLength, lineThickness, lineThickness]} />
        <meshStandardMaterial
          color="#4CAF50"
          emissive="#4CAF50"
          emissiveIntensity={0.8}
        />
      </mesh>

      {/* Vertical line (side of corner) */}
      <mesh position={[lineLength / 2, -lineLength / 2, 0]} rotation={[0, 0, Math.PI / 2]}>
        <boxGeometry args={[lineLength, lineThickness, lineThickness]} />
        <meshStandardMaterial
          color="#4CAF50"
          emissive="#4CAF50"
          emissiveIntensity={0.8}
        />
      </mesh>

      {/* Corner point indicator */}
      <mesh position={[lineLength / 2, 0, 0]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial
          color="#FFD700"
          emissive="#FFD700"
          emissiveIntensity={1.0}
        />
      </mesh>

      {/* Instruction text */}
      <Text
        position={[0, 0.3, 0]}
        fontSize={0.1}
        color="#FFFFFF"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {instruction}
      </Text>
    </group>
  );
}

