import { useState, useCallback } from 'react'
import { useGLTF, useEnvironment, Box, Sphere, Cylinder } from '@react-three/drei'
import { Select } from '@react-three/postprocessing'

// Smart device data
const devices = {
  'Smart Bulb': {
    type: 'Light',
    features: ['Voice Control', 'RGB Colors', 'Energy Efficient', 'App Control'],
    position: [0, 2.5, 0],
    color: '#ffd700'
  },
  'Smart TV': {
    type: 'Entertainment',
    features: ['4K Display', 'Streaming Apps', 'Voice Assistant', 'Screen Mirroring'],
    position: [-2, 1, -2],
    color: '#1a1a1a'
  },
  'Air Conditioner': {
    type: 'Climate',
    features: ['Auto Temperature', 'Energy Saving', 'Air Purifier', 'Sleep Mode'],
    position: [2.5, 1.5, -2],
    color: '#e0e0e0'
  },
  'Tower Fan': {
    type: 'Climate',
    features: ['Oscillation', 'Timer', 'Remote Control', 'Quiet Mode'],
    position: [-2.5, 0.5, 1],
    color: '#4a90e2'
  }
}

// Dining Room Model component
function DiningRoomModel() {
  const { nodes, materials } = useGLTF('/models/cozy_modern_living_room/scene.gltf')
  
  return (
    <group dispose={null}>
      {Object.keys(nodes).map((key) => {
        const node = nodes[key]
        if (node.isMesh) {
          return (
            <mesh
              key={key}
              geometry={node.geometry}
              material={node.material}
              position={node.position}
              rotation={node.rotation}
              scale={node.scale}
              castShadow
              receiveShadow
            />
          )
        }
        return null
      })}
    </group>
  )
}

// Smart Bulb component
function SmartBulb({ position, isHovered }) {
  return (
    <group position={position}>
      {/* Bulb */}
      <Sphere args={[0.15, 32, 32]} position={[0, 0, 0]} castShadow>
        <meshStandardMaterial 
          color={isHovered ? '#ffff00' : '#ffd700'} 
          emissive={isHovered ? '#ffff00' : '#ffd700'}
          emissiveIntensity={isHovered ? 1 : 0.5}
        />
      </Sphere>
      {/* Base */}
      <Cylinder args={[0.08, 0.08, 0.1, 16]} position={[0, -0.15, 0]} castShadow>
        <meshStandardMaterial color="#888" />
      </Cylinder>
      {/* Cord */}
      <Cylinder args={[0.02, 0.02, 2, 8]} position={[0, 1, 0]} castShadow>
        <meshStandardMaterial color="#333" />
      </Cylinder>
    </group>
  )
}

// Smart TV component
function SmartTV({ position, isHovered }) {
  return (
    <group position={position}>
      {/* Screen */}
      <Box args={[1.5, 0.9, 0.05]} castShadow>
        <meshStandardMaterial 
          color={isHovered ? '#2a2a2a' : '#1a1a1a'}
          emissive={isHovered ? '#4a4a4a' : '#000000'}
          emissiveIntensity={0.3}
        />
      </Box>
      {/* Stand */}
      <Box args={[0.3, 0.1, 0.2]} position={[0, -0.5, 0]} castShadow>
        <meshStandardMaterial color="#333" />
      </Box>
    </group>
  )
}

// Air Conditioner component
function AirConditioner({ position, isHovered }) {
  return (
    <group position={position}>
      {/* Main unit */}
      <Box args={[0.8, 0.3, 0.2]} castShadow>
        <meshStandardMaterial 
          color={isHovered ? '#f0f0f0' : '#e0e0e0'}
          metalness={0.3}
          roughness={0.4}
        />
      </Box>
      {/* Vents */}
      <Box args={[0.7, 0.05, 0.15]} position={[0, -0.15, 0.05]} castShadow>
        <meshStandardMaterial color="#999" />
      </Box>
    </group>
  )
}

// Tower Fan component
function TowerFan({ position, isHovered }) {
  return (
    <group position={position}>
      {/* Tower body */}
      <Cylinder args={[0.15, 0.15, 1, 16]} castShadow>
        <meshStandardMaterial 
          color={isHovered ? '#5aa0f2' : '#4a90e2'}
          metalness={0.5}
          roughness={0.3}
        />
      </Cylinder>
      {/* Base */}
      <Cylinder args={[0.2, 0.2, 0.1, 16]} position={[0, -0.55, 0]} castShadow>
        <meshStandardMaterial color="#333" />
      </Cylinder>
    </group>
  )
}

// Main Scene component
export function Scene({ onDeviceHover, ...props }) {
  const [hovered, setHovered] = useState(null)
  const env = useEnvironment({ preset: 'city' })

  const handleHover = useCallback((deviceName) => {
    setHovered(deviceName)
    onDeviceHover(deviceName ? devices[deviceName] : null)
  }, [onDeviceHover])

  return (
    <group {...props}>
      <DiningRoomModel />
      
      {/* Smart Bulb */}
      <Select 
        enabled={hovered === 'Smart Bulb'}
        onPointerOver={(e) => { e.stopPropagation(); handleHover('Smart Bulb') }}
        onPointerOut={() => handleHover(null)}
      >
        <SmartBulb position={devices['Smart Bulb'].position} isHovered={hovered === 'Smart Bulb'} />
      </Select>

      {/* Smart TV */}
      <Select 
        enabled={hovered === 'Smart TV'}
        onPointerOver={(e) => { e.stopPropagation(); handleHover('Smart TV') }}
        onPointerOut={() => handleHover(null)}
      >
        <SmartTV position={devices['Smart TV'].position} isHovered={hovered === 'Smart TV'} />
      </Select>

      {/* Air Conditioner */}
      <Select 
        enabled={hovered === 'Air Conditioner'}
        onPointerOver={(e) => { e.stopPropagation(); handleHover('Air Conditioner') }}
        onPointerOut={() => handleHover(null)}
      >
        <AirConditioner position={devices['Air Conditioner'].position} isHovered={hovered === 'Air Conditioner'} />
      </Select>

      {/* Tower Fan */}
      <Select 
        enabled={hovered === 'Tower Fan'}
        onPointerOver={(e) => { e.stopPropagation(); handleHover('Tower Fan') }}
        onPointerOut={() => handleHover(null)}
      >
        <TowerFan position={devices['Tower Fan'].position} isHovered={hovered === 'Tower Fan'} />
      </Select>
    </group>
  )
}

// Preload the model for better performance
useGLTF.preload('/models/cozy_modern_living_room/scene.gltf')

