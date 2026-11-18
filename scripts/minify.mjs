// 构建期「安全压缩」：只删注释、行首缩进、行尾空白、合并空行。
// 不重命名标识符、不合并行、不动字符串/模板字面量/正则的内容。
//
// 设计上宁可在拿不准时保底 fail（throw），也不输出可能损坏的代码：
//   - 本仓库的运行时 JS 没有跨行字符串/模板字面量；若某行扫描后仍处于字符串状态，
//     说明遇到预料之外的写法，直接抛错让 build 失败，而不是悄悄生成坏产物。
//   - HTML 里的 <script> 内容原样保留（只压缩标签之外的缩进/注释）。
//
// 纯函数：minifyJs(text) / minifyCss(text) / minifyHtml(text)。

function stripBlockCommentsInLine(line) {
  // 行内处理 /* ... */（同一行闭合）与未闭合（返回 {code, open}）
  let out = ''
  let i = 0
  let quote = ''
  while (i < line.length) {
    const ch = line[i]
    if (quote) {
      out += ch
      if (ch === '\\' && i + 1 < line.length) {
        out += line[i + 1]
        i += 2
        continue
      }
      if (ch === quote) quote = ''
      i += 1
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      out += ch
      i += 1
      continue
    }
    if (ch === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2)
      if (end === -1) return { code: out, open: true }
      i = end + 2
      continue
    }
    out += ch
    i += 1
  }
  if (quote) return { code: out, open: false, unterminated: true }
  return { code: out, open: false }
}

export function minifyJs(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  const out = []
  let inBlockComment = false
  for (const rawLine of lines) {
    let line = rawLine
    if (inBlockComment) {
      const end = line.indexOf('*/')
      if (end === -1) continue
      line = line.slice(end + 2)
      inBlockComment = false
    }
    line = line.replace(/^[ \t]+/, '')
    if (line === '') {
      out.push('')
      continue
    }
    // 整行 // 注释（只删这种；行尾注释保留）
    if (line.startsWith('//')) continue
    const stripped = stripBlockCommentsInLine(line)
    if (stripped.unterminated) {
      throw new Error(`minifyJs: 发现跨行字符串/模板字面量，拒绝压缩：${line.slice(0, 80)}`)
    }
    if (stripped.open) {
      inBlockComment = true
      line = stripped.code.replace(/[ \t]+$/, '')
      if (line === '') continue
      out.push(line)
      continue
    }
    out.push(stripped.code.replace(/[ \t]+$/, ''))
  }
  // 去掉首尾空行、连续空行合并
  const collapsed = []
  for (const line of out) {
    if (line === '' && (collapsed.length === 0 || collapsed[collapsed.length - 1] === '')) continue
    collapsed.push(line)
  }
  while (collapsed.length && collapsed[collapsed.length - 1] === '') collapsed.pop()
  return `${collapsed.join('\n')}\n`
}

export function minifyCss(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  const out = []
  let inBlockComment = false
  for (const rawLine of lines) {
    let line = rawLine
    if (inBlockComment) {
      const end = line.indexOf('*/')
      if (end === -1) continue
      line = line.slice(end + 2)
      inBlockComment = false
    }
    // 去掉行内 /* ... */（CSS 里没有需要保护的多行字符串）
    for (;;) {
      const start = line.indexOf('/*')
      if (start === -1) break
      const end = line.indexOf('*/', start + 2)
      if (end === -1) {
        line = line.slice(0, start)
        inBlockComment = true
        break
      }
      line = line.slice(0, start) + line.slice(end + 2)
    }
    line = line.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '')
    out.push(line)
  }
  const collapsed = []
  for (const line of out) {
    if (line === '' && (collapsed.length === 0 || collapsed[collapsed.length - 1] === '')) continue
    collapsed.push(line)
  }
  while (collapsed.length && collapsed[collapsed.length - 1] === '') collapsed.pop()
  return `${collapsed.join('\n')}\n`
}

export function minifyHtml(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
  const out = []
  let inScript = false
  let inBlockComment = false
  for (const rawLine of lines) {
    let line = rawLine
    // <script> 内部原样保留（避免动到内联脚本里的字符串/缩进语义）
    if (inScript) {
      out.push(line.replace(/[ \t]+$/, ''))
      if (/<\/script>/i.test(line)) inScript = false
      continue
    }
    if (inBlockComment) {
      const end = line.indexOf('-->')
      if (end === -1) continue
      line = line.slice(end + 3)
      inBlockComment = false
    }
    for (;;) {
      const start = line.indexOf('<!--')
      if (start === -1) break
      // 保留条件注释 <!--[if ...]> 与构建标记（validate/CI 用它识别生成物）
      if (/^<!--\[if/i.test(line.slice(start))) break
      const end = line.indexOf('-->', start + 4)
      const comment = end === -1 ? line.slice(start) : line.slice(start, end + 3)
      if (comment.includes('scripts/build.mjs')) {
        const before = line.slice(0, start)
        line = before + comment + (end === -1 ? '' : line.slice(end + 3))
        break
      }
      if (end === -1) {
        line = line.slice(0, start)
        inBlockComment = true
        break
      }
      line = line.slice(0, start) + line.slice(end + 3)
    }
    line = line.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '')
    out.push(line)
    if (/<script\b/i.test(line) && !/<\/script>/i.test(line)) inScript = true
  }
  const collapsed = []
  for (const line of out) {
    if (line === '' && (collapsed.length === 0 || collapsed[collapsed.length - 1] === '')) continue
    collapsed.push(line)
  }
  while (collapsed.length && collapsed[collapsed.length - 1] === '') collapsed.pop()
  return `${collapsed.join('\n')}\n`
}
