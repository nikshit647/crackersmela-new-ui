# Invoice runtime verification — 5 October 2026

The candidate now passes the real mPDF font-directory regression on PHP 8.1.34 and 8.3.35. The broader render/download suite passes 66/66 checks. All records are synthetic and all HTTP requests use a loopback-only PHP server. No live customer records, real orders, email delivery, publishing, or deployment are involved.

## Change and evidence

`audit-evidence/production-release/cm-invoice.php` previously defined `CM_INVOICE_FONT_DIR` without passing it to mPDF. With valid full font files in that folder and a stock mPDF install, both PHP versions failed with `Cannot find TTF TrueType font file "cmregular.ttf" in configured font directories.`

The three-line addition reads mPDF's default configuration and appends the configured invoice font directory. Keeping the default directories preserves installations that already put the custom font names in mPDF's own font folder. Invoice content, totals, layout, and authorization code are unchanged.

- Before source SHA-256: `f025efb6d85dbe0220a49ebacbb4d3b19ac8028fff288e0d8d0804e32f0bbe8a`
- After source SHA-256: `e9a1a43ed853edb4671325b5a230291cf5859f8063b9ce16ad83b680c53a38a3`
- Failing-before regression: `audit-evidence/invoice-render-20261005/font-path-before.json` — external assets fail on both versions; legacy default fonts pass.
- Passing-after regression: `audit-evidence/invoice-render-20261005/font-path-final.json` — 4/4 pass, covering both folder layouts on both PHP versions.
- Full final results: `audit-evidence/invoice-render-20261005/results.json` — 66/66 pass; source hashes are included.
- Both PHP versions also pass syntax validation of the modified candidate file.

The full suite renders a one-page invoice and a five-page, 65-item invoice. It checks embedded fonts, rupee and accented characters, every long-invoice row, stored totals, pagination, customer ownership, staff/CSRF boundaries, request methods, safe download headers, single PDFs, and a two-document ZIP. Orders remain byte-identical, no mail outbox is created, and the HTTP/renderer logs contain no warnings or errors.

The first exploratory font-inspection assertion assumed CID font objects and reported four failures for valid embedded TrueType fonts. The final check follows both font structures to the actual embedded font stream; that harness correction is separate from the independently reproduced font-directory failure.

## Retained test sources

- `audit/invoice-font-path-test.py`: real mPDF regression for external and legacy font layouts.
- `audit/invoice-render-test.py`: isolated PDF and authenticated HTTP regressions.
- `audit/invoice-render-harness.php`: direct renderer adapter using only supplied fixture data.
- `audit/invoice-render-standard-order.json`: synthetic input, with no real customer details.

Run with the bundled Python runtime (which provides `pypdf`):

```powershell
& '<bundled-python>/python.exe' 'audit/invoice-font-path-test.py' repeat
& '<bundled-python>/python.exe' 'audit/invoice-render-test.py'
```

The test paths expect official Windows PHP runtimes at `audit-evidence/tools/php-8.1.34/php.exe` and `audit-evidence/tools/php-8.3.35/php.exe`. The commands enable the shipped `mbstring` and `gd` extensions, and enable the ZIP extension only when it is external (PHP 8.1 includes ZIP). Renderer HTTP requests disable URL file access and mail.

## Isolated dependency setup

All runtime binaries, Composer files, fonts, cache, synthetic stores, and PDFs remain under `audit-evidence/`; none are added to the candidate or frozen review packages.

The isolated Composer project is `audit-evidence/invoice-render-20261005/`. It pins official `mpdf/mpdf` **8.3.1**, installed with `--no-plugins --no-scripts --prefer-dist --no-interaction`. The Composer PHAR was downloaded from `https://getcomposer.org/download/latest-stable/composer.phar` and checked against the official SHA-256 file. Its recorded digest is `7a2d379d5b8ffdaa028580ef26494c36d2feef4b178d3dd1473a4dbc5e17c8d6`; provenance, install log, and exact transitive versions are retained in `composer-provenance.json`, `dependency-install.log`, and `composer.lock` in that folder.

To reproduce dependency setup, use a verified Composer PHAR with a PHP runtime that enables `openssl`, `curl`, `mbstring`, `gd`, and ZIP, and install `mpdf/mpdf:8.3.1` in the isolated project. Copy its own full `vendor/mpdf/mpdf/ttfonts/DejaVuSans.ttf` to `invoice-assets/cmregular.ttf`, and `DejaVuSans-Bold.ttf` to `invoice-assets/cmregular-bold.ttf`. The regression temporarily adds/removes only these two hash-verified aliases in the isolated vendor default font folder to exercise both layouts. The full suite then removes those diagnostic aliases and tests external assets only.

## Artifacts and limits

Final synthetic PDFs are under `audit-evidence/invoice-render-20261005/8.1.34/` and `8.3.35/`: `standard.pdf`, `long.pdf`, `customer-api.pdf`, `staff-api.pdf`, and `bulk-invoices.zip`. Visual review images and findings are retained in the sibling `visual-review/` folder.

An independent visual review inspected all six pages at 140 DPI and found no clipping, overlaps, broken tables, footer collisions, or missing glyphs. The long invoice repeats its table headings on pages 2–5 and preserves rows 1–65. The post-fix page images are pixel-identical to the diagnostic pre-fix render with the same fonts. `visual-review/all-pages-overview.png`, `review-notes.md`, and `pixel-comparison.json` retain that evidence.

The production mPDF version and actual full-font files/placement were not available locally, so those specific deployed dependencies remain unverified. `images/logo-invoice.png` is absent from the local candidate; these renders exercise the text-logo fallback, not the production image. Existing production vendor/fonts/logo assets must therefore continue to be preserved by the release package.

No frozen package was edited. This source fix must be included in a newly generated review package.
