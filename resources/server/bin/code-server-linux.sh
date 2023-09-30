#!/usr/bin/env sh
#
# Copyright (c) Tongji University. All rights reserved.
#

case "$1" in
	--inspect*) INSPECT="$1"; shift;;
esac

ROOT="$(dirname "$(dirname "$(readlink -f "$0")")")"

"$ROOT/node" ${INSPECT:-} "$ROOT/out/server-main.js" "$@"
