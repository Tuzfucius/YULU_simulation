import type { ReactNode } from 'react';

type ScreenPanelProps = {
    title?: string;
    aside?: ReactNode;
    className?: string;
    children: ReactNode;
};

export function ScreenPanel({ title, aside, className = '', children }: ScreenPanelProps) {
    return (
        <section className={`screen-panel rounded-2xl ${className}`}>
            {(title || aside) && (
                <div className="mb-3 flex items-center justify-between px-4 pt-4">
                    <h2 className="screen-panel-title text-sm font-medium">{title}</h2>
                    {aside ? <div>{aside}</div> : null}
                </div>
            )}
            <div className={title || aside ? 'px-4 pb-4' : 'p-4'}>{children}</div>
        </section>
    );
}
