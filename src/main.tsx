import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import { warmupTerminal } from "./ipc/commands";

// Pre-warm a terminal session as early as possible so the first terminal
// tab opens instantly. Fire-and-forget — errors are silently ignored.
warmupTerminal().catch(() => {});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
