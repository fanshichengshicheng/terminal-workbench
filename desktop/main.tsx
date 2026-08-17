import { createRoot } from "react-dom/client";
import Workbench from "../app/Workbench";
import "../app/globals.css";
import "../app/settings.css";
import "../app/frame.css";
import "../app/module-clean.css";
import "../app/project-workspace.css";
import "../app/endfield-theme.css";
import "@xyflow/react/dist/style.css";

createRoot(document.getElementById("root")!).render(<Workbench />);
