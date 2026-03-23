import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { useXRStore } from "@react-three/xr";
interface ARSessionHandlerProps {
  arModeRequested: boolean;
  onARSessionReady?: () => void;
}

export function ARSessionHandler({ arModeRequested, onARSessionReady }: ARSessionHandlerProps) {
  const { gl } = useThree();
  const xrStore = useXRStore();
  const sessionRequestedRef = useRef(false);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (!arModeRequested) {
      sessionRequestedRef.current = false;
      isProcessingRef.current = false;
      return;
    }
    
    if (sessionRequestedRef.current || isProcessingRef.current) {
      return;
    }
    
    // Check if session is already AR
    const currentSession = xrStore.getState().session;
    if (currentSession && (currentSession as any).mode === 'immersive-ar') {
      sessionRequestedRef.current = true;
      return;
    }
    
    isProcessingRef.current = true;
    
    const requestARSession = async () => {
      try {
        if (!navigator.xr || !(navigator.xr as any).isSessionSupported) {
          console.warn('XR not available');
          isProcessingRef.current = false;
          return;
        }

        const isARSupported = await (navigator.xr as any).isSessionSupported('immersive-ar');
        if (!isARSupported) {
          console.warn('AR not supported');
          isProcessingRef.current = false;
          return;
        }

        // End current session if exists and is not AR
        if (currentSession && (currentSession as any).mode !== 'immersive-ar') {
          try {
            await currentSession.end();
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (err) {
            console.warn('Error ending previous session:', err);
          }
        }

        // Check if renderer is available
        if (!gl || !gl.xr) {
          console.warn('Renderer not ready, waiting...');
          let retries = 0;
          while ((!gl || !gl.xr) && retries < 10) {
            await new Promise(resolve => setTimeout(resolve, 200));
            retries++;
          }
          if (!gl || !gl.xr) {
            console.error('Renderer not available after waiting');
            isProcessingRef.current = false;
            return;
          }
        }

        // Request AR session
        const arSession = await (navigator.xr as any).requestSession('immersive-ar', {
          requiredFeatures: ['local-floor'],
          optionalFeatures: ['bounded-floor', 'hand-tracking', 'layers']
        });

        // Set the AR session on the renderer
        if (gl && gl.xr) {
          await gl.xr.setSession(arSession);
          xrStore.setState({ session: arSession });
          
          // Add session end listener
          arSession.addEventListener('end', () => {
            xrStore.setState({ session: undefined });
            sessionRequestedRef.current = false;
            isProcessingRef.current = false;
          });
          
          sessionRequestedRef.current = true;
          isProcessingRef.current = false;
          onARSessionReady?.();
        } else {
          console.error('Renderer or XR manager not available');
          await arSession.end();
          isProcessingRef.current = false;
        }
      } catch (err) {
        console.error('Failed to start AR session:', err);
        sessionRequestedRef.current = false;
        isProcessingRef.current = false;
      }
    };

    const timer = setTimeout(() => {
      requestARSession();
    }, 200);

    return () => {
      clearTimeout(timer);
      isProcessingRef.current = false;
    };
  }, [arModeRequested, gl, xrStore, onARSessionReady]);

  useEffect(() => {
    if (!arModeRequested) {
      sessionRequestedRef.current = false;
    }
  }, [arModeRequested]);

  return null;
}

