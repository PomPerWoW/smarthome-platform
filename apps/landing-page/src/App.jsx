import { Suspense, useState } from "react";
import { Canvas } from '@react-three/fiber'
import { Sky, Bvh } from '@react-three/drei'
import { Selection } from '@react-three/postprocessing'
import { Scene } from './components/Scene'
import { Effects } from './components/Effects'
import { Overlay } from './components/Overlay'
import { ThreeErrorBoundary } from "./components/ThreeErrorBoundary";

function App() {
  const [hoveredDevice, setHoveredDevice] = useState(null)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [threeError, setThreeError] = useState(null);

  const handleDeviceHover = (device) => {
    setHoveredDevice(device)
  }

  const handleMouseMove = (e) => {
    setMousePosition({ x: e.clientX, y: e.clientY })
  }

  return (
    <div onMouseMove={handleMouseMove} style={{ width: '100vw', height: '100vh' }}>
      <ThreeErrorBoundary
        onError={(err) => setThreeError(err)}
        fallback={<div className="three-fallback-bg" />}
      >
        <Canvas
          flat
          dpr={[1, 1.5]}
          gl={{ antialias: false }}
          camera={{ position: [-2, 1.5, 5], fov: 20, near: 0.1, far: 100 }}
          shadows
        >
          <Suspense fallback={null}>
            <ambientLight intensity={1} />
            <directionalLight
              position={[5, 5, 5]}
              intensity={1.5}
              castShadow
              shadow-mapSize={[2048, 2048]}
            />
            <pointLight position={[0, 3, 0]} intensity={0.8} />
            <pointLight position={[-3, 2, -2]} intensity={0.5} color="#ffd700" />
            <Sky sunPosition={[100, 20, 100]} />
            <Bvh firstHitOnly>
              <Selection>
                <Effects />
                <Scene onDeviceHover={handleDeviceHover} position={[0, 0, 0]} />
              </Selection>
            </Bvh>
          </Suspense>
        </Canvas>
      </ThreeErrorBoundary>

      <Overlay hoveredDevice={hoveredDevice} mousePosition={mousePosition} />

      {threeError && (
        <div className="three-error-banner" role="alert">
          <div className="three-error-banner__title">3D scene failed to load</div>
          <div className="three-error-banner__body">
            This usually happens when model assets weren’t downloaded (Git LFS).
            Run <code>git lfs install</code> then <code>git lfs pull</code>, and refresh.
          </div>
        </div>
      )}
    </div>
  )
}

export default App
