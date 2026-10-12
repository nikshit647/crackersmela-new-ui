"""Apply bounded client integration to the captured source, preserving other work."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'audit-evidence/product-experience-20261010/source'
app = SOURCE / 'js/app.js'
s = app.read_text(encoding='utf-8')
def replace(old, new, count=1):
    global s
    assert s.count(old) == count, (old[:100], s.count(old))
    s = s.replace(old, new)

start = s.index('  /* Shared image upload widget.')
end = s.index('  const parseProductNumber', start)
s = s[:start] + '''  /* The same persistent media editor is used by product creation and editing. */
  const imageWidget = prefix => window.CMProductMedia.render(prefix);
  const imgManagers = {};
  const wireImageWidget = (prefix, product = {}) => {
    imgManagers[prefix] = window.CMProductMedia.bind($('#' + prefix + 'Media'), product, {
      upload: (file, onProgress) => uploadWithBackgroundRemoval(file, { onProgress }),
    });
  };
  const imgWaitForUpload = prefix => {
    try { imgManagers[prefix].value(); return false; }
    catch (error) { toast(error.message, 'err'); return true; }
  };
  const imgGet = prefix => imgManagers[prefix].value().image;
  const imgGetImages = prefix => imgManagers[prefix].value().images;
  const validateImageInput = prefix => {
    const input = $('#' + prefix + 'Url');
    if (!input || !input.value.trim()) return true;
    try { imgManagers[prefix].addUrl(input.value); input.value = ''; input.setCustomValidity(''); return true; }
    catch (error) { input.setCustomValidity(error.message); input.reportValidity(); input.focus(); return false; }
  };
''' + s[end:]
replace("wireImageWidget('ep');", "wireImageWidget('ep', mergeProduct(p, productOverrides[id]));")
replace("const prevImage = (m.__prevImage);", "const media = imgManagers.ep.value();")
replace("image: imgGet('ep') || prevImage,", "image: media.image,\n        images: media.images,")
replace("image: img,", "image: img,\n          images: imgGetImages('ap'),")
replace("'inStock', 'image', 'order'", "'inStock', 'image', 'images', 'showDescription', 'order'")
replace("desc: ($('#epDesc').value || '').trim(),", "desc: ($('#epDesc').value || '').trim(),\n        showDescription: !!$('#epShowDescription').checked,")
replace("desc: ($('#apDesc').value || '').trim(),", "desc: ($('#apDesc').value || '').trim(),\n          showDescription: !!$('#apShowDescription').checked,")
replace('<label class="ep-field ep-span2" data-field="epNote">', '''<label class="ep-toggle ep-description-toggle">
                <input id="epShowDescription" type="checkbox" ${base.showDescription !== false ? 'checked' : ''}>
                <span class="ep-toggle__track"></span>
                <span class="ep-toggle__txt"><b>Show Description on Product Page</b><small>Enable this to display the full product description to customers.</small></span>
              </label>
              <label class="ep-field ep-span2" data-field="epNote">''')
replace('<label>Description <textarea id="apDesc" rows="3" placeholder="Full product description"></textarea></label>', '''<label>Description <textarea id="apDesc" rows="3" placeholder="Full product description"></textarea></label>
        <label class="ep-toggle"><input id="apShowDescription" type="checkbox" checked><span class="ep-toggle__track"></span><span class="ep-toggle__txt"><b>Show Description on Product Page</b><small>Enable this to display the full product description to customers.</small></span></label>''')
replace('Current product image. Upload a new one or paste a URL — the full image is always shown, never cropped.', 'Add, arrange and choose the primary product image. Images stay uncropped.')
replace('<span class="hero-shot__tag"><b>${esc(p.shortName)}</b><span>${money(priceOf(p))}</span></span>', '<span class="hero-shot__tag">${window.CMProductBrand.render(p, { compact: true })}<span class="hero-shot__details"><b>${esc(p.shortName)}</b><span>${money(priceOf(p))}</span></span></span>')
replace('''        <div class="prod-detail__media reveal">
          ${p.image ? productImageMarkup(p, 600, 'detail') : `<div class="fallback">${catIcon(cat)}</div>`}
        </div>''', "        ${window.CMProductGallery.render(p, { fallbackMarkup: catIcon(cat) })}")
replace('''          <p class="desc-note">${esc(productText(productSeo?.description || p.desc || p.note || p.name))}</p>''', '''          ${p.note ? `<p class="desc-note product-short-note">${esc(productText(p.note))}</p>` : ''}
          ${p.showDescription !== false && (p.desc || productSeo?.description) && (p.desc || productSeo?.description) !== p.note ? `<div class="desc-note product-description">${esc(productText(p.desc || productSeo?.description))}</div>` : ''}''')
replace("      const p = prodBySlug(currentRoute.params[0] || '');\n      const btnQ", "      const p = prodBySlug(currentRoute.params[0] || '');\n      window.CMProductGallery.bind(document.querySelector('[data-product-gallery]'), p);\n      const btnQ")
replace('''      <div class="prod-card__body">
        <span''', '''      <div class="prod-card__body">
        ${window.CMProductBrand.render(p)}
        <span''')
replace('<div><b>${esc(p.shortName)}</b><span class="sh-sub">', '<div>${window.CMProductBrand.render(p, { compact: true })}<b>${esc(p.shortName)}</b><span class="sh-sub">')
replace('<td class="row-name" style="max-width:340px"><a', '<td class="row-name" style="max-width:340px">${window.CMProductBrand.render(p, { compact: true })}<a')
replace('''          <span class="prod-card__cat" style="font-size:12.5px">''', '''          ${window.CMProductBrand.render(p)}
          <span class="prod-card__cat" style="font-size:12.5px">''')
replace('const uploadWithBackgroundRemoval = file =>', 'const uploadWithBackgroundRemoval = (file, opts = {}) =>')
replace("uploadFile(new File([dataURLtoBlob(dataUrl)], 'product.webp', { type: 'image/webp' }))", "uploadFile(new File([dataURLtoBlob(dataUrl)], 'product.webp', { type: 'image/webp' }), opts)")
replace(': uploadFile(file);', ': uploadFile(file, opts);')
# Only the product-media caller requests upload progress; other callers retain fetch.
replace("    return fetch(UPLOAD_API, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken }, body: fd })", '''    const request = typeof opts.onProgress === 'function' ? new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', UPLOAD_API); xhr.withCredentials = true; xhr.timeout = 120000;
      xhr.setRequestHeader('X-CSRF-Token', csrfToken);
      xhr.upload.onprogress = event => { if (event.lengthComputable) opts.onProgress(event.loaded / event.total * 100); };
      xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json: async () => JSON.parse(xhr.responseText) });
      xhr.onerror = xhr.ontimeout = () => reject(new Error('Upload connection failed.'));
      xhr.send(fd);
    }) : fetch(UPLOAD_API, { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrfToken }, body: fd });
    return request''')
app.write_text(s, encoding='utf-8')

index = SOURCE / 'index.html'
html = index.read_text(encoding='utf-8')
html = html.replace('</head>', '\n'.join('<link rel="stylesheet" href="/css/' + name + '.css?v=20261010-products1">' for name in ['product-media', 'product-gallery', 'product-brand']) + '\n</head>')
html = html.replace('<script src="js/app.js?v=20261009-homeflash2"></script>', '\n'.join('<script src="/js/' + name + '.js?v=20261010-products1"></script>' for name in ['product-media', 'product-gallery', 'product-brand', 'app']))
index.write_text(html, encoding='utf-8')
print('Integrated product controls, gallery, visibility and listing pills.')
