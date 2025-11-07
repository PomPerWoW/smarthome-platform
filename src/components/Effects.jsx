import { easing } from 'maath'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, Outline, ToneMapping } from '@react-three/postprocessing'

export function Effects() {
  const { size } = useThree()
  
  // Smooth camera movement following mouse
  useFrame((state, delta) => {
    easing.damp3(
      state.camera.position,
      [
        state.pointer.x * 2,
        1.5 + state.pointer.y,
        6 + Math.atan(state.pointer.x)
      ],
      0.3,
      delta
    )
    state.camera.lookAt(0, 1, 0)
  })

  return (
    <EffectComposer stencilBuffer disableNormalPass autoClear={false} multisampling={4}>
      {/* Ambient Occlusion for depth */}
      <N8AO 
        halfRes 
        aoSamples={5} 
        aoRadius={0.4} 
        distanceFalloff={0.75} 
        intensity={1} 
      />
      {/* Outline effect for selected items */}
      <Outline 
        visibleEdgeColor="white" 
        hiddenEdgeColor="white" 
        blur 
        width={size.width * 1.25} 
        edgeStrength={10} 
      />
      {/* Tone mapping for realistic colors */}
      <ToneMapping />
    </EffectComposer>
  )
}

