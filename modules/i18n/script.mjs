import fs from 'node:fs'
import path from 'node:path'
import { pullFile, readXlsxWorkbook, rowToArray } from '@saco/xlsx-plugin'

/** 描述[语言标签]，或 vue-monorepo 的 描述(code)[iso]。第 0 列 Key 不参与 */
const HEADER_RE = /^(.*?)\s*(?:\(([^)]*)\))?\s*\[([^\]]+)\]$/

const i18nDir = import.meta.dirname
const xlsxPath = path.join(i18nDir, 'language.xlsx')
const repoRoot = path.join(i18nDir, '../..')
/** pages.json / manifest 的 %key% 只读项目根目录 locale，不读 modules/i18n */
const localeDir = path.join(repoRoot, 'locale')

/**
 * uni-app x 简体标签是 zh-Hans，不是 zh-CN。
 * 表头已经写成 zh-Hans / en-US 时原样用。
 */
const toLocaleTag = (iso) => {
	if (/^zh-cn$/i.test(iso)) return 'zh-Hans'
	if (/^zh-(tw|hk|mo)$/i.test(iso)) return 'zh-Hant'
	return iso
}

/** zh-Hans → zhHans，给 import 当变量名 */
const toIdent = (locale) => {
	const parts = locale.split(/[-_]/).filter(Boolean)
	const raw =
		parts[0].toLowerCase() +
		parts
			.slice(1)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join('')
	return /^[A-Za-z_$]/.test(raw) ? raw : `lang${raw}`
}

const parseLocaleHeader = (text) => {
	const matched = text.trim().match(HEADER_RE)
	if (!matched) return null
	const desc = matched[1].trim()
	const iso = matched[3].trim()
	if (!desc || !iso) return null
	return { desc, locale: toLocaleTag(iso) }
}

const parseLocalesFromHeader = (headers) => {
	const langs = []
	// 第 0 列是 Key，后面每一列是一种语言
	for (const cell of headers.slice(1)) {
		if (!cell.trim()) continue
		const parsed = parseLocaleHeader(cell)
		if (!parsed) {
			throw new Error(
				`[i18n] 表头无法解析「${cell}」，须为 描述[语言标签]，如 简体中文[zh-Hans]`,
			)
		}
		if (langs.some((item) => item.locale === parsed.locale)) {
			throw new Error(`[i18n] 语言标签重复：${parsed.locale}`)
		}
		langs.push(parsed)
	}
	if (!langs.length) throw new Error('[i18n] 表头没有语言列')
	return langs
}

/**
 * 转换 modules/i18n/language.xlsx，语言包写到项目根目录 locale。
 * 传 -local 才从同级 vue-monorepo 覆盖这份表；平时用目录里已有的文件。
 */
const run = async () => {
	if (process.argv.includes('-local') || !fs.existsSync(xlsxPath)) {
		pullFile(
			{
				local: 'vue-monorepo',
				repoFile: 'packages/i18n/language.xlsx',
				destPath: xlsxPath,
			},
			repoRoot,
		)
	}
	await convertLanguageXlsx(xlsxPath)
}

const convertLanguageXlsx = async (filePath) => {
	if (!fs.existsSync(filePath)) {
		throw new Error(`[i18n] 找不到 ${filePath}`)
	}

	const workbook = await readXlsxWorkbook(filePath)
	let langs = []
	const messages = new Map()

	workbook.eachSheet((sheet) => {
		if (sheet.name.includes('不读取')) return
		let count = 0
		sheet.eachRow((row, rowNumber) => {
			const cells = rowToArray(row)
			if (rowNumber === 1) {
				if (!langs.length) {
					langs = parseLocalesFromHeader(cells)
					for (const lang of langs) messages.set(lang.locale, new Map())
				}
				return
			}
			const key = (cells[0] ?? '').trim()
			if (!key) return
			langs.forEach((lang, index) => {
				// 文案保留原文空格和换行，不 trim
				messages.get(lang.locale).set(key, cells[index + 1] ?? '')
			})
			count += 1
		})
		if (count) console.log(`→ [${sheet.name}] ${count} 条`)
	})

	if (!langs.length) throw new Error('[i18n] 没有可读的工作表')

	fs.mkdirSync(localeDir, { recursive: true })
	for (const lang of langs) {
		const data = Object.fromEntries(messages.get(lang.locale))
		fs.writeFileSync(
			path.join(localeDir, `${lang.locale}.json`),
			JSON.stringify(data, null, '\t') + '\n',
			'utf8',
		)
		console.log(`→ ${lang.desc} locale/${lang.locale}.json 写入成功`)
	}
	fs.writeFileSync(path.join(i18nDir, 'index.uts'), renderIndex(langs), 'utf8')
	console.log('→ index.uts 写入成功')
}

const renderIndex = (langs) => {
	const imports = langs
		.map(
			(lang) =>
				`import ${toIdent(lang.locale)} from '../../locale/${lang.locale}.json'`,
		)
		.join('\n')
	const list = langs
		.map(
			(lang) =>
				`\t{ desc: ${JSON.stringify(lang.desc)}, locale: ${JSON.stringify(lang.locale)} },`,
		)
		.join('\n')
	const messages = langs
		.map((lang) => `\t\t${JSON.stringify(lang.locale)}: ${toIdent(lang.locale)},`)
		.join('\n')
	const locale =
		langs.find((lang) => lang.locale === 'zh-Hans')?.locale ?? langs[0].locale
	const fallback =
		langs.find((lang) => lang.locale === 'en' || lang.locale.startsWith('en-'))
			?.locale ?? langs[langs.length - 1].locale

	return `import { createI18n } from 'vue-i18n'
${imports}

/** 由 language.xlsx 表头生成，不要手改 */
export const i18nLocales = [
${list}
]

/** 由 language.xlsx 生成，不要手改 */
export const i18n = createI18n({
	legacy: false,
	locale: ${JSON.stringify(locale)},
	fallbackLocale: ${JSON.stringify(fallback)},
	messages: {
${messages}
	},
})
`
}

run().catch((err) => {
	console.error('i18n 脚本执行失败:', err)
	process.exit(1)
})
