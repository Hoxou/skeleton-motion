import React from "react";
import { createRoot } from "react-dom/client";
import DisplayRoom from "./DisplayRoom.jsx";
import "./chrome.css";

const injected = JSON.parse(document.querySelector("#room-data").textContent);
const data = injected ?? (import.meta.env.DEV ? (await import("./devData.js")).default : null);

createRoot(document.querySelector("#root")).render(<DisplayRoom data={data} />);
