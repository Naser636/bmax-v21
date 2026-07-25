#!/usr/bin/env bash
set -euo pipefail

ODG="./runtime/bin/odg"

echo "=================================================="
echo "ODG RUNTIME - START"
echo "=================================================="

$ODG verify
$ODG discover
$ODG contracts validate
$ODG planner build
$ODG capability graph
$ODG capability verify
$ODG orchestrator plan
$ODG providers resolve
$ODG mission run-all
$ODG artifacts verify
$ODG evidence build
$ODG knowledge promote
$ODG memory sync
$ODG audit
$ODG status

echo
echo "=================================================="
echo "ODG RUNTIME COMPLETED"
echo "=================================================="
