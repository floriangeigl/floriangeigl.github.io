import Masonry from 'https://cdn.jsdelivr.net/npm/masonry-layout@4.2.2/+esm';
import imagesLoaded from 'https://cdn.jsdelivr.net/npm/imagesloaded@5.0.0/+esm';
import PhotoSwipeLightbox from 'https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe-lightbox.esm.min.js';

// Load the video plugin only when a gallery actually contains a video, so
// image-only pages never depend on it (nor break if it fails to load).
let PhotoSwipeVideoPlugin = null;
if (document.querySelector('.masonry-video')) {
  try {
    ({ default: PhotoSwipeVideoPlugin } = await import(
      'https://cdn.jsdelivr.net/npm/photoswipe-video-plugin@1.0.2/dist/photoswipe-video-plugin.esm.min.js'
    ));
  } catch (err) {
    console.warn('[gallery] video plugin failed to load:', err);
  }
}

document.querySelectorAll('.pswp-gallery.masonry-grid').forEach(gallery => {
  // Masonry layout
  const msnry = new Masonry(gallery, {
    itemSelector: '.masonry-item',
    columnWidth: '.masonry-sizer',
    percentPosition: true,
    gutter: 8,
  });
  // Expose instance so gallery-editor.js can trigger re-layout after reordering
  gallery._masonry = msnry;

  // Re-layout as thumbnails load to fix placeholder gaps
  imagesLoaded(gallery)
    .on('progress', () => msnry.layout())
    .on('always', () => msnry.layout());

  // PhotoSwipe lightbox
  const lightbox = new PhotoSwipeLightbox({
    gallery,
    children: 'a.masonry-item',
    pswpModule: () =>
      import('https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe.esm.min.js'),
  });

  // Enable <video> playback inside the lightbox (when the plugin loaded)
  if (PhotoSwipeVideoPlugin) {
    new PhotoSwipeVideoPlugin(lightbox);
  }

  // Custom caption element in the lightbox
  lightbox.on('uiRegister', function () {
    lightbox.pswp.ui.registerElement({
      name: 'custom-caption',
      order: 9,
      isButton: false,
      appendTo: 'root',
      html: '',
      onInit: (el, pswp) => {
        pswp.on('change', () => {
          const slideEl = pswp.currSlide.data.element;
          const captionEl = slideEl && slideEl.querySelector('.pswp-caption-content');
          el.textContent = captionEl ? captionEl.textContent : '';
        });
      },
    });
  });

  lightbox.init();

  // Autoplay-muted-on-hover for video thumbnails in the grid
  gallery.querySelectorAll('.masonry-video').forEach(item => {
    const video = item.querySelector('.masonry-video-el');
    if (!video) return;
    item.addEventListener('mouseenter', () => {
      video.play().catch(() => {});
    });
    item.addEventListener('mouseleave', () => {
      video.pause();
      video.currentTime = 0;
    });
  });
});
