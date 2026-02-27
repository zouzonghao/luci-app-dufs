#!/usr/bin/env sh
set -eu
# pipefail is optional in POSIX sh; enable it only when supported.
(set -o pipefail) >/dev/null 2>&1 && set -o pipefail

usage() {
    cat <<EOF
Usage: $(basename "$0") [VERSION] [OUT_DIR]

Build luci-app-dufs IPK package.

Arguments:
  VERSION   Package version (default: YYMMDD-HHMM, auto-generated)
  OUT_DIR   Output directory (default: ./dist)

Example:
  $(basename "$0")
  $(basename "$0") 260227-1449 ./output
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    usage
    exit 0
fi

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
BUILD_STAMP="$(date '+%y%m%d-%H%M')"
if [ -z "${1:-}" ] || [ "${1:-}" = "auto" ]; then
    VERSION="${BUILD_STAMP}"
else
    VERSION="$1"
fi
OUT_DIR="${2:-$ROOT_DIR/dist}"
PKG_NAME="luci-app-dufs"
PKG_ARCH="all"
VIEW_PATH="$ROOT_DIR/htdocs/luci-static/resources/view/dufs.js"
# Timestamp used to normalize archive entries for reproducible builds.
# Use 1980-01-01 to avoid negative epoch issues on UTC-negative time zones.
SOURCE_DATE_TOUCH="${SOURCE_DATE_TOUCH:-198001010000}"

case "$VERSION" in
    *[!0-9.-]*) echo "Invalid version: $VERSION" >&2; exit 1 ;;
esac

BIN_PATH="$ROOT_DIR/root/usr/bin/dufs"
[ -f "$BIN_PATH" ] || {
    echo "Missing offline binary: $BIN_PATH" >&2
    exit 1
}

[ -f "$VIEW_PATH" ] || {
    echo "Missing LuCI view: $VIEW_PATH" >&2
    exit 1
}

WORK_DIR="$(mktemp -d "/tmp/${PKG_NAME}.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT

DATA_DIR="$WORK_DIR/data"
CONTROL_DIR="$WORK_DIR/control"
PKGROOT_DIR="$WORK_DIR/pkgroot"
IPK_PATH="$OUT_DIR/${PKG_NAME}_${VERSION}.ipk"

mkdir -p "$OUT_DIR" "$DATA_DIR" "$CONTROL_DIR" "$PKGROOT_DIR"

cp -a "$ROOT_DIR/root/." "$DATA_DIR/"
mkdir -p "$DATA_DIR/www/luci-static/resources/view"
cp -a "$VIEW_PATH" "$DATA_DIR/www/luci-static/resources/view/dufs.js"
# Clean macOS metadata in staging only.
find "$DATA_DIR" -name '.DS_Store' -type f -exec rm -f {} \; 2>/dev/null || true
chmod 0755 "$DATA_DIR/etc/init.d/dufs" "$DATA_DIR/usr/bin/dufs"

create_tar() {
    dir="$1"
    out="$2"
    list_file="$WORK_DIR/.list.$(basename "$out" .gz)"
    tmp_tar="$WORK_DIR/.tmp.$(basename "$out" .gz)"
    (
        cd "$dir"
        find . -mindepth 1 ! -type d -print | LC_ALL=C sort > "$list_file"
    )
    "$TAR_BIN" --format=ustar --owner=0 --group=0 --numeric-owner \
        -cf "$tmp_tar" -C "$dir" -T "$list_file"
    "$GZIP_BIN" -n -f "$tmp_tar"
    mv -f "${tmp_tar}.gz" "$out"
}

normalize_tree_mtime() {
    dir="$1"
    find "$dir" -exec touch -t "$SOURCE_DATE_TOUCH" {} \;
}

cat > "$CONTROL_DIR/control" <<EOF
Package: $PKG_NAME
Version: $VERSION
Depends: luci-base
Section: luci
Category: LuCI
Title: LuCI support for dufs (offline all-in-one)
Architecture: $PKG_ARCH
Maintainer: macm4
Description: Offline all-in-one package containing dufs binary and LuCI management UI.
EOF

cat > "$CONTROL_DIR/postinst" <<'EOF'
#!/bin/sh
[ -n "$IPKG_INSTROOT" ] && exit 0
case "$1" in
	""|configure) ;;
	*) exit 0 ;;
esac

if [ ! -f /etc/config/dufs ]; then
cat > /etc/config/dufs <<'CFGEOF'
config dufs 'main'
	option enabled '0'
	option serve_path '/mnt'
	list bind '0.0.0.0'
	option port '5000'
	option path_prefix ''
	option allow_all '0'
	option allow_upload '0'
	option allow_delete '0'
	option allow_search '0'
	option allow_symlink '0'
	option allow_archive '0'
	option allow_hash '0'
	option enable_cors '0'
	option render_index '0'
	option render_try_index '0'
	option render_spa '0'
	option compress 'low'
	option user 'root'
	option group 'root'
CFGEOF
fi

enabled="$(uci -q get dufs.main.enabled)"
[ -n "$enabled" ] || enabled="$(uci -q get dufs.@dufs[0].enabled)"
if [ "$enabled" = "1" ] || [ "$enabled" = "true" ]; then
/etc/init.d/dufs enable >/dev/null 2>&1 || true
/etc/init.d/dufs restart >/dev/null 2>&1 || /etc/init.d/dufs start >/dev/null 2>&1 || true
else
/etc/init.d/dufs stop >/dev/null 2>&1 || true
/etc/init.d/dufs disable >/dev/null 2>&1 || true
fi

echo "==> Refreshing LuCI cache..."
rm -f /tmp/luci-indexcache
rm -rf /tmp/luci-modulecache/*
/etc/init.d/rpcd restart >/dev/null 2>&1
/etc/init.d/uhttpd reload >/dev/null 2>&1 || /etc/init.d/uhttpd restart >/dev/null 2>&1

echo "==> luci-app-dufs installed successfully"

exit 0
EOF
chmod 0755 "$CONTROL_DIR/postinst"

cat > "$CONTROL_DIR/prerm" <<'EOF'
#!/bin/sh
[ -n "$IPKG_INSTROOT" ] && exit 0

echo "==> Stopping dufs service..."
/etc/init.d/dufs stop 2>/dev/null || true
/etc/init.d/dufs disable 2>/dev/null || true

case "$1" in
	""|remove|purge)
		echo "==> Removing configuration..."
		rm -f /etc/config/dufs
	;;
esac

echo "==> Removing LuCI cache..."
rm -f /tmp/luci-indexcache
rm -rf /tmp/luci-modulecache/*

exit 0
EOF
chmod 0755 "$CONTROL_DIR/prerm"

export COPYFILE_DISABLE=1
TAR_BIN="${TAR:-tar}"
GZIP_BIN="${GZIP:-gzip}"
if ! command -v "$TAR_BIN" >/dev/null 2>&1; then
    echo "Error: tar command not found" >&2
    exit 1
fi
if ! command -v "$GZIP_BIN" >/dev/null 2>&1; then
    echo "Error: gzip command not found" >&2
    exit 1
fi

normalize_tree_mtime "$CONTROL_DIR"
normalize_tree_mtime "$DATA_DIR"

create_tar "$CONTROL_DIR" "$PKGROOT_DIR/control.tar.gz"
create_tar "$DATA_DIR" "$PKGROOT_DIR/data.tar.gz"
printf '2.0\n' > "$PKGROOT_DIR/debian-binary"
touch -t "$SOURCE_DATE_TOUCH" "$PKGROOT_DIR/debian-binary" \
    "$PKGROOT_DIR/control.tar.gz" "$PKGROOT_DIR/data.tar.gz"

create_tar "$PKGROOT_DIR" "$IPK_PATH"

cd "$OUT_DIR"
if command -v sha256sum >/dev/null 2>&1; then
    HASH_LINE="$(sha256sum "$(basename "$IPK_PATH")")"
elif command -v shasum >/dev/null 2>&1; then
    HASH_LINE="$(shasum -a 256 "$(basename "$IPK_PATH")")"
else
    echo "Error: sha256sum/shasum not found" >&2
    exit 1
fi
printf '%s\n' "$HASH_LINE" > "${IPK_PATH}.sha256"
HASH_VALUE="$(printf '%s\n' "$HASH_LINE" | awk '{print $1}')"
SIZE_BYTES="$(wc -c < "$IPK_PATH" | tr -d ' ')"

echo ""
echo "========================================="
echo "✓ Package created: $(basename "$IPK_PATH")"
echo "✓ Size (bytes): $SIZE_BYTES"
echo "✓ SHA256: $HASH_VALUE"
echo "========================================="
