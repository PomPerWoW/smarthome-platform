import * as THREE from 'three';
import { FurnitureItem, FurnitureMetadata, WallPlacementInfo } from './FurnitureItem';
import { Transform } from './Base3DObject';

export type WallpaperCutoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export class WallpaperItem extends FurnitureItem {
  protected wallWidth: number;
  protected wallHeight: number;
  protected base64Image: string;
  protected cutoutRegions: WallpaperCutoutRect[] = [];

  constructor(
    id: string,
    name: string,
    modelId: number,
    wallWidth: number,
    wallHeight: number,
    wallPlacement: WallPlacementInfo,
    base64Image: string,
    metadata: FurnitureMetadata = {},
    initialTransform?: Partial<Transform>
  ) {
    const metadataWithWall: FurnitureMetadata = {
      ...metadata,
      category: 'wallpaper',
      wallMountable: true,
    };
    super(id, name, modelId, null, metadataWithWall, initialTransform, 'wallpaper', base64Image);
    this.wallWidth = wallWidth;
    this.wallHeight = wallHeight;
    this.base64Image = base64Image;
    this.setWallPlacement(wallPlacement);
  }

  isWallpaper(): boolean {
    return true;
  }

  reorientPlaneToWall(): void {
    const wallPlacement = this.getWallPlacement();
    if (!wallPlacement) return;
    const plane = this.getWallpaperSurfaceMesh();
    if (plane) this.orientPlaneToNormal(plane, wallPlacement.wallNormal);
  }

  private orientPlaneToNormal(
    plane: THREE.Mesh,
    wallNormal: [number, number, number]
  ): void {
    const targetNormal = new THREE.Vector3(
      wallNormal[0],
      wallNormal[1],
      wallNormal[2]
    ).normalize();
    const defaultNormal = new THREE.Vector3(0, 0, 1);
    if (targetNormal.dot(defaultNormal) < -0.999) {
      plane.rotation.set(0, Math.PI, 0);
    } else {
      plane.quaternion.setFromUnitVectors(defaultNormal, targetNormal);
    }
  }

  override moveAlongWall(_deltaVertical: number, deltaHorizontal: number): [number, number, number] {
    const currentPos = this.getPosition();
    const newPos: [number, number, number] = [...currentPos];

    if (!this.getWallPlacement()) return newPos;

    const wallNormal = this.getWallPlacement()!.wallNormal;

    if (Math.abs(wallNormal[2]) > Math.abs(wallNormal[0])) {
      newPos[0] += deltaHorizontal;
    } else {
      newPos[2] += deltaHorizontal;
    }

    return newPos;
  }

  override async loadModel(_scene: THREE.Scene): Promise<void> {
    this.modelGroup.clear();

    const planeGeometry = new THREE.PlaneGeometry(this.wallWidth, this.wallHeight);

    const texture = this.loadTextureFromBase64(this.base64Image);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    const plane = new THREE.Mesh(planeGeometry, material);

    const wallPlacement = this.getWallPlacement();
    if (wallPlacement) {
      this.orientPlaneToNormal(plane, wallPlacement.wallNormal);
    }

    this.modelGroup.add(plane);
  }

  private loadTextureFromBase64(base64: string): THREE.Texture {
    const imageUrl = base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`;
    const loader = new THREE.TextureLoader();
    const texture = loader.load(imageUrl);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  override serialize(): Record<string, unknown> {
    const base = super.serialize();
    return {
      ...base,
      wall_width: this.wallWidth,
      wall_height: this.wallHeight,
      image: this.base64Image,
      ...(this.cutoutRegions.length > 0
        ? { wallpaper_cutouts: this.cutoutRegions }
        : {}),
    };
  }

  override dispose(): void {
    this.modelGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshBasicMaterial;
        if (mat.map) mat.map.dispose();
        mat.dispose();
      }
    });
    super.dispose();
  }

  getWallpaperSurfaceMesh(): THREE.Mesh | null {
    let found: THREE.Mesh | null = null;
    this.modelGroup.traverse((child) => {
      if (found) return;
      if (!(child instanceof THREE.Mesh) || !child.material) return;
      const mat = child.material as THREE.MeshBasicMaterial;
      if (mat.map) found = child;
    });
    return found;
  }

  getPlaneMesh(): THREE.Mesh | null {
    return this.getWallpaperSurfaceMesh();
  }

  //Set plane material opacity
  setMaterialOpacity(opacity: number): void {
    this.modelGroup.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshBasicMaterial;
        mat.transparent = opacity < 1;
        mat.opacity = opacity;
      }
    });
  }

  // Cutout implementation
  applyCutouts(holes: WallpaperCutoutRect[]): void {
    this.cutoutRegions = holes.map((h) => ({ ...h }));

    const w = this.wallWidth;
    const h = this.wallHeight;
    const hw = w / 2;
    const hh = h / 2;

    const shape = new THREE.Shape();
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, hh);
    shape.lineTo(-hw, hh);
    shape.closePath();

    for (const hole of holes) {
      const x1 = hole.x;
      const y1 = hole.y;
      const x2 = hole.x + hole.width;
      const y2 = hole.y + hole.height;
      const path = new THREE.Path();
      path.moveTo(x1, y1);
      path.lineTo(x1, y2);
      path.lineTo(x2, y2);
      path.lineTo(x2, y1);
      path.closePath();
      shape.holes.push(path);
    }

    const geom = new THREE.ShapeGeometry(shape);
    const mesh = this.getWallpaperSurfaceMesh();
    if (mesh) {
      mesh.geometry.dispose();
      mesh.geometry = geom;
      this.applyPlaneUVsToGeometry(geom, w, h);
    }
  }

  private applyPlaneUVsToGeometry(geometry: THREE.BufferGeometry, w: number, h: number): void {
    const pos = geometry.attributes.position;
    if (!pos) return;
    const count = pos.count;
    const uvs = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      uvs[i * 2] = (x / w) + 0.5;
      uvs[i * 2 + 1] = (y / h) + 0.5;
    }
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.attributes.uv!.needsUpdate = true;
  }
}
