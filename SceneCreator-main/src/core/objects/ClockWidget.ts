import * as THREE from 'three';
import { FurnitureItem } from './FurnitureItem';
import { FurnitureMetadata } from './FurnitureItem';

export class ClockWidget extends FurnitureItem {
  private timeTexture: THREE.CanvasTexture | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private lastRenderedTime = "";

  constructor(
    id: string,
    name: string,
    initialTransform?: { position?: [number, number, number]; rotation?: [number, number, number]; scale?: number },
  ) {
    const metadata: FurnitureMetadata = {
      category: 'widgets',
      type: 'Clock',
      description: 'Digital clock showing real-world time',
      wallMountable: true,
    };
    super(
      id,
      name,
      -1,
      null,
      metadata,
      initialTransform,
      'Clock',
      '',
    );
  }

  override async loadModel(_scene: THREE.Scene): Promise<void> {
    this.modelGroup.clear();
    const width = 512;
    const height = 256;
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.timeTexture = new THREE.CanvasTexture(this.canvas);
    this.timeTexture.minFilter = THREE.LinearFilter;
    this.timeTexture.magFilter = THREE.LinearFilter;
    this.timeTexture.anisotropy = 16;

    // Digital display frame
    const frameWidth = 0.5;
    const frameHeight = 0.25;
    const frameDepth = 0.03;

    const frameGeo = new THREE.BoxGeometry(frameWidth + 0.04, frameHeight + 0.04, frameDepth);
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.6,
      metalness: 0.2,
    });
    const frame = new THREE.Mesh(frameGeo, frameMaterial);
    frame.position.z = -frameDepth / 2;
    this.modelGroup.add(frame);

    // Display screen
    const screenGeo = new THREE.PlaneGeometry(frameWidth, frameHeight);
    const screenMaterial = new THREE.MeshBasicMaterial({
      map: this.timeTexture,
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const screen = new THREE.Mesh(screenGeo, screenMaterial);
    screen.position.z = 0.01;
    this.modelGroup.add(screen);

    this.renderTime();

    frameGeo.computeBoundingBox();
    const minY = frameGeo.boundingBox!.min.y;
    this.modelGroup.position.y = -minY;
  }

  private formatTime(): string {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const h = hours % 12 || 12;
    const m = minutes.toString().padStart(2, '0');
    const s = seconds.toString().padStart(2, '0');
    const ampm = hours < 12 ? 'AM' : 'PM';
    return `${h}:${m}:${s} ${ampm}`;
  }

  private renderTime(): void {
    if (!this.ctx || !this.canvas || !this.timeTexture) return;

    const timeStr = this.formatTime();
    if (timeStr === this.lastRenderedTime) return;
    this.lastRenderedTime = timeStr;

    const { width, height } = this.canvas;

    this.ctx.fillStyle = '#0a0a0f';
    this.ctx.fillRect(0, 0, width, height);

    this.ctx.font = 'bold 72px "Courier New", monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    const x = width / 2;
    const y = height / 2;

    this.ctx.strokeStyle = '#000000';
    this.ctx.lineWidth = 4;
    this.ctx.lineJoin = 'round';
    this.ctx.strokeText(timeStr, x, y);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText(timeStr, x, y);

    this.timeTexture.needsUpdate = true;
  }

  override update(_delta: number): void {
    super.update(_delta);
    this.renderTime();
  }

  override dispose(): void {
    if (this.timeTexture) {
      this.timeTexture.dispose();
      this.timeTexture = null;
    }
    this.canvas = null;
    this.ctx = null;
    this.lastRenderedTime = "";
    super.dispose();
  }
}
