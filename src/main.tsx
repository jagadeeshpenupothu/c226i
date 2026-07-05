import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./design/tokens.css";

// Turns an unexpected render error into a readable panel instead of a blank
// white window. The fallback is rendered by React (so it can't be wiped by a
// reconcile) and the error is echoed to the console for diagnosis.
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null; info: string }> {
  state = { error: null as Error | null, info: "" };

  static getDerivedStateFromError(error: Error) {
    return { error, info: "" };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("PrintPilot render error:", error, info.componentStack);
    this.setState({ info: `${error?.stack || error?.message || String(error)}\n\nComponent stack:${info.componentStack || ""}` });
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ position: "fixed", inset: 0, overflow: "auto", padding: 24, background: "#1c1d20", color: "#f3f4f6", font: "13px/1.5 ui-monospace,Menlo,monospace" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#ff6b6b", marginBottom: 8 }}>PrintPilot hit an unexpected error</div>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
            {this.state.info || this.state.error.stack || this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
