"""Remove the obsolete cutout pipeline; keep original-file upload validation."""
from pathlib import Path

source = Path(__file__).resolve().parents[1] / 'audit-evidence/product-experience-20261010/source'
app = source / 'js/app.js'
text = app.read_text(encoding='utf-8')
start = text.index('  /* ---- background removal on a data URL')
end = text.index('  const UPLOAD_API', start)
text = text[:start] + '  /* Product images are uploaded as the original file. */\n' + text[end:]
start = text.index('  /* Client-side background removal, then upload the processed result. */')
end = text.index('  const findOrder', start)
text = text[:start] + text[end:]
text = text.replace('uploadWithBackgroundRemoval', 'uploadFile')
text = text.replace('return { url, bgRemoved: result.bgRemoved === true };', 'return { url };')
assert 'removeBackground' not in text and 'bgRemoved' not in text and 'dataURLtoBlob' not in text
app.write_text(text, encoding='utf-8', newline='\r\n')
media = source / 'js/product-media.js'
text = media.read_text(encoding='utf-8')
assert 'Background removal stays automatic.' in text
text = text.replace('Background removal stays automatic.', 'Upload a product image. Original image backgrounds are preserved.')
media.write_text(text, encoding='utf-8')
print('Removed canvas cutout, resizing, WebP conversion and all cutout upload calls.')
