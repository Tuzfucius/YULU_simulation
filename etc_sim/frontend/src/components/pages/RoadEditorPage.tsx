import React, { useState, useEffect } from 'react';
import { TrajectoryList } from '../road-editor/TrajectoryList';
import { EditorCanvas } from '../road-editor/EditorCanvas';
import { EditorToolbar } from '../road-editor/EditorToolbar';
import { PreciseInput } from '../road-editor/PreciseInput';
import { useI18nStore } from '../../stores/i18nStore';

export type CustomRoadData = {
    nodes: { x: number, y: number, radius?: number }[];
    gantries: { id: string, x: number, y: number, name?: string, segmentIndex?: number, t?: number }[];
    scale?: number;
};

const SCALE_M_PER_UNIT = 2; // 1 画布单位 = 2 米（1格50px = 100m）

export function RoadEditorPage() {
    const { t } = useI18nStore();
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [roadData, setRoadData] = useState<CustomRoadData>({ nodes: [], gantries: [], scale: SCALE_M_PER_UNIT });
    const [drawingMode, setDrawingMode] = useState<'select' | 'pen' | 'gantry'>('select');
    const [showGrid, setShowGrid] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const [defaultRadius, setDefaultRadius] = useState(0); // 默认圆弧半径（米）

    // Load file handler
    const handleLoadFile = async (filename: string) => {
        try {
            const response = await fetch(`http://localhost:8000/api/custom-roads/${filename}`);
            if (response.ok) {
                const data = await response.json();
                setRoadData({
                    nodes: data.nodes || [],
                    gantries: data.gantries || []
                });
                setSelectedFile(filename);
            }
        } catch (error) {
            console.error("Failed to load file:", error);
        }
    };

    // Clear handler
    const handleClear = () => {
        // Confirm dialog could be added here
        setRoadData({ nodes: [], gantries: [] });
        setSelectedFile(null);
    };

    // Save handler
    const handleSave = async () => {
        let filename = selectedFile;
        if (!filename) {
            const input = prompt(t('editor.enterFilename', 'Enter filename:'), `path_${Date.now()}`);
            if (!input) return;
            filename = input;
        }

        // 验证：至少要有起始点和1个ETC门架
        if (roadData.nodes.length < 2) {
            alert(t('editor.validationNodes', 'Please draw a path with at least 2 points.'));
            return;
        }
        if (roadData.gantries.length < 1) {
            alert(t('editor.validationGantries', 'Please place at least 1 ETC gantry on the path.'));
            return;
        }

        try {
            const payload = {
                filename: filename,
                data: {
                    nodes: roadData.nodes,
                    edges: [],
                    gantries: roadData.gantries,
                    meta: { scale_m_per_unit: SCALE_M_PER_UNIT }
                }
            };

            const response = await fetch('http://localhost:8000/api/custom-roads/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                setSelectedFile(result.filename);
                setRefreshKey(k => k + 1); // 触发列表刷新
                alert(t('editor.saveSuccess', 'Saved successfully!'));
            } else {
                const err = await response.json().catch(() => ({}));
                alert(`Save failed: ${err.detail || response.statusText}`);
            }
        } catch (error) {
            console.error(error);
            alert('Save error');
        }
    };

    return (
        <div className="flex h-full bg-[var(--bg-base)] text-[var(--text-primary)]">
            {/* Sidebar: File List */}
            <aside className="w-64 border-r border-[var(--glass-border)] bg-[var(--glass-bg)] flex flex-col">
                <div className="p-4 border-b border-[var(--glass-border)]">
                    <h2 className="text-lg font-bold">🛣️ {t('editor.projectList', 'Project List')}</h2>
                </div>
                <div className="flex-1 overflow-y-auto">
                    <TrajectoryList
                        onSelect={handleLoadFile}
                        selectedFile={selectedFile}
                        refreshKey={refreshKey}
                    />
                </div>
            </aside>

            {/* Main Area */}
            <main className="flex-1 flex flex-col relative">
                {/* Toolbar */}
                <div className="h-14 border-b border-[var(--glass-border)] bg-[var(--glass-bg)] flex items-center px-4 justify-between z-10">
                    <div className="flex items-center gap-3">
                        <EditorToolbar
                            mode={drawingMode}
                            setMode={setDrawingMode}
                            showGrid={showGrid}
                            setShowGrid={setShowGrid}
                            onClear={handleClear}
                            canUndo={false}
                            canRedo={false}
                            onUndo={() => { }}
                            onRedo={() => { }}
                        />
                        {/* 圆弧半径控制（钢笔模式下显示） */}
                        {drawingMode === 'pen' && (
                            <div className="flex items-center gap-1.5 border-l border-[var(--glass-border)] pl-3">
                                <label className="text-xs text-[var(--text-muted)] whitespace-nowrap">
                                    圆弧 R:
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    step={50}
                                    value={defaultRadius}
                                    onChange={e => setDefaultRadius(Math.max(0, Number(e.target.value)))}
                                    className="w-20 bg-[rgba(0,0,0,0.3)] border border-[var(--glass-border)] rounded px-2 py-0.5 text-right text-xs focus:border-[var(--accent-blue)] outline-none"
                                />
                                <span className="text-xs text-[var(--text-muted)]">m</span>
                                <span className="text-[10px] text-[var(--text-muted)] opacity-60">
                                    {defaultRadius === 0 ? '(尖角)' : '(圆弧)'}
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-sm opacity-70">
                            {selectedFile ? `Editing: ${selectedFile}` : 'Unsaved Project'}
                        </div>
                        <button
                            onClick={handleSave}
                            className="bg-[var(--accent-blue)] hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
                        >
                            {t('editor.save', 'Save')}
                        </button>
                    </div>
                </div>


                {/* Canvas Area */}
                <div className="flex-1 relative overflow-hidden bg-[#1a1a1a]">
                    <EditorCanvas
                        data={roadData}
                        setData={setRoadData}
                        mode={drawingMode}
                        showGrid={showGrid}
                        defaultRadius={defaultRadius}
                    />

                    {/* Precise Input Floating Panel */}
                    {drawingMode === 'pen' && roadData.nodes.length > 0 && (
                        <div className="absolute bottom-4 right-4">
                            <PreciseInput
                                lastNode={roadData.nodes[roadData.nodes.length - 1]}
                                onAddSegment={(newNode) => {
                                    setRoadData(prev => ({
                                        ...prev,
                                        nodes: [...prev.nodes, newNode]
                                    }));
                                }}
                            />
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
