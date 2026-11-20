import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BodyScene } from "./BodyScene";
import { isRegion } from "./regions";
function App() {
  const [value, setValue] = useState("");
  useEffect(() => {
    const receive = (e: Event) => { const id = (e as CustomEvent).detail; if (id === "" || isRegion(id)) setValue(id); };
    window.addEventListener("body:selection", receive);
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: "ready" }));
    return () => window.removeEventListener("body:selection", receive);
  }, []);
  return <BodyScene value={value} onChange={id => {
    setValue(id);
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: "region", id }));
  }} />;
}
createRoot(document.getElementById("root")!).render(<App />);
