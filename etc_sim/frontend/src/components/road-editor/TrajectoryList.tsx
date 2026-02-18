import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useI18nStore } from '../../stores/i18nStore';

type FileItem = {
    filename: string;
    updated_at: number;
    size: number;
};

interface ContextMenu {
    x: number;
    y: number;
    filename: string;
}

interface TrajectoryListProps {
    onSelect: (filename: string) => void;
    selectedFile: string | null;
    refreshKey?: number;
}

export function TrajectoryList({ onSelect, selectedFile, refreshKey }: TrajectoryListProps) {
    const { t } = useI18nStore();
    const [files, setFiles] = useState<FileItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
    const [renamingFile, setRenamingFile] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const menuRef = useRef<HTMLDivElement>(null);

    const fetchFiles = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:8000/api/custom-roads/');
            if (res.ok) setFiles(await res.json());
        } catch (e) {
            console.error('Failed to fetch files', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchFiles(); }, [refreshKey, fetchFiles]);

    // 点击其他地方关闭右键菜单
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setContextMenu(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ─── 操作 ────────────────────────────────────────────────

    const handleDelete = async (filename: string) => {
        setContextMenu(null);
        if (!confirm(`删除 "${filename.replace('.json', '')}"？`)) return;
        try {
            await fetch(`http://localhost:8000/api/custom-roads/${filename}`, { method: 'DELETE' });
            fetchFiles();
        } catch (e) { console.error(e); }
    };

    const handleRenameStart = (filename: string) => {
        setContextMenu(null);
        setRenamingFile(filename);
        setRenameValue(filename.replace('.json', ''));
    };

    const handleRenameSubmit = async (oldFilename: string) => {
        if (!renameValue.trim()) { setRenamingFile(null); return; }
        try {
            await fetch(`http://localhost:8000/api/custom-roads/${oldFilename}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_filename: renameValue.trim() })
            });
            setRenamingFile(null);
            fetchFiles();
        } catch (e) { console.error(e); }
    };

    const handleCopy = async (filename: string) => {
        setContextMenu(null);
        try {
            // 1. 读取原文件内容
            const res = await fetch(`http://localhost:8000/api/custom-roads/${filename}`);
            if (!res.ok) return;
            const data = await res.json();
            // 2. 保存为新文件
            const newName = filename.replace('.json', '') + '_copy';
            await fetch('http://localhost:8000/api/custom-roads/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: newName, data })
            });
            fetchFiles();
        } catch (e) { console.error(e); }
    };

    const handleContextMenu = (e: React.MouseEvent, filename: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, filename });
    };

    // ─── 渲染 ────────────────────────────────────────────────

    return (
        <div className="p-2 space-y-1 relative">
            {/* 头部 */}
            <div className="flex justify-between items-center mb-2 px-2">
                <span className="text-xs text-[var(--text-muted)]">{files.length} 个路径</span>
                <button
                    onClick={fetchFiles}
                    className="text-xs hover:text-[var(--accent-blue)] transition-colors"
                    title="刷新"
                >↻</button>
            </div>

            {loading && <div className="text-center py-4 text-xs opacity-50">加载中...</div>}

            {!loading && files.map(file => (
                <div
                    key={file.filename}
                    onClick={() => onSelect(file.filename)}
                    onContextMenu={(e) => handleContextMenu(e, file.filename)}
                    className={`group flex items-center justify-between p-2 rounded cursor-pointer text-sm transition-colors ${selectedFile === file.filename
                            ? 'bg-[var(--accent-blue)] text-white'
                            : 'hover:bg-[rgba(255,255,255,0.08)] text-[var(--text-secondary)]'
                        }`}
                >
                    {renamingFile === file.filename ? (
                        <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onBlur={() => handleRenameSubmit(file.filename)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameSubmit(file.filename);
                                if (e.key === 'Escape') setRenamingFile(null);
                            }}
                            onClick={e => e.stopPropagation()}
                            className="flex-1 bg-transparent border-b border-white outline-none text-sm"
                        />
                    ) : (
                        <>
                            <div className="flex items-center gap-1.5 truncate pr-1 min-w-0">
                                <span className="text-[10px] opacity-50">🛣</span>
                                <span className="truncate" title={file.filename}>
                                    {file.filename.replace('.json', '')}
                                </span>
                            </div>
                            <span className="text-[10px] opacity-40 shrink-0">
                                {(file.size / 1024).toFixed(1)}k
                            </span>
                        </>
                    )}
                </div>
            ))}

            {!loading && files.length === 0 && (
                <div className="text-center py-8 text-xs text-[var(--text-muted)]">
                    <p>暂无路径</p>
                    <p className="mt-1 opacity-60">使用钢笔工具绘制并保存</p>
                </div>
            )}

            {/* 右键菜单 */}
            {contextMenu && (
                <div
                    ref={menuRef}
                    className="fixed z-50 bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-lg shadow-xl py-1 min-w-[140px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button
                        onClick={() => handleRenameStart(contextMenu.filename)}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-[rgba(255,255,255,0.08)] flex items-center gap-2"
                    >
                        <span>📝</span> 重命名
                    </button>
                    <button
                        onClick={() => handleCopy(contextMenu.filename)}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-[rgba(255,255,255,0.08)] flex items-center gap-2"
                    >
                        <span>📋</span> 复制
                    </button>
                    <div className="border-t border-[var(--glass-border)] my-1" />
                    <button
                        onClick={() => handleDelete(contextMenu.filename)}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-red-500/10 text-red-400 flex items-center gap-2"
                    >
                        <span>🗑️</span> 删除
                    </button>
                </div>
            )}
        </div>
    );
}
