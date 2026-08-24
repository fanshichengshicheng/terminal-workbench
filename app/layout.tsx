import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./settings.css";
import "./frame.css";
import "./module-clean.css";
import "./project-workspace.css";
import "./endfield-theme.css";
import "./workbench-variants.css";
import "./dorm.css";
import "./ai-companion.css";
import "@xyflow/react/dist/style.css";

const siteTitle = "终端工作台 / ENGINEERING FIELD WORKBENCH";
const siteDescription =
  "面向嵌入式、机械设计、3D 打印、工程竞赛与无人机研究的个人工程工作台。";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const requestHost = forwardedHost ?? requestHeaders.get("host") ?? "localhost:3000";
  const safeHost = /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(requestHost)
    ? requestHost
    : "localhost:3000";
  const forwardedProtocol = requestHeaders
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : /^(localhost|127\.0\.0\.1)(?::\d+)?$/i.test(safeHost)
        ? "http"
        : "https";
  const socialImageUrl = new URL("/og.png", `${protocol}://${safeHost}`).toString();

  return {
    title: siteTitle,
    description: siteDescription,
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title: siteTitle,
      description: siteDescription,
      type: "website",
      locale: "zh_CN",
      images: [
        {
          url: socialImageUrl,
          width: 1672,
          height: 941,
          alt: "终端工作台：从嵌入式、机械设计和 3D 打印走向无人机研发",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: siteTitle,
      description: siteDescription,
      images: [socialImageUrl],
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
