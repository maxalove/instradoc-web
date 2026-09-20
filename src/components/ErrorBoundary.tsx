import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Last-resort guard. Without it a single render error leaves the user staring at a
 * blank page with their work seemingly gone — the projects are still in IndexedDB,
 * so the recovery message says so and offers a reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("InstraDoc crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const russian = document.documentElement.lang === "ru";
    return (
      <div className="figma-app">
        <main className="figma-page figma-editor-empty">
          <div className="figma-empty">
            <strong>{russian ? "Что-то пошло не так" : "Something went wrong"}</strong>
            <span>
              {russian
                ? "Проекты сохранены в вашем браузере и не потеряны. Перезагрузите страницу, чтобы продолжить."
                : "Your projects are saved in this browser and are not lost. Reload the page to continue."}
            </span>
            <code className="figma-error-detail">{this.state.error.message}</code>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              {russian ? "Перезагрузить" : "Reload"}
            </button>
          </div>
        </main>
      </div>
    );
  }
}
