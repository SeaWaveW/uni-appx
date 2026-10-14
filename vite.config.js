import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { pxToRpxTemplate } from '@saco/rpx-plugin'

export default defineConfig({
	// 稿宽和 PostCSS 一样，读 package.json 的 rpx-plugin；没有则 375
	plugins: [uni(), pxToRpxTemplate()],
})
