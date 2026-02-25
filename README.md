# luci-app-dufs

LuCI 应用插件，用于在 OpenWrt 路由器上通过 Web 界面管理 [dufs](https://github.com/sigoden/dufs) 文件服务器。

![demo](./demo.avif)

## 功能特性

- 支持静态文件服务
- 支持文件上传/下载
- 支持文件夹打包下载为 ZIP
- 支持搜索文件
- 支持 WebDAV 协议
- 支持访问控制（用户名/密码认证）
- 支持 HTTPS
- 支持自定义端口和路径前缀

## 安装方式

### 方式一：直接安装预构建的 IPK（推荐）

从项目的 [Release 页面](https://github.com/macm4/luci-app-dufs/releases) 下载最新的 `.ipk` 文件，然后通过 OpenWrt 安装。




---

### 方式二：手动构建 IPK

如果你需要使用最新版本的 dufs，或者想自己构建，可以按照以下步骤操作：

#### 步骤 1：下载并准备 dufs 源码

访问 [dufs GitHub Releases](https://github.com/sigoden/dufs/releases) 页面，下载对应架构的压缩包。

对于大多数 ARM 架构的 OpenWrt 路由器，选择 `aarch64-unknown-linux-musl.tar.gz`（AArch64/ARM64）：

```sh
# 在本地电脑上操作
# 1. 下载本项目源码，cd 进入文件夹


# 2. 下载dufs（假设为 0.45.0，请根据实际版本号修改）
curl -L -o dufs.tar.gz "https://github.com/sigoden/dufs/releases/download/v0.45.0/dufs-v0.45.0-aarch64-unknown-linux-musl.tar.gz"

# 3. 解压
tar -xzf dufs.tar.gz
```


#### 步骤 2：将 dufs 二进制文件放入项目目录

将解压出来的 `dufs` 可执行文件复制到本项目的对应目录：

```sh
# 复制二进制文件到 luci-app-dufs 的 bin 目录
cp dufs luci-app-dufs/root/usr/bin/dufs

# 确保文件可执行
chmod +x luci-app-dufs/root/usr/bin/dufs
```

#### 步骤 3：执行构建脚本

```sh
# 执行构建脚本
# 参数说明：
#   第一个参数：版本号（格式：dufs版本-修订号），如 0.45.0-4
#   第二个参数：输出目录，如 ./dist

./scripts/build_opkg_ipk.sh 0.45.0-4 ./dist
```

**输出目录结构：**

```
./dist/
└── luci-app-dufs_0.45.0-4_all.ipk    # 生成的安装包
```

#### 步骤 4：安装到路由器

通过 OpenWrt webui 安装

或

```sh
# 将生成的 IPK 文件上传到路由器
scp ./dist/luci-app-dufs_0.45.0-4_all.ipk root@<路由器IP>:/tmp/

# SSH 登录路由器并安装
ssh root@<路由器IP>
opkg install /tmp/luci-app-dufs_0.45.0-4_all.ipk
```


### 访问

服务启动后，通过以下地址访问：

- **HTTP**: `http://<路由器IP>:5000/`
- **WebDAV**: `http://<路由器IP>:5000/`（使用 WebDAV 客户端连接）



## 卸载

通过 OpenWrt webui 卸载

或

```sh
ssh root@<路由器IP>
opkg remove luci-app-dufs
```

## 相关链接

- [dufs 官方仓库](https://github.com/sigoden/dufs)

