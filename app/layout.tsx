import type { Metadata } from "next";
import "./globals.css";
import "./settings.css";
import "./frame.css";

export const metadata: Metadata = {
  title: "终端工作台 / WORKBENCH",
  description: "项目与灵感管理工作台",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="zh-CN"><body>{children}</body></html>; }
