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
    if (device) {
      setHoveredDevice({
        name: Object.keys({
          'Smart Bulb': true,
          'Smart TV': true,
          'Air Conditioner': true,
          'Tower Fan': true
        }).find(key => 
          device.position.toString() === 
          ({
            'Smart Bulb': [0, 2.5, 0],
            'Smart TV': [-2, 1, -2],
            'Air Conditioner': [2.5, 1.5, -2],
            'Tower Fan': [-2.5, 0.5, 1]
          }[key]?.toString())
        ) || 'Device',
        ...device
      })
    } else {
      setHoveredDevice(null)
    }
  }

  return (
    <>
      <Canvas
        flat
        dpr={[1, 1.5]}
        gl={{ antialias: false }}
        camera={{ position: [0, 0, 0], fov: 45, near: 0.1, far: 100 }}
        shadows
      >
        {/* Lighting */}
        <ambientLight intensity={1} />
        <directionalLight 
          position={[5, 5, 5]} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize={[2048, 2048]}
        />
        <pointLight position={[0, 3, 0]} intensity={0.8} />
        <pointLight position={[-3, 2, -2]} intensity={0.5} color="#ffd700" />
        
        {/* Sky background */}
        <Sky sunPosition={[100, 20, 100]} />
        
        {/* BVH for performance optimization */}
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

      {/* UI Overlay */}
      <Overlay hoveredDevice={hoveredDevice} />
    </>
  )
}

export default App
