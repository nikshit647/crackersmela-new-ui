#!/usr/bin/env bash
# Roll back release 20261010-editor-seo4 on crackersmela.com.
# Restores the 21 overwritten files from the backup and deletes the 23 added files.
# Run ONLY if the release must be reverted:
#   ssh bluehost-vps "bash -s" < audit/rollback-20261010-editor-seo4.sh
set -eu
ROOT=/home/crackersmela.com/public_html
BACKUP=/home/backups/crackersmela-20261010-191326

[ -f "$BACKUP/rollback-manifest.txt" ] || { echo "rollback manifest missing"; exit 1; }

echo "== restoring overwritten files =="
restored=0
while read -r kind path; do
  if [ "$kind" = "OVERWRITTEN" ]; then
    cp -p "$BACKUP/$path" "$ROOT/$path"
    restored=$((restored+1))
  fi
done < "$BACKUP/rollback-manifest.txt"
echo "restored $restored file(s)"

echo "== removing files added by this release =="
removed=0
while read -r kind path; do
  if [ "$kind" = "ADDED" ]; then
    rm -f "$ROOT/$path"
    removed=$((removed+1))
  fi
done < "$BACKUP/rollback-manifest.txt"
echo "removed $removed file(s)"

find "$ROOT/images/brands" -type d -empty -delete 2>/dev/null || true
echo "== rollback complete =="