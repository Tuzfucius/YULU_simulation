/**
 * 俯视回放渲染器
 * 
 * 分离自 ReplayPage.tsx，包含全局模式和局部模式的 Canvas 渲染逻辑。
 * 
 * - renderGlobalFrame: 全局模式渲染（色块车辆）
 * - renderLocalFrame:  局部模式渲染（精美像素素材）
 * 
 * 素材来源: Kenney Pixel Car Pack (CC0)
 */

// ==================== 类型 ====================

export interface TrajectoryFrame {
  time: number;
  vehicles: VehicleData[];
  etcGates?: { position: number; segment: number }[];
}

export interface VehicleData {
  id: number;
  x: number;
  lane: number;
  speed: number;
  type: string;
  anomaly: number;
}

export interface LocalRange {
  startKm: number;
  endKm: number;
  startTime: number;
  endTime: number;
}

export interface RenderOptions {
  viewOffset: number;
  zoomLevel: number;
  numLanes: number;
  roadLength: number;
  playbackSpeed: number;
  isEn: boolean;
  frameIndex: number;
  totalFrames: number;
  bufferLength: number;
}

export interface VehicleImages {
  cars: HTMLImageElement[];
  trucks: HTMLImageElement[];
  buses: HTMLImageElement[];
  special: HTMLImageElement[];  // anomaly vehicles
}

// ==================== 颜色常量 ====================

const COLORS = {
  road: '#2d3748',
  laneMarking: '#a0aec0',
  car: '#60a5fa',
  truck: '#f59e0b',
  bus: '#34d399',
  anomaly1: '#ef4444',
  anomaly2: '#f97316',
  anomaly3: '#eab308',
  etcGate: '#a78bfa',
};

// ==================== 全局模式渲染 ====================

/**
 * 全局模式渲染帧 — 使用色块表示车辆（与原实现一致）
 */
export function renderGlobalFrame(
  ctx: CanvasRenderingContext2D,
  frame: TrajectoryFrame,
  opts: RenderOptions,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const laneH = 40 * opts.zoomLevel;
  const roadTop = (h - laneH * opts.numLanes) / 2;
  const mpp = opts.roadLength / (w * opts.zoomLevel);

  // 背景
  ctx.fillStyle = '#1a202c';
  ctx.fillRect(0, 0, w, h);

  // 道路
  ctx.fillStyle = COLORS.road;
  ctx.fillRect(0, roadTop, w, laneH * opts.numLanes);

  // 车道线
  for (let i = 0; i <= opts.numLanes; i++) {
    const y = roadTop + i * laneH;
    const isBorder = i === 0 || i === opts.numLanes;
    ctx.strokeStyle = isBorder ? '#e2e8f0' : COLORS.laneMarking;
    ctx.lineWidth = isBorder ? 3 : 1;
    ctx.setLineDash(isBorder ? [] : [15, 10]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ETC 门架
  if (frame.etcGates) {
    for (const gate of frame.etcGates) {
      const x = (gate.position - opts.viewOffset) / mpp;
      if (x < 0 || x > w) continue;
      ctx.strokeStyle = COLORS.etcGate;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, roadTop - 15);
      ctx.lineTo(x, roadTop + laneH * opts.numLanes + 15);
      ctx.stroke();
      ctx.fillStyle = COLORS.etcGate;
      ctx.font = '11px monospace';
      ctx.fillText(`G${gate.segment}`, x - 8, roadTop - 20);
    }
  }

  // 车辆（色块）
  for (const v of frame.vehicles) {
    const x = (v.x - opts.viewOffset) / mpp;
    if (x < -20 || x > w + 20) continue;
    const y = roadTop + v.lane * laneH + laneH / 2;
    const vLen = (v.type === 'CAR' ? 4.5 : v.type === 'TRUCK' ? 12 : 10) / mpp;
    const color = v.anomaly >= 1
      ? [COLORS.anomaly1, COLORS.anomaly2, COLORS.anomaly3][v.anomaly - 1] || COLORS.anomaly1
      : v.type === 'TRUCK' ? COLORS.truck : v.type === 'BUS' ? COLORS.bus : COLORS.car;
    ctx.fillStyle = color;
    ctx.globalAlpha = Math.max(0.4, Math.min(1, v.speed / 33));
    ctx.beginPath();
    ctx.roundRect(x - vLen / 2, y - laneH * 0.25, vLen, laneH * 0.5, 3);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // HUD 信息
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(10, 10, 320, 45);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '12px monospace';
  ctx.fillText(
    `${opts.isEn ? 'T' : '时间'}: ${frame.time.toFixed(1)}s | ${opts.isEn ? 'F' : '帧'}: ${opts.frameIndex + 1}/${opts.totalFrames} | ${opts.isEn ? 'V' : '车'}: ${frame.vehicles.length}`,
    20, 28,
  );
  ctx.fillText(
    `${opts.playbackSpeed}x | ${opts.isEn ? 'Zoom' : '缩放'}: ${opts.zoomLevel.toFixed(1)}x | ${opts.isEn ? 'Buf' : '缓冲'}: ${opts.bufferLength}`,
    20, 46,
  );
}

// ==================== 局部模式渲染 ====================

/**
 * 过滤帧数据：只保留局部区间内的车辆和门架
 */
export function filterFrameByRange(frame: TrajectoryFrame, range: LocalRange): TrajectoryFrame {
  const startM = range.startKm * 1000;
  const endM = range.endKm * 1000;
  return {
    time: frame.time,
    vehicles: frame.vehicles.filter(v => v.x >= startM && v.x <= endM),
    etcGates: frame.etcGates?.filter(g => g.position >= startM && g.position <= endM),
  };
}

/**
 * 局部模式渲染帧 — 使用精美像素素材
 */
export function renderLocalFrame(
  ctx: CanvasRenderingContext2D,
  frame: TrajectoryFrame,
  range: LocalRange,
  opts: RenderOptions,
  images: VehicleImages,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const laneH = 60 * opts.zoomLevel; // 局部模式车道更宽
  const totalRoadH = laneH * opts.numLanes;
  const roadTop = (h - totalRoadH) / 2;
  const rangeStartM = range.startKm * 1000;
  const rangeEndM = range.endKm * 1000;
  const rangeLenM = rangeEndM - rangeStartM;

  if (rangeLenM <= 0) return;

  // 背景 — 深色调
  ctx.fillStyle = '#0f1724';
  ctx.fillRect(0, 0, w, h);

  // 道路底色 — 带细微渐变
  const roadGrad = ctx.createLinearGradient(0, roadTop, 0, roadTop + totalRoadH);
  roadGrad.addColorStop(0, '#374151');
  roadGrad.addColorStop(0.5, '#2d3748');
  roadGrad.addColorStop(1, '#374151');
  ctx.fillStyle = roadGrad;
  ctx.fillRect(0, roadTop, w, totalRoadH);

  // 路肩（道路两侧的浅色条带）
  ctx.fillStyle = '#4a5568';
  ctx.fillRect(0, roadTop - 4, w, 4);
  ctx.fillRect(0, roadTop + totalRoadH, w, 4);

  // 车道线
  for (let i = 0; i <= opts.numLanes; i++) {
    const y = roadTop + i * laneH;
    const isBorder = i === 0 || i === opts.numLanes;
    if (isBorder) {
      // 实线白边
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
    } else {
      // 虚线车道分隔
      ctx.strokeStyle = '#cbd5e0';
      ctx.lineWidth = 2;
      ctx.setLineDash([20, 15]);
    }
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 里程标记
  const kmInterval = rangeLenM > 5000 ? 1 : rangeLenM > 2000 ? 0.5 : 0.2;
  const startKmCeil = Math.ceil(range.startKm / kmInterval) * kmInterval;
  ctx.font = '11px "Consolas", monospace';
  ctx.textAlign = 'center';
  for (let km = startKmCeil; km <= range.endKm; km += kmInterval) {
    const screenX = ((km * 1000 - rangeStartM) / rangeLenM) * w;
    if (screenX < 10 || screenX > w - 10) continue;

    // 刻度线
    ctx.strokeStyle = 'rgba(160, 174, 192, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(screenX, roadTop - 12);
    ctx.lineTo(screenX, roadTop - 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(screenX, roadTop + totalRoadH + 4);
    ctx.lineTo(screenX, roadTop + totalRoadH + 12);
    ctx.stroke();

    // 标签
    ctx.fillStyle = '#a0aec0';
    ctx.fillText(`${km.toFixed(1)}km`, screenX, roadTop - 16);
  }
  ctx.textAlign = 'start';

  // ETC 门架
  if (frame.etcGates) {
    for (const gate of frame.etcGates) {
      const screenX = ((gate.position - rangeStartM) / rangeLenM) * w;
      if (screenX < 0 || screenX > w) continue;

      // 门架柱
      ctx.strokeStyle = COLORS.etcGate;
      ctx.lineWidth = 4;
      ctx.shadowColor = COLORS.etcGate;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(screenX, roadTop - 20);
      ctx.lineTo(screenX, roadTop + totalRoadH + 20);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 门架横梁
      ctx.fillStyle = COLORS.etcGate;
      ctx.fillRect(screenX - 20, roadTop - 20, 40, 6);

      // 标签
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px "Consolas", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`G${gate.segment}`, screenX, roadTop - 26);
      ctx.textAlign = 'start';
    }
  }

  // 车辆（精美素材）
  for (const v of frame.vehicles) {
    const screenX = ((v.x - rangeStartM) / rangeLenM) * w;
    if (screenX < -40 || screenX > w + 40) continue;
    const screenY = roadTop + v.lane * laneH + laneH / 2;

    drawVehicleSprite(ctx, v, screenX, screenY, laneH, images, opts.zoomLevel);
  }

  // HUD
  const filteredFrame = frame;
  const hudW = 380;
  const hudH = 60;
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.beginPath();
  ctx.roundRect(10, 10, hudW, hudH, 8);
  ctx.fill();

  // HUD 左侧蓝条装饰
  ctx.fillStyle = '#60a5fa';
  ctx.beginPath();
  ctx.roundRect(10, 10, 4, hudH, [8, 0, 0, 8]);
  ctx.fill();

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '12px "Consolas", monospace';
  ctx.fillText(
    `${opts.isEn ? 'T' : '时间'}: ${frame.time.toFixed(1)}s | ${opts.isEn ? 'Range' : '区间'}: ${range.startKm.toFixed(1)}-${range.endKm.toFixed(1)}km`,
    24, 32,
  );
  ctx.fillText(
    `${opts.isEn ? 'V' : '车辆'}: ${filteredFrame.vehicles.length} | ${opts.playbackSpeed}x | ${opts.isEn ? 'F' : '帧'}: ${opts.frameIndex + 1}/${opts.totalFrames}`,
    24, 52,
  );

  // 图例
  drawLegend(ctx, w, opts.isEn, images);
}

// ==================== 辅助绘制函数 ====================

/**
 * 使用素材绘制单个车辆
 */
function drawVehicleSprite(
  ctx: CanvasRenderingContext2D,
  v: VehicleData,
  screenX: number,
  screenY: number,
  laneH: number,
  images: VehicleImages,
  _zoom: number,
): void {
  const img = pickVehicleImage(v, images);

  // 素材原始尺寸较小（像素风），需要放大
  // 按车道高度的比例进行缩放，使车辆填充车道的合理区域
  const targetH = laneH * 0.5;
  const aspect = img ? (img.naturalWidth / img.naturalHeight) : 2;
  const drawH = targetH;
  const drawW = drawH * aspect;

  ctx.save();

  // 异常车辆特效
  if (v.anomaly > 0) {
    const glowColor = v.anomaly === 1 ? '#ef4444' : v.anomaly === 2 ? '#f97316' : '#eab308';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 12;

    // 闪烁效果
    const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 200 + v.id);
    ctx.globalAlpha = pulse;
  } else {
    // 正常车辆微调透明度（按速度）
    ctx.globalAlpha = Math.max(0.6, Math.min(1, v.speed / 33));
  }

  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, screenX - drawW / 2, screenY - drawH / 2, drawW, drawH);
  } else {
    // 素材未加载时的回退 — 渐变色块
    const grad = ctx.createLinearGradient(screenX - drawW / 2, screenY, screenX + drawW / 2, screenY);
    const baseColor = v.type === 'TRUCK' ? COLORS.truck : v.type === 'BUS' ? COLORS.bus : COLORS.car;
    grad.addColorStop(0, baseColor);
    grad.addColorStop(1, adjustBrightness(baseColor, -30));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(screenX - drawW / 2, screenY - drawH / 2, drawW, drawH, 4);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // 速度标签（仅局部模式）
  ctx.font = '9px "Consolas", monospace';
  ctx.fillStyle = v.anomaly > 0 ? '#fca5a5' : '#94a3b8';
  ctx.textAlign = 'center';
  ctx.fillText(`${(v.speed * 3.6).toFixed(0)}`, screenX, screenY - drawH / 2 - 3);
  ctx.textAlign = 'start';

  ctx.restore();
}

/**
 * 根据车辆类型和 ID 选择对应素材
 */
function pickVehicleImage(v: VehicleData, images: VehicleImages): HTMLImageElement | null {
  // 异常车辆使用特殊素材
  if (v.anomaly > 0 && images.special.length > 0) {
    return images.special[(v.anomaly - 1) % images.special.length];
  }

  const typeUpper = v.type.toUpperCase();
  if (typeUpper === 'TRUCK' && images.trucks.length > 0) {
    return images.trucks[v.id % images.trucks.length];
  }
  if (typeUpper === 'BUS' && images.buses.length > 0) {
    return images.buses[v.id % images.buses.length];
  }
  if (images.cars.length > 0) {
    return images.cars[v.id % images.cars.length];
  }
  return null;
}

/**
 * 绘制图例
 */
function drawLegend(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  isEn: boolean,
  _images: VehicleImages,
): void {
  const items = [
    { color: COLORS.car, label: isEn ? 'Car' : '小汽车' },
    { color: COLORS.truck, label: isEn ? 'Truck' : '货车' },
    { color: COLORS.bus, label: isEn ? 'Bus' : '客车' },
    { color: COLORS.anomaly1, label: isEn ? 'Anomaly' : '异常' },
  ];

  const legendW = items.length * 80 + 20;
  const legendH = 24;
  const legendX = canvasW - legendW - 10;
  const legendY = 10;

  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.roundRect(legendX, legendY, legendW, legendH, 6);
  ctx.fill();

  ctx.font = '10px sans-serif';
  items.forEach((item, i) => {
    const x = legendX + 12 + i * 80;
    ctx.fillStyle = item.color;
    ctx.beginPath();
    ctx.roundRect(x, legendY + 7, 10, 10, 2);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(item.label, x + 14, legendY + 16);
  });
}

/**
 * 调整颜色亮度
 */
function adjustBrightness(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ==================== 素材加载 ====================

/** 素材路径映射 */
const ASSET_PATHS = {
  cars: [
    '/assets/vehicles/cars/sedan.png',
    '/assets/vehicles/cars/sedan_blue.png',
    '/assets/vehicles/cars/sports_green.png',
    '/assets/vehicles/cars/sports_red.png',
    '/assets/vehicles/cars/sports_yellow.png',
  ],
  trucks: [
    '/assets/vehicles/trucks/truck.png',
    '/assets/vehicles/trucks/truckdark.png',
    '/assets/vehicles/trucks/truckcabin.png',
  ],
  buses: [
    '/assets/vehicles/buses/bus.png',
    '/assets/vehicles/buses/bus_school.png',
  ],
  special: [
    '/assets/vehicles/special/ambulance.png',
    '/assets/vehicles/special/police.png',
  ],
};

/**
 * 加载单张图片
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * 预加载所有车辆素材
 */
export async function preloadVehicleImages(): Promise<VehicleImages> {
  const loadGroup = async (paths: string[]): Promise<HTMLImageElement[]> => {
    const results = await Promise.allSettled(paths.map(loadImage));
    return results
      .filter((r): r is PromiseFulfilledResult<HTMLImageElement> => r.status === 'fulfilled')
      .map(r => r.value);
  };

  const [cars, trucks, buses, special] = await Promise.all([
    loadGroup(ASSET_PATHS.cars),
    loadGroup(ASSET_PATHS.trucks),
    loadGroup(ASSET_PATHS.buses),
    loadGroup(ASSET_PATHS.special),
  ]);

  return { cars, trucks, buses, special };
}

/** 渲染"加载中"占位帧 */
export function renderLoadingPlaceholder(
  ctx: CanvasRenderingContext2D,
  isEn: boolean,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.fillStyle = '#1a202c';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(isEn ? 'Loading frames...' : '正在加载帧数据...', w / 2, h / 2);
  ctx.textAlign = 'start';
}
