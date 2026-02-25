include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-dufs
PKG_VERSION:=0.45.0
PKG_RELEASE:=6
PKG_LICENSE:=MIT
PKG_MAINTAINER:=macm4

LUCI_TITLE:=LuCI support for dufs
LUCI_DEPENDS:=+luci-base
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

define Package/luci-app-dufs/conffiles
/etc/config/dufs
endef

define Package/luci-app-dufs/postinst
#!/bin/sh
[ -n "$$$$IPKG_INSTROOT" ] && exit 0

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

rm -f /etc/config/dufs
rm -f /tmp/luci-indexcache
rm -rf /tmp/luci-modulecache/*
exit 0
endef

# call BuildPackage - OpenWrt buildroot signature
