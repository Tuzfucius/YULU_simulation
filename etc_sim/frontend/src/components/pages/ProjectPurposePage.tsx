import { motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  BrainCircuit,
  Eye,
  Gauge,
  LineChart,
  MonitorPlay,
  Route,
} from 'lucide-react';

type VehicleConfig = {
  id: string;
  laneClassName: string;
  startX: number;
  endX: number;
  duration: number;
  delay?: number;
  color: 'light' | 'dark' | 'alert';
};

const VEHICLES: VehicleConfig[] = [
  { id: 'v-1', laneClassName: 'top-10', startX: -6, endX: 78, duration: 11, color: 'dark' },
  { id: 'v-2', laneClassName: 'top-24', startX: 10, endX: 92, duration: 14, delay: 1, color: 'light' },
  { id: 'v-3', laneClassName: 'top-40', startX: -2, endX: 72, duration: 12, delay: 2, color: 'light' },
  { id: 'v-4', laneClassName: 'top-[13.5rem]', startX: 18, endX: 86, duration: 13, delay: 1.5, color: 'dark' },
  { id: 'v-5', laneClassName: 'top-[18.5rem]', startX: -8, endX: 82, duration: 16, delay: 0.5, color: 'light' },
  { id: 'v-6', laneClassName: 'top-[23rem]', startX: 8, endX: 68, duration: 10, delay: 2.2, color: 'alert' },
];

const FEATURE_ITEMS = [
  {
    icon: MonitorPlay,
    title: '仿真控制',
    description: '配置车流、环境与道路参数，实时观察不同策略下的交通演化过程。',
  },
  {
    icon: LineChart,
    title: '车流画像',
    description: '将速度、流量与拥堵变化沉淀为画像曲线，支撑区间诊断与趋势对比。',
  },
  {
    icon: AlertTriangle,
    title: '异常预警',
    description: '识别降速、停滞、障碍物等异常事件，为运营人员提供可解释的预警依据。',
  },
  {
    icon: BrainCircuit,
    title: '策略验证',
    description: '结合工作流、场景模板与预测能力，对干预方案进行离线验证与复盘。',
  },
];

const WORKFLOW_ITEMS = [
  '建立路网与场景，复现重点收费区间和车流组织方式。',
  '在仿真过程中持续采集车辆轨迹、速度变化和事件触发信息。',
  '把微观运行结果映射为区间级车流画像，生成可对比的态势特征。',
  '将画像与预警、回放、策略编辑页面联动，支撑分析、解释和决策。',
];

const VEHICLE_STYLES: Record<VehicleConfig['color'], { body: string; cargo: string; shadow: string }> = {
  light: {
    body: 'linear-gradient(135deg, #f8fafc, #cbd5e1)',
    cargo: 'linear-gradient(135deg, #dbeafe, #93c5fd)',
    shadow: '0 14px 32px rgba(15, 23, 42, 0.3)',
  },
  dark: {
    body: 'linear-gradient(135deg, #a1a1aa, #52525b)',
    cargo: 'linear-gradient(135deg, #64748b, #334155)',
    shadow: '0 14px 32px rgba(15, 23, 42, 0.32)',
  },
  alert: {
    body: 'linear-gradient(135deg, #fb7185, #ef4444)',
    cargo: 'linear-gradient(135deg, #f97316, #dc2626)',
    shadow: '0 16px 36px rgba(239, 68, 68, 0.35)',
  },
};

const CHART_POINTS = '0,160 68,156 136,154 204,153 272,152 340,149 408,144 476,134 544,108 612,82 680,74 748,86 816,96 884,98';

function VehicleCard({ color }: Pick<VehicleConfig, 'color'>) {
  const palette = VEHICLE_STYLES[color];

  return (
    <div
      className="relative h-10 w-24 shrink-0"
      style={{ filter: 'drop-shadow(0 10px 18px rgba(0, 0, 0, 0.22))' }}
      aria-hidden="true"
    >
      <div
        className="absolute left-0 top-2 h-5 w-14 rounded-[10px] border border-white/15"
        style={{ background: palette.cargo, boxShadow: palette.shadow }}
      />
      <div
        className="absolute left-11 top-1 h-7 w-11 rounded-[10px] border border-white/15"
        style={{ background: palette.body }}
      />
      <div className="absolute left-2 top-4 h-1 w-10 rounded-full bg-black/30" />
      <div className="absolute left-[3.25rem] top-3 h-2 w-5 rounded-sm bg-cyan-200/70" />
      <div className="absolute left-2 top-7 h-3 w-3 rounded-full border border-white/20 bg-slate-950/80" />
      <div className="absolute left-[3.75rem] top-7 h-3 w-3 rounded-full border border-white/20 bg-slate-950/80" />
      <div className="absolute left-[4.8rem] top-7 h-3 w-3 rounded-full border border-white/20 bg-slate-950/80" />
    </div>
  );
}

export function ProjectPurposePage() {
  const reduceMotion = useReducedMotion();

  return (
    <main className="h-full overflow-y-auto overflow-x-hidden bg-[var(--bg-base)]">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-8 p-8">
        <header className="glass-card relative overflow-hidden p-8">
          <div
            className="pointer-events-none absolute inset-0 opacity-80"
            style={{
              background:
                'radial-gradient(circle at 0% 0%, rgba(168, 199, 250, 0.18), transparent 36%), radial-gradient(circle at 100% 20%, rgba(208, 188, 255, 0.16), transparent 30%)',
            }}
          />
          <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <section className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2 text-sm text-[var(--text-secondary)]">
                <Activity className="h-4 w-4 text-[var(--accent-blue)]" />
                项目说明页
              </div>
              <div className="space-y-4">
                <h1 className="text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
                  以仿真复现车流演化，以画像解释异常与预警
                </h1>
                <p className="max-w-3xl text-base leading-7 text-[var(--text-secondary)]">
                  本项目面向 ETC 路段运行分析，核心目标是把“车辆怎么跑”与“区间状态怎么变”连接起来。
                  上层仿真场景负责复现车辆运动、事件干扰与路段状态，下层车流画像负责提取速度变化、
                  拥堵趋势和异常信号，为预警分析、策略验证和运行复盘提供统一依据。
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <article className="rounded-2xl border border-[var(--glass-border)] bg-black/10 p-4">
                  <p className="text-sm text-[var(--text-muted)]">项目定位</p>
                  <p className="mt-2 text-lg font-medium text-[var(--text-primary)]">运营解释型仿真平台</p>
                </article>
                <article className="rounded-2xl border border-[var(--glass-border)] bg-black/10 p-4">
                  <p className="text-sm text-[var(--text-muted)]">分析对象</p>
                  <p className="mt-2 text-lg font-medium text-[var(--text-primary)]">收费区间车流与异常事件</p>
                </article>
                <article className="rounded-2xl border border-[var(--glass-border)] bg-black/10 p-4">
                  <p className="text-sm text-[var(--text-muted)]">输出结果</p>
                  <p className="mt-2 text-lg font-medium text-[var(--text-primary)]">画像、预警、回放、策略评估</p>
                </article>
              </div>
            </section>

            <aside className="rounded-[28px] border border-[var(--glass-border)] bg-black/15 p-6">
              <h2 className="text-lg font-medium text-[var(--text-primary)]">页面阅读方式</h2>
              <ol className="mt-6 space-y-4 text-sm leading-6 text-[var(--text-secondary)]">
                <li className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
                    1
                  </span>
                  先看中部示意图，理解“仿真场景”如何生成“车流画像”。
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
                    2
                  </span>
                  再看下方功能卡片，了解现有页面分别承担的业务作用。
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
                    3
                  </span>
                  最后结合工作链路，明确系统如何服务于预警研判和策略验证。
                </li>
              </ol>
            </aside>
          </div>
        </header>

        <section className="glass-card overflow-hidden p-8" aria-labelledby="purpose-diagram-title">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-[var(--text-muted)]">Purpose Diagram</p>
              <h2 id="purpose-diagram-title" className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                仿真场景到车流画像的映射示意
              </h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
              示意图上半部分表达“车辆在区间内运动并触发事件”，下半部分表达“系统把运行过程沉淀为速度画像与预警结果”。
            </p>
          </div>

          <div className="mt-8 space-y-6">
            <article className="rounded-[28px] border border-[var(--glass-border)] bg-[linear-gradient(180deg,rgba(2,6,23,0.92),rgba(15,23,42,0.98))] p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-medium text-white">上层：车流动态仿真</h3>
                  <p className="mt-2 text-sm text-slate-300">车辆在收费区间和门架之间持续运动，异常事件会在空间上直接显现。</p>
                </div>
                <div className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200">
                  实时状态采集
                </div>
              </div>

              <div
                className="relative h-[22rem] overflow-hidden rounded-[24px] border border-white/10 bg-[radial-gradient(circle_at_50%_20%,rgba(51,65,85,0.22),transparent_45%),linear-gradient(180deg,#050816,#0b1120)]"
                role="img"
                aria-label="车流仿真示意图，展示车辆在多车道区间内运动并在异常位置产生告警"
              >
                <div className="absolute inset-y-0 left-[31%] w-4 bg-gradient-to-b from-slate-400/70 via-slate-300 to-slate-400/70" />
                <div className="absolute inset-y-0 left-[67%] w-4 bg-gradient-to-b from-slate-400/70 via-slate-300 to-slate-400/70" />
                <div className="absolute inset-x-0 top-[5.25rem] border-t border-white/5" />
                <div className="absolute inset-x-0 top-[10rem] border-t border-white/5" />
                <div className="absolute inset-x-0 top-[14.75rem] border-t border-white/5" />
                <div className="absolute inset-x-0 top-[19.5rem] border-t border-white/5" />

                <div className="absolute left-[30.15%] top-[9rem] h-8 w-8 rounded bg-slate-300/70" />
                <div className="absolute left-[66.15%] top-[13rem] h-8 w-8 rounded bg-slate-300/70" />
                <div className="absolute left-[calc(31%-0.9rem)] top-6 -rotate-90 text-xs tracking-[0.3em] text-slate-300/70">门架 A</div>
                <div className="absolute left-[calc(67%-0.9rem)] top-6 -rotate-90 text-xs tracking-[0.3em] text-slate-300/70">门架 B</div>

                {VEHICLES.map(vehicle => (
                  <motion.div
                    key={vehicle.id}
                    className={`absolute ${vehicle.laneClassName}`}
                    initial={{ x: `${vehicle.startX}%` }}
                    animate={reduceMotion ? { x: `${vehicle.endX}%` } : { x: [`${vehicle.startX}%`, `${vehicle.endX}%`] }}
                    transition={reduceMotion ? { duration: 0 } : {
                      duration: vehicle.duration,
                      delay: vehicle.delay ?? 0,
                      repeat: Number.POSITIVE_INFINITY,
                      repeatType: 'loop',
                      ease: 'linear',
                    }}
                  >
                    <VehicleCard color={vehicle.color} />
                  </motion.div>
                ))}

                <motion.div
                  className="absolute right-[18%] top-[7.5rem] flex flex-col items-start gap-3"
                  animate={reduceMotion ? { opacity: 1 } : { opacity: [0.8, 1, 0.8] }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 2.8, repeat: Number.POSITIVE_INFINITY }}
                >
                  <div className="flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-600/15 px-4 py-2 text-sm font-medium text-red-100 shadow-[0_0_28px_rgba(239,68,68,0.22)]">
                    <AlertTriangle className="h-4 w-4" />
                    障碍物 / 降速点
                  </div>
                  <div className="h-10 w-10 rounded bg-[linear-gradient(135deg,#ef4444,#7f1d1d)] shadow-[0_0_28px_rgba(239,68,68,0.28)]" />
                </motion.div>

                <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-xs text-slate-300">
                  <Gauge className="h-4 w-4 text-cyan-200" />
                  系统持续记录速度、密度、排队变化与异常事件
                </div>
              </div>
            </article>

            <div className="flex justify-center">
              <div className="inline-flex items-center gap-3 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-6 py-3 text-sm text-[var(--text-secondary)]">
                <ArrowDown className="h-4 w-4 text-[var(--accent-blue)]" />
                运行轨迹和事件信号汇聚为区间级车流画像
              </div>
            </div>

            <article className="rounded-[28px] border border-[var(--glass-border)] bg-[linear-gradient(180deg,rgba(4,8,28,0.96),rgba(8,18,48,0.96))] p-6">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-medium text-white">下层：车流画像 / 速度画像</h3>
                  <p className="mt-2 text-sm text-slate-300">系统把连续运动结果映射为时间序列画像，用于判断降速、拥堵与事件影响范围。</p>
                </div>
                <div className="rounded-full border border-red-500/25 bg-red-500/10 px-4 py-2 text-sm text-red-100">
                  区间预警输出
                </div>
              </div>

              <div
                className="relative overflow-hidden rounded-[24px] border border-cyan-500/10 bg-[radial-gradient(circle_at_0%_0%,rgba(34,211,238,0.12),transparent_28%),linear-gradient(180deg,#020617,#08122b)] p-6"
                role="img"
                aria-label="车流画像示意图，展示区间速度曲线在异常点位附近显著下探并触发预警"
              >
                <div className="grid gap-6 lg:grid-cols-[120px_minmax(0,1fr)]">
                  <div className="flex flex-col justify-between rounded-2xl border border-cyan-400/10 bg-cyan-400/5 p-4">
                    <div>
                      <p className="text-sm text-slate-400">速度</p>
                      <p className="mt-2 text-3xl font-semibold text-cyan-200">105</p>
                      <p className="mt-1 text-xs tracking-[0.18em] text-slate-500">KM/H</p>
                    </div>
                    <div className="space-y-2">
                      <div className="h-2 rounded-full bg-slate-800">
                        <div className="h-full w-[78%] rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.42)]" />
                      </div>
                      <div className="h-2 rounded-full bg-slate-800">
                        <div className="h-full w-[58%] rounded-full bg-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.38)]" />
                      </div>
                    </div>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl border border-white/6 bg-[rgba(2,6,23,0.48)] p-4">
                    <svg viewBox="0 0 920 220" className="h-[18rem] w-full">
                      <defs>
                        <linearGradient id="profileStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#38bdf8" />
                          <stop offset="60%" stopColor="#facc15" />
                          <stop offset="100%" stopColor="#ef4444" />
                        </linearGradient>
                        <linearGradient id="profileFill" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="rgba(56, 189, 248, 0.28)" />
                          <stop offset="100%" stopColor="rgba(56, 189, 248, 0.02)" />
                        </linearGradient>
                      </defs>

                      {Array.from({ length: 6 }).map((_, index) => (
                        <line
                          key={`row-${index}`}
                          x1="0"
                          x2="920"
                          y1={20 + index * 36}
                          y2={20 + index * 36}
                          stroke="rgba(148, 163, 184, 0.12)"
                          strokeDasharray="4 6"
                        />
                      ))}
                      {Array.from({ length: 8 }).map((_, index) => (
                        <line
                          key={`column-${index}`}
                          x1={index * 120}
                          x2={index * 120}
                          y1="0"
                          y2="220"
                          stroke="rgba(148, 163, 184, 0.08)"
                          strokeDasharray="4 6"
                        />
                      ))}

                      <polyline
                        points={`${CHART_POINTS} 884,220 0,220`}
                        fill="url(#profileFill)"
                      />
                      <polyline
                        points={CHART_POINTS}
                        fill="none"
                        stroke="url(#profileStroke)"
                        strokeWidth="5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                      <line x1="612" x2="612" y1="0" y2="220" stroke="rgba(239, 68, 68, 0.4)" strokeDasharray="8 8" />
                      <circle cx="612" cy="82" r="7" fill="#ef4444" />
                    </svg>

                    <div className="pointer-events-none absolute inset-x-4 bottom-3 flex justify-between text-xs text-slate-500">
                      <span>14:30</span>
                      <span>14:32</span>
                      <span>14:34</span>
                      <span>14:36</span>
                      <span>14:38</span>
                      <span>14:40</span>
                    </div>

                    <div className="absolute right-6 top-12 max-w-[18rem] rounded-2xl border border-red-500/35 bg-[rgba(127,29,29,0.24)] p-4 text-red-50 shadow-[0_0_28px_rgba(239,68,68,0.18)]">
                      <div className="flex items-start gap-3">
                        <Eye className="mt-0.5 h-5 w-5 text-red-300" />
                        <div>
                          <p className="text-base font-medium">监测到速度骤降</p>
                          <p className="mt-2 text-sm leading-6 text-red-100/85">位置：G01 C2-C3 门架段，推测为障碍物或局部排队影响。</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_420px]">
          <article className="glass-card p-8">
            <header className="flex items-center gap-3">
              <Route className="h-5 w-5 text-[var(--accent-blue)]" />
              <h2 className="text-2xl font-semibold text-[var(--text-primary)]">系统工作链路</h2>
            </header>
            <div className="mt-8 space-y-4">
              {WORKFLOW_ITEMS.map((item, index) => (
                <div key={item} className="flex gap-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-blue)]/15 text-sm font-semibold text-[var(--accent-blue)]">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-7 text-[var(--text-secondary)]">{item}</p>
                </div>
              ))}
            </div>
          </article>

          <aside className="glass-card p-8">
            <header className="flex items-center gap-3">
              <Gauge className="h-5 w-5 text-[var(--accent-green)]" />
              <h2 className="text-2xl font-semibold text-[var(--text-primary)]">可回答的问题</h2>
            </header>
            <ul className="mt-8 space-y-4 text-sm leading-7 text-[var(--text-secondary)]">
              <li className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                当前区间为什么发生降速，影响从哪个门架开始扩散。
              </li>
              <li className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                某个场景模板或控制策略是否能够缓解拥堵与排队。
              </li>
              <li className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                预警信号是否与仿真轨迹一致，是否存在误报或漏报。
              </li>
              <li className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4">
                回放结果、画像结果与大屏展示之间是否保持统一解释口径。
              </li>
            </ul>
          </aside>
        </section>

        <section className="glass-card p-8">
          <header>
            <h2 className="text-2xl font-semibold text-[var(--text-primary)]">相关功能入口</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">
              说明页的目标不是替代现有功能，而是帮助使用者快速理解各页面在整套分析闭环中的位置。
            </p>
          </header>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {FEATURE_ITEMS.map(item => {
              const Icon = item.icon;
              return (
                <article
                  key={item.title}
                  className="rounded-[24px] border border-[var(--glass-border)] bg-[var(--glass-bg)] p-6 transition-colors hover:bg-[var(--glass-bg-hover)]"
                >
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-blue)]/15 text-[var(--accent-blue)]">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-medium text-[var(--text-primary)]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{item.description}</p>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
