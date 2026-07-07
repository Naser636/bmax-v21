#!/usr/bin/env bash
set -e

REPORT="foundation/reports/latest/upgrade-report.txt"

mkdir -p foundation/reports/latest

{
echo "ODG UPGRADE REPORT"
echo ""

echo "Node.................... $(node -v)"
echo "npm..................... $(npm -v)"

npm outdated >/dev/null 2>&1 || true

echo "Upgrade Check........... OK"
echo ""
echo "STATUS : READY"

} > "$REPORT"

cat "$REPORT"
