import * as THREE from 'three';
import { FurnitureItem } from './FurnitureItem';
import { Transform } from './Base3DObject';
import { fetchWeatherData, WeatherData } from '../../utils/WeatherService';

// Weather background images
const WEATHER_CODE_TO_IMAGE: Record<number, string> = {
  0: 'weather_clearSky',
  1: 'weather_clearSky',
  2: 'weather_partlyCloudy',
  3: 'weather_overcast',
  45: 'weather_fog',
  48: 'weather_fog',
  51: 'weather_rain',
  53: 'weather_rain',
  55: 'weather_rain',
  61: 'weather_rain',
  63: 'weather_rain',
  65: 'weather_rain',
  71: 'weather_snow',
  73: 'weather_snow',
  75: 'weather_snow',
  80: 'weather_shower',
  81: 'weather_shower',
  82: 'weather_shower',
  95: 'weather_thunderstorm',
  96: 'weather_thunderstorm',
  99: 'weather_thunderstorm',
};

const weatherImageCache: Map<string, HTMLImageElement> = new Map();

function getWeatherImageUrl(name: string): string {
  return new URL(`../../assets/weather/${name}.png`, import.meta.url).href;
}

function getWeatherImageName(code: number): string {
  return WEATHER_CODE_TO_IMAGE[code] ?? 'weather_clearSky';
}

const CANVAS_WIDTH = 512;
const CANVAS_HEIGHT = 320;
const PANEL_WIDTH = 0.5;
const PANEL_HEIGHT = PANEL_WIDTH * (CANVAS_HEIGHT / CANVAS_WIDTH);
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
 
export class WeatherWidget extends FurnitureItem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private canvasTexture: THREE.CanvasTexture;
  private weatherData: WeatherData | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  constructor(
    id: string,
    initialTransform?: Partial<Transform>
  ) {
    super(
      id,
      'Weather Widget',
      -1,
      null,
      {
        description: 'Live weather forecast display',
        category: 'Widgets',
        type: 'weather_widget',
        isContainer: false,
        wallMountable: true,
      },
      initialTransform
    );
 
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_WIDTH;
    this.canvas.height = CANVAS_HEIGHT;
    this.ctx = this.canvas.getContext('2d')!;
    this.canvasTexture = new THREE.CanvasTexture(this.canvas);
    this.canvasTexture.minFilter = THREE.LinearFilter;
    this.canvasTexture.magFilter = THREE.LinearFilter;
 
    this.buildPanel();
    this.renderLoadingState();
    this.loadWeather();
 
    this.refreshTimer = setInterval(() => {
      this.loadWeather();
    }, REFRESH_INTERVAL_MS);
  }
 
  private buildPanel(): void {
    this.modelGroup.clear();
 
    const frameGeometry = new THREE.BoxGeometry(
      PANEL_WIDTH + 0.02,
      PANEL_HEIGHT + 0.02,
      0.015
    );
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.3,
      metalness: 0.6,
    });
    const frame = new THREE.Mesh(frameGeometry, frameMaterial);
    this.modelGroup.add(frame);
 
    const screenGeometry = new THREE.PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT);
    const screenMaterial = new THREE.MeshBasicMaterial({
      map: this.canvasTexture,
      toneMapped: false,
    });
    const screen = new THREE.Mesh(screenGeometry, screenMaterial);
    screen.position.z = 0.009;
    this.modelGroup.add(screen);

    frameGeometry.computeBoundingBox();
    const minY = frameGeometry.boundingBox!.min.y;
    this.modelGroup.position.y = -minY;
  }
 
  private async loadWeather(): Promise<void> {
    try {
      this.renderLoadingState();
      this.weatherData = await fetchWeatherData();
      this.renderWeatherDisplay();
    } catch (err) {
      console.error('WeatherWidget: failed to fetch weather', err);
      this.renderErrorState();
    }
  }
 
  private renderLoadingState(): void {
    const ctx = this.ctx;
    this.clearCanvas('#0f172a');
 
    ctx.fillStyle = '#94a3b8';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Loading weather...', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
 
    this.canvasTexture.needsUpdate = true;
  }
 
  private renderErrorState(): void {
    const ctx = this.ctx;
    this.clearCanvas('#1e1b2e');
 
    ctx.fillStyle = '#ef4444';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Weather unavailable', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
 
    this.canvasTexture.needsUpdate = true;
  }
 
  private drawBackgroundImage(imageName: string): void {
    const cached = weatherImageCache.get(imageName);
    if (cached && cached.complete && cached.naturalWidth > 0) {
      const ctx = this.ctx;
      const img = cached;
      const imgAspect = img.width / img.height;
      const canvasAspect = CANVAS_WIDTH / CANVAS_HEIGHT;
      let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;
      if (imgAspect > canvasAspect) {
        sWidth = img.height * canvasAspect;
        sx = (img.width - sWidth) / 2;
      } else {
        sHeight = img.width / canvasAspect;
        sy = (img.height - sHeight) / 2;
      }
      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    } else {
      this.drawFallbackGradient();
    }
  }

  private drawFallbackGradient(): void {
    const ctx = this.ctx;
    const w = this.weatherData;
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    if (w?.isDay) {
      gradient.addColorStop(0, '#1e3a5f');
      gradient.addColorStop(1, '#0f172a');
    } else {
      gradient.addColorStop(0, '#0c0c1d');
      gradient.addColorStop(1, '#1a1a2e');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  private loadWeatherBackground(imageName: string, onLoaded: () => void): void {
    if (weatherImageCache.has(imageName)) {
      onLoaded();
      return;
    }
    const url = getWeatherImageUrl(imageName);
    const img = new Image();
    img.onload = () => {
      weatherImageCache.set(imageName, img);
      onLoaded();
    };
    img.onerror = () => {
      onLoaded();
    };
    img.src = url;
  }

  private renderWeatherDisplay(): void {
    if (!this.weatherData) return;
    const w = this.weatherData;

    const imageName = getWeatherImageName(w.weatherCode);
    this.loadWeatherBackground(imageName, () => {
      this.drawBackgroundImage(imageName);
      this.drawTextScrim();
      this.drawWeatherOverlay();
      this.canvasTexture.needsUpdate = true;
    });
  }

  private drawTextScrim(): void {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }

  private drawWeatherOverlay(): void {
    if (!this.weatherData) return;
    const ctx = this.ctx;
    const w = this.weatherData;

    // Location name
    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(w.locationName, 30, 40);
 
    // Weather icon (large)
    ctx.font = '72px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(w.weatherIcon, 30, 140);
 
    // Temperature
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${w.temperature}${w.temperatureUnit}`, CANVAS_WIDTH - 30, 130);
 
    // Description
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(w.weatherDescription, 30, 195);
 
    // Divider
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 220);
    ctx.lineTo(CANVAS_WIDTH - 30, 220);
    ctx.stroke();
 
    // Bottom stats
    ctx.fillStyle = '#94a3b8';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Humidity: ${w.humidity}%`, 30, 260);
    ctx.fillText(`Wind: ${w.windSpeed} km/h`, 30, 290);
  }

  private clearCanvas(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
 
  // Override: no GLTF to fetch
  protected async fetchModel(_path: string): Promise<THREE.Group> {
    return new THREE.Group();
  }
 
  protected setupModel(_model: THREE.Group): void {
    // Panel is already built in constructor
  }
 
  protected onModelLoaded(_model: THREE.Group): void {
    // No-op
  }
 
  protected onModelLoadError(_error: unknown): void {
    // No-op
  }
 
  // Override loadModel to skip GLTF loading
  async loadModel(_scene: THREE.Scene): Promise<void> {
  }
 
  update(delta: number): void {
    super.update(delta);
  }
 
  clone(): WeatherWidget {
    return new WeatherWidget(`${this.id}-${Date.now()}`, {
      position: this.getPosition(),
      rotation: this.getRotation(),
      scale: this.getScale(),
    });
  }
 
  serialize(): Record<string, unknown> {
    return {
      ...super.serialize(),
      widget_type: 'weather',
    };
  }
 
  dispose(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.canvasTexture.dispose();
    super.dispose();
  }
}