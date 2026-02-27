include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-dufs
PKG_VERSION:=$(shell date +%y%m%d-%H%M)
PKG_LICENSE:=MIT
PKG_MAINTAINER:=macm4

LUCI_TITLE:=LuCI support for dufs
LUCI_DEPENDS:=+luci-base
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

define Package/luci-app-dufs/postinst
#!/bin/sh
[ -n "$$$$IPKG_INSTROOT" ] && exit 0
case "$$$$1" in
	""|configure) ;;
	*) exit 0 ;;
esac

if [ ! -f /etc/config/dufs ]; then
cat > /etc/config/dufs <<'EOF'
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
EOF
fi

enabled="$$(uci -q get dufs.main.enabled)"
[ -n "$$$$enabled" ] || enabled="$$(uci -q get dufs.@dufs[0].enabled)"
if [ "$$$$enabled" = "1" ] || [ "$$$$enabled" = "true" ]; then
	/etc/init.d/dufs enable >/dev/null 2>&1 || true
	/etc/init.d/dufs restart >/dev/null 2>&1 || /etc/init.d/dufs start >/dev/null 2>&1 || true
else
	/etc/init.d/dufs stop >/dev/null 2>&1 || true
	/etc/init.d/dufs disable >/dev/null 2>&1 || true
fi

rm -f /tmp/luci-indexcache
rm -rf /tmp/luci-modulecache/*
/etc/init.d/rpcd restart >/dev/null 2>&1
/etc/init.d/uhttpd reload >/dev/null 2>&1 || /etc/init.d/uhttpd restart >/dev/null 2>&1
exit 0
endef

define Package/luci-app-dufs/postrm
#!/bin/sh
[ -n "$$$$IPKG_INSTROOT" ] && exit 0

/etc/init.d/dufs stop 2>/dev/null || true
/etc/init.d/dufs disable 2>/dev/null || true

case "$$$$1" in
	""|remove|purge)
		rm -f /etc/config/dufs
	;;
esac

rm -f /tmp/luci-indexcache
rm -rf /tmp/luci-modulecache/*
exit 0
endef

# call BuildPackage - OpenWrt buildroot signature
