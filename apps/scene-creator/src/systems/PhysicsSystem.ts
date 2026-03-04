import { createSystem } from "@iwsdk/core";
import { Vector3, Scene, LineSegments, BufferGeometry, LineBasicMaterial, Float32BufferAttribute } from "three";

// We'll import the type for type-safety, but load the module async
import type { World, RigidBody, Collider, DebugRenderBuffers } from "@dimforge/rapier3d";

export class PhysicsSystem extends createSystem({}) {
  public physicsWorld: World | null = null;
  public RAPIER: typeof import("@dimforge/rapier3d") | null = null;

  private debugMesh: LineSegments | null = null;
  private debugEnabled = false;

  async init() {
    console.log("[PhysicsSystem] Initializing Rapier...");
    try {
      // Dynamic import to handle WASM loading gracefully
      const RAPIER = await import("@dimforge/rapier3d");

      // Initialize if required (older versions needed explicit init(), newer ones might not)
      // but safe to do purely via import side-effects in some setups. 
      // Checking if 'init' export exists just in case using the compat layer or specific bind
      if ('init' in RAPIER && typeof RAPIER.init === 'function') {
        await (RAPIER as any).init();
      }

      this.RAPIER = RAPIER;

      const gravity = { x: 0.0, y: -9.81, z: 0.0 };
      this.physicsWorld = new RAPIER.World(gravity);

      console.log("[PhysicsSystem] Physics world created");

      // Setup debug rendering if needed
      // this.enableDebugRendering(); 
    } catch (err) {
      console.error("[PhysicsSystem] Failed to initialize Rapier:", err);
    }
  }

  update(dt: number) {
    if (!this.physicsWorld) return;

    // Step the physics world with error handling
    try {
      this.physicsWorld.step();
    } catch (e) {
      console.error("[PhysicsSystem] Rapier step error:", e);
      // Recreate physics world on crash to prevent hang
      try {
        const gravity = { x: 0.0, y: -9.81, z: 0.0 };
        this.physicsWorld = new this.RAPIER!.World(gravity);
        console.warn("[PhysicsSystem] Physics world recreated after crash");
      } catch (e2) {
        console.error("[PhysicsSystem] Could not recover:", e2);
        this.physicsWorld = null;
      }
      return;
    }

    // Update debug mesh if enabled
    if (this.debugEnabled && this.debugMesh && this.physicsWorld.debugRender) {
      const buffers = this.physicsWorld.debugRender();

      this.debugMesh.geometry.setAttribute(
        'position',
        new Float32BufferAttribute(buffers.vertices, 3)
      );
      this.debugMesh.geometry.setAttribute(
        'color',
        new Float32BufferAttribute(buffers.colors, 4)
      );
    }
  }

  enableDebugRendering() {
    if (!this.physicsWorld) return;
    this.debugEnabled = true;

    const material = new LineBasicMaterial({ vertexColors: true, color: 0xffffff });
    const geometry = new BufferGeometry();

    this.debugMesh = new LineSegments(geometry, material);
    this.debugMesh.name = "physics-debug-render";
    this.world.scene.add(this.debugMesh as any);
  }
}
