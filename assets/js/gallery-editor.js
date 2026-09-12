/**
 * Gallery Edit Mode
 * -----------------
 * Toggle with Alt+E or the ghost pencil icon (bottom-right corner).
 *
 * In edit mode:
 *   - The masonry grid is replaced by a compact sortable list.
 *   - Drag the ⠿ handle to reorder images.
 *   - Edit captions inline.
 *   - Click ↺ / ↻ to mark an image for rotation (CI applies it on push).
 *   - Click "Copy YAML" to copy the updated .yml to your clipboard, then paste
 *     it into _data/galleries/<key>.yml and push — CI handles the rest.
 */

const SORTABLE_ESM = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/+esm';

let editModeActive = false;
let editModeTransitioning = false;
let sortableInstances = [];
let editBar = null;
let ghostIcon = null;
let Sortable = null;
let thumbPreviewEl = null;

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  if (!document.querySelector('.pswp-gallery.masonry-grid')) return;

  createGhostIcon();

  document.addEventListener('keydown', (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      toggleEditMode();
    }
  });
}

// ── Ghost icon ────────────────────────────────────────────────────────────────

function createGhostIcon() {
  ghostIcon = document.createElement('button');
  ghostIcon.id = 'gallery-edit-ghost';
  ghostIcon.setAttribute('aria-label', 'Gallery edit mode (Alt+E)');
  ghostIcon.setAttribute('title', 'Gallery edit mode (Alt+E)');
  ghostIcon.textContent = '✏';
  document.body.appendChild(ghostIcon);
  ghostIcon.addEventListener('click', toggleEditMode);
}

// ── Toggle ────────────────────────────────────────────────────────────────────

async function toggleEditMode() {
  if (editModeTransitioning) return;
  editModeTransitioning = true;
  editModeActive = !editModeActive;
  if (editModeActive) {
    await enterEditMode();
  } else {
    exitEditMode();
  }
  editModeTransitioning = false;
}

// ── Enter ─────────────────────────────────────────────────────────────────────

async function enterEditMode() {
  ghostIcon.classList.add('active');
  document.body.classList.add('gallery-edit-active');

  // Lazily load SortableJS (ESM)
  if (!Sortable) {
    try {
      const mod = await import(SORTABLE_ESM);
      Sortable = mod.default;
    } catch (err) {
      console.error('[gallery-editor] Failed to load SortableJS:', err);
      editModeActive = false;
      editModeTransitioning = false;
      ghostIcon.classList.remove('active');
      document.body.classList.remove('gallery-edit-active');
      return;
    }
  }

  editBar = createEditBar();
  document.body.appendChild(editBar);

  document.querySelectorAll('.pswp-gallery.masonry-grid').forEach((gallery) => {
    const galleryKey = gallery.id.replace(/^gallery-/, '');

    // Derive base image path from the first rendered anchor href
    const firstAnchor = gallery.querySelector('.masonry-item[data-file]');
    const basePath = firstAnchor
      ? firstAnchor.getAttribute('href').replace(/\/[^\/]+$/, '')
      : `/${galleryKey}/img`;

    // Load the JSON data embedded by gallery.html
    const dataEl = document.getElementById(`gallery-data-${galleryKey}`);
    const originalData = dataEl ? JSON.parse(dataEl.textContent) : [];

    // Hide masonry, inject compact list panel
    gallery.classList.add('gallery-edit-hidden');
    const panel = buildEditPanel(galleryKey, originalData, basePath);
    gallery.insertAdjacentElement('afterend', panel);

    const sortable = new Sortable(panel, {
      animation: 180,
      handle: '.gal-row-handle',
      draggable: '.gal-edit-row',
      ghostClass: 'gal-row-ghost',
      chosenClass: 'gal-row-chosen',
      dragClass: 'gal-row-drag',
    });

    sortableInstances.push({ gallery, panel, sortable });
  });
}

// ── Exit ──────────────────────────────────────────────────────────────────────

function exitEditMode() {
  ghostIcon.classList.remove('active');
  document.body.classList.remove('gallery-edit-active');

  sortableInstances.forEach(({ gallery, panel, sortable }) => {
    sortable.destroy();
    panel.remove();
    gallery.classList.remove('gallery-edit-hidden');

    // Defer Masonry re-layout until after the browser re-renders the now-visible grid
    const msnry = gallery._masonry;
    if (msnry) {
      requestAnimationFrame(() => {
        msnry.reloadItems();
        msnry.layout();
      });
    }
  });

  sortableInstances = [];
  editBar?.remove();
  editBar = null;
  thumbPreviewEl?.remove();
  thumbPreviewEl = null;
}

// ── Panel builder ─────────────────────────────────────────────────────────────

function sanitizeImageUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return '';
  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function buildSafeImageSrc(basePath, fileName) {
  const safeBase = String(basePath ?? '').replace(/\/+$/, '');
  const safeFile = String(fileName ?? '').replace(/^\/+/, '');
  return sanitizeImageUrl(`${safeBase}/${safeFile}`);
}

function buildEditPanel(galleryKey, originalData, basePath) {
  const panel = document.createElement('div');
  panel.className = 'gal-edit-panel';
  panel.id = `gal-edit-panel-${galleryKey}`;

  for (const item of originalData) {
    const isVideo = item.type === 'video';
    const row = document.createElement('div');
    row.className = 'gal-edit-row';
    row.dataset.file = item.file;
    row.dataset.rotation = '0';

    // ── Drag handle ──
    const handle = document.createElement('span');
    handle.className = 'gal-row-handle';
    handle.textContent = '⣿';
    handle.setAttribute('aria-hidden', 'true');

    // ── Thumbnail ──
    const thumb = document.createElement('img');
    thumb.className = 'gal-row-thumb';
    thumb.src = buildSafeImageSrc(basePath, item.thumb);
    thumb.alt = '';
    thumb.draggable = false;
    thumb.addEventListener('mouseenter', () => showThumbPreview(thumb));
    thumb.addEventListener('mouseleave', hideThumbPreview);

    // ── Filename ──
    const filename = document.createElement('span');
    filename.className = 'gal-row-filename';
    filename.textContent = item.file;

    // ── Caption input ──
    const captionInput = document.createElement('input');
    captionInput.type = 'text';
    captionInput.className = 'gal-row-caption';
    captionInput.placeholder = 'Caption…';
    captionInput.value = item.caption || '';
    stopDragOn(captionInput);

    row.append(handle, thumb, filename, captionInput);

    // ── Rotation controls (images only) ──
    if (!isVideo) {
      const rotControls = document.createElement('div');
      rotControls.className = 'gal-row-rot';

      const ccwBtn = document.createElement('button');
      ccwBtn.className = 'gal-rotate-btn';
      ccwBtn.title = 'Rotate 90° counter-clockwise';
      ccwBtn.textContent = '↺';

      const rotLabel = document.createElement('span');
      rotLabel.className = 'gal-row-rot-label';
      rotLabel.textContent = '0°';

      const cwBtn = document.createElement('button');
      cwBtn.className = 'gal-rotate-btn';
      cwBtn.title = 'Rotate 90° clockwise';
      cwBtn.textContent = '↻';

      ccwBtn.addEventListener('click', () => applyRowRotation(row, thumb, rotLabel, -90));
      cwBtn.addEventListener('click',  () => applyRowRotation(row, thumb, rotLabel, +90));

      rotControls.append(ccwBtn, rotLabel, cwBtn);
      stopDragOn(rotControls);
      row.appendChild(rotControls);
    }

    panel.appendChild(row);
  }

  return panel;
}

/** Prevent SortableJS drag from starting on interactive sub-elements. */
function stopDragOn(el) {
  el.addEventListener('mousedown',  (e) => e.stopPropagation());
  el.addEventListener('pointerdown',(e) => e.stopPropagation());
  el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
}

function applyRowRotation(row, thumb, label, delta) {
  const current = parseInt(row.dataset.rotation ?? '0', 10);
  const next = ((current + delta) % 360 + 360) % 360;
  row.dataset.rotation = String(next);
  label.textContent = next === 0 ? '0°' : `${next}°`;
  const scale = next % 180 === 0 ? 1 : 0.72;
  thumb.style.transform = next === 0 ? '' : `rotate(${next}deg) scale(${scale})`;
}

// ── Thumbnail hover preview ───────────────────────────────────────────────────

function showThumbPreview(thumb) {
  if (!thumbPreviewEl) {
    thumbPreviewEl = document.createElement('div');
    thumbPreviewEl.className = 'gal-thumb-preview';
    const img = document.createElement('img');
    thumbPreviewEl.appendChild(img);
    document.body.appendChild(thumbPreviewEl);
  }
  const previewImg = thumbPreviewEl.querySelector('img');
  const safePreviewSrc = sanitizeImageUrl(thumb.src);
  if (!safePreviewSrc) return;
  previewImg.src = safePreviewSrc;

  const rect = thumb.getBoundingClientRect();
  const gap  = 12;
  const pw   = 292; // max preview width + border
  const ph   = 292;

  let left = rect.right + gap;
  let top  = rect.top + rect.height / 2 - ph / 2;

  if (left + pw > window.innerWidth  - gap) left = rect.left - pw - gap;
  top = Math.max(gap, Math.min(top, window.innerHeight - ph - gap));

  thumbPreviewEl.style.left = `${Math.round(left)}px`;
  thumbPreviewEl.style.top  = `${Math.round(top)}px`;
  requestAnimationFrame(() => thumbPreviewEl?.classList.add('visible'));
}

function hideThumbPreview() {
  thumbPreviewEl?.classList.remove('visible');
}

// ── Edit bar ──────────────────────────────────────────────────────────────────

function createEditBar() {
  const bar = document.createElement('div');
  bar.id = 'gallery-edit-bar';

  const label = document.createElement('span');
  label.className = 'gal-edit-bar-label';
  label.textContent = '✏ Edit mode';
  bar.appendChild(label);

  const galleries = document.querySelectorAll('.pswp-gallery.masonry-grid');
  const multiGallery = galleries.length > 1;

  galleries.forEach((gallery) => {
    const galleryKey = gallery.id.replace(/^gallery-/, '');
    const btn = document.createElement('button');
    btn.className = 'gal-copy-btn';
    btn.dataset.galleryKey = galleryKey;
    btn.textContent = multiGallery ? `Copy YAML – ${galleryKey}` : 'Copy YAML';
    btn.addEventListener('click', () => copyYaml(galleryKey, btn));
    bar.appendChild(btn);
  });

  const closeBtn = document.createElement('button');
  closeBtn.className = 'gal-edit-close-btn';
  closeBtn.textContent = '✕ Exit';
  closeBtn.addEventListener('click', toggleEditMode);
  bar.appendChild(closeBtn);

  return bar;
}

// ── YAML generation ───────────────────────────────────────────────────────────

function copyYaml(galleryKey, triggerBtn) {
  const dataEl = document.getElementById(`gallery-data-${galleryKey}`);
  const panel  = document.getElementById(`gal-edit-panel-${galleryKey}`);
  if (!dataEl || !panel) {
    alert(`[gallery-editor] No data found for gallery: ${galleryKey}`);
    return;
  }

  const originalData = JSON.parse(dataEl.textContent);
  const dataMap = new Map(originalData.map((item) => [item.file, item]));
  const renderedFiles = new Set();
  const lines = [];

  panel.querySelectorAll('.gal-edit-row[data-file]').forEach((row) => {
    const file = row.dataset.file;
    const original = dataMap.get(file);
    if (!original) return;
    renderedFiles.add(file);

    const caption = row.querySelector('.gal-row-caption')?.value.trim() ?? (original.caption ?? '');
    const rotation = parseInt(row.dataset.rotation ?? '0', 10);
    lines.push(itemToYaml({ ...original, caption, rotation }));
  });

  // Preserve any items absent from the panel (safety net)
  originalData.forEach((item) => {
    if (!renderedFiles.has(item.file)) lines.push(itemToYaml(item));
  });

  const yaml = lines.join('\n') + '\n';

  navigator.clipboard.writeText(yaml)
    .then(() => showCopiedFeedback(triggerBtn))
    .catch(() => prompt('Copy the YAML below (Ctrl+A, Ctrl+C):', yaml));
}

// ── YAML serialisation ────────────────────────────────────────────────────────

function itemToYaml(item) {
  const parts = [`- file: ${item.file}`];
  parts.push(`  thumb: ${item.thumb}`);
  if (item.type) parts.push(`  type: ${item.type}`);
  parts.push(`  width: ${item.width}`);
  parts.push(`  height: ${item.height}`);
  parts.push(`  thumb_width: ${item.thumb_width}`);
  parts.push(`  thumb_height: ${item.thumb_height}`);
  parts.push(`  date: '${item.date}'`);
  parts.push(`  caption: ${yamlScalar(item.caption)}`);
  const rotation = parseInt(item.rotation ?? 0, 10);
  if (rotation !== 0) parts.push(`  rotation: ${rotation}`);
  return parts.join('\n');
}

/** Serialise a string as a YAML scalar, matching the style used in the gallery files. */
function yamlScalar(s) {
  if (s === null || s === undefined || s === '') return "''";
  // Needs quoting if it starts/ends with whitespace or contains YAML-significant chars
  const needsQuote = /^\s|\s$|[:'"\n\r\t#\[\]{}|>&*!,%@`?\\]/.test(s);
  if (!needsQuote) return s;
  // Single-quote style (YAML standard): escape internal single quotes by doubling them
  return `'${s.replace(/'/g, "''")}'`;
}

// ── UI feedback ───────────────────────────────────────────────────────────────

function showCopiedFeedback(btn) {
  if (!btn) return;
  const original = btn.textContent;
  btn.textContent = '✓ Copied!';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = original;
    btn.classList.remove('copied');
  }, 2200);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
