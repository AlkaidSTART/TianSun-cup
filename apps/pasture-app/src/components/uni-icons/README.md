# uni-icons

该目录中的组件来自 `@dcloudio/uni-ui@1.5.12` 的 `lib/uni-icons`。

在 npm workspaces 中，`@dcloudio/uni-ui` 会被提升到仓库根目录，uni-app 编译到微信小程序时会为组件生成带 `../` 的产物路径，Rollup 会拒绝该路径。将当前项目使用的组件放在应用源码目录中可以保持产物路径位于小程序根目录内。
