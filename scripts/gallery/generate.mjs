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

  // List source images at top level (exclude thumbs/ subdir). Sort for determinism.
  const sourceFiles = readdirSync(imageDirAbs)
    .filter(f => IMAGE_EXTS.has(extname(f).toLowerCase()))
    .sort();

  // Load existing manifest to preserve captions
  const existingManifest = loadManifest(manifestAbs);

  const entries = [];
  let thumbsGenerated = 0;
  let thumbsCached = 0;

  for (const file of sourceFiles) {
    const srcPath = join(imageDirAbs, file);
    const thumbBasename = basename(file, extname(file)) + '.webp';
    const thumbPath = join(thumbDirAbs, thumbBasename);
    const thumbRelative = `thumbs/${thumbBasename}`;

    // Always (re)read original dimensions for manifest accuracy
    const srcMeta = await sharp(srcPath).metadata();

    // Account for EXIF orientation: for orientations 5-8 the image is rotated
    // 90°, so its displayed dimensions are swapped relative to the stored pixels.
    let origWidth = srcMeta.width;
    let origHeight = srcMeta.height;
    if (srcMeta.orientation && srcMeta.orientation >= 5) {
      [origWidth, origHeight] = [origHeight, origWidth];
    }

    // Decide whether to (re)generate the thumbnail
    let needsRegen = true;
    if (existsSync(thumbPath)) {
      const srcMtime = statSync(srcPath).mtimeMs;
      const thumbMtime = statSync(thumbPath).mtimeMs;
      if (thumbMtime >= srcMtime) needsRegen = false;
    }

    let thumb_width, thumb_height;
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

    // Date: EXIF DateTimeOriginal → git commit date → build time
    const exifDate = await getExifDate(srcPath);
    let date;
    if (exifDate) {
      date = formatDate(exifDate);
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
      caption = await getExifCaption(srcPath);
    }

    entries.push({
      file,
      thumb: thumbRelative,
      width: origWidth,
      height: origHeight,
      thumb_width,
      thumb_height,
      date,
      caption,
    });
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
