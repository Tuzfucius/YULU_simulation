import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import {
  CartesianGrid,
  ComposedChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, TrendingDown } from 'lucide-react';

interface CarData {
  id: string;
  lane: number;
  speedProfile: (t: number) => number;
  brakeAt?: number;
  vehicleType: 'coupe' | 'suv';
  isHero?: boolean;
}

const DURATION = 10;
const HERO_LANE = 1;
const OBSTACLE_POS = 75;
const STOP_POS_HERO = 62;
const GAP_PER_CAR = 16;
const SPEED = 16;
const BRAKE_START = 2;

const getHeroPosition = (t: number): number => {
  const stopTime = 4.5;
  const startPos = 10;

  if (t < BRAKE_START) {
    return startPos + t * SPEED;
  }
  if (t < stopTime) {
    const dt = t - BRAKE_START;
    const duration = stopTime - BRAKE_START;
    const posAtBrake = startPos + BRAKE_START * SPEED;
    const accel = -SPEED / duration;
    return posAtBrake + SPEED * dt + 0.5 * accel * dt * dt;
  }
  return STOP_POS_HERO;
};

const getQueuePosition = (t: number, index: number): number => {
  const targetPos = getHeroPosition(t);
  const myStopPos = STOP_POS_HERO - GAP_PER_CAR * index;
  const offset = -16 * index;

  if (t < BRAKE_START + 0.2 + index * 0.2) {
    return targetPos + offset;
  }

  const currentIdeal = targetPos + offset;
  return currentIdeal > myStopPos ? myStopPos : currentIdeal;
};

const getBgCarPosition = (t: number, startPos: number, speed: number, lane: number): number => {
  let pos = startPos + t * speed;
  if (lane === 2 && t > 2.5) {
    pos -= (t - 2.5) * 4;
  }
  return ((pos + 20) % 160) - 20;
};

function Box3D({
  width,
  height,
  depth,
  colorClass,
  borderClass = 'border-white/5',
  children,
  style,
}: {
  width: string;
  height: string;
  depth: number;
  colorClass: string;
  borderClass?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const halfDepth = depth / 2;
  return (
    <div className="purpose-3d relative" style={{ width, height, ...style }}>
      <div className={`absolute inset-0 ${colorClass} ${borderClass} border`} style={{ transform: `translateZ(${halfDepth}px)` }}>
        {children}
      </div>
      <div className="absolute inset-0 bg-black shadow-lg" style={{ transform: `rotateY(180deg) translateZ(${halfDepth}px)` }} />
      <div className={`absolute right-0 top-0 h-full ${colorClass} ${borderClass} origin-right border brightness-75`} style={{ width: `${depth}px`, transform: 'rotateY(90deg)' }} />
      <div className={`absolute left-0 top-0 h-full ${colorClass} ${borderClass} origin-left border brightness-75`} style={{ width: `${depth}px`, transform: 'rotateY(-90deg)' }} />
      <div className={`absolute left-0 top-0 w-full ${colorClass} ${borderClass} origin-top border brightness-110`} style={{ height: `${depth}px`, transform: 'rotateX(90deg)' }} />
      <div className={`absolute bottom-0 left-0 w-full ${colorClass} ${borderClass} origin-bottom border brightness-50`} style={{ height: `${depth}px`, transform: 'rotateX(-90deg)' }} />
    </div>
  );
}

function Wheel({ x, y, scale = 1 }: { x: string; y: string; scale?: number }) {
  return (
    <div className="purpose-3d absolute h-[4px] w-[16%]" style={{ left: x, top: y, transform: `translateZ(4px) scale(${scale})` }}>
      <Box3D width="100%" height="100%" depth={12} colorClass="bg-zinc-900" borderClass="border-black">
        <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,#111,#111_2px,#333_2px,#333_4px)]" />
      </Box3D>
      <div className="purpose-3d absolute bottom-0 left-0 flex h-[12px] w-full items-center justify-center origin-bottom" style={{ transform: 'rotateX(-90deg)' }}>
        <div className="h-[60%] w-[60%] rounded-full border-[2px] border-zinc-400 bg-zinc-500 shadow-[inset_0_0_4px_black]" />
      </div>
      <div className="purpose-3d absolute left-0 top-0 flex h-[12px] w-full items-center justify-center origin-top" style={{ transform: 'rotateX(90deg)' }}>
        <div className="h-[60%] w-[60%] rounded-full border-[2px] border-zinc-400 bg-zinc-500 shadow-[inset_0_0_4px_black]" />
      </div>
    </div>
  );
}

function SuvBody({ colorClass, borderClass, isBraking }: { colorClass: string; borderClass: string; isBraking?: boolean }) {
  const tailColor = isBraking ? 'bg-red-500 shadow-[0_0_20px_red]' : 'bg-red-800';
  const chassisZ = 6;
  const bodyHeight = 16;

  return (
    <div className="purpose-3d h-full w-full">
      <Wheel x="12%" y="-1px" scale={1.3} />
      <Wheel x="72%" y="-1px" scale={1.3} />
      <Wheel x="12%" y="99%" scale={1.3} />
      <Wheel x="72%" y="99%" scale={1.3} />

      <div className="purpose-3d absolute inset-y-0 inset-x-[2%]" style={{ transform: `translateZ(${chassisZ + bodyHeight / 2}px)` }}>
        <Box3D width="96%" height="100%" depth={bodyHeight} colorClass={colorClass} borderClass={borderClass}>
          <div className="purpose-3d absolute left-0 top-0 h-full w-[2px]">
            <div className="purpose-3d absolute left-0 top-1/2 h-[90%] w-[14px] -translate-y-1/2 origin-left" style={{ transform: 'rotateY(-90deg) translateX(7px)' }}>
              <div className={`absolute inset-0 ${colorClass}`} />
              <div className={`absolute bottom-0 left-0 top-0 w-[4px] ${tailColor}`} />
              <div className={`absolute bottom-0 right-0 top-0 w-[4px] ${tailColor}`} />
            </div>
          </div>
          <div className="absolute bottom-[10%] left-[20%] right-[5%] top-[10%] border border-zinc-950 bg-zinc-900">
            <div className={`absolute inset-[2px] ${colorClass}`} />
          </div>
        </Box3D>
      </div>

      <div className="purpose-3d absolute bottom-0 right-[2%] top-0 w-[20%]" style={{ transform: `translateZ(${chassisZ + bodyHeight / 2 - 2}px)` }}>
        <Box3D width="100%" height="100%" depth={bodyHeight - 4} colorClass={colorClass} borderClass={borderClass} />
      </div>
    </div>
  );
}

function CoupeBody({ colorClass, borderClass, isBraking }: { colorClass: string; borderClass: string; isBraking?: boolean }) {
  const tailColor = isBraking ? 'bg-red-500 shadow-[0_0_20px_red]' : 'bg-red-800';
  const chassisZ = 4;

  return (
    <div className="purpose-3d h-full w-full">
      <Wheel x="14%" y="0%" />
      <Wheel x="75%" y="0%" />
      <Wheel x="14%" y="98%" />
      <Wheel x="75%" y="98%" />

      <div className="purpose-3d absolute bottom-[2%] left-[2%] top-[2%]" style={{ width: '20%', transform: `translateZ(${chassisZ + 5}px)` }}>
        <Box3D width="100%" height="100%" depth={10} colorClass={colorClass} borderClass={borderClass}>
          <div className="purpose-3d absolute left-0 top-0 h-full w-[2px]">
            <div className="purpose-3d absolute left-0 top-1/2 h-[90%] w-[10px] -translate-y-1/2 origin-left" style={{ transform: 'rotateY(-90deg) translateX(5px)' }}>
              <div className={`absolute left-0 right-0 top-1 h-[3px] ${tailColor}`} />
              <div className={`absolute left-0 right-0 top-1/2 h-[3px] ${tailColor}`} />
            </div>
          </div>
        </Box3D>
      </div>

      <div className="purpose-3d absolute bottom-[2%] left-[22%] top-[2%]" style={{ width: '42%', transform: `translateZ(${chassisZ + 6.5}px)` }}>
        <Box3D width="100%" height="100%" depth={13} colorClass={colorClass} borderClass={borderClass}>
          <div className={`absolute inset-[3px] ${colorClass} brightness-110`} />
        </Box3D>
      </div>

      <div className="purpose-3d absolute bottom-[2%] right-[2%] top-[2%]" style={{ width: '28%', transform: `translateZ(${chassisZ + 4.5}px)` }}>
        <Box3D width="100%" height="100%" depth={9} colorClass={colorClass} borderClass={borderClass} />
      </div>
    </div>
  );
}

function CarBox({ car, isBraking }: { car: CarData; isBraking: boolean }) {
  let colorClass = 'bg-zinc-800';
  let borderClass = 'border-zinc-700';

  if (car.isHero) {
    colorClass = 'bg-orange-600';
    borderClass = 'border-orange-400/50';
  } else if (car.vehicleType === 'suv') {
    colorClass = 'bg-zinc-500';
    borderClass = 'border-zinc-400';
  } else {
    colorClass = 'bg-slate-200';
    borderClass = 'border-white/50';
  }

  return (
    <div className="purpose-3d relative h-full w-full">
      <div className="absolute inset-0 scale-[0.85] bg-black/60 blur-md [transform:translateZ(1px)]" />
      <div className={`purpose-3d absolute inset-0 transition-transform duration-200 ${isBraking ? 'rotate-y-[1deg]' : ''}`}>
        {car.vehicleType === 'suv'
          ? <SuvBody colorClass={colorClass} borderClass={borderClass} isBraking={isBraking} />
          : <CoupeBody colorClass={colorClass} borderClass={borderClass} isBraking={isBraking} />}
      </div>
    </div>
  );
}

function Gantry3D() {
  return (
    <div className="purpose-3d relative h-full w-full">
      <div className="purpose-3d absolute top-[-50px] h-[40px] w-full" style={{ transform: 'translateZ(35px)' }}>
        <Box3D width="100%" height="100%" depth={70} colorClass="bg-slate-400" borderClass="border-slate-300" />
      </div>
      <div className="purpose-3d absolute bottom-[-50px] h-[40px] w-full" style={{ transform: 'translateZ(35px)' }}>
        <Box3D width="100%" height="100%" depth={70} colorClass="bg-slate-400" borderClass="border-slate-300" />
      </div>
      <div className="purpose-3d absolute bottom-[-30px] top-[-30px] w-full" style={{ transform: 'translateZ(55px)' }}>
        <Box3D width="100%" height="100%" depth={16} colorClass="bg-slate-300" borderClass="border-white/20">
          <div className="absolute inset-x-0 bottom-[10%] top-[10%] flex items-center justify-center border-2 border-slate-500 bg-zinc-900 shadow-lg [transform:translateZ(9px)]">
            <span className="whitespace-nowrap text-[8px] font-bold tracking-widest text-slate-200 [transform:rotate(90deg)]">ETC 专用</span>
          </div>
        </Box3D>
      </div>
    </div>
  );
}

function HighwayScene({ currentTime }: { currentTime: number }) {
  const gantries = [20, 68];
  const cars = useMemo<CarData[]>(() => {
    const list: CarData[] = [];
    list.push({
      id: 'hero',
      lane: HERO_LANE,
      speedProfile: getHeroPosition,
      brakeAt: BRAKE_START,
      vehicleType: 'suv',
      isHero: true,
    });
    list.push({
      id: 'q1',
      lane: HERO_LANE,
      speedProfile: t => getQueuePosition(t, 1),
      brakeAt: BRAKE_START + 0.3,
      vehicleType: 'coupe',
    });
    list.push({
      id: 'q2',
      lane: HERO_LANE,
      speedProfile: t => getQueuePosition(t, 2),
      brakeAt: BRAKE_START + 0.6,
      vehicleType: 'suv',
    });

    const laneConfigs: Array<{ lane: number; speed: number; count: number; types: Array<'coupe' | 'suv'> }> = [
      { lane: 0, speed: 16, count: 4, types: ['suv', 'coupe', 'coupe', 'suv'] },
      { lane: 2, speed: 12, count: 5, types: ['coupe', 'suv', 'coupe', 'suv', 'coupe'] },
      { lane: 3, speed: 13, count: 4, types: ['suv', 'coupe', 'suv', 'coupe'] },
    ];

    laneConfigs.forEach(config => {
      const spacing = 140 / config.count;
      for (let i = 0; i < config.count; i += 1) {
        const startPos = i * spacing + (Math.random() - 0.5) * 10;
        list.push({
          id: `bg-${config.lane}-${i}`,
          lane: config.lane,
          speedProfile: t => getBgCarPosition(t, startPos, config.speed, config.lane),
          brakeAt: config.lane === 2 ? 3.5 : undefined,
          vehicleType: config.types[i],
        });
      }
    });

    return list;
  }, []);

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#050505]">
      <div className="absolute inset-0 flex items-center justify-center [perspective:800px]">
        <div
          className="purpose-3d relative h-[500px] w-[140%] bg-[#101012] shadow-2xl"
          style={{ transform: 'rotateX(55deg) rotateZ(-5deg) translateY(50px) scale(0.9)', boxShadow: '0 0 100px rgba(0,0,0,0.8)' }}
        >
          <div className="absolute inset-0 opacity-80" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #27272a 0%, #000000 100%)' }} />

          <div className="purpose-3d absolute top-[32%] z-20" style={{ left: `${OBSTACLE_POS}%`, transform: 'translateZ(12px)' }}>
            <div className="purpose-3d relative h-10 w-12">
              <div className="absolute inset-0 bg-red-900/50 blur-md [transform:translateZ(-12px)]" />
              <Box3D width="100%" height="100%" depth={24} colorClass="bg-red-600/60" borderClass="border-red-400">
                <div className="flex h-full w-full items-center justify-center">
                  <AlertTriangle className="h-6 w-6 animate-pulse text-white" />
                </div>
              </Box3D>
            </div>
          </div>

          {cars.map(car => {
            const leftPos = car.speedProfile(currentTime);
            if (leftPos < -20 || leftPos > 120) {
              return null;
            }
            const isBraking = car.brakeAt !== undefined && currentTime >= car.brakeAt;
            return (
              <div
                key={car.id}
                className="purpose-3d absolute transition-transform will-change-[left]"
                style={{
                  left: `${leftPos}%`,
                  top: `${car.lane * 25 + 7}%`,
                  width: '10%',
                  height: '11%',
                  zIndex: 20 + car.lane,
                }}
              >
                <CarBox car={car} isBraking={isBraking} />
              </div>
            );
          })}

          {gantries.map(pos => (
            <div key={pos} className="purpose-3d absolute bottom-0 top-0 w-6" style={{ left: `${pos}%`, zIndex: 50 }}>
              <Gantry3D />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type ChartPoint = { x: number; y: number; isHero: boolean };
type DashShapeProps = { cx?: number; cy?: number; payload?: ChartPoint };
type ScannerShapeProps = { x1?: number; x2?: number };

function HorizontalDash(props: DashShapeProps) {
  const { cx, cy, payload } = props;
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !payload) {
    return null;
  }

  const length = 15;
  if (payload.isHero) {
    return <line x1={(cx ?? 0) - length} y1={cy} x2={(cx ?? 0) - 2.5} y2={cy} stroke="#fbbf24" strokeLinecap="round" strokeWidth={5} />;
  }

  let stroke = '#22d3ee';
  let opacity = 0.6;
  if (payload.y < 40) {
    stroke = '#ef4444';
    opacity = 0.9;
  } else if (payload.y < 90) {
    stroke = '#a78bfa';
    opacity = 0.7;
  }
  return <line x1={(cx ?? 0) - length} y1={cy} x2={cx} y2={cy} opacity={opacity} stroke={stroke} strokeLinecap="butt" strokeWidth={2.5} />;
}

function ScannerLineShape(props: ScannerShapeProps) {
  const { x1, x2 } = props;
  if (!x1) {
    return null;
  }
  return (
    <line
      x1={x1}
      x2={x2}
      y1="0"
      y2="100%"
      className="drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]"
      stroke="#22d3ee"
      strokeWidth={1.5}
    />
  );
}

const HeavyScatterPlot = React.memo(function HeavyScatterPlot({ dataTime }: { dataTime: number }) {
  const { heroData, bgData } = useMemo(() => {
    const hData: ChartPoint[] = [];
    const bData: ChartPoint[] = [];

    for (let t = 0; t <= 10.5; t += 0.25) {
      if (Math.random() > 0.3) {
        bData.push({ x: t, y: 115 + Math.random() * 15, isHero: false });
      }
      if (Math.random() > 0.3) {
        bData.push({ x: t, y: 95 + Math.random() * 10, isHero: false });
      }
      let lane2Speed = 100 + Math.random() * 10;
      if (t > 3) {
        lane2Speed -= (t - 3) * 20;
      }
      bData.push({ x: t, y: Math.max(40, lane2Speed), isHero: false });
    }

    for (let t = 0; t <= 10.2; t += 0.12) {
      let heroSpeed = 110;
      if (t >= 2 && t < 4.5) {
        heroSpeed = Math.max(0, 110 * (1 - (t - 2) / 2.5));
      } else if (t >= 4.5) {
        heroSpeed = 0;
      }
      if (t < 2) {
        heroSpeed += (Math.random() - 0.5) * 5;
      }
      if (t < 6 || heroSpeed > 0) {
        hData.push({ x: t, y: Math.max(0, heroSpeed), isHero: true });
      }
    }
    return { heroData: hData, bgData: bData };
  }, []);

  const currentHero = useMemo(() => heroData.filter(d => d.x <= dataTime), [heroData, dataTime]);
  const currentBg = useMemo(() => bgData.filter(d => d.x <= dataTime), [bgData, dataTime]);
  const formatTimeAxis = (value: number): string => `14:${30 + Math.floor(value)}`;

  return (
    <ResponsiveContainer height="100%" width="100%">
      <ComposedChart margin={{ top: 35, right: 20, left: 40, bottom: 20 }}>
        <defs>
          <linearGradient id="safetyGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
            <stop offset="25%" stopColor="#10b981" stopOpacity={0.2} />
            <stop offset="35%" stopColor="#f59e0b" stopOpacity={0.2} />
            <stop offset="55%" stopColor="#ef4444" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
          </linearGradient>
          <clipPath id="chartClip" clipPathUnits="objectBoundingBox">
            <rect height="1" width={dataTime / 10} x="0" y="0" />
          </clipPath>
        </defs>

        <CartesianGrid opacity={0.3} stroke="#334155" strokeDasharray="3 3" vertical />
        <ReferenceArea clipPath="url(#chartClip)" fill="url(#safetyGradient)" ifOverflow="visible" x1={0} x2={10} y1={0} y2={140} />
        <XAxis axisLine dataKey="x" domain={[0, 10]} height={20} interval={0} stroke="#334155" tick={{ fontSize: 10, fill: '#94a3b8' }} tickCount={11} tickFormatter={formatTimeAxis} type="number" />
        <YAxis axisLine={false} dataKey="y" domain={[0, 140]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} type="number" width={30} />
        <Scatter data={currentHero} isAnimationActive={false} shape={<HorizontalDash />} />
        <Scatter data={currentBg} isAnimationActive={false} shape={<HorizontalDash />} />
        <ReferenceLine ifOverflow="extendDomain" shape={ScannerLineShape} x={dataTime} />
      </ComposedChart>
    </ResponsiveContainer>
  );
});

function HudChart({ currentTime, dataTime }: { currentTime: number; dataTime: number }) {
  const showWarning = currentTime > 2;

  return (
    <div className="relative flex h-full w-full flex-col bg-slate-900/50 p-2">
      <div className="relative flex-1 overflow-hidden rounded-sm border border-slate-800 bg-slate-950 pb-4">
        <div className="purpose-grid absolute inset-0 opacity-10" />
        <div className="absolute bottom-8 left-0 top-0 z-0 w-[50px] border-r border-slate-800/50 bg-slate-900/50" />
        <div className="purpose-mono absolute left-3 top-2 z-10 whitespace-nowrap text-xs text-slate-400">速度 (km/h)</div>
        <HeavyScatterPlot dataTime={dataTime} />

        <div className={`pointer-events-none absolute left-[65%] top-[40%] transition-all duration-500 ${showWarning ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'}`}>
          <div className="flex items-center gap-4 rounded-md border-2 border-red-500/50 bg-slate-950/90 p-4 shadow-[0_0_30px_rgba(220,38,38,0.2)] backdrop-blur-md">
            <TrendingDown className="h-12 w-12 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
            <div className="flex flex-col">
              <span className="text-xl font-bold leading-tight tracking-wider text-red-100">监测到速度骤降</span>
              <span className="purpose-mono mt-1 text-sm text-red-400">位置: G01 C2-C3门架段</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CyberCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-sm border border-cyan-900/30 bg-slate-900/80 backdrop-blur-sm">
      <div className="absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-cyan-500/50 transition-colors group-hover:border-cyan-400" />
      <div className="absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 border-cyan-500/50 transition-colors group-hover:border-cyan-400" />
      <div className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-cyan-500/50 transition-colors group-hover:border-cyan-400" />
      <div className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-cyan-500/50 transition-colors group-hover:border-cyan-400" />
      <div className="relative z-0 flex-1 overflow-hidden">{children}</div>
      <div className="pointer-events-none absolute inset-0 z-[5] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] opacity-10" />
    </div>
  );
}

export function ProjectPurposeAnimation() {
  const prefersReducedMotion = useReducedMotion();
  const [time, setTime] = useState(0);
  const requestRef = useRef<number>(0);
  const startTimeRef = useRef<number | null>(null);
  const previousTimeRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setTime(4.5);
      return undefined;
    }

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp - previousTimeRef.current * 1000;
      }
      const elapsed = (timestamp - startTimeRef.current) / 1000;
      const loopedTime = elapsed % DURATION;
      setTime(loopedTime);
      previousTimeRef.current = loopedTime;
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [prefersReducedMotion]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-[#020617] p-3 md:p-4">
      <style>{`
        .purpose-mono { font-family: "JetBrains Mono", monospace; }
        .purpose-grid {
          background-size: 40px 40px;
          background-image:
            linear-gradient(to right, rgba(6, 182, 212, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(6, 182, 212, 0.1) 1px, transparent 1px);
        }
        .purpose-3d { transform-style: preserve-3d; }
      `}</style>
      <main className="grid h-full min-h-[860px] grid-cols-1 grid-rows-2 gap-3">
        <CyberCard>
          <HighwayScene currentTime={time} />
        </CyberCard>
        <CyberCard>
          <HudChart currentTime={time} dataTime={time} />
        </CyberCard>
      </main>
    </div>
  );
}
