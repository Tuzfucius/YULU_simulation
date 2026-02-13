/**
 * 2D 道路俯视图回放页面 — 大文件优化版
 * 
 * 优化：
 * - 分块加载：先获取文件元信息（总帧数），再按需分批获取帧数据
 * - 滑动窗口缓冲：内存中仅保留当前帧 ±BUFFER_SIZE 帧
 * - 预取机制：播放到缓冲区边界时自动预取下一批
 * - 加载进度条：显示已加载帧/总帧比例
 * - 兼容小文件直接加载和手动导入
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18nStore } from '../../stores/i18nStore';

interface TrajectoryFrame {
  time: number;
  vehicles: {
    id: number; x: number; lane: number; speed: number; type: string; anomaly: number;
  }[];
  etcGates?: { position: number; segment: number }[];
}

interface OutputFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  extension: string;
  meta?: Record<string, any>;
}

const COLORS = {
  road: '#2d3748', laneMarking: '#a0aec0',
  car: '#60a5fa', truck: '#f59e0b', bus: '#34d399',
  anomaly1: '#ef4444', anomaly2: '#f97316', anomaly3: '#eab308',
  etcGate: '#a78bfa',
};
const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4, 8];

/** 每次从后端拉取的帧数 */
const CHUNK_SIZE = 500;
/** 预加载触发阈值：距离缓冲区边界不足此值时触发预取 */
const PREFETCH_THRESHOLD = 100;

export const ReplayPage: React.FC = () => {
  const { lang } = useI18nStore();
  const isEn = lang === 'en';

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  // 帧缓冲管理
  const [frameBuffer, setFrameBuffer] = useState<TrajectoryFrame[]>([]);
  const [bufferOffset, setBufferOffset] = useState(0); // frameBuffer[0] 对应的全局帧索引
  const [totalFrames, setTotalFrames] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0); // 全局帧索引
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
  const [loadProgress, setLoadProgress] = useState(0); // 0-1
  const [currentFilePath, setCurrentFilePath] = useState('');

  // 防止重复预取
  const fetchingRef = useRef(false);

  // ==================== 帧缓冲管理 ====================

  /** 根据全局索引获取对应的缓冲区帧 */
  const getFrame = useCallback((globalIndex: number): TrajectoryFrame | null => {
    const localIndex = globalIndex - bufferOffset;
    if (localIndex >= 0 && localIndex < frameBuffer.length) {
      return frameBuffer[localIndex];
    }
    return null;
  }, [frameBuffer, bufferOffset]);

  /** 分块从后端加载帧数据 */
  const fetchChunk = useCallback(async (filePath: string, offset: number, limit: number = CHUNK_SIZE): Promise<TrajectoryFrame[]> => {
    try {
      const res = await fetch(`/api/files/output-file-chunk?path=${encodeURIComponent(filePath)}&offset=${offset}&limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      if (data.config && offset === 0) {
        setNumLanes(data.config.num_lanes || data.config.numLanes || 4);
        setRoadLength(data.config.road_length || data.config.roadLength || 20000);
      }
      return data.frames || [];
    } catch {
      return [];
    }
  }, []);

  /** 初始加载文件：获取 info + 首批帧 */
  const loadFileChunked = useCallback(async (file: OutputFile) => {
    setLoadingFile(file.path);
    setLoadingChunk(true);
    setLoadProgress(0);

    try {
      // 1. 获取文件元信息
      const infoRes = await fetch(`/api/files/output-file-info?path=${encodeURIComponent(file.path)}`);
      if (!infoRes.ok) throw new Error('无法获取文件信息');
      const info = await infoRes.json();

      if (info.total_frames === 0) {
        // 回退到直接加载
        await loadFileDirectly(file);
        return;
      }

      setTotalFrames(info.total_frames);
      setCurrentFilePath(file.path);

      if (info.config) {
        setNumLanes(info.config.num_lanes || info.config.numLanes || 4);
        setRoadLength(info.config.road_length || info.config.roadLength || 20000);
      }

      // 2. 加载首批帧
      const firstChunk = await fetchChunk(file.path, 0, CHUNK_SIZE);
      if (firstChunk.length === 0) throw new Error('无帧数据');

      setFrameBuffer(firstChunk);
      setBufferOffset(0);
      setCurrentIndex(0);
      setIsLoaded(true);
      setLoadedFileName(file.name);
      setLoadProgress(Math.min(1, firstChunk.length / info.total_frames));

    } catch (err) {
      alert(isEn ? 'Failed to load' : `加载失败: ${err}`);
    } finally {
      setLoadingFile('');
      setLoadingChunk(false);
    }
  }, [isEn, fetchChunk]);

  /** 小文件回退方案 */
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

  /** 预取：当播放接近缓冲区边界时自动加载更多帧 */
  const prefetchIfNeeded = useCallback(async (globalIndex: number) => {
    if (!currentFilePath || fetchingRef.current) return;

    const localIndex = globalIndex - bufferOffset;
    const distanceToEnd = frameBuffer.length - localIndex;

    // 向前预取
    if (distanceToEnd < PREFETCH_THRESHOLD && bufferOffset + frameBuffer.length < totalFrames) {
      fetchingRef.current = true;
      const nextOffset = bufferOffset + frameBuffer.length;
      const newFrames = await fetchChunk(currentFilePath, nextOffset, CHUNK_SIZE);
      if (newFrames.length > 0) {
        setFrameBuffer(prev => {
          // 追加新帧，如果缓冲区过大则裁剪前面的帧
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

    // 向后预取（快退时）
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

  useEffect(() => { refreshOutputFiles(); }, [refreshOutputFiles]);

  // ==================== 数据解析 ====================

  const applyJsonData = (data: any) => {
    let frames: TrajectoryFrame[] = [];
    if (Array.isArray(data)) {
      frames = data;
    } else if (data.frames) {
      frames = data.frames;
      if (data.config) {
        setNumLanes(data.config.num_lanes || data.config.numLanes || 4);
        setRoadLength(data.config.road_length || data.config.roadLength || 20000);
      }
    } else if (data.trajectory_data) {
      // 前端转换 trajectory_data 为帧（小文件）
      frames = trajectoryToFrames(data.trajectory_data, data.config);
      if (data.config) {
        setNumLanes(data.config.num_lanes || data.config.numLanes || 4);
        setRoadLength(data.config.road_length || data.config.roadLength || 20000);
      }
    }
    setFrameBuffer(frames);
    setBufferOffset(0);
    setTotalFrames(frames.length);
    setCurrentFilePath('');
    setLoadProgress(1);
  };

  /** 前端轨迹转帧（用于手动导入的小文件） */
  const trajectoryToFrames = (trajectoryData: any[], _config?: any): TrajectoryFrame[] => {
    const frameMap = new Map<number, TrajectoryFrame>();
    for (const entry of trajectoryData) {
      const t = entry.time || 0;
      const rt = Math.round(t * 2) / 2;
      if (!frameMap.has(rt)) frameMap.set(rt, { time: rt, vehicles: [] });
      frameMap.get(rt)!.vehicles.push({
        id: entry.id || 0,
        x: entry.pos ?? entry.x ?? 0,
        lane: entry.lane || 0,
        speed: entry.speed || 0,
        type: entry.vehicle_type || entry.type || 'CAR',
        anomaly: entry.anomaly_type ?? entry.anomaly ?? 0,
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

    // 大文件提示
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

  // ==================== Canvas 渲染 ====================

  const renderFrame = useCallback((frameIndex: number) => {
    const canvas = canvasRef.current; if (!canvas || totalFrames === 0) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const frame = getFrame(frameIndex);
    if (!frame) {
      // 帧未在缓冲区中 — 显示加载提示
      const w = canvas.width, h = canvas.height;
      ctx.fillStyle = '#1a202c'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e2e8f0'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(isEn ? 'Loading frames...' : '正在加载帧数据...', w / 2, h / 2);
      ctx.textAlign = 'start';
      return;
    }

    const w = canvas.width, h = canvas.height;
    const laneH = 40 * zoomLevel;
    const roadTop = (h - laneH * numLanes) / 2;
    const mpp = roadLength / (w * zoomLevel);

    ctx.fillStyle = '#1a202c'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = COLORS.road; ctx.fillRect(0, roadTop, w, laneH * numLanes);
    for (let i = 0; i <= numLanes; i++) {
      const y = roadTop + i * laneH;
      ctx.strokeStyle = i === 0 || i === numLanes ? '#e2e8f0' : COLORS.laneMarking;
      ctx.lineWidth = i === 0 || i === numLanes ? 3 : 1;
      ctx.setLineDash(i === 0 || i === numLanes ? [] : [15, 10]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.setLineDash([]);

    if (frame.etcGates) {
      for (const gate of frame.etcGates) {
        const x = (gate.position - viewOffset) / mpp;
        if (x < 0 || x > w) continue;
        ctx.strokeStyle = COLORS.etcGate; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, roadTop - 15); ctx.lineTo(x, roadTop + laneH * numLanes + 15); ctx.stroke();
        ctx.fillStyle = COLORS.etcGate; ctx.font = '11px monospace';
        ctx.fillText(`G${gate.segment}`, x - 8, roadTop - 20);
      }
    }

    for (const v of frame.vehicles) {
      const x = (v.x - viewOffset) / mpp;
      if (x < -20 || x > w + 20) continue;
      const y = roadTop + v.lane * laneH + laneH / 2;
      const vLen = (v.type === 'CAR' ? 4.5 : v.type === 'TRUCK' ? 12 : 10) / mpp;
      let color = v.anomaly >= 1 ? [COLORS.anomaly1, COLORS.anomaly2, COLORS.anomaly3][v.anomaly - 1] || COLORS.anomaly1
        : v.type === 'TRUCK' ? COLORS.truck : v.type === 'BUS' ? COLORS.bus : COLORS.car;
      ctx.fillStyle = color;
      ctx.globalAlpha = Math.max(0.4, Math.min(1, v.speed / 33));
      ctx.beginPath(); ctx.roundRect(x - vLen / 2, y - laneH * 0.25, vLen, laneH * 0.5, 3); ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(10, 10, 320, 45);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '12px monospace';
    ctx.fillText(`${isEn ? 'T' : '时间'}: ${frame.time.toFixed(1)}s | ${isEn ? 'F' : '帧'}: ${frameIndex + 1}/${totalFrames} | ${isEn ? 'V' : '车'}: ${frame.vehicles.length}`, 20, 28);
    ctx.fillText(`${playbackSpeed}x | ${isEn ? 'Zoom' : '缩放'}: ${zoomLevel.toFixed(1)}x | ${isEn ? 'Buf' : '缓冲'}: ${frameBuffer.length}`, 20, 46);
  }, [frameBuffer, bufferOffset, totalFrames, viewOffset, zoomLevel, numLanes, roadLength, playbackSpeed, isEn, getFrame]);

  // ==================== 播放控制 ====================

  useEffect(() => {
    if (!isPlaying || totalFrames === 0) return;
    let prev = performance.now();
    const animate = (now: number) => {
      const dt = (now - prev) / 1000; prev = now;
      setCurrentIndex(p => {
        const n = p + dt * playbackSpeed * 2;
        if (n >= totalFrames) { setIsPlaying(false); return totalFrames - 1; }
        return n;
      });
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, totalFrames, playbackSpeed]);

  // 渲染 + 预取
  useEffect(() => {
    const idx = Math.floor(currentIndex);
    renderFrame(idx);
    prefetchIfNeeded(idx);
  }, [currentIndex, renderFrame, prefetchIfNeeded]);

  useEffect(() => {
    const resize = () => { if (canvasRef.current && containerRef.current) { canvasRef.current.width = containerRef.current.clientWidth; canvasRef.current.height = containerRef.current.clientHeight; renderFrame(Math.floor(currentIndex)); } };
    resize(); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize);
  }, [currentIndex, renderFrame]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      switch (e.key) { case ' ': e.preventDefault(); setIsPlaying(p => !p); break; case 'ArrowRight': setCurrentIndex(i => Math.min(i + 1, totalFrames - 1)); break; case 'ArrowLeft': setCurrentIndex(i => Math.max(i - 1, 0)); break; case '+': case '=': setZoomLevel(z => Math.min(z * 1.2, 10)); break; case '-': setZoomLevel(z => Math.max(z / 1.2, 0.1)); break; }
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [totalFrames]);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    let drag = false, sx = 0, so = 0;
    const md = (e: MouseEvent) => { drag = true; sx = e.clientX; so = viewOffset; };
    const mm = (e: MouseEvent) => { if (!drag) return; setViewOffset(so - (e.clientX - sx) * roadLength / (c.width * zoomLevel)); };
    const mu = () => { drag = false; };
    const wh = (e: WheelEvent) => { e.preventDefault(); if (e.ctrlKey) setZoomLevel(z => Math.max(0.1, Math.min(10, z * (e.deltaY > 0 ? 0.9 : 1.1)))); else setViewOffset(v => v + e.deltaY * roadLength / (c.width * zoomLevel) * 0.5); };
    c.addEventListener('mousedown', md); c.addEventListener('mousemove', mm); c.addEventListener('mouseup', mu); c.addEventListener('mouseleave', mu);
    c.addEventListener('wheel', wh, { passive: false });
    return () => { c.removeEventListener('mousedown', md); c.removeEventListener('mousemove', mm); c.removeEventListener('mouseup', mu); c.removeEventListener('mouseleave', mu); c.removeEventListener('wheel', wh); };
  }, [viewOffset, zoomLevel, roadLength]);

  // ==================== 工具函数 ====================

  const fmtSize = (b: number) => b < 1024 ? `${b}B` : b < 1048576 ? `${(b / 1024).toFixed(1)}KB` : `${(b / 1048576).toFixed(1)}MB`;
  const fmtTime = (iso: string) => { try { return new Date(iso).toLocaleString(isEn ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };

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
                  <button key={file.path} onClick={() => loadFileChunked(file)} disabled={loadingFile === file.path}
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
      <div className="flex-1 flex flex-col">
        <div className="h-14 flex items-center justify-between px-6 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md shrink-0">
          <div className="flex items-center gap-4">
            {!showHistory && <button onClick={() => setShowHistory(true)} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">📂</button>}
            <h2 className="text-lg font-medium text-[var(--text-primary)]">🛣️ {isEn ? 'Replay' : '俯视回放'}</h2>
            {loadedFileName && <span className="text-xs text-[var(--text-muted)] font-mono">{loadedFileName}</span>}
            {loadingChunk && <span className="text-xs text-[var(--accent-blue)] animate-pulse">⏳ {isEn ? 'Processing...' : '处理中...'}</span>}
          </div>
          {isLoaded && (
            <div className="flex items-center gap-3">
              <button onClick={() => setCurrentIndex(0)} className="text-lg hover:opacity-80">⏮</button>
              <button onClick={() => setCurrentIndex(i => Math.max(0, i - 10))} className="text-lg hover:opacity-80">⏪</button>
              <button onClick={() => setIsPlaying(!isPlaying)} className="w-10 h-10 rounded-full bg-[var(--accent-blue)] text-white flex items-center justify-center text-xl hover:opacity-90">{isPlaying ? '⏸' : '▶'}</button>
              <button onClick={() => setCurrentIndex(i => Math.min(totalFrames - 1, i + 10))} className="text-lg hover:opacity-80">⏩</button>
              <button onClick={() => setCurrentIndex(totalFrames - 1)} className="text-lg hover:opacity-80">⏭</button>
              <select value={playbackSpeed} onChange={e => setPlaybackSpeed(Number(e.target.value))} className="px-2 py-1 text-sm rounded bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)]">
                {SPEED_OPTIONS.map(s => <option key={s} value={s}>{s}x</option>)}
              </select>
            </div>
          )}
        </div>
        <div ref={containerRef} className="flex-1 relative">
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
        {isLoaded && (
          <div className="flex flex-col border-t border-[var(--glass-border)] bg-[var(--glass-bg)] shrink-0">
            {/* 加载进度条 */}
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
    </div>
  );
};
