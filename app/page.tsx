import type { Metadata } from "next";
import Workbench from "./Workbench";

export const metadata: Metadata = {
  title: "终端工作台 / WORKBENCH",
  description: "项目与灵感管理工作台",
};

export default function Home() {
  return <Workbench />;
}
