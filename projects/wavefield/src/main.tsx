import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { createScene } from "./scene";
import "./styles.css";

function App() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    return createScene(host.current);
  }, []);

  return (
    <>
      <div ref={host} className="stage" />
      <header className="overlay">
        <a href="/projects">← Caleb Brown</a>
        <h1>Wavefield</h1>
        <p>drag to orbit · click to ripple · scroll to zoom</p>
      </header>
    </>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
