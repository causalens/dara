import fs from "node:fs";
import path from "node:path";
import { lookup } from "mrmime";
import type { Connect } from "vite";
import type { Project } from "./project.js";
import type { Manifest } from "./contract.js";
import { ProjectError } from "./contract.js";
import { inside, treeFiles } from "./files.js";

/** Expand registered assets into one collision-checked output namespace. */
export function collectAssets(
  manifest: Pick<Manifest, "static" | "appStatic"> & Partial<Pick<Manifest, "favicon">>,
): Map<string, string> {
  const files = new Map<string, string>();
  const namespaces = new Set(manifest.static.map((item) => item.package));
  const add = (destination: string, source: string, application = false) => {
    const target = destination.replaceAll(path.sep, "/");
    if (
      target.startsWith("/") ||
      target.split("/").includes("..") ||
      target.includes("\\") ||
      target.includes(":")
    ) {
      throw new ProjectError(
        "asset.target",
        `Invalid static target ${target}`,
        "edit static registrations",
      );
    }
    if (["index.html", ".dara-build.json"].includes(target) || target.startsWith(".dara-")) {
      throw new ProjectError(
        "asset.collision",
        `${source} targets private Dara output ${target}`,
        "edit static registrations",
      );
    }
    if (application && namespaces.has(target.split("/")[0] ?? "")) {
      throw new ProjectError(
        "asset.collision",
        `${source} collides with package namespace ${target.split("/")[0]}`,
        "edit static registrations",
      );
    }
    const conflict = [...files.keys()].find((existing) =>
      [
        existing === target,
        existing.startsWith(target + "/"),
        target.startsWith(existing + "/"),
      ].some(Boolean),
    );
    if (conflict) {
      throw new ProjectError(
        "asset.collision",
        `${source} and ${files.get(conflict)} both target ${target}`,
        "edit static registrations",
      );
    }
    files.set(target, source);
  };
  for (const item of manifest.static) {
    if (!/^[\w.-]+$/.test(item.package) || item.package === "..") {
      throw new ProjectError(
        "asset.target",
        `Invalid package namespace ${item.package}`,
        "edit package static_assets",
      );
    }
    if (!fs.existsSync(item.source)) {
      throw new ProjectError(
        "asset.source",
        `${item.source} is missing`,
        "edit package static_assets",
      );
    }
    const directory = fs.statSync(item.source).isDirectory();
    for (const file of directory ? treeFiles(item.source) : [item.source]) {
      const destination = path.posix.join(
        item.package,
        item.target,
        directory ? path.relative(item.source, file).replaceAll(path.sep, "/") : "",
      );
      if (!destination.startsWith(item.package + "/")) {
        throw new ProjectError(
          "asset.target",
          `${destination} escapes ${item.package}`,
          "edit package static_assets",
        );
      }
      add(destination, file);
    }
  }
  for (const folder of manifest.appStatic) {
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
      throw new ProjectError(
        "asset.source",
        `${folder} is not a directory`,
        "edit static folder registrations",
      );
    }
    for (const file of treeFiles(folder)) {
      add(path.relative(folder, file), file, true);
    }
  }
  if (manifest.favicon) {
    const existing = files.get("favicon.ico");
    if (existing && fs.realpathSync(existing) !== fs.realpathSync(manifest.favicon)) {
      throw new ProjectError(
        "asset.collision",
        `${existing} and ${manifest.favicon} both target favicon.ico`,
        "edit static registrations",
      );
    }
    if (!existing) {
      add("favicon.ico", manifest.favicon);
    }
  }
  return files;
}

/** Serve declared static files only; Vite handles JavaScript imports through its normal graph. */
export function assetMiddleware(
  project: Pick<Project, "assets" | "base">,
): Connect.NextHandleFunction {
  return (request, response, next) => {
    let url;
    try {
      url = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    } catch {
      response.statusCode = 400;
      response.end();
      return;
    }
    const base = project.base ?? "/static/";
    if (!url.startsWith(base)) {
      return next();
    }
    const file = project.assets.get(url.slice(base.length));
    if (!file) {
      return next();
    }
    const allowed = [...project.assets.values()].includes(file) && fs.existsSync(file);
    if (!allowed) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.setHeader("Content-Type", lookup(file) ?? "application/octet-stream");
    response.setHeader("Cache-Control", "no-cache");
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(file)
      .on("error", () => {
        response.destroy();
      })
      .pipe(response);
  };
}

/** Copy assets into staging while rejecting collisions with Vite's emitted files. */
export function copyAssets(project: Pick<Project, "assets">, staging: string) {
  for (const [target, source] of project.assets) {
    const destination = path.resolve(staging, target);
    let ancestor = path.dirname(destination);
    while (inside(staging, ancestor) && ancestor !== staging && !fs.existsSync(ancestor)) {
      ancestor = path.dirname(ancestor);
    }
    if (
      !inside(staging, destination) ||
      fs.existsSync(destination) ||
      !fs.statSync(ancestor).isDirectory()
    ) {
      throw new ProjectError(
        "asset.collision",
        `${source} collides with generated output ${target}`,
        "edit static registrations",
      );
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

/** Watch registered roots, including missing files, so static additions and deletions recover live. */
export function assetRoots(manifest: Manifest) {
  return [
    ...new Set([
      ...manifest.static.map((asset) => asset.source),
      ...manifest.appStatic,
      ...(manifest.favicon ? [manifest.favicon] : []),
    ]),
  ];
}
