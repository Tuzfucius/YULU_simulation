/**
 * 2D 道路俯视图回放页面
 * 
 * 功能：
 * - 仿真完成后导入轨迹数据回放
 * - Canvas 俯视渲染（车辆+道路+ETC门架）
 * - 回放控制（慢放/快放/暂停/进度条）
 * - 可选实时可视化开关
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

// 轨迹数据类型
interface TrajectoryFrame {
  time: number;
  vehicles: {
    id: number;
    x: number;      // 位置(m)
    lane: number;
    speed: number;   // m/s
    type: string;    // CAR | TRUCK | BUS
    anomaly: number; // 0=正常, 1/2/3=异常
    color?: string;
  }[];
  etcGates?: { position: number; segment: number }[];
  incidents?: { position: number; lanes: number[]; type: string }[];
}

// 颜色方案
const COLORS = {
  road: '#2d3748',
  roadLine: '#4a5568',
  laneMarking: '#a0aec0',
  car: '#60a5fa',
  truck: '#f59e0b',
  bus: '#34d399',
  anomaly1: '#ef4444',
  anomaly2: '#f97316',
  anomaly3: '#eab308',
  etcGate: '#a78bfa',
  incident: '#ef4444',
  construction: '#f59e0b',
};

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4, 8];

export const ReplayPage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  
  // 状态
  const [frames, setFrames] = useState<TrajectoryFrame[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [viewOffset, setViewOffset] = useState(0);   // 水平偏移
  const [zoomLevel, setZoomLevel] = useState(1);
  const [liveMode, setLiveMode] = useState(false);    // 实时可视化开关
  const [numLanes, setNumLanes] = useState(4);
  const [roadLength, setRoadLength] = useState(20000); // 米
  
  // 导入轨迹数据
  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (Array.isArray(data)) {
          setFrames(data);
          setIsLoaded(true);
          setCurrentIndex(0);
        } else if (data.frames) {
          setFrames(data.frames);
          if (data.config) {
            setNumLanes(data.config.num_lanes || 4);
            setRoadLength(data.config.road_length || 20000);
          }
          setIsLoaded(true);
          setCurrentIndex(0);
        }
      } catch {
        alert('无效的轨迹数据文件');
      }
    };
    reader.readAsText(file);
  }, []);
  
  // Canvas 渲染
  const renderFrame = useCallback((frameIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const frame = frames[Math.min(frameIndex, frames.length - 1)];
    if (!frame) return;
    
    const w = canvas.width;
    const h = canvas.height;
    const laneHeight = 40 * zoomLevel;
    const roadTop = (h - laneHeight * numLanes) / 2;
    const metersPerPixel = roadLength / (w * zoomLevel);
    
    // 清空
    ctx.fillStyle = '#1a202c';
    ctx.fillRect(0, 0, w, h);
    
    // 绘制道路
    ctx.fillStyle = COLORS.road;
    ctx.fillRect(0, roadTop, w, laneHeight * numLanes);
    
    // 车道标线
    for (let i = 0; i <= numLanes; i++) {
      const y = roadTop + i * laneHeight;
      ctx.strokeStyle = i === 0 || i === numLanes ? '#e2e8f0' : COLORS.laneMarking;
      ctx.lineWidth = i === 0 || i === numLanes ? 3 : 1;
      ctx.setLineDash(i === 0 || i === numLanes ? [] : [15, 10]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    
    // ETC 门架
    if (frame.etcGates) {
      for (const gate of frame.etcGates) {
        const x = (gate.position - viewOffset) / metersPerPixel;
        if (x < 0 || x > w) continue;
        
        ctx.strokeStyle = COLORS.etcGate;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x, roadTop - 15);
        ctx.lineTo(x, roadTop + laneHeight * numLanes + 15);
        ctx.stroke();
        
        ctx.fillStyle = COLORS.etcGate;
        ctx.font = '11px monospace';
        ctx.fillText(`G${gate.segment}`, x - 8, roadTop - 20);
      }
    }
    
    // 事故/施工标记
    if (frame.incidents) {
      for (const inc of frame.incidents) {
        const x = (inc.position - viewOffset) / metersPerPixel;
        if (x < -50 || x > w + 50) continue;
        
        const color = inc.type === 'construction' ? COLORS.construction : COLORS.incident;
        for (const lane of inc.lanes) {
          const y = roadTop + lane * laneHeight + laneHeight / 2;
          ctx.fillStyle = color + '40';
          ctx.fillRect(x - 20, roadTop + lane * laneHeight + 2, 40, laneHeight - 4);
          ctx.fillStyle = color;
          ctx.font = '16px sans-serif';
          ctx.fillText(inc.type === 'construction' ? '🚧' : '⚠️', x - 8, y + 5);
        }
      }
    }
    
    // 绘制车辆
    for (const v of frame.vehicles) {
      const x = (v.x - viewOffset) / metersPerPixel;
      if (x < -20 || x > w + 20) continue;
      
      const y = roadTop + v.lane * laneHeight + laneHeight / 2;
      const vLen = (v.type === 'CAR' ? 4.5 : v.type === 'TRUCK' ? 12 : 10) / metersPerPixel;
      const vH = laneHeight * 0.5;
      
      // 车辆颜色（按异常状态优先）
      let color = COLORS.car;
      if (v.anomaly === 1) color = COLORS.anomaly1;
      else if (v.anomaly === 2) color = COLORS.anomaly2;
      else if (v.anomaly === 3) color = COLORS.anomaly3;
      else if (v.type === 'TRUCK') color = COLORS.truck;
      else if (v.type === 'BUS') color = COLORS.bus;
      
      // 速度映射透明度
      const speedAlpha = Math.max(0.4, Math.min(1, v.speed / 33));
      
      ctx.fillStyle = color;
      ctx.globalAlpha = speedAlpha;
      ctx.beginPath();
      ctx.roundRect(x - vLen / 2, y - vH / 2, vLen, vH, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    
    // HUD 信息
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(10, 10, 260, 65);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '13px monospace';
    ctx.fillText(`时间: ${frame.time.toFixed(1)}s | 帧: ${frameIndex + 1}/${frames.length}`, 20, 30);
    ctx.fillText(`车辆: ${frame.vehicles.length} | 速度: ${playbackSpeed}x`, 20, 50);
    ctx.fillText(`视图偏移: ${viewOffset.toFixed(0)}m | 缩放: ${zoomLevel.toFixed(1)}x`, 20, 68);
    
  }, [frames, viewOffset, zoomLevel, numLanes, roadLength, playbackSpeed]);
  
  // 播放循环
  useEffect(() => {
    if (!isPlaying || frames.length === 0) return;
    
    let prevTime = performance.now();
    
    const animate = (now: number) => {
      const dt = (now - prevTime) / 1000;
      prevTime = now;
      
      setCurrentIndex(prev => {
        const next = prev + dt * playbackSpeed * 2; // 每秒2帧
        if (next >= frames.length) {
          setIsPlaying(false);
          return frames.length - 1;
        }
        return next;
      });
      
      animFrameRef.current = requestAnimationFrame(animate);
    };
    
    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, frames.length, playbackSpeed]);
  
  // 渲染当前帧
  useEffect(() => {
    renderFrame(Math.floor(currentIndex));
  }, [currentIndex, renderFrame]);
  
  // Canvas 尺寸适配
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
  
  // 键盘控制
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
          e.preventDefault();
          setIsPlaying(p => !p);
          break;
        case 'ArrowRight':
          setCurrentIndex(i => Math.min(i + 1, frames.length - 1));
          break;
        case 'ArrowLeft':
          setCurrentIndex(i => Math.max(i - 1, 0));
          break;
        case '+':
        case '=':
          setZoomLevel(z => Math.min(z * 1.2, 10));
          break;
        case '-':
          setZoomLevel(z => Math.max(z / 1.2, 0.1));
          break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [frames.length]);
  
  // 鼠标拖拽/缩放
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    let isDragging = false;
    let startX = 0;
    let startOffset = 0;
    
    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      startX = e.clientX;
      startOffset = viewOffset;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const metersPerPixel = roadLength / (canvas.width * zoomLevel);
      setViewOffset(startOffset - dx * metersPerPixel);
    };
    const onMouseUp = () => { isDragging = false; };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        setZoomLevel(z => Math.max(0.1, Math.min(10, z * (e.deltaY > 0 ? 0.9 : 1.1))));
      } else {
        const metersPerPixel = roadLength / (canvas.width * zoomLevel);
        setViewOffset(v => v + e.deltaY * metersPerPixel * 0.5);
      }
    };
    
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('mouseleave', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [viewOffset, zoomLevel, roadLength]);
  
  return (
    <div className="flex flex-col h-full bg-[var(--bg-base)]">
      {/* 顶部工具栏 */}
      <div className="h-14 flex items-center justify-between px-6 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-medium text-[var(--text-primary)]">🛣️ 道路俯视图回放</h2>
          
          {/* 导入按钮 */}
          <label className="cursor-pointer px-3 py-1.5 text-sm rounded-lg bg-[var(--accent-blue)] text-white hover:opacity-90 transition-opacity">
            📂 导入轨迹
            <input type="file" accept=".json" onChange={handleFileImport} className="hidden" />
          </label>
          
          {/* 实时模式开关 */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--glass-border)]">
            <span className={`text-xs ${liveMode ? 'text-[var(--accent-green)]' : 'text-[var(--text-muted)]'}`}>
              ⚡ 实时
            </span>
            <button
              onClick={() => setLiveMode(!liveMode)}
              className={`w-8 h-4 rounded-full relative transition-colors ${liveMode ? 'bg-[var(--accent-green)]' : 'bg-[var(--text-muted)]'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${liveMode ? 'left-4' : 'left-0.5'}`} />
            </button>
          </div>
        </div>
        
        {/* 回放控制 */}
        {isLoaded && (
          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentIndex(0)} className="text-lg hover:opacity-80" title="重置">⏮</button>
            <button onClick={() => setCurrentIndex(i => Math.max(0, i - 10))} className="text-lg hover:opacity-80" title="后退10帧">⏪</button>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-10 h-10 rounded-full bg-[var(--accent-blue)] text-white flex items-center justify-center text-xl hover:opacity-90"
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button onClick={() => setCurrentIndex(i => Math.min(frames.length - 1, i + 10))} className="text-lg hover:opacity-80" title="前进10帧">⏩</button>
            <button onClick={() => setCurrentIndex(frames.length - 1)} className="text-lg hover:opacity-80" title="末尾">⏭</button>
            
            {/* 速度选择 */}
            <select
              value={playbackSpeed}
              onChange={e => setPlaybackSpeed(Number(e.target.value))}
              className="px-2 py-1 text-sm rounded bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-primary)]"
            >
              {SPEED_OPTIONS.map(s => (
                <option key={s} value={s}>{s}x</option>
              ))}
            </select>
          </div>
        )}
      </div>
      
      {/* Canvas 区域 */}
      <div ref={containerRef} className="flex-1 relative">
        {!isLoaded ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--text-muted)]">
            <div className="text-6xl mb-4">🛣️</div>
            <p className="text-lg mb-2">导入仿真轨迹数据以开始回放</p>
            <p className="text-sm">支持 JSON 格式的轨迹记录文件</p>
            <label className="cursor-pointer mt-4 px-6 py-3 text-base rounded-xl bg-[var(--accent-blue)] text-white hover:opacity-90 transition-opacity">
              📂 选择文件
              <input type="file" accept=".json" onChange={handleFileImport} className="hidden" />
            </label>
          </div>
        ) : (
          <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
        )}
      </div>
      
      {/* 进度条 */}
      {isLoaded && (
        <div className="h-10 flex items-center gap-4 px-6 border-t border-[var(--glass-border)] bg-[var(--glass-bg)] shrink-0">
          <span className="text-xs text-[var(--text-muted)] w-20">
            {frames[Math.floor(currentIndex)]?.time.toFixed(1)}s
          </span>
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            value={Math.floor(currentIndex)}
            onChange={e => setCurrentIndex(Number(e.target.value))}
            className="flex-1 h-1 accent-[var(--accent-blue)]"
          />
          <span className="text-xs text-[var(--text-muted)] w-20 text-right">
            {frames[frames.length - 1]?.time.toFixed(1)}s
          </span>
        </div>
      )}
    </div>
  );
};
