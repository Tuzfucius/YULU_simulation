/**
 * 错误边界组件
 * 捕获 React render 阶段的未处理错误，防止整个应用崩溃
 */
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;

            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: '100%', padding: '2rem', color: 'var(--text-primary)', background: 'var(--bg-base)',
                }}>
                    <div style={{
                        maxWidth: 480, textAlign: 'center', padding: '2rem',
                        borderRadius: 12, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                    }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>页面渲染出错</h2>
                        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                            {this.state.error?.message || '发生了一个未知错误'}
                        </p>
                        <button
                            onClick={this.handleRetry}
                            style={{
                                padding: '8px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
                                background: 'var(--accent-blue)', color: '#000', fontWeight: 500, fontSize: 14,
                            }}
                        >
                            重试
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
