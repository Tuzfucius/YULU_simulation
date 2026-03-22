/**
 * 2D 道路俯视图回放页面 — 双模式版
 * 
 * 模式：
 * - 全局模式：整条道路概览，使用色块表示车辆（原有功能）
 * - 局部模式：用户指定路段和时间区间，使用精美像素素材渲染车辆
 * 
 * 优化：
 * - 分块加载：先获取文件元信息（总帧数），再按需分批获取帧数据
 * - 滑动窗口缓冲：内存中仅保留当前帧 ±BUFFER_SIZE 帧
 * - 预取机制：播放到缓冲区边界时自动预取下一批
 * - 素材预加载：挂载时异步加载所有车辆 PNG 素材
 * 
 * 车辆素材: Kenney Pixel Car Pack (CC0) — www.kenney.nl
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18nStore } from '../../stores/i18nStore';
import { ContextMenu, type ContextMenuState } from '../charts/ContextMenu';
import { RangeSelector } from './RangeSelector';
import {
  type TrajectoryFrame,
  type LocalRange,
  type VehicleImages,
  type RenderOptions,
  renderGlobalFrame,
  renderLocalFrame,
  renderLoadingPlaceholder,
  filterFrameByRange,
  interpolateFrames,
  preloadVehicleImages,
  renderMinimap,
  renderHeatStrip,
  type AnomalyLog,
} from './replayRenderers';

interface OutputFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  extension: string;
  meta?: Record<string, any>;
}

type ViewMode = 'global' | 'local';

type ReplayJumpRequest = {
  runId: string;
  time: number | null;
  segment: number | null;
};

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function resolveRoadLengthMeters(config?: Record<string, unknown> | null): number {
  if (!config) return 20000;

  const kmValue = toFiniteNumber(
    config.custom_road_length_km ?? config.road_length_km ?? config.roadLengthKm,
  );
  if (kmValue != null) {
    return kmValue * 1000;
  }

  const metersValue = toFiniteNumber(
    config.road_length ?? config.roadLength ?? config.roadLengthM,
  );
  return metersValue ?? 20000;
}

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4, 8];
const CHUNK_SIZE = 500;
const PREFETCH_THRESHOLD = 100;

export const ReplayPage: React.FC = () => {
  const { lang } = useI18nStore();
  const isEn = lang === 'en';
  const [searchParams, setSearchParams] = useSearchParams();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  // ==================== 帧缓冲管理 ====================
  const [frameBuffer, setFrameBuffer] = useState<TrajectoryFrame[]>([]);
  const [bufferOffset, setBufferOffset] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadedFileName, setLoadedFileName] = useState('');
  const [viewOffset, setViewOffset] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [numLanes, setNumLanes] = useState(4);
  const [roadLength, setRoadLength] = useState(20000);

  const [outputFiles, setOutputFiles] = useState<OutputFile[]>([]);
  const [outputDir, setOutputDir] = useState('');
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingFile, setLoadingFile] = useState('');
  const [showHistory, setShowHistory] = useState(true);

  // 分块加载状态
  const [loadingChunk, setLoadingChunk] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [currentFilePath, setCurrentFilePath] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // 防止重复预取
  const fetchingRef = useRef(false);
  const pendingReplayJumpRef = useRef<ReplayJumpRequest | null>(null);

  // ==================== 双模式状态 ====================
  const [viewMode, setViewMode] = useState<ViewMode>('global');
  const [localRange, setLocalRange] = useState<LocalRange>({
    startKm: 0, endKm: 5, startTime: 0, endTime: 300,
  });
  const [rangeCollapsed, setRangeCollapsed] = useState(false);
  const [anomalyLogs] = useState<AnomalyLog[]>([]);
  const [trackedVehicleId, setTrackedVehicleId] = useState<number | null>(null);

  // 素材
  const vehicleImagesRef = useRef<VehicleImages | null>(null);
  const [imagesLoaded, setImagesLoaded] = useState(false);

  const deriveRunId = useCallback((file: OutputFile) => {
    const normalized = file.path.replace(/\\/g, '/');
    return normalized.split('/')[0] || file.name.replace(/\.json$/i, '');
  }, []);

  useEffect(() => {
    const runId = searchParams.get('run');
    if (!runId) return;
    const timeParam = Number(searchParams.get('time'));
    pendingReplayJumpRef.current = {
      runId,
      time: Number.isFinite(timeParam) ? timeParam : null,
      segment: toFiniteNumber(searchParams.get('segment')),
    };
  }, [searchParams]);

  // ==================== 素材预加载 ====================
  useEffect(() => {
    preloadVehicleImages().then(imgs => {
      vehicleImagesRef.current = imgs;
      setImagesLoaded(true);
    }).catch(() => {
      // 素材加载失败不阻塞使用，局部模式会回退为色块
      setImagesLoaded(true);
    });
  }, []);

  // ==================== 帧缓冲管理 ====================

  const getFrame = useCallback((globalIndex: number): TrajectoryFrame | null => {
    const localIndex = globalIndex - bufferOffset;
    if (localIndex >= 0 && localIndex < frameBuffer.length) {
      return frameBuffer[localIndex];
    }
    return null;
  }, [frameBuffer, bufferOffset]);

  const fetchChunk = useCallback(async (filePath: string, offset: number, limit: number = CHUNK_SIZE): Promise<TrajectoryFrame[]> => {
    try {
      const res = await fetch(`/api/files/output-file-chunk?path=${encodeURIComponent(filePath)}&offset=${offset}&limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      if (data.config && offset === 0) {
        const config = data.config as Record<string, unknown>;
        setNumLanes(toFiniteNumber(config.num_lanes ?? config.numLanes) ?? 4);
        setRoadLength(resolveRoadLengthMeters(config));
      }
      return data.frames || [];
    } catch {
      return [];
    }
  }, []);

  const loadFileChunked = useCallback(async (file: OutputFile) => {
    setLoadingFile(file.path);
    setLoadingChunk(true);
    setLoadProgress(0);

    try {
      const infoRes = await fetch(`/api/files/output-file-info?path=${encodeURIComponent(file.path)}`);
      if (!infoRes.ok) throw new Error('无法获取文件信息');
      const info = await infoRes.json();

      if (info.total_frames === 0) {
        await loadFileDirectly(file);
        return;
      }

      setTotalFrames(info.total_frames);
      setCurrentFilePath(file.path);

      if (info.config) {
        const config = info.config as Record<string, unknown>;
        const roadLengthMeters = resolveRoadLengthMeters(config);
        setNumLanes(toFiniteNumber(config.num_lanes ?? config.numLanes) ?? 4);
        setRoadLength(roadLengthMeters);
        // 初始化局部区间为道路的前 1/4
        setLocalRange(prev => ({
          ...prev,
          endKm: Math.min(prev.endKm, roadLengthMeters / 1000),
        }));
      }

      const firstChunk = await fetchChunk(file.path, 0, CHUNK_SIZE);
      if (firstChunk.length === 0) throw new Error('无帧数据');

      setFrameBuffer(firstChunk);
      setBufferOffset(0);
      setCurrentIndex(0);
      setIsLoaded(true);
      setLoadedFileName(file.name);
      setLoadProgress(Math.min(1, firstChunk.length / info.total_frames));

      // 初始化时间范围
      if (firstChunk.length > 0) {
        const maxT = firstChunk[firstChunk.length - 1]?.time || 300;
        setLocalRange(prev => ({ ...prev, endTime: Math.min(prev.endTime, maxT) }));
      }

    } catch (err) {
      alert(isEn ? 'Failed to load' : `加载失败: ${err}`);
    } finally {
      setLoadingFile('');
      setLoadingChunk(false);
    }
  }, [isEn, fetchChunk]);

  const loadFileDirectly = useCallback(async (file: OutputFile) => {
    try {
      const res = await fetch(`/api/files/output-file?path=${encodeURIComponent(file.path)}`);
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (result.type === 'json' && result.data) {
        applyJsonData(result.data);
        setIsLoaded(true); setCurrentIndex(0); setLoadedFileName(file.name);
      }
    } catch {
      alert(isEn ? 'Failed to load' : '加载失败');
    }
    setLoadingFile('');
    setLoadingChunk(false);
  }, [isEn]);

  const prefetchIfNeeded = useCallback(async (globalIndex: number) => {
    if (!currentFilePath || fetchingRef.current) return;

    const localIndex = globalIndex - bufferOffset;
    const distanceToEnd = frameBuffer.length - localIndex;

    if (distanceToEnd < PREFETCH_THRESHOLD && bufferOffset + frameBuffer.length < totalFrames) {
      fetchingRef.current = true;
      const nextOffset = bufferOffset + frameBuffer.length;
      const newFrames = await fetchChunk(currentFilePath, nextOffset, CHUNK_SIZE);
      if (newFrames.length > 0) {
        setFrameBuffer(prev => {
          const combined = [...prev, ...newFrames];
          const MAX_BUFFER = CHUNK_SIZE * 4;
          if (combined.length > MAX_BUFFER) {
            const trim = combined.length - MAX_BUFFER;
            setBufferOffset(bo => bo + trim);
            return combined.slice(trim);
          }
          return combined;
        });
        setLoadProgress(Math.min(1, (nextOffset + newFrames.length) / totalFrames));
      }
      fetchingRef.current = false;
    }

    if (localIndex < PREFETCH_THRESHOLD && bufferOffset > 0) {
      fetchingRef.current = true;
      const prevOffset = Math.max(0, bufferOffset - CHUNK_SIZE);
      const prevFrames = await fetchChunk(currentFilePath, prevOffset, bufferOffset - prevOffset);
      if (prevFrames.length > 0) {
        setFrameBuffer(prev => {
          const combined = [...prevFrames, ...prev];
          const MAX_BUFFER = CHUNK_SIZE * 4;
          if (combined.length > MAX_BUFFER) {
            return combined.slice(0, MAX_BUFFER);
          }
          return combined;
        });
        setBufferOffset(prevOffset);
      }
      fetchingRef.current = false;
    }
  }, [currentFilePath, bufferOffset, frameBuffer.length, totalFrames, fetchChunk]);

  // ==================== 输出文件管理 ====================

  const refreshOutputFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const res = await fetch('/api/files/output-files');
      if (res.ok) {
        const data = await res.json();
        setOutputFiles(data.files || []);
        setOutputDir(data.dir || '');
      }
    } catch { /* 后端未启动 */ }
    setLoadingFiles(false);
  }, []);

  const showFileMenu = useCallback((event: React.MouseEvent, file: OutputFile) => {
    event.preventDefault();
    const runId = deriveRunId(file);
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: '重命名',
          icon: '✏️',
          onClick: async () => {
            const nextName = prompt('请输入新的历史记录名称', runId);
            if (!nextName || nextName.trim() === '' || nextName.trim() === runId) return;
            const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/rename`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ new_name: nextName.trim() }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.detail || '重命名失败');
            await refreshOutputFiles();
          },
        },
        {
          label: '复制',
          icon: '📄',
          onClick: async () => {
            const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/copy`, { method: 'POST' });
            const data = await res.json();
            if (!data.success) throw new Error(data.detail || '复制失败');
            await refreshOutputFiles();
          },
        },
        {
          label: '删除',
          icon: '🗑️',
          danger: true,
          onClick: async () => {
            if (!confirm(`确认删除 "${runId}"？此操作不可恢复。`)) return;
            const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`, { method: 'DELETE' });
            const data = await res.json();
            if (!data.success) throw new Error(data.detail || '删除失败');
            await refreshOutputFiles();
          },
        },
        {
          label: '在文件夹中打开',
          icon: '📂',
          onClick: async () => {
            await fetch(`/api/runs/${encodeURIComponent(runId)}/open-folder`, { method: 'POST' });
          },
        },
      ],
    });
  }, [deriveRunId, refreshOutputFiles]);

  useEffect(() => { refreshOutputFiles(); }, [refreshOutputFiles]);

  useEffect(() => {
    const request = pendingReplayJumpRef.current;
    if (!request || outputFiles.length === 0 || loadingFile) return;
    const target = outputFiles.find(file => deriveRunId(file) === request.runId || file.name === request.runId);
    if (!target) return;
    if (loadedFileName === target.name || currentFilePath === target.path) return;
    loadFileChunked(target);
  }, [deriveRunId, outputFiles, loadingFile, loadedFileName, currentFilePath, loadFileChunked]);

  // ==================== 数据解析 ====================

  const applyJsonData = (data: any) => {
    let frames: TrajectoryFrame[] = [];
    if (Array.isArray(data)) {
      frames = data;
    } else if (data.frames) {
      frames = data.frames;
      if (data.config) {
        const config = data.config as Record<string, unknown>;
        setNumLanes(toFiniteNumber(config.num_lanes ?? config.numLanes) ?? 4);
        setRoadLength(resolveRoadLengthMeters(config));
      }
    } else if (data.trajectory_data) {
      frames = trajectoryToFrames(data.trajectory_data, data.config);
      if (data.config) {
        const config = data.config as Record<string, unknown>;
        setNumLanes(toFiniteNumber(config.num_lanes ?? config.numLanes) ?? 4);
        setRoadLength(resolveRoadLengthMeters(config));
      }
    }
    setFrameBuffer(frames);
    setBufferOffset(0);
    setTotalFrames(frames.length);
    setCurrentFilePath('');
    setLoadProgress(1);
  };

  useEffect(() => {
    const request = pendingReplayJumpRef.current;
    if (!request || !isLoaded) return;
    const activeFile = outputFiles.find(file => loadedFileName === file.name || currentFilePath === file.path || deriveRunId(file) === request.runId);
    if (!activeFile || deriveRunId(activeFile) !== request.runId) return;
    const jumpTime = request.time;

    if (request.segment !== null) {
      const segmentValue = request.segment;
      if (Number.isFinite(segmentValue)) {
        const startKm = Math.max(0, segmentValue - 0.5);
        const endKm = Math.min(roadLength / 1000, Math.max(startKm + 0.5, segmentValue + 0.5));
        setLocalRange(prev => ({
          ...prev,
          startKm,
          endKm,
          startTime: jumpTime !== null ? Math.max(0, jumpTime - 30) : prev.startTime,
          endTime: jumpTime !== null
            ? Math.min(
              Math.max(jumpTime + 30, prev.startTime + 30),
              prev.endTime > 0 ? Math.max(prev.endTime, jumpTime + 30) : jumpTime + 30,
            )
            : prev.endTime,
        }));
        setViewMode('local');
      }
    }

    if (jumpTime !== null) {
      const localIndex = frameBuffer.findIndex(frame => frame.time >= jumpTime);
      if (localIndex >= 0) {
        setCurrentIndex(bufferOffset + localIndex);
      }
    }

    setShowHistory(false);
    pendingReplayJumpRef.current = null;
    setSearchParams({}, { replace: true });
  }, [isLoaded, outputFiles, loadedFileName, currentFilePath, deriveRunId, roadLength, frameBuffer, bufferOffset, setSearchParams]);

  const trajectoryToFrames = (trajectoryData: any[], _config?: any): TrajectoryFrame[] => {
    const frameMap = new Map<number, TrajectoryFrame>();
    for (const entry of trajectoryData) {
      const t = toFiniteNumber(entry.time) ?? 0;
      const rt = Math.round(t * 2) / 2;
      if (!frameMap.has(rt)) frameMap.set(rt, { time: rt, vehicles: [] });
      frameMap.get(rt)!.vehicles.push({
        id: toFiniteNumber(entry.id) ?? 0,
        x: toFiniteNumber(entry.pos ?? entry.x ?? entry.position_m ?? entry.position) ?? 0,
        lane: toFiniteNumber(entry.lane ?? entry.lane_index) ?? 0,
        speed: toFiniteNumber(entry.speed ?? entry.v_speed) ?? 0,
        type: String(entry.vehicle_type || entry.type || 'CAR'),
        anomaly: toFiniteNumber(entry.anomaly_type ?? entry.anomaly) ?? 0,
      });
    }
    return [...frameMap.values()].sort((a, b) => a.time - b.time);
  };

  const parseCsvToFrames = (csvText: string): TrajectoryFrame[] => {
    const lines = csvText.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const col = (name: string) => {
      const idx = headers.indexOf(name);
      return idx !== -1 ? idx : headers.findIndex(h => h.includes(name));
    };
    const timeI = col('time'), xI = col('x') !== -1 ? col('x') : col('position');
    const laneI = col('lane'), speedI = col('speed');
    const idI = col('id') !== -1 ? col('id') : col('vehicle_id');
    const typeI = col('type') !== -1 ? col('type') : col('vehicle_type');
    const frameMap = new Map<number, TrajectoryFrame>();
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const t = parseFloat(cols[timeI] || '0');
      const rt = Math.round(t * 2) / 2;
      if (!frameMap.has(rt)) frameMap.set(rt, { time: rt, vehicles: [] });
      frameMap.get(rt)!.vehicles.push({
        id: parseInt(cols[idI] || '0'), x: parseFloat(cols[xI] || '0'),
        lane: parseInt(cols[laneI] || '0'), speed: parseFloat(cols[speedI] || '0'),
        type: cols[typeI]?.trim() || 'CAR', anomaly: 0,
      });
    }
    return [...frameMap.values()].sort((a, b) => a.time - b.time);
  };

  // 手动导入
  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      alert(isEn ? 'File too large. Please use server-side files.' : '文件过大（>50MB），请使用服务端加载');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        if (file.name.endsWith('.json')) { applyJsonData(JSON.parse(text)); }
        else {
          const p = parseCsvToFrames(text);
          if (p.length > 0) {
            setFrameBuffer(p);
            setBufferOffset(0);
            setTotalFrames(p.length);
            setCurrentFilePath('');
            setLoadProgress(1);
          }
        }
        setIsLoaded(true); setCurrentIndex(0); setLoadedFileName(file.name);
      } catch { alert(isEn ? 'Invalid file' : '无效文件'); }
    };
    reader.readAsText(file);
  }, [isEn]);

  // ==================== 局部模式：帧索引映射 ====================

  /** 获取局部模式下有效的帧索引范围 */
  const localFrameRange = useMemo(() => {
    if (viewMode !== 'local' || frameBuffer.length === 0) return null;

    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < frameBuffer.length; i++) {
      const t = frameBuffer[i].time;
      if (t >= localRange.startTime && startIdx === -1) {
        startIdx = i + bufferOffset;
      }
      if (t <= localRange.endTime) {
        endIdx = i + bufferOffset;
      }
    }

    if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) return null;
    return { start: startIdx, end: endIdx };
  }, [viewMode, frameBuffer, bufferOffset, localRange.startTime, localRange.endTime]);

  /** 局部模式下当前区间的车辆数 */
  const localVehicleCount = useMemo(() => {
    if (viewMode !== 'local') return undefined;
    const frame = getFrame(Math.floor(currentIndex));
    if (!frame) return 0;
    const filtered = filterFrameByRange(frame, localRange);
    return filtered.vehicles.length;
  }, [viewMode, currentIndex, getFrame, localRange]);

  // ==================== Canvas 渲染 ====================

  const renderFrame = useCallback((frameIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas || totalFrames === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const frame = getFrame(frameIndex);

    if (!frame) {
      renderLoadingPlaceholder(ctx, isEn);
      return;
    }

    // 自动追踪视角逻辑：如果跟踪了车辆，动态计算 viewOffset 使其居中（局部模式也受影响，因局部按 startKm 固定，可加特效跟随，但此时主要针对全局做视口移动）
    let currentViewOffset = viewOffset;
    if (trackedVehicleId) {
      const v = frame.vehicles.find(v => v.id === trackedVehicleId);
      if (v) {
        if (viewMode === 'global') {
          // 尝试让车辆保持在画布中心位置
          const mppX = roadLength / (canvas.width * zoomLevel);
          const targetOffset = v.x - (canvas.width * mppX) / 2;
          // 平滑过渡
          currentViewOffset = currentViewOffset + (targetOffset - currentViewOffset) * 0.1;
          setViewOffset(currentViewOffset);
        }
      }
    }

    const opts: RenderOptions = {
      viewOffset: currentViewOffset, zoomLevel, numLanes, roadLength,
      playbackSpeed, isEn,
      frameIndex, totalFrames,
      bufferLength: frameBuffer.length,
    };

    if (viewMode === 'local') {
      // 局部模式：帧间插值实现平滑过渡
      const t = currentIndex - Math.floor(currentIndex); // 小数部分作为插值因子
      const nextFrame = getFrame(frameIndex + 1);
      let renderTarget: TrajectoryFrame;
      if (nextFrame && t > 0.01) {
        renderTarget = interpolateFrames(frame, nextFrame, t);
      } else {
        renderTarget = frame;
      }
      const filteredFrame = filterFrameByRange(renderTarget, localRange);
      const images = vehicleImagesRef.current || { cars: [], trucks: [], buses: [], special: [] };
      renderLocalFrame(ctx, filteredFrame, localRange, opts, images, anomalyLogs, trackedVehicleId);

      // 小地图（全局视角）
      const viewStartM = localRange.startKm * 1000;
      const viewEndM = localRange.endKm * 1000;
      renderMinimap(ctx, frame, canvas.width, canvas.height, roadLength, viewStartM, viewEndM, isEn);
    } else {
      renderGlobalFrame(ctx, frame, opts, anomalyLogs, trackedVehicleId);

      // 小地图（全局视口位置）
      const mpp = roadLength / (canvas.width * zoomLevel);
      const viewStartM = viewOffset;
      const viewEndM = viewOffset + canvas.width * mpp;
      renderMinimap(ctx, frame, canvas.width, canvas.height, roadLength, viewStartM, viewEndM, isEn);
    }

    // 渲染底部热力色带（两种模式都显示）
    renderHeatStrip(ctx, frame, canvas.width, canvas.height, roadLength);
  }, [
    frameBuffer, bufferOffset, totalFrames, viewOffset, zoomLevel,
    numLanes, roadLength, playbackSpeed, isEn, getFrame,
    viewMode, localRange, currentIndex, anomalyLogs, trackedVehicleId,
  ]);

  // ==================== 播放控制 ====================

  useEffect(() => {
    if (!isPlaying || totalFrames === 0) return;
    let prev = performance.now();
    const animate = (now: number) => {
      const dt = (now - prev) / 1000; prev = now;
      setCurrentIndex(p => {
        const n = p + dt * playbackSpeed * 2;
        const maxIdx = totalFrames - 1;

        // 局部模式：时间超出区间时停止
        if (viewMode === 'local' && localFrameRange) {
          if (n >= localFrameRange.end) {
            setIsPlaying(false);
            return localFrameRange.end;
          }
        }

        if (n >= maxIdx) { setIsPlaying(false); return maxIdx; }
        return n;
      });
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, totalFrames, playbackSpeed, viewMode, localFrameRange]);

  // 渲染 + 预取
  useEffect(() => {
    const idx = Math.floor(currentIndex);
    renderFrame(idx);
    prefetchIfNeeded(idx);
  }, [currentIndex, renderFrame, prefetchIfNeeded]);

  useEffect(() => {
    const resize = () => {
      if (canvasRef.current && containerRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        renderFrame(Math.floor(currentIndex));
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [currentIndex, renderFrame]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      switch (e.key) {
        case ' ': e.preventDefault(); setIsPlaying(p => !p); break;
        case 'ArrowRight':
          e.preventDefault();
          setCurrentIndex(i => Math.min(i + (e.shiftKey ? 10 : 1), totalFrames - 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setCurrentIndex(i => Math.max(i - (e.shiftKey ? 10 : 1), 0));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setPlaybackSpeed(s => {
            const idx = SPEED_OPTIONS.indexOf(s);
            return idx < SPEED_OPTIONS.length - 1 ? SPEED_OPTIONS[idx + 1] : s;
          });
          break;
        case 'ArrowDown':
          e.preventDefault();
          setPlaybackSpeed(s => {
            const idx = SPEED_OPTIONS.indexOf(s);
            return idx > 0 ? SPEED_OPTIONS[idx - 1] : s;
          });
          break;
        case 'Escape':
          e.preventDefault();
          setTrackedVehicleId(null);
          break;
        case 'Tab':
          e.preventDefault();
          setViewMode(m => m === 'global' ? 'local' : 'global');
          break;
        case 'Home':
          e.preventDefault();
          setCurrentIndex(viewMode === 'local' && localFrameRange ? localFrameRange.start : 0);
          break;
        case 'End':
          e.preventDefault();
          setCurrentIndex(viewMode === 'local' && localFrameRange ? localFrameRange.end : totalFrames - 1);
          break;
        case '+': case '=': setZoomLevel(z => Math.min(z * 1.2, 10)); break;
        case '-': setZoomLevel(z => Math.max(z / 1.2, 0.1)); break;
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [totalFrames, viewMode, localFrameRange]);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    let drag = false, sx = 0, so = 0, moved = false;
    const md = (e: MouseEvent) => { drag = true; moved = false; sx = e.clientX; so = viewOffset; };
    const mm = (e: MouseEvent) => {
      if (!drag) return;
      if (Math.abs(e.clientX - sx) > 5) moved = true;
      setViewOffset(so - (e.clientX - sx) * roadLength / (c.width * zoomLevel));
    };
    const mu = (e: MouseEvent) => {
      drag = false;
      // Click detection for vehicle tracking
      if (!moved) {
        const frame = getFrame(Math.floor(currentIndex));
        if (frame) {
          const rect = c.getBoundingClientRect();
          const cx = e.clientX - rect.left;
          const cy = e.clientY - rect.top;

          let mpp: number, startM: number, laneH: number, totalRoadH: number, roadTop: number;
          if (viewMode === 'local') {
            const rangeLenM = (localRange.endKm - localRange.startKm) * 1000;
            startM = localRange.startKm * 1000;
            mpp = rangeLenM / c.width;
            laneH = 40 * zoomLevel;
          } else {
            mpp = roadLength / (c.width * zoomLevel);
            startM = viewOffset;
            laneH = 40;
          }

          totalRoadH = laneH * numLanes;
          roadTop = (c.height - totalRoadH) / 2;

          let clickedVehId: number | null = null;
          for (let i = frame.vehicles.length - 1; i >= 0; i--) {
            const v = frame.vehicles[i];
            const vLen = (v.type === 'CAR' ? 4.5 : v.type === 'TRUCK' ? 12 : 10) / mpp;
            const vx = (v.x - startM) / mpp;
            const vy = roadTop + v.lane * laneH + laneH / 2;

            // Simple bounding box hit test (with some padding for easier clicking)
            const padding = 10;
            if (cx >= vx - vLen / 2 - padding && cx <= vx + vLen / 2 + padding &&
              cy >= vy - laneH * 0.25 - padding && cy <= vy + laneH * 0.25 + padding) {
              clickedVehId = v.id;
              break;
            }
          }
          setTrackedVehicleId(current => current === clickedVehId ? null : clickedVehId);
        }
      }
    };
    const wh = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) setZoomLevel(z => Math.max(0.1, Math.min(10, z * (e.deltaY > 0 ? 0.9 : 1.1))));
      else setViewOffset(v => v + e.deltaY * roadLength / (c.width * zoomLevel) * 0.5);
    };
    c.addEventListener('mousedown', md);
    c.addEventListener('mousemove', mm);
    c.addEventListener('mouseup', mu);
    c.addEventListener('mouseleave', () => drag = false);
    c.addEventListener('wheel', wh, { passive: false });
    return () => {
      c.removeEventListener('mousedown', md);
      c.removeEventListener('mousemove', mm);
      c.removeEventListener('mouseup', mu);
      c.removeEventListener('mouseleave', mu);
      c.removeEventListener('wheel', wh);
    };
  }, [viewOffset, zoomLevel, roadLength]);

  // ==================== 模式切换 ====================

  const handleModeSwitch = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'local' && localFrameRange) {
      // 切换到局部模式时，跳到区间起点
      setCurrentIndex(localFrameRange.start);
    }
  }, [localFrameRange]);

  // ==================== 工具函数 ====================

  const fmtSize = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1048576).toFixed(1)}MB`;
  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(isEn ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  };

  const renderMeta = (meta?: Record<string, any>) => {
    if (!meta || Object.keys(meta).length === 0) return null;
    const tags: string[] = [];
    if (meta.vehicles) tags.push(`${meta.vehicles}${isEn ? 'veh' : '辆'}`);
    if (meta.lanes) tags.push(`${meta.lanes}${isEn ? 'L' : '车道'}`);
    if (meta.road_km) tags.push(`${meta.road_km}km`);
    if (meta.avg_speed) tags.push(`${meta.avg_speed}km/h`);
    if (meta.anomalies) tags.push(`${meta.anomalies}${isEn ? 'events' : '异常'}`);
    return (
      <div className="flex flex-wrap gap-1 mt-1 ml-6">
        {tags.map((tag, i) => (
          <span key={i} className="px-1.5 py-0.5 text-[9px] rounded bg-[var(--accent-blue)]/10 text-[var(--accent-blue)]">
            {tag}
          </span>
        ))}
      </div>
    );
  };

  // ==================== 最大时间 ====================
  const maxTime = useMemo(() => {
    if (frameBuffer.length === 0) return 300;
    return frameBuffer[frameBuffer.length - 1]?.time || 300;
  }, [frameBuffer]);

  // ==================== JSX ====================

  return (
    <div className="flex h-full bg-[var(--bg-base)]">
      {/* 左侧：历史数据 */}
      {showHistory && (
        <div className="w-72 flex flex-col border-r border-[var(--glass-border)] bg-[var(--glass-bg)] shrink-0">
          <div className="px-4 py-3 border-b border-[var(--glass-border)] flex items-center justify-between">
            <h3 className="text-sm font-medium text-[var(--text-primary)]">📂 {isEn ? 'History' : '历史数据'}</h3>
            <div className="flex gap-2">
              <button onClick={refreshOutputFiles} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">🔄</button>
              <button onClick={() => setShowHistory(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
            </div>
          </div>
          {outputDir && <div className="px-4 py-1 border-b border-[var(--glass-border)] bg-[rgba(0,0,0,0.1)]"><p className="text-[9px] text-[var(--text-muted)] truncate font-mono" title={outputDir}>{outputDir}</p></div>}

          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {loadingFiles ? (
              <div className="py-8 text-center text-sm text-[var(--text-muted)]">{isEn ? 'Loading...' : '加载中...'}</div>
            ) : outputFiles.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                <p>{isEn ? 'No data files' : '未找到数据文件'}</p>
                <p className="text-[10px] mt-1">{isEn ? 'Run a simulation first' : '请先运行仿真'}</p>
              </div>
            ) : (
              <div className="py-1">
                {outputFiles.map(file => (
                  <button key={file.path} onClick={() => loadFileChunked(file)} onContextMenu={(e) => showFileMenu(e, file)} disabled={loadingFile === file.path}
                    className={`w-full text-left px-4 py-2.5 hover:bg-[rgba(255,255,255,0.05)] transition-colors border-b border-[var(--glass-border)]/50 group ${loadedFileName === file.name ? 'bg-[var(--accent-blue)]/5' : ''}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{file.extension === '.json' ? '📄' : '📊'}</span>
                      <span className="text-xs text-[var(--text-primary)] truncate flex-1 group-hover:text-[var(--accent-blue)]">{file.name}</span>
                      {loadingFile === file.path && <span className="text-[10px] text-[var(--accent-blue)]">⏳</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 ml-6 text-[10px] text-[var(--text-muted)]">
                      <span>{fmtSize(file.size)}</span>
                      <span>{fmtTime(file.modified)}</span>
                    </div>
                    {renderMeta(file.meta)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="p-3 border-t border-[var(--glass-border)]">
            <label className="cursor-pointer w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border border-dashed border-[var(--glass-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent-blue)] transition-colors">
              📁 {isEn ? 'Import File' : '导入文件'}
              <input type="file" accept=".json,.csv" onChange={handleFileImport} className="hidden" />
            </label>
          </div>
        </div>
      )}

      {/* 右侧：回放 */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* 顶栏 */}
        <div className="h-14 flex items-center justify-between px-6 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md shrink-0">
          <div className="flex items-center gap-4">
            {!showHistory && <button onClick={() => setShowHistory(true)} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">📂</button>}

            {/* 模式切换 Tab */}
            <div className="flex rounded-lg overflow-hidden border border-[var(--glass-border)]">
              <button
                onClick={() => handleModeSwitch('global')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'global'
                  ? 'bg-[var(--accent-blue)] text-white'
                  : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.05)]'
                  }`}
              >
                🌐 {isEn ? 'Global' : '全局回放'}
              </button>
              <button
                onClick={() => handleModeSwitch('local')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'local'
                  ? 'bg-[var(--accent-blue)] text-white'
                  : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[rgba(255,255,255,0.05)]'
                  }`}
              >
                🔍 {isEn ? 'Local' : '局部回放'}
              </button>
            </div>

            {loadedFileName && <span className="text-xs text-[var(--text-muted)] font-mono">{loadedFileName}</span>}
            {loadingChunk && <span className="text-xs text-[var(--accent-blue)] animate-pulse">⏳ {isEn ? 'Processing...' : '处理中...'}</span>}
            {viewMode === 'local' && !imagesLoaded && (
              <span className="text-[10px] text-[var(--text-muted)] animate-pulse">
                {isEn ? 'Loading assets...' : '加载素材中...'}
              </span>
            )}
          </div>
          {isLoaded && (
            <div className="flex items-center gap-3">
              <button onClick={() => {
                if (viewMode === 'local' && localFrameRange) {
                  setCurrentIndex(localFrameRange.start);
                } else {
                  setCurrentIndex(0);
                }
              }} className="text-lg hover:opacity-80">⏮</button>
              <button onClick={() => setCurrentIndex(i => Math.max(0, i - 10))} className="text-lg hover:opacity-80">⏪</button>
              <button onClick={() => setIsPlaying(!isPlaying)} className="w-10 h-10 rounded-full bg-[var(--accent-blue)] text-white flex items-center justify-center text-xl hover:opacity-90">{isPlaying ? '⏸' : '▶'}</button>
              <button onClick={() => setCurrentIndex(i => Math.min(totalFrames - 1, i + 10))} className="text-lg hover:opacity-80">⏩</button>
              <button onClick={() => {
                if (viewMode === 'local' && localFrameRange) {
                  setCurrentIndex(localFrameRange.end);
                } else {
                  setCurrentIndex(totalFrames - 1);
                }
              }} className="text-lg hover:opacity-80">⏭</button>
              <select value={playbackSpeed} onChange={e => setPlaybackSpeed(Number(e.target.value))} className="px-2 py-1 text-sm rounded bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)]">
                {SPEED_OPTIONS.map(s => <option key={s} value={s}>{s}x</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Canvas 区域 */}
        <div ref={containerRef} className="flex-1 relative min-h-0 overflow-hidden">
          {!isLoaded ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-muted)]">
              <div className="text-6xl mb-4">🛣️</div>
              <p className="text-lg mb-1">{isEn ? 'Select a file from history or import one' : '从左侧历史数据中选择，或手动导入文件'}</p>
              <p className="text-sm">{isEn ? 'Supports JSON and CSV' : '支持 JSON 和 CSV 格式'}</p>
            </div>
          ) : (
            <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
          )}
        </div>

        {/* 局部模式：区间选择器 */}
        {isLoaded && viewMode === 'local' && (
          <RangeSelector
            range={localRange}
            onChange={setLocalRange}
            maxKm={roadLength / 1000}
            maxTime={maxTime}
            vehicleCount={localVehicleCount}
            isEn={isEn}
            collapsed={rangeCollapsed}
            onToggleCollapse={() => setRangeCollapsed(c => !c)}
          />
        )}

        {/* 底部进度条 */}
        {isLoaded && (
          <div className="flex flex-col border-t border-[var(--glass-border)] bg-[var(--glass-bg)] shrink-0">
            {loadProgress < 1 && (
              <div className="h-1 bg-[var(--glass-border)]">
                <div className="h-full bg-[var(--accent-blue)] transition-all duration-300" style={{ width: `${loadProgress * 100}%` }} />
              </div>
            )}
            <div className="h-10 flex items-center gap-4 px-6">
              <span className="text-xs text-[var(--text-muted)] w-16">
                {getFrame(Math.floor(currentIndex))?.time.toFixed(1) ?? '...'}s
              </span>
              <input type="range" min={0} max={totalFrames - 1} value={Math.floor(currentIndex)} onChange={e => setCurrentIndex(Number(e.target.value))} className="flex-1 h-1 accent-[var(--accent-blue)]" />
              <span className="text-xs text-[var(--text-muted)] w-20 text-right">
                {Math.floor(currentIndex + 1)}/{totalFrames}
              </span>
            </div>
          </div>
        )}
      </div>
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  );
};
