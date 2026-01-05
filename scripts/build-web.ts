/// <reference types="@types/bun" />
import { join } from "path";
import { existsSync, mkdirSync, copyFileSync } from "fs";

const outdir = join(process.cwd(), "dist/web");
const srcDir = join(process.cwd(), "src/web");

console.log("🚀 开始构建浏览器版本...");

// 确保输出目录存在
if (!existsSync(outdir)) {
  mkdirSync(outdir, { recursive: true });
}

// 构建 polyfill（需要在主应用代码之前加载）
console.log("🔧 构建 polyfills...");
const polyfillResult = await Bun.build({
  entrypoints: [join(srcDir, "polyfills.ts")],
  outdir: outdir,
  target: "browser",
  format: "iife",
  minify: false,
  define: {
    __POLYFILLS__: "true",
  },
});

if (!polyfillResult.success) {
  console.error("❌ Polyfill 构建失败");
  process.exit(1);
}

// 复制 HTML 文件
const htmlFile = join(srcDir, "index.html");
const htmlOut = join(outdir, "index.html");
if (existsSync(htmlFile)) {
  copyFileSync(htmlFile, htmlOut);
  console.log("✅ 已复制 index.html");
} else {
  console.error("❌ 找不到 index.html");
  process.exit(1);
}

// 构建 TypeScript 文件
console.log("📦 构建 JavaScript 文件...");

const result = await Bun.build({
  entrypoints: [join(srcDir, "app.ts")],
  outdir: outdir,
  target: "browser",
  minify: process.env.NODE_ENV === "production",
  sourcemap: "external",
  format: "esm",
  // 定义浏览器环境的全局变量
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "development"
    ),
  },
  // 排除 Node.js 特定的模块
  external: ["async_hooks", "fs", "path", "os", "crypto"],
});

if (result.success) {
  console.log("✅ 构建成功！");
  console.log(`📁 输出目录: ${outdir}`);
  console.log("\n运行方式:");
  console.log("  1. 使用静态文件服务器:");
  console.log(`     bunx serve ${outdir}`);
  console.log("  2. 或使用 Python:");
  console.log(`     cd ${outdir} && python3 -m http.server 8000`);
  console.log("  3. 或使用 Node.js http-server:");
  console.log(`     npx http-server ${outdir}`);
} else {
  console.error("❌ 构建失败");
  process.exit(1);
}
