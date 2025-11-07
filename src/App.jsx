import { useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Sky, Bvh } from '@react-three/drei'
import { Selection } from '@react-three/postprocessing'
import { Scene } from './components/Scene'
import { Effects } from './components/Effects'
import { Overlay } from './components/Overlay'

function App() {
  const [hoveredDevice, setHoveredDevice] = useState(null)

  const handleDeviceHover = (device) => {
    setHoveredDevice(device)
  }

  return (
    <>
      <Canvas
        flat
        dpr={[1, 1.5]}
        gl={{ antialias: false }}
        camera={{ position: [-2, 1.5, 5], fov: 20, near: 0.1, far: 100 }}
        shadows
      >
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
            <Scene
              onDeviceHover={handleDeviceHover}
              position={[0, 0, 0]}
            />
          </Selection>
        </Bvh>
      </Canvas>

      <Overlay hoveredDevice={hoveredDevice} />
    </>
  )
}

export default App
