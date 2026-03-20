import { Activity, AlertTriangle, BrainCircuit, Gauge, LineChart, MonitorPlay, Route } from 'lucide-react';
import { ProjectPurposeAnimation } from './ProjectPurposeAnimation';

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

export function ProjectPurposePage() {
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
                  上层仿真场景负责复现车辆运动、事件干扰与路段状态，下层车流画像负责提取速度变化、拥堵趋势和异常信号，
                  为预警分析、策略验证和运行复盘提供统一依据。
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
                  先看中部动画，理解“仿真场景”如何生成“车流画像”。
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
              这里植入了你提供的原始双联动动画，上半区展示车流动态仿真，下半区展示速度画像与异常提示。
            </p>
          </div>
          <div className="mt-8">
            <ProjectPurposeAnimation />
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
