/**
 * ContextMenu — 通用右键菜单组件
 *
 * 用法：
 *   onContextMenu={e => showMenu(e, items)}
 *   <ContextMenu menu={menu} onClose={closeMenu} />
 */

import { useEffect, useRef, type FC } from 'react';

export interface ContextMenuItem {
    label: string;
    icon?: string;
    danger?: boolean;
    disabled?: boolean;
    onClick: () => void;
}

export interface ContextMenuState {
    x: number;
    y: number;
    items: ContextMenuItem[];
}

interface Props {
    menu: ContextMenuState | null;
    onClose: () => void;
}

export const ContextMenu: FC<Props> = ({ menu, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menu) return;
        const handle = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', handle);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handle);
            document.removeEventListener('keydown', handleKey);
        };
    }, [menu, onClose]);

    if (!menu) return null;

    // 防止菜单超出视口
    const safeX = Math.min(menu.x, window.innerWidth - 180);
    const safeY = Math.min(menu.y, window.innerHeight - menu.items.length * 36 - 16);

    return (
        <div
            ref={ref}
            role="menu"
            className="fixed z-[9999] min-w-[160px] py-1 rounded-xl border border-[var(--glass-border)] shadow-2xl backdrop-blur-xl"
            style={{
                left: safeX,
                top: safeY,
                background: 'rgba(20, 20, 30, 0.92)',
            }}
        >
            {menu.items.map((item, i) => (
                item.disabled ? (
                    <div
                        key={i}
                        className="px-3 py-2 text-xs text-[var(--text-muted)] opacity-50 cursor-not-allowed flex items-center gap-2 select-none"
                    >
                        {item.icon && <span>{item.icon}</span>}
                        {item.label}
                    </div>
                ) : (
                    <button
                        key={i}
                        role="menuitem"
                        onClick={() => { item.onClick(); onClose(); }}
                        className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors hover:bg-[rgba(255,255,255,0.08)] ${item.danger ? 'text-red-400 hover:text-red-300' : 'text-[var(--text-primary)]'}`}
                    >
                        {item.icon && <span className="shrink-0">{item.icon}</span>}
                        {item.label}
                    </button>
                )
            ))}
        </div>
    );
};
