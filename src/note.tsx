import React from "react";
import ReactDOM from "react-dom/client";
import { NoteWindow } from "./NoteWindow";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <NoteWindow />
  </React.StrictMode>
);
