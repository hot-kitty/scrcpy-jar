// Minimal UI wiring for the clean-room replica.
import { connectWebUsb, listDirectory, downloadFile } from "./adb.js";
import { PandaKit } from "./pandakit.js";

const $ = (id) => document.getElementById(id);
let adb = null;
let kit = null;
let currentPath = "/sdcard";

function setStatus(text) { $("status").textContent = text; }

$("connect").onclick = async () => {
  try {
    setStatus("连接中…");
    adb = await connectWebUsb();
    kit = new PandaKit(adb);
    try { await kit.connect(); setStatus("已连接（PandaKit 可用）"); }
    catch { kit = null; setStatus("已连接（ADB 通，PandaKit 未启动：应用列表不可用）"); }
    $("disconnect").disabled = false;
    $("list").disabled = false; $("up").disabled = false; $("apps").disabled = false;
    await refreshFiles();
  } catch (e) { setStatus(`连接失败：${e.message}`); }
};

$("disconnect").onclick = async () => {
  await kit?.dispose().catch(() => {});
  kit = null;
  await adb?.close().catch(() => {});
  adb = null;
  $("disconnect").disabled = true; $("list").disabled = true;
  $("up").disabled = true; $("apps").disabled = true;
  setStatus("未连接");
};

async function refreshFiles() {
  const entries = await listDirectory(adb, currentPath);
  $("path").value = currentPath;
  const ul = $("files"); ul.innerHTML = "";
  for (const entry of entries) {
    const li = document.createElement("li");
    li.textContent = `${entry.isDirectory ? "📁" : "📄"} ${entry.name} (${entry.size ?? 0} bytes)`;
    if (entry.isDirectory) {
      li.className = "dir";
      li.style.cursor = "pointer";
      li.onclick = async () => { currentPath = `${currentPath.replace(/\/$/, "")}/${entry.name}`; await refreshFiles(); };
    } else {
      li.style.cursor = "pointer";
      li.onclick = async () => {
        const buffer = await downloadFile(adb, `${currentPath.replace(/\/$/, "")}/${entry.name}`);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([buffer]));
        a.download = entry.name; a.click();
        URL.revokeObjectURL(a.href);
      };
    }
    ul.appendChild(li);
  }
}

$("list").onclick = async () => { currentPath = $("path").value || "/sdcard"; await refreshFiles(); };
$("up").onclick = async () => {
  currentPath = currentPath.replace(/\/[^/]+\/?$/, "") || "/";
  await refreshFiles();
};

$("apps").onclick = async () => {
  if (!kit) { setStatus("PandaKit 未连接，无法加载应用列表"); return; }
  const ul = $("apps"); ul.innerHTML = "<li>加载中…</li>";
  const apps = await kit.listApps(3, 64);
  ul.innerHTML = "";
  for (const app of apps) {
    const li = document.createElement("li");
    if (app.iconDataUrl) {
      const img = document.createElement("img");
      img.src = app.iconDataUrl; img.alt = app.appName || app.packageName;
      li.appendChild(img);
    }
    li.appendChild(document.createTextNode(`${app.appName || app.packageName} — ${app.packageName} (${app.versionName ?? ""})`));
    ul.appendChild(li);
  }
};
