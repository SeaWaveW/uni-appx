import fs from 'node:fs'
import path from 'node:path'
import { pullFile, readXlsxWorkbook, rowToArray } from '@saco/xlsx-plugin'

/** 组件库 var.scss 只拿这 8 个种子去混档位，其它键写了也不会进 color.mix */
const SEED_KEYS = new Set([
	'primary-color',
	'success-color',
	'warning-color',
	'danger-color',
	'info-color',
	'white-color',
	'black-color',
	'text-color',
])

/** 能交给 Sass 混色的值。var() 不能写进 $color-palette */
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i

const VAR_RE = /^var\(\s*--([^)]+?)\s*\)$/i

const themeDir = import.meta.dirname
const xlsxPath = path.join(themeDir, 'color.xlsx')
const repoRoot = path.join(themeDir, '../..')

const normalizeHeader = (header) => header.toLowerCase().replace(/\s+/g, '')

const findCol = (headers, predicates) => {
	for (const pred of predicates) {
		const index = headers.findIndex(pred)
		if (index >= 0) return index
	}
	return -1
}

/** 色名，不带 -- */
const themeName = (key) => key.trim().replace(/^--+/, '')

/** JSON 用驼峰：primary-color → primaryColor，main-color-1 → mainColor1 */
const toJsonKey = (key) =>
	themeName(key).replace(/[-_]+([a-zA-Z0-9])/g, (_, char) =>
		char.toUpperCase(),
	)

/**
 * 从同级 vue-monorepo 拷 color.xlsx。
 * vars.scss 只给组件库种子；light.json / dark.json 是整张表，图表按档取色。
 */
const run = async () => {
	// 不带点的 local 相对本仓库上一级，指向同级的 vue-monorepo
	pullFile(
		{
			local: 'vue-monorepo',
			repoFile: 'packages/theme/color.xlsx',
			destPath: xlsxPath,
		},
		repoRoot,
	)
	await convertColorXlsx(xlsxPath)
}

const convertColorXlsx = async (filePath) => {
	if (!fs.existsSync(filePath)) {
		throw new Error(`[theme] 找不到 ${filePath}`)
	}

	const workbook = await readXlsxWorkbook(filePath)
	const rows = []

	workbook.eachSheet((sheet) => {
		// 表名标明不读取的，整张跳过
		if (sheet.name.includes('不读取')) return
		const parsed = parseThemeSheet(sheet)
		if (!parsed.length) return
		rows.push(...parsed)
		console.log(`→ [${sheet.name}] ${parsed.length} 条`)
	})

	const themeRows = mergeThemeRows(rows)
	if (!themeRows.length) {
		throw new Error('[theme] 没有可读的主题色')
	}

	fs.writeFileSync(path.join(themeDir, 'vars.scss'), renderVars(themeRows), 'utf8')
	const { light, dark } = renderThemeJson(themeRows)
	fs.writeFileSync(
		path.join(themeDir, 'light.json'),
		JSON.stringify(light, null, '\t') + '\n',
		'utf8',
	)
	fs.writeFileSync(
		path.join(themeDir, 'dark.json'),
		JSON.stringify(dark, null, '\t') + '\n',
		'utf8',
	)
	console.log(
		`→ vars.scss、light.json、dark.json 写入成功（${themeRows.length} 条）`,
	)
}

const parseThemeSheet = (sheet) => {
	const headers = rowToArray(sheet.getRow(1), true)
	const keyIdx = findCol(headers, [
		(header) => normalizeHeader(header) === 'key',
		(header) => normalizeHeader(header).startsWith('key'),
	])
	const lightIdx = findCol(headers, [(header) =>
		normalizeHeader(header).startsWith('light'),
	])
	const darkIdx = findCol(headers, [(header) =>
		normalizeHeader(header).startsWith('dark'),
	])
	const remarkIdx = findCol(headers, [
		(header) => header.includes('备注'),
		(header) => {
			const name = normalizeHeader(header)
			return name.startsWith('remark') || name.startsWith('comment')
		},
	])
	if (keyIdx < 0 || lightIdx < 0) return []

	const parsed = []
	sheet.eachRow((row, rowNumber) => {
		if (rowNumber === 1) return
		const cells = rowToArray(row, true)
		const key = themeName(cells[keyIdx] ?? '')
		const light = cells[lightIdx] ?? ''
		if (!key || !light) return
		// 暗色空着就跟亮色，图表切到暗色档时还有色
		const dark = (darkIdx >= 0 ? cells[darkIdx] : '') || light
		const remark = remarkIdx >= 0 ? (cells[remarkIdx] ?? '') : ''
		parsed.push({ key, light, dark, remark })
	})
	return parsed
}

/** 同名 Key 后表覆盖前表 */
const mergeThemeRows = (rows) => {
	const map = new Map()
	for (const row of rows) map.set(row.key, row)
	return [...map.values()]
}

/**
 * 表里的 var(--primary-color) 在端上不能当色值。
 * 按同一档展开成实际颜色，图表才能亮暗都画出来。
 */
const resolveColor = (value, tone, byKey, seen) => {
	const matched = value.match(VAR_RE)
	if (!matched) return value
	const name = matched[1]
	if (seen.has(name)) return value
	const row = byKey.get(name)
	if (!row) return value
	seen.add(name)
	return resolveColor(row[tone], tone, byKey, seen)
}

const renderThemeJson = (rows) => {
	const byKey = new Map(rows.map((row) => [row.key, row]))
	const light = {}
	const dark = {}
	for (const row of rows) {
		const key = toJsonKey(row.key)
		light[key] = resolveColor(row.light, 'light', byKey, new Set([row.key]))
		dark[key] = resolveColor(row.dark, 'dark', byKey, new Set([row.key]))
	}
	return { light, dark }
}

const renderVars = (rows) => {
	const entries = rows
		.filter((row) => SEED_KEYS.has(row.key))
		.filter((row) => COLOR_RE.test(row.light) && COLOR_RE.test(row.dark))
		.map(
			(row) =>
				`\t${row.key}: (\n\t\tlight: ${row.light},\n\t\tdark: ${row.dark},\n\t),`,
		)
		.join('\n')
	return `// 由 modules/theme/color.xlsx 生成，不要手改
// 组件库 var.scss 只读这几个种子。必须在引入 var.scss 之前赋值
$color-palette: (
${entries}
);
`
}

run().catch((err) => {
	console.error('theme 脚本执行失败:', err)
	process.exit(1)
})
