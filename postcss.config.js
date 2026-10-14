const { pxToRpx } = require('@saco/rpx-plugin')

// Android 编样式时会加载这份配置。源码保持 px，这里换成 rpx
module.exports = {
	plugins: [pxToRpx()],
}
