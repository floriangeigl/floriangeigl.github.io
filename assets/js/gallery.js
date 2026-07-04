import Masonry from 'https://cdn.jsdelivr.net/npm/masonry-layout@4.2.2/+esm';
import imagesLoaded from 'https://cdn.jsdelivr.net/npm/imagesloaded@5.0.0/+esm';
import PhotoSwipeLightbox from 'https://cdn.jsdelivr.net/npm/photoswipe@5.4.4/dist/photoswipe-lightbox.esm.min.js';

document.querySelectorAll('.pswp-gallery.masonry-grid').forEach(gallery => {
  // Masonry layout
  const msnry = new Masonry(gallery, {
    itemSelector: '.masonry-item',
    columnWidth: '.masonry-sizer',
    percentPosition: true,
    gutter: 8,
  });

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
});
