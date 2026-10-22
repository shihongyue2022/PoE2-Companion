import React from "react"
import ReactDOM from "react-dom/client"
import WorkbenchApp from "./workbench/WorkbenchApp"
import "./index.css"
import { ErrorBoundary } from "./lib/sentry"
import { ErrorFallback } from "./ErrorFallback"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary fallback={<ErrorFallback />}>
      <WorkbenchApp />
    </ErrorBoundary>
  </React.StrictMode>,
)
