// ErrorBoundary.jsx
// 자식 렌더 중 예외가 나면 fallback 을 대신 그린다. 앱 전체가 빈 화면이 되는 것을 막는 용도.
import React from "react";

export default class ErrorBoundary extends React.Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error("[ErrorBoundary]", error, info?.componentStack);
    }

    render() {
        const { error } = this.state;
        const { fallback = null, children } = this.props;
        if (error) return typeof fallback === "function" ? fallback(error) : fallback;
        return children;
    }
}
