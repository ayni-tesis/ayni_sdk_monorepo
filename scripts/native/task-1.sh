#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/../.."
(cd 'apps/native' && flutter create --platforms=android,ios . && flutter pub get)
