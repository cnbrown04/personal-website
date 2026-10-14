import "@site/kit/theme.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

function App() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <a href="/projects" style={{ color: "var(--foreground)" }}>
        ← Back to projects
      </a>
      <h1>{{title}}</h1>
      <p>A standalone app with its own build, served at /p/{{slug}}/.</p>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
