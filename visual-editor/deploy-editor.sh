#!/usr/bin/env bash
set -euo pipefail
# Run only on the already verified Crackers Mela host, after local QA passes.
web=/home/crackersmela.com/public_html
release=/root/crackersmela-releases/20261004-visual-editor
stage="$release/staged"
mkdir -p "$stage" "$release/rollback"
tar -xzf "$release/editor-release.tar.gz" -C "$stage"
cd "$stage"
sha256sum -c SHA256SUMS
while IFS= read -r file; do
  case "$file" in *.php) /usr/local/lsws/lsphp81/bin/php -l "$file";; esac
done < FILES
cd "$web"
# Refuse to overwrite a storefront changed since the verified live backup.
printf '%s\n' \
  'aabb819885ced09e4532bfc46834d7158781626654edbebba9b17fc53bb54642  index.html' \
  'd0064fc1cc90892a5b92b9b74e29724b13a1f4323cef719f63ec4c23eb903415  js/app.js' \
  '45a4fc3ad4e2fc2509e15520baf46bb7e579633189f0e0c179f17986d0b2343e  .htaccess' \
  '0485187b8828a469e86f8a21901d08b75a38b73ef792c6a710435ec817034b86  sitemap.php' \
  '856b2cd7b9500cf29c10d21e9a2061be043b30c753f36d5748d962b2271db22c  robots.txt' | sha256sum -c -
while IFS= read -r file; do
  if test -f "$web/$file"; then
    mkdir -p "$release/rollback/$(dirname "$file")"
    cp -p "$web/$file" "$release/rollback/$file"
  fi
done < "$stage/FILES"
# Install dependencies first, then storefront entry points and routing.
while IFS= read -r file; do
  mkdir -p "$web/$(dirname "$file")"
  install -o crack9454 -g crack9454 -m 0644 "$stage/$file" "$web/$file.cms-install"
  mv -f "$web/$file.cms-install" "$web/$file"
done < "$stage/FILES"
sha256sum -c "$stage/SHA256SUMS"
date -u +%FT%TZ > "$release/installed-at.txt"
printf 'Editor installed. Existing customer, order, product, and authentication data were not changed.\n'
