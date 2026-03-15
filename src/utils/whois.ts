const URL_REGEX = /(https?:\/\/)([\w=?.\/&@#~%+:;!,()-]+)/g
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

/** Parse raw whois text into formatted HTML table with linked URLs and emails */
export function parseWhoisHtml(whois: string): string {
  let remarks = '<div class="remarks">'
  const rows: string[] = []

  for (const line of whois.split('\n')) {
    const [key, value] = line.split(/:\x20(.+)?/, 2)
    if (!key || !value) continue

    const formatted = value.trim()
      .replace(URL_REGEX, "<a href='$1$2' target='_blank'>$1$2</a>")
      .replace(EMAIL_REGEX, email => `<a href="mailto:${email}">${email}</a>`)

    if (key.trim() === 'remarks') {
      if (!formatted) continue
      // Preserve whitespace in remarks by replacing spaces (but not inside links)
      const remark = formatted.replace(/(<a\b[^>]*>.*?<\/a>)|\x20/g, (_, link) => link ?? '&nbsp;')
      remarks += `<p>${remark}</p>`
    } else {
      rows.push(`<tr><td class="key">${key.trim()}</td><td>${formatted}</td></tr>`)
    }
  }

  remarks += '</div>'
  return `<table><tbody>${rows.join('')}</tbody></table>${remarks}`
}
