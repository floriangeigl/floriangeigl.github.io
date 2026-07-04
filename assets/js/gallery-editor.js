/**
 * Gallery Edit Mode
 * -----------------
 * Toggle with Alt+E or the ghost pencil icon (bottom-right corner).
 *
 * In edit mode:
 *   - Drag thumbnails to reorder them.
 *   - Edit captions inline (click the caption area at the bottom of each item).
 *   - Click "Copy YAML" to copy the resulting .yml content to your clipboard,
 *     then paste it into the corresponding _data/galleries/*.yml file.
 */

const SORTABLE_ESM = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/+esm';

let editModeActive = false;
let editModeTransitioning = false;
let sortableInstances = [];
let editBar = null;
let ghostIcon = null;
let Sortable = null;

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
  if (editModeTransitioning) return; // ignore rapid clicks while async loading
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
    gallery.classList.add('gallery-edit-mode');

    gallery.querySelectorAll('.masonry-item').forEach((item) => {
      // Disable lightbox by removing href temporarily
      item.dataset.origHref = item.getAttribute('href') || '';
      item.setAttribute('href', 'javascript:void(0)');
      item.addEventListener('click', absorbClick, true);

      addCaptionInput(item);
      if (!item.classList.contains('masonry-video')) {
        addRotationControls(item);
      }
    });

    const sortable = new Sortable(gallery, {
      animation: 150,
      filter: '.masonry-sizer',
      draggable: '.masonry-item',
      ghostClass: 'gal-edit-sortable-ghost',
      chosenClass: 'gal-edit-sortable-chosen',
      onEnd() {
        const msnry = gallery._masonry;
        if (msnry) {
          msnry.reloadItems();
          msnry.layout();
        }
      },
    });

    sortableInstances.push({ gallery, sortable });
  });
}

// ── Exit ──────────────────────────────────────────────────────────────────────

function exitEditMode() {
  ghostIcon.classList.remove('active');
  document.body.classList.remove('gallery-edit-active');

  sortableInstances.forEach(({ gallery, sortable }) => {
    sortable.destroy();
    gallery.classList.remove('gallery-edit-mode');

    gallery.querySelectorAll('.masonry-item').forEach((item) => {
      item.removeEventListener('click', absorbClick, true);

      if (item.dataset.origHref !== undefined) {
        item.setAttribute('href', item.dataset.origHref);
        delete item.dataset.origHref;
      }

      item.querySelector('.gal-caption-input')?.remove();
      item.querySelector('.masonry-caption')?.classList.remove('hidden-for-edit');
      item.querySelector('.gal-rotation-controls')?.remove();
      const img = item.querySelector('img');
      if (img) { img.style.transform = ''; img.style.transformOrigin = ''; }
      delete item.dataset.rotation;
    });

    const msnry = gallery._masonry;
    if (msnry) {
      msnry.reloadItems();
      msnry.layout();
    }
  });

  sortableInstances = [];

  editBar?.remove();
  editBar = null;
}

function absorbClick(e) {
  // Allow caption inputs and rotation buttons to receive events normally
  if (e.target.classList.contains('gal-caption-input')) return;
  if (e.target.closest('.gal-rotation-controls')) return;
  e.preventDefault();
  e.stopImmediatePropagation();
}

// ── Caption input ─────────────────────────────────────────────────────────────

function addCaptionInput(item) {
  const captionSpan = item.querySelector('.masonry-caption');
  const currentCaption = captionSpan ? captionSpan.textContent.trim() : '';

  captionSpan?.classList.add('hidden-for-edit');

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'gal-caption-input';
  input.placeholder = 'Caption…';
  input.value = currentCaption;

  // Prevent drag when interacting with the input
  input.addEventListener('mousedown', (e) => e.stopPropagation());
  input.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  input.addEventListener('pointerdown', (e) => e.stopPropagation());

  item.appendChild(input);
}

// ── Rotation controls ─────────────────────────────────────────────────────────

function addRotationControls(item) {
  item.dataset.rotation = '0';

  const controls = document.createElement('div');
  controls.className = 'gal-rotation-controls';

  const ccwBtn = document.createElement('button');
  ccwBtn.className = 'gal-rotate-btn gal-rotate-ccw';
  ccwBtn.title = 'Rotate 90° counter-clockwise';
  ccwBtn.textContent = '↺';

  const label = document.createElement('span');
  label.className = 'gal-rotation-label';
  label.textContent = '0°';

  const cwBtn = document.createElement('button');
  cwBtn.className = 'gal-rotate-btn gal-rotate-cw';
  cwBtn.title = 'Rotate 90° clockwise';
  cwBtn.textContent = '↻';

  controls.append(ccwBtn, label, cwBtn);
  item.appendChild(controls);

  ccwBtn.addEventListener('click', () => applyRotationDelta(item, -90));
  cwBtn.addEventListener('click',  () => applyRotationDelta(item, +90));

  // Prevent drag and lightbox from triggering when interacting with controls
  controls.addEventListener('click',      (e) => e.stopPropagation());
  controls.addEventListener('mousedown',  (e) => e.stopPropagation());
  controls.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  controls.addEventListener('pointerdown',(e) => e.stopPropagation());
}

function applyRotationDelta(item, delta) {
  const current = parseInt(item.dataset.rotation ?? '0', 10);
  const next = ((current + delta) % 360 + 360) % 360;
  item.dataset.rotation = String(next);

  const label = item.querySelector('.gal-rotation-label');
  if (label) label.textContent = next === 0 ? '0°' : `${next}°`;

  // Visual preview: rotate + shrink slightly for 90°/270° so it stays in frame
  const img = item.querySelector('img');
  if (img) {
    img.style.transformOrigin = 'center center';
    if (next === 0) {
      img.style.transform = '';
    } else if (next === 180) {
      img.style.transform = 'rotate(180deg)';
    } else {
      img.style.transform = `rotate(${next}deg) scale(0.68)`;
    }
  }
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
    btn.addEventListener('click', () => copyYaml(gallery, galleryKey, btn));
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

function copyYaml(gallery, galleryKey, triggerBtn) {
  const dataEl = document.getElementById(`gallery-data-${galleryKey}`);
  if (!dataEl) {
    alert(`[gallery-editor] No embedded data found for gallery: ${galleryKey}`);
    return;
  }

  const originalData = JSON.parse(dataEl.textContent);
  const dataMap = new Map(originalData.map((item) => [item.file, item]));
  const renderedFiles = new Set();
  const lines = [];

  gallery.querySelectorAll('.masonry-item[data-file]').forEach((domItem) => {
    const file = domItem.dataset.file;
    const original = dataMap.get(file);
    if (!original) return;
    renderedFiles.add(file);

    const captionInput = domItem.querySelector('.gal-caption-input');
    const caption = captionInput ? captionInput.value.trim() : (original.caption ?? '');
    const rotation = parseInt(domItem.dataset.rotation ?? '0', 10);
    lines.push(itemToYaml({ ...original, caption, rotation }));
  });

  // Preserve any items not rendered in the DOM (e.g. missing thumb)
  originalData.forEach((item) => {
    if (!renderedFiles.has(item.file)) {
      lines.push(itemToYaml(item));
    }
  });

  const yaml = lines.join('\n') + '\n';

  navigator.clipboard.writeText(yaml)
    .then(() => showCopiedFeedback(triggerBtn))
    .catch(() => {
      // Fallback for browsers/contexts that block clipboard access
      prompt('Copy the YAML below (Ctrl+A, Ctrl+C):', yaml);
    });
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
