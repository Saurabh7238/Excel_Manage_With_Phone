const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8000/api' : '/api')

export async function api(path, token, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.detail || 'Something went wrong. Please try again.')
  return body
}

export async function uploadWorkbook(file, token, preview = false, options = null) {
  const form = new FormData()
  form.append('file', file)
  if (options) form.append('options', JSON.stringify(options))
  const endpoint = preview ? '/upload/preview' : '/upload'
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.detail || 'Could not upload the workbook.')
  return body
}

export async function downloadWorkbook(token) {
  const response = await fetch(`${API_URL}/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail || 'Could not download the workbook.')
  }
  return response.blob()
}

export async function uploadAttachment(sheetName, recordId, file, token) {
  const form = new FormData()
  form.append('file', file)
  const path = `/${encodeURIComponent(sheetName)}/rows/${encodeURIComponent(recordId)}/attachments`
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.detail || 'Could not attach this file.')
  return body
}

export async function downloadAttachment(sheetName, recordId, attachmentId, token) {
  const path = `/${encodeURIComponent(sheetName)}/rows/${encodeURIComponent(recordId)}/attachments/${encodeURIComponent(attachmentId)}`
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.detail || 'Could not download this attachment.')
  }
  return response.blob()
}