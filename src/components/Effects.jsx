import { easing } from 'maath'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, N8AO, Outline, ToneMapping } from '@react-three/postprocessing'

export function Effects() {
  const { size } = useThree()

  useFrame((state, delta) => {
    easing.damp3(
      state.camera.position,
      [
        -5,
        0.5 + state.pointer.y / 5,
        0 + state.pointer.x * 0.15
      ],
      0.3,
      delta
    )
    state.camera.lookAt(2, 0, 0)
  })

  return (
    <EffectComposer stencilBuffer disableNormalPass autoClear={false} multisampling={4}>
      <N8AO
        halfRes
        aoSamples={5}
        aoRadius={0.4}
        distanceFalloff={0.75}
        intensity={1}
      />
      <Outline
        visibleEdgeColor="white"
        hiddenEdgeColor="white"
        blur
        width={size.width * 1.25}
        edgeStrength={10}
      />
      <ToneMapping />
    </EffectComposer>
  )
}

