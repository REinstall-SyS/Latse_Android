import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
import { registerAppWorker } from "@/services/pwa-update.service";
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find root element");
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  if (document.readyState === "complete") void registerAppWorker();
  else
    window.addEventListener(
      "load",
      () => {
        void registerAppWorker();
      },
      { once: true },
    );
}
