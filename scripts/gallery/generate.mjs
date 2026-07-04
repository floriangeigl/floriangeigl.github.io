import sharp from 'sharp';
import exifr from 'exifr';
import yaml from 'js-yaml';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'fs';
import { join, basename, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..', '..');

const IMAGE_EXTS = new Set(['.webp', '.jpg', '.jpeg', '.png']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov']);

function loadConfig() {
  return JSON.parse(readFileSync(join(__dirname, 'galleries.json'), 'utf-8'));
}

function loadManifest(manifestPath) {
  if (!existsSync(manifestPath)) return new Map();
  const data = yaml.load(readFileSync(manifestPath, 'utf-8'));
  if (!Array.isArray(data)) return new Map();
  return new Map(data.map(entry => [entry.file, entry]));
}

function getGitCommitDate(relFilePath) {
  try {
    const result = execSync(
      `git log -1 --format=%cI -- "${relFilePath}"`,
      { cwd: repoRoot, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (result) return new Date(result);
  } catch {
    // ignore
  }
  return null;
}

async function getExifDate(srcPath) {
  try {
    const exif = await exifr.parse(srcPath, { pick: ['DateTimeOriginal'] });
    if (exif?.DateTimeOriginal instanceof Date) return exif.DateTimeOriginal;
  } catch {
    // ignore
  }
  return null;
}

async function getExifCaption(srcPath) {
  try {
    const exif = await exifr.parse(srcPath, {
      iptc: true,
      xmp: true,
      pick: ['ImageDescription', 'Description', 'Caption', 'description'],
    });
    if (exif) {
      const val =
        exif.ImageDescription || exif.Description || exif.Caption || exif.description;
      if (typeof val === 'string' && val.trim()) return val.trim();
    }
  } catch {
    // ignore
  }
  return '';
}

/** Returns ISO 8601 string without milliseconds and without trailing Z. */
function formatDate(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, '');
}

/** Read the display dimensions of a video via ffprobe. */
function getVideoDimensions(srcPath) {
  const out = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of json "${srcPath}"`,
    { encoding: 'utf-8' }
  );
  const info = JSON.parse(out);
  const stream = info.streams && info.streams[0];
  return { width: stream.width, height: stream.height };
}

/** Extract a single poster frame (~1s in) from a video as a PNG buffer. */
function extractPosterBuffer(srcPath) {
  return execSync(
    `ffmpeg -v error -ss 1 -i "${srcPath}" -frames:v 1 -f image2pipe -vcodec png pipe:1`,
    { maxBuffer: 1024 * 1024 * 128 }
  );
}

/** Video creation date from container metadata, if present. */
function getVideoDate(srcPath) {
  try {
    const out = execSync(
      `ffprobe -v error -show_entries format_tags=creation_time -of default=noprint_wrappers=1:nokey=1 "${srcPath}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    if (out) {
      const d = new Date(out);
      if (!isNaN(d.getTime())) return d;
    }
  } catch {
    // ignore
  }
  return null;
}

async function processGallery(config) {
  const { key, imageDir, manifest: manifestRelPath } = config;
  const imageDirAbs = join(repoRoot, imageDir);
  const thumbDirAbs = join(imageDirAbs, 'thumbs');
  const manifestAbs = join(repoRoot, manifestRelPath);

  if (!existsSync(imageDirAbs)) {
    console.warn(`[${key}] Image dir not found: ${imageDirAbs}`);
    return;
  }

  mkdirSync(thumbDirAbs, { recursive: true });

  // List source media at top level (exclude thumbs/ subdir). Sort for determinism.
  const sourceFiles = readdirSync(imageDirAbs)
    .filter(f => {
      const e = extname(f).toLowerCase();
      return IMAGE_EXTS.has(e) || VIDEO_EXTS.has(e);
    })
    .sort();

  // Load existing manifest to preserve captions
  const existingManifest = loadManifest(manifestAbs);

  const entries = [];
  let thumbsGenerated = 0;
  let thumbsCached = 0;

  for (const file of sourceFiles) {
    const srcPath = join(imageDirAbs, file);
    const ext = extname(file).toLowerCase();
    const isVideo = VIDEO_EXTS.has(ext);
    const thumbBasename = basename(file, ext) + '.webp';
    const thumbPath = join(thumbDirAbs, thumbBasename);
    const thumbRelative = `thumbs/${thumbBasename}`;

    // Decide whether to (re)generate the thumbnail/poster
    let needsRegen = true;
    if (existsSync(thumbPath)) {
      const srcMtime = statSync(srcPath).mtimeMs;
      const thumbMtime = statSync(thumbPath).mtimeMs;
      if (thumbMtime >= srcMtime) needsRegen = false;
    }

    let origWidth, origHeight, thumb_width, thumb_height;

    if (isVideo) {
      // Original (display) dimensions from ffprobe
      const dims = getVideoDimensions(srcPath);
      origWidth = dims.width;
      origHeight = dims.height;

      // Poster thumbnail from a single extracted frame
      if (needsRegen) {
        const posterBuffer = extractPosterBuffer(srcPath);
        const info = await sharp(posterBuffer)
          .rotate()
          .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 72, effort: 4 })
          .toFile(thumbPath);
        thumb_width = info.width;
        thumb_height = info.height;
        thumbsGenerated++;
      } else {
        const thumbMeta = await sharp(thumbPath).metadata();
        thumb_width = thumbMeta.width;
        thumb_height = thumbMeta.height;
        thumbsCached++;
      }
    } else {
      // Always (re)read original dimensions for manifest accuracy
      const srcMeta = await sharp(srcPath).metadata();

      // Account for EXIF orientation: for orientations 5-8 the image is rotated
      // 90°, so its displayed dimensions are swapped relative to the stored pixels.
      origWidth = srcMeta.width;
      origHeight = srcMeta.height;
      if (srcMeta.orientation && srcMeta.orientation >= 5) {
        [origWidth, origHeight] = [origHeight, origWidth];
      }

      if (needsRegen) {
        const info = await sharp(srcPath)
          .rotate() // auto-orient from EXIF so thumbnails are never sideways
          .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 72, effort: 4 })
          .toFile(thumbPath);
        thumb_width = info.width;
        thumb_height = info.height;
        thumbsGenerated++;
      } else {
        const thumbMeta = await sharp(thumbPath).metadata();
        thumb_width = thumbMeta.width;
        thumb_height = thumbMeta.height;
        thumbsCached++;
      }
    }

    // Date: EXIF/container date → git commit date → build time
    const mediaDate = isVideo ? getVideoDate(srcPath) : await getExifDate(srcPath);
    let date;
    if (mediaDate) {
      date = formatDate(mediaDate);
    } else {
      const gitDate = getGitCommitDate(`${imageDir}/${file}`);
      date = gitDate ? formatDate(gitDate) : formatDate(new Date());
    }

    // Caption: non-empty existing manifest value wins; fallback to IPTC/XMP; else ""
    const existingEntry = existingManifest.get(file);
    let caption;
    if (existingEntry && existingEntry.caption) {
      caption = existingEntry.caption;
    } else {
      caption = isVideo ? '' : await getExifCaption(srcPath);
    }

    const entry = {
      file,
      thumb: thumbRelative,
      width: origWidth,
      height: origHeight,
      thumb_width,
      thumb_height,
      date,
      caption,
    };
    if (isVideo) entry.type = 'video';
    entries.push(entry);
  }

  // Orphan cleanup: remove thumb files whose source image no longer exists
  const sourceBaseNames = new Set(sourceFiles.map(f => basename(f, extname(f)) + '.webp'));
  let orphansRemoved = 0;
  if (existsSync(thumbDirAbs)) {
    for (const f of readdirSync(thumbDirAbs)) {
      if (!sourceBaseNames.has(f)) {
        unlinkSync(join(thumbDirAbs, f));
        orphansRemoved++;
      }
    }
  }

  // Ordering: the manifest is the source of truth for display order.
  // Existing images keep their current manifest order (so manual reordering
  // sticks across runs); newly-discovered images are prepended at the top
  // (newest-first), sorted among themselves by date descending.
  const orderIndex = new Map([...existingManifest.keys()].map((f, i) => [f, i]));
  const newEntries = entries
    .filter(e => !orderIndex.has(e.file))
    .sort((a, b) => {
      const dc = b.date.localeCompare(a.date);
      return dc !== 0 ? dc : b.file.localeCompare(a.file);
    });
  const existingEntries = entries
    .filter(e => orderIndex.has(e.file))
    .sort((a, b) => orderIndex.get(a.file) - orderIndex.get(b.file));
  const ordered = [...newEntries, ...existingEntries];

  // Write manifest YAML (stable key order per schema, no key sorting)
  const manifestDir = dirname(manifestAbs);
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(manifestAbs, yaml.dump(ordered, { lineWidth: -1, sortKeys: false }), 'utf-8');

  console.log(
    `[${key}] thumbs_generated=${thumbsGenerated} thumbs_cached=${thumbsCached} orphans_removed=${orphansRemoved}`
  );
}

async function main() {
  const configs = loadConfig();
  for (const config of configs) {
    await processGallery(config);
  }
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
