import { installReplay } from "./replay";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "tldraw/tldraw.css";
import "./index.css";
import App from "./App";

installReplay();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
