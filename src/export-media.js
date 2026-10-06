import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright-core";

const execFileAsync = promisify(execFile);

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);

async function findExecutable(paths) {
  for (const executable of paths) {
    try {
      await fs.access(executable);
      return executable;
    } catch {
      // Try next candidate.
    }
  }
  return undefined;
}

async function findFfmpeg() {
  if (process.env.FFMPEG_PATH) {
    await fs.access(process.env.FFMPEG_PATH);
    return process.env.FFMPEG_PATH;
  }
  try {
    const { stdout } = await execFileAsync("which", ["ffmpeg"]);
    return stdout.trim();
  } catch {
    throw new Error("video/GIF export requires FFmpeg. Install with `brew install ffmpeg` or set FFMPEG_PATH");
  }
}

async function captureFrames(svg, scene, directory, fps = 30) {
  const executablePath = await findExecutable(CHROME_PATHS);
  if (!executablePath) throw new Error("Chrome or Chromium not found. Set CHROME_PATH");
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: scene.viewport,
    });
    const markup = svg.replace(/^<\?xml[^>]+>\s*/, "");
    await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>${markup}`);
    const frameCount = Math.ceil(scene.duration * fps);
    const target = page.locator("svg");
    await page.evaluate(() => document.querySelector("svg").pauseAnimations());
    for (let frame = 0; frame < frameCount; frame += 1) {
      await page.evaluate((seconds) => document.querySelector("svg").setCurrentTime(seconds), frame / fps);
      await target.screenshot({ path: path.join(directory, `frame-${String(frame).padStart(4, "0")}.png`) });
    }
  } finally {
    await browser.close();
  }
}

function ffmpegArgs(format, fps, input, output) {
  const common = ["-y", "-framerate", String(fps), "-i", input];
  if (format === "webm") {
    return [...common, "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-pix_fmt", "yuv420p", "-an", output];
  }
  if (format === "mp4") {
    return [...common, "-vf", "format=yuv420p", "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-movflags", "+faststart", "-an", output];
  }
  return [
    ...common,
    "-filter_complex",
    "fps=20,scale=960:-2:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle",
    "-loop",
    "0",
    output,
  ];
}

export async function exportMedia(svg, scene, format, output) {
  const ffmpeg = await findFfmpeg();
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "skeleton-motion-"));
  try {
    const fps = 30;
    await captureFrames(svg, scene, temporary, fps);
    await execFileAsync(ffmpeg, ffmpegArgs(format, fps, path.join(temporary, "frame-%04d.png"), output), {
      maxBuffer: 8 * 1024 * 1024,
    });
  } finally {
    await fs.rm(temporary, { force: true, recursive: true });
  }
}

export const __testing = { ffmpegArgs };
