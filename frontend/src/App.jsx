import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, BadgeIndianRupee, BriefcaseBusiness, CalendarDays,
  ArrowDownAZ, ArrowUpAZ, Check, ChevronDown, ChevronLeft, CircleHelp, ClipboardList, ClipboardPaste, Clock3, Download,
  Eye, FilePlus2, FileText, Filter, LayoutDashboard, Link2, LoaderCircle, LogOut, Menu, Paperclip, Pencil, Plus, RefreshCw, ScanLine, Search, Trash2,
  Settings2, SlidersHorizontal, Sparkles, Upload, UsersRound, X,
} from 'lucide-react'
import { api, downloadAttachment, downloadWorkbook, uploadAttachment, uploadWorkbook } from './api'

const money = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const palette = ['#dff4a7', '#e7efec', '#ffe3d8', '#e4e8ff']
const icons = [UsersRound, BadgeIndianRupee, BriefcaseBusiness, Clock3]
const DEFAULT_WIDGETS = ['activeLists', 'recordsTracked', 'numberTotals']

function formatValue(value, field) {
  if (value === null || value === undefined || value === '') return '—'
  if (field?.type === 'number') return `₹${money.format(Number(value) || 0)}`
  if (field?.type === 'link') return field.options?.find((option) => option.id === String(value))?.label || 'Missing linked record'
  return String(value)
}

function Login({ onLogin, error, busy }) {
  const [password, setPassword] = useState('')
  return (
    <main className="login-screen">
      <div className="login-art" aria-hidden="true">
        <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
        <div className="receipt-card"><span>THIS MONTH</span><strong>₹ 84,250</strong><div className="receipt-line" /><div className="receipt-line short" /><div className="receipt-stamp"><Check size={17} /></div></div>
      </div>
      <form className="login-panel" onSubmit={(event) => { event.preventDefault(); onLogin(password) }}>
        <div className="brand-mark"><span className="brand-symbol">L</span><span>ledgerly</span></div>
        <p className="eyebrow">YOUR BUSINESS, IN GOOD ORDER</p>
        <h1>Welcome<br />back.</h1>
        <p className="login-copy">Sign in to keep your day moving.</p>
        <label className="field-label" htmlFor="password">Workspace password</label>
        <input id="password" className="text-input" type="password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" />
        {error && <p className="error-copy">{error}</p>}
        <button className="primary-button w-full" disabled={busy || !password}>{busy ? <LoaderCircle className="animate-spin" size={18} /> : null} Open workspace <ArrowUpRight size={17} /></button>
        <p className="login-foot"><CircleHelp size={14} /> Ask your workspace owner for access.</p>
      </form>
    </main>
  )
}

function Modal({ title, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={`modal-panel ${wide ? 'modal-wide' : ''}`}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close" onClick={onClose}><X size={19} /></button></div>{children}</section></div>
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('ledgerly-token') || '')
  const [lists, setLists] = useState([])
  const [activeList, setActiveList] = useState('')
  const [data, setData] = useState(null)
  const [screen, setScreen] = useState('home')
  const [modal, setModal] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingUpload, setPendingUpload] = useState(null)
  const [editingRecord, setEditingRecord] = useState(null)
  const [attachmentRecord, setAttachmentRecord] = useState(null)
  const [selectedRows, setSelectedRows] = useState(() => new Set())
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterField, setFilterField] = useState('')
  const [filterValue, setFilterValue] = useState('')
  const [sortField, setSortField] = useState('')
  const [sortAscending, setSortAscending] = useState(true)
  const [linkedRecordId, setLinkedRecordId] = useState('')
  const [visibleWidgets, setVisibleWidgets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ledgerly-widgets') || 'null') || DEFAULT_WIDGETS }
    catch { return DEFAULT_WIDGETS }
  })
  const [googleSyncing, setGoogleSyncing] = useState(false)
  const [toast, setToast] = useState('')

  async function loadLists(auth = token) {
    const result = await api('/lists', auth)
    setLists(result)
    if (!activeList && result.length) setActiveList(result[0].name)
  }

  async function loadData(sheet = activeList) {
    if (!sheet) return
    const result = await api(`/${encodeURIComponent(sheet)}/data`, token)
    setData(result)
  }

  useEffect(() => {
    if (!token) return
    loadLists().catch(() => { localStorage.removeItem('ledgerly-token'); setToken('') })
  }, [token])

  useEffect(() => {
    if (token && activeList) loadData().catch((problem) => showToast(problem.message))
  }, [token, activeList])

  useEffect(() => setSelectedRows(new Set()), [activeList])

  useEffect(() => {
    localStorage.setItem('ledgerly-widgets', JSON.stringify(visibleWidgets))
  }, [visibleWidgets])

  useEffect(() => {
    if (!toast) return
    const hasAction = typeof toast === 'object' && (toast.undo || toast.link)
    const timer = window.setTimeout(() => setToast(''), hasAction ? 12000 : 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  function showToast(message) { setToast(message) }

  async function signIn(password) {
    setBusy(true); setError('')
    try {
      const result = await api('/login', '', { method: 'POST', body: JSON.stringify({ password }) })
      localStorage.setItem('ledgerly-token', result.token)
      setToken(result.token)
    } catch (problem) { setError(problem.message) }
    finally { setBusy(false) }
  }

  async function importWorkbook(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true); setError('')
    try {
      const preview = await uploadWorkbook(file, token, true)
      setPendingUpload({ file, preview, selectedSheets: preview.worksheets.map((sheet) => sheet.name), mapping: {} })
      setModal('upload-preview')
    } catch (problem) { showToast(problem.message) }
    finally { setUploading(false) }
  }

  async function confirmWorkbookImport() {
    if (!pendingUpload) return
    setUploading(true)
    try {
      const options = { sheets: pendingUpload.selectedSheets, mapping: pendingUpload.mapping }
      const result = await uploadWorkbook(pendingUpload.file, token, false, options)
      setLists(result)
      setActiveList(result[0]?.name || '')
      setData(null)
      setScreen('home')
      setPendingUpload(null)
      setModal('')
      showToast(`${pendingUpload.file.name} imported`)
    } catch (problem) { showToast(problem.message) }
    finally { setUploading(false) }
  }

  async function reload() {
    await loadLists()
    if (activeList) await loadData(activeList)
  }

  async function createList(name, fields) {
    await api(`/${encodeURIComponent(name)}/create`, token, { method: 'POST', body: JSON.stringify({ name, fields }) })
    setActiveList(name); setScreen('list'); setModal(''); await loadLists(); await loadData(name)
    showToast(`${name} is ready`)
  }

  async function addRow(values) {
    await api(`/${encodeURIComponent(activeList)}/add-row`, token, { method: 'POST', body: JSON.stringify({ values }) })
    setModal(''); await reload(); showToast('Record saved')
  }

  async function previewRow(rowIndex, values) {
    return api(`/${encodeURIComponent(activeList)}/rows/${rowIndex}/preview`, token, { method: 'POST', body: JSON.stringify({ values }) })
  }

  async function editRow(rowIndex, values) {
    await api(`/${encodeURIComponent(activeList)}/rows/${rowIndex}`, token, { method: 'PUT', body: JSON.stringify({ values }) })
    setEditingRecord(null); setModal(''); await reload(); showToast('Record updated')
  }

  async function applyBulkPaste(mode, rows) {
    const indices = mode === 'update' ? [...selectedRows].sort((left, right) => left - right) : []
    await api(`/${encodeURIComponent(activeList)}/bulk-rows`, token, {
      method: 'POST',
      body: JSON.stringify({ mode, indices, rows }),
    })
    setSelectedRows(new Set())
    setModal('')
    await reload()
    showToast(`${rows.length} records ${mode === 'append' ? 'added' : 'updated'}`)
  }

  function toggleRowSelection(rowIndex, checked) {
    setSelectedRows((current) => {
      const next = new Set(current)
      if (checked) next.add(rowIndex)
      else next.delete(rowIndex)
      return next
    })
  }

  function openLinkedRecord(field, recordId) {
    const linked = field.options?.find((option) => option.id === recordId)
    if (!linked) return
    setFilterField(''); setFilterValue(''); setSortField(''); setSearch(''); setLinkedRecordId(recordId)
    setActiveList(field.target_sheet)
    setScreen('list')
  }

  async function exportWorkbook() {
    try {
      const file = await downloadWorkbook(token)
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = url
      link.download = 'Business.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      showToast('Workbook downloaded')
    } catch (problem) { showToast(problem.message) }
  }

  async function syncGoogleSheets() {
    setGoogleSyncing(true)
    try {
      const result = await api('/google-sync', token, { method: 'POST' })
      setToast({ message: `${result.sheets} sheets synced to Google`, link: result.url })
    } catch (problem) { showToast(problem.message) }
    finally { setGoogleSyncing(false) }
  }

  async function exportReceipt(row) {
    try {
    const { jsPDF } = await import('jspdf')
    const findValue = (pattern) => {
      const field = fields.find((item) => pattern.test(item.name))
      return field ? row[field.name] : null
    }
    const doc = new jsPDF()
    const customer = findValue(/customer|client|name/i) || 'Customer'
    const invoice = findValue(/invoice|receipt|reference|bill\s*(number|no\.?)/i)
    const total = findValue(/bill|total|amount/i)
    const paid = findValue(/paid|received/i)
    const balance = findValue(/balance|due/i)
    doc.setFillColor(23, 60, 49)
    doc.rect(0, 0, 210, 42, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(21)
    doc.text('PAYMENT RECEIPT', 18, 23)
    doc.setFontSize(10)
    doc.text('Ledgerly Business Manager', 18, 33)
    doc.setTextColor(35, 55, 43)
    doc.setFontSize(12)
    doc.text(`Customer: ${String(customer)}`, 18, 60)
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 18, 70)
    if (invoice) doc.text(`Reference: ${String(invoice)}`, 18, 80)
    doc.setDrawColor(220, 228, 220)
    doc.line(18, 90, 192, 90)
    doc.setFontSize(11)
    let y = 104
    if (total !== null) { doc.text('Total', 18, y); doc.text(`INR ${money.format(Number(total) || 0)}`, 192, y, { align: 'right' }); y += 12 }
    if (paid !== null) { doc.text('Paid', 18, y); doc.text(`INR ${money.format(Number(paid) || 0)}`, 192, y, { align: 'right' }); y += 12 }
    if (balance !== null) { doc.setFont('helvetica', 'bold'); doc.text('Balance due', 18, y); doc.text(`INR ${money.format(Number(balance) || 0)}`, 192, y, { align: 'right' }); doc.setFont('helvetica', 'normal') }
    doc.setFontSize(9)
    doc.setTextColor(120, 132, 124)
    doc.text('Generated from your business records.', 18, 270)
    const safeName = String(customer).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'customer'
    doc.save(`Receipt-${safeName}.pdf`)
    showToast('PDF receipt downloaded')
    } catch (problem) { showToast(problem.message || 'Could not create the PDF receipt') }
  }

  async function deleteRow(rowIndex) {
    if (!window.confirm('Delete this record? You can undo this once.')) return
    const sheetName = activeList
    try {
      const deleted = await api(`/${encodeURIComponent(sheetName)}/rows/${rowIndex}`, token, { method: 'DELETE' })
      setSelectedRows(new Set())
      await loadLists()
      if (activeList === sheetName) await loadData(sheetName)
      setToast({ message: 'Record deleted', undo: async () => {
        await api(`/${encodeURIComponent(sheetName)}/rows/${deleted.index}/restore`, token, { method: 'POST', body: JSON.stringify({ values: deleted.row }) })
        await loadLists()
        if (activeList === sheetName) await loadData(sheetName)
        showToast('Record restored')
      } })
    } catch (problem) { showToast(problem.message) }
  }

  async function undoDelete() {
    const undo = toast?.undo
    if (!undo) return
    setToast('Restoring record...')
    try { await undo() } catch (problem) { showToast(problem.message) }
  }

  async function updateField(fieldName, changes) {
    await api(`/${encodeURIComponent(activeList)}/fields/${encodeURIComponent(fieldName)}`, token, { method: 'PUT', body: JSON.stringify(changes) })
    await reload()
  }

  async function addField(field) {
    await api(`/${encodeURIComponent(activeList)}/add-field`, token, { method: 'POST', body: JSON.stringify(field) })
    await reload()
  }

  async function removeField(name) {
    await api(`/${encodeURIComponent(activeList)}/fields/${encodeURIComponent(name)}`, token, { method: 'DELETE' })
    await reload()
  }

  async function saveStyles(styles) {
    await api(`/${encodeURIComponent(activeList)}/styles`, token, { method: 'PUT', body: JSON.stringify(styles) })
    setModal(''); showToast('Column styles saved to Excel')
  }

  const selected = lists.find((list) => list.name === activeList)
  const fields = data?.fields || selected?.fields || []
  const visibleRows = useMemo(() => {
    let rows = [...(data?.rows || [])]
    if (linkedRecordId) rows = rows.filter((row) => row._id === linkedRecordId)
    if (filterField && filterValue !== '') rows = rows.filter((row) => String(row[filterField] ?? '') === filterValue)
    if (search.trim()) {
      const needle = search.trim().toLowerCase()
      rows = rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(needle)) || fields.some((field) => field.type === 'link' && field.options?.find((option) => option.id === row[field.name])?.label.toLowerCase().includes(needle)))
    }
    if (sortField) rows.sort((left, right) => {
      const sortDefinition = fields.find((field) => field.name === sortField)
      const firstValue = left[sortField]
      const secondValue = right[sortField]
      const first = sortDefinition?.type === 'link' ? sortDefinition.options?.find((option) => option.id === firstValue)?.label : firstValue
      const second = sortDefinition?.type === 'link' ? sortDefinition.options?.find((option) => option.id === secondValue)?.label : secondValue
      const comparison = typeof first === 'number' && typeof second === 'number'
        ? first - second
        : String(first ?? '').localeCompare(String(second ?? ''), undefined, { numeric: true, sensitivity: 'base' })
      return sortAscending ? comparison : -comparison
    })
    return rows
  }, [data, fields, filterField, filterValue, search, sortField, sortAscending, linkedRecordId])
  const filterValues = filterField ? [...new Set((data?.rows || []).map((row) => String(row[filterField] ?? '')).filter(Boolean))] : []
  const visibleRowIndices = visibleRows.map((row) => data?.rows.indexOf(row)).filter((index) => index >= 0)
  const allVisibleSelected = visibleRowIndices.length > 0 && visibleRowIndices.every((index) => selectedRows.has(index))
  const dashboardTotal = lists.reduce((total, list) => total + Object.values(list.sums || {}).reduce((sum, value) => sum + Number(value || 0), 0), 0)
  const dashboardStats = [
    { id: 'activeLists', label: 'ACTIVE LISTS', value: lists.length.toString().padStart(2, '0'), Icon: ClipboardList, tone: 'sage' },
    { id: 'recordsTracked', label: 'RECORDS TRACKED', value: lists.reduce((sum, list) => sum + list.count, 0).toLocaleString('en-IN'), Icon: ArrowUpRight, tone: 'coral-bg' },
    { id: 'numberTotals', label: 'NUMBER TOTALS', value: `INR ${money.format(dashboardTotal)}`, Icon: BadgeIndianRupee, tone: 'lilac' },
    ...lists.map((list, index) => ({ id: `list:${list.name}`, label: `${list.name.toUpperCase()} RECORDS`, value: String(list.count), Icon: icons[index % icons.length], tone: `card-icon-${index % 4}` })),
  ]
  const activeWidgets = dashboardStats.filter((widget) => visibleWidgets.includes(widget.id))

  if (!token) return <Login onLogin={signIn} error={error} busy={busy} />

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark"><span className="brand-symbol">L</span><span>ledgerly</span></div>
        <div className="workspace-label">WORKSPACE <ChevronDown size={13} /></div>
        <button className={`nav-item ${screen === 'home' ? 'nav-active' : ''}`} onClick={() => setScreen('home')}><LayoutDashboard size={18} /> Overview</button>
        <p className="side-caption">YOUR LISTS <button title="Create list" onClick={() => setModal('create')}><Plus size={15} /></button></p>
        <div className="side-lists">{lists.map((list, index) => {
          const Icon = icons[index % icons.length]
          return <button key={list.name} className={`nav-item ${screen === 'list' && activeList === list.name ? 'nav-active' : ''}`} onClick={() => { setLinkedRecordId(''); setActiveList(list.name); setScreen('list') }}><span className={`side-icon side-icon-${index % 4}`}><Icon size={16} /></span><span className="truncate">{list.name}</span><span className="side-count">{list.count}</span></button>
        })}</div>
        <div className="sidebar-bottom"><div className="profile-avatar">S</div><div className="profile-info"><strong>Store owner</strong><span>Business workspace</span></div><button className="icon-button" title="Sign out" onClick={() => { localStorage.removeItem('ledgerly-token'); setToken('') }}><LogOut size={17} /></button></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="mobile-brand"><span className="brand-symbol">L</span><strong>ledgerly</strong></div><div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{screen === 'home' ? 'Overview' : activeList}</strong></div><div className="top-actions"><span className="saved-indicator"><span /> Excel synced</span><button className="avatar-button" title="Sign out" onClick={() => { localStorage.removeItem('ledgerly-token'); setToken('') }}>S</button></div></header>

        {screen === 'home' ? <section className="page-content page-enter">
          <div className="welcome-row"><div><p className="eyebrow">WEDNESDAY, SEPTEMBER 30</p><h1>Good business<br className="mobile-break" /> starts here<span className="title-period">.</span></h1><p className="subheading">A clear view of the work that keeps you moving.</p></div><div className="welcome-actions"><label className="secondary-button upload-button"><Upload size={17} /> {uploading ? 'Importing...' : 'Upload Excel'}<input className="upload-input" type="file" accept=".xlsx" onChange={importWorkbook} disabled={uploading} /></label><button className="secondary-button" onClick={exportWorkbook}><Download size={17} /> Download Excel</button><button className="secondary-button" onClick={syncGoogleSheets} disabled={googleSyncing}>{googleSyncing ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Sync Google Sheets</button><button className="primary-button create-button" onClick={() => setModal('create')}><Plus size={19} /> Create new list</button></div></div>
          <div className={`overview-strip ${activeWidgets.length === 1 ? 'overview-single' : ''}`}>{activeWidgets.map((widget) => { const Icon = widget.Icon; return <div className="overview-stat" key={widget.id}><span className={`stat-icon ${widget.tone}`}><Icon size={18} /></span><div><span>{widget.label}</span><strong>{widget.value}</strong></div></div> })}<div className="strip-aside"><Sparkles size={16} /><span>Everything in its place.</span></div></div>
          <div className="section-heading"><div><p className="eyebrow">YOUR BUSINESS</p><h2>Lists & records</h2></div><div className="dashboard-tools"><button className="secondary-button" onClick={() => setModal('widgets')}><SlidersHorizontal size={16} /> Dashboard widgets</button><span className="list-count-label">{lists.length} LISTS</span></div></div>
          <div className="dashboard-grid">{lists.map((list, index) => {
            const Icon = icons[index % icons.length]
            const sums = Object.entries(list.sums || {})
            return <button key={list.name} className="list-card" onClick={() => { setLinkedRecordId(''); setActiveList(list.name); setScreen('list') }}><div className="card-top"><span className={`card-icon card-icon-${index % 4}`}><Icon size={19} /></span><ArrowUpRight size={18} className="card-arrow" /></div><h3>{list.name}</h3><p className="card-records">{list.count} {list.count === 1 ? 'record' : 'records'}</p><div className="card-rule" /><div className="card-totals">{sums.length ? sums.slice(0, 2).map(([name, amount]) => <div key={name}><span>{name}</span><strong>₹{money.format(Number(amount) || 0)}</strong></div>) : <div><span>LAST UPDATED</span><strong>Just now</strong></div>}</div></button>
          })}<button className="new-list-tile" onClick={() => setModal('create')}><span className="new-list-plus"><Plus size={20} /></span><strong>Start a new list</strong><span>Set up a tracker for your business</span><ArrowUpRight size={17} className="new-list-arrow" /></button></div>
          <footer className="page-footer"><span>LEDGERLY BUSINESS MANAGER</span><span>YOUR DATA LIVES IN BUSINESS.XLSX</span></footer>
        </section> : <section className="page-content list-page page-enter">
          <button className="back-link" onClick={() => { setLinkedRecordId(''); setScreen('home') }}><ChevronLeft size={16} /> All lists</button>
          <div className="list-title-row"><div><p className="eyebrow">BUSINESS LIST</p><h1>{activeList}<span className="title-period">.</span></h1><p className="subheading">Every detail, right where you need it.</p></div><div className="list-actions"><button className="secondary-button" onClick={() => setModal('fields')}><Settings2 size={17} /> <span>Manage fields</span></button><button className="primary-button" onClick={() => setModal('add')}><Plus size={19} /> Add record</button></div></div>
          <div className="summary-bar"><div className="summary-count"><span>SHOWING</span><strong>{visibleRows.length}<small> / {data?.count ?? 0}</small></strong></div>{Object.entries(data?.sums || {}).map(([name, value]) => <div className="summary-total" key={name}><span>TOTAL {name.toUpperCase()}</span><strong>₹{money.format(Number(value) || 0)}</strong></div>)}<div className="summary-end"><span className="tiny-green-dot" /> UP TO DATE</div></div>
          <div className="toolbar"><label className="search-box"><Search size={17} /><input value={search} onChange={(event) => { setLinkedRecordId(''); setSearch(event.target.value) }} placeholder={`Search ${activeList.toLowerCase()}...`} /></label><div className="toolbar-right"><label className="filter-select"><Filter size={15} /><select aria-label="Filter field" value={filterField} onChange={(event) => { setLinkedRecordId(''); setFilterField(event.target.value); setFilterValue('') }}><option value="">Filter field</option>{fields.map((field) => <option key={field.name} value={field.name}>{field.name}</option>)}</select><select aria-label="Filter value" value={filterValue} onChange={(event) => { setLinkedRecordId(''); setFilterValue(event.target.value) }} disabled={!filterField}><option value="">All values</option>{filterValues.map((value) => { const option = fields.find((field) => field.name === filterField)?.options?.find((item) => item.id === value); return <option key={value} value={value}>{option?.label || value}</option> })}</select></label><label className="filter-select sort-select"><select aria-label="Sort field" value={sortField} onChange={(event) => { setLinkedRecordId(''); setSortField(event.target.value) }}><option value="">Sort by</option>{fields.map((field) => <option key={field.name} value={field.name}>{field.name}</option>)}</select></label><button className="square-button" title={sortAscending ? 'Ascending order' : 'Descending order'} aria-label={sortAscending ? 'Ascending order' : 'Descending order'} onClick={() => setSortAscending((value) => !value)}>{sortAscending ? <ArrowUpAZ size={17} /> : <ArrowDownAZ size={17} />}</button><button className="square-button" title="Manage fields and styles" onClick={() => setModal('fields')}><SlidersHorizontal size={17} /></button></div></div>
          <div className="bulk-toolbar"><label className="select-visible"><input type="checkbox" checked={allVisibleSelected} disabled={!visibleRowIndices.length} onChange={(event) => visibleRowIndices.forEach((index) => toggleRowSelection(index, event.target.checked))} /><span>Select visible</span></label><span className="selection-count">{selectedRows.size} selected</span><button className="secondary-button" onClick={() => setModal('bulk-paste')}><ClipboardPaste size={16} /> Paste from Excel</button></div>
          {visibleRows.length ? <div className="record-list">{visibleRows.map((row, index) => {
            const leadField = fields.find((field) => ['text', 'dropdown'].includes(field.type)) || fields[0]
            const lead = row[leadField?.name]
            const detailFields = fields.filter((field) => field.name !== leadField?.name && field.type === 'link').concat(fields.filter((field) => field.name !== leadField?.name && field.type !== 'formula' && field.type !== 'link')).slice(0, 3)
            const formulas = fields.filter((field) => field.type === 'formula')
            const rowIndex = data?.rows.indexOf(row) ?? index
            return <article className="record-card" key={`${row._id}-${String(lead)}`}><label className="row-select"><input type="checkbox" aria-label={`Select ${lead || 'record'}`} checked={selectedRows.has(rowIndex)} onChange={(event) => toggleRowSelection(rowIndex, event.target.checked)} /></label><div className="record-avatar" style={{ background: palette[index % palette.length] }}>{String(lead || '?').trim().charAt(0).toUpperCase()}</div><div className="record-main"><div className="record-name-row"><h3>{lead || 'Untitled record'}</h3><span className="record-date">{row.Date || row['Due Date'] || `#${String(rowIndex + 1).padStart(3, '0')}`}</span></div><div className="record-details">{detailFields.map((field) => <span key={field.name}><small>{field.name}</small>{field.type === 'link' ? <button className="record-link" onClick={() => openLinkedRecord(field, row[field.name])}>{formatValue(row[field.name], field)} <Link2 size={12} /></button> : formatValue(row[field.name], field)}</span>)}</div></div><div className="record-end">{formulas.map((field) => <div className="formula-value" key={field.name}><span>{field.name}</span><strong>{formatValue(row[field.name], field)}</strong></div>)}{row.Status && <span className={`status-pill status-${String(row.Status).toLowerCase().replaceAll(' ', '-')}`}><span />{row.Status}</span>}<div className="row-actions">{activeList === 'Payment Record' && <button className="row-edit-button" title="Create PDF receipt" aria-label={`Create receipt for ${lead || 'record'}`} onClick={() => exportReceipt(row)}><FileText size={15} /></button>}<button className="row-edit-button" title="Attachments" aria-label={`Attachments for ${lead || 'record'}`} onClick={() => { setAttachmentRecord({ id: row._id, label: lead || 'record' }); setModal('attachments') }}><Paperclip size={15} /></button><button className="row-edit-button" title="Edit record" aria-label={`Edit ${lead || 'record'}`} onClick={() => { setEditingRecord({ index: rowIndex, row }); setModal('edit') }}><Pencil size={15} /></button><button className="row-edit-button danger-action" title="Delete record" aria-label={`Delete ${lead || 'record'}`} onClick={() => deleteRow(rowIndex)}><Trash2 size={15} /></button></div></div></article>
          })}</div> : <div className="empty-state"><span className="empty-icon"><Search size={21} /></span><h3>{search || (filterField && filterValue) ? 'No matching records' : 'A fresh page'}</h3><p>{search || (filterField && filterValue) ? 'Try another search or clear your filters.' : 'Add your first record to get this list moving.'}</p>{!search && !filterValue && <button className="primary-button" onClick={() => setModal('add')}><Plus size={18} /> Add first record</button>}</div>}
          <footer className="page-footer"><span>{visibleRows.length} RECORD{visibleRows.length === 1 ? '' : 'S'} IN VIEW</span><span>CHANGES SAVE TO BUSINESS.XLSX</span></footer>
        </section>}
      </main>

      <nav className="mobile-nav"><button className={screen === 'home' ? 'mobile-nav-active' : ''} onClick={() => setScreen('home')}><LayoutDashboard size={19} /><span>Overview</span></button><button className={screen === 'list' ? 'mobile-nav-active' : ''} onClick={() => { if (activeList) setScreen('list'); else setModal('create') }}><ClipboardList size={19} /><span>Lists</span></button><button className="mobile-add" aria-label="Add record" onClick={() => screen === 'list' ? setModal('add') : setModal('create')}><Plus size={22} /></button><button onClick={() => setModal('create')}><FilePlus2 size={19} /><span>New list</span></button><button onClick={() => setModal('fields')}><Settings2 size={19} /><span>Fields</span></button></nav>

      {modal === 'add' && <Modal title={`Add to ${activeList}`} onClose={() => setModal('')}><RecordForm fields={fields} onSubmit={addRow} onCancel={() => setModal('')} /></Modal>}
      {modal === 'edit' && editingRecord && <Modal title="Edit record" onClose={() => { setModal(''); setEditingRecord(null) }}><RecordForm key={`${activeList}-${editingRecord.index}`} fields={fields} initialValues={editingRecord.row} onSubmit={(values) => editRow(editingRecord.index, values)} onPreview={(values) => previewRow(editingRecord.index, values)} onCancel={() => { setModal(''); setEditingRecord(null) }} editing /></Modal>}
      {modal === 'attachments' && attachmentRecord && <Modal title={`Files for ${attachmentRecord.label}`} onClose={() => { setModal(''); setAttachmentRecord(null) }}><AttachmentManager sheetName={activeList} recordId={attachmentRecord.id} token={token} /></Modal>}
      {modal === 'widgets' && <Modal title="Dashboard widgets" onClose={() => setModal('')}><WidgetSettings widgets={dashboardStats} visibleWidgets={visibleWidgets} onChange={setVisibleWidgets} /></Modal>}
      {modal === 'bulk-paste' && <Modal title="Paste from Excel" wide onClose={() => setModal('')}><BulkPasteForm fields={fields} selectedCount={selectedRows.size} onSubmit={applyBulkPaste} onCancel={() => setModal('')} /></Modal>}
      {modal === 'upload-preview' && pendingUpload && <Modal title="Preview Excel import" wide onClose={() => { setModal(''); setPendingUpload(null) }}><div className="upload-preview"><p className="modal-intro"><strong>{pendingUpload.file.name}</strong> will replace the current workbook after you confirm. Choose worksheets and adjust column names first.</p>{pendingUpload.preview.worksheets.map((worksheet) => {
        const selectedSheet = pendingUpload.selectedSheets.includes(worksheet.name)
        const mapping = pendingUpload.mapping[worksheet.name] || {}
        return <section className={`preview-sheet ${selectedSheet ? '' : 'preview-sheet-disabled'}`} key={worksheet.name}><div className="preview-sheet-heading"><label className="sheet-choice"><input type="checkbox" checked={selectedSheet} onChange={(event) => setPendingUpload((current) => ({ ...current, selectedSheets: event.target.checked ? [...current.selectedSheets, worksheet.name] : current.selectedSheets.filter((name) => name !== worksheet.name) }))} /><h3>{worksheet.name}</h3></label><span>{worksheet.count} records · {worksheet.fields.length} fields</span></div><div className="column-mapping-list">{worksheet.fields.map((field) => <label className="column-mapping" key={field.name}><span>{field.name}</span><input className="text-input" value={mapping[field.name] ?? field.name} disabled={!selectedSheet} aria-label={`Imported name for ${field.name}`} onChange={(event) => setPendingUpload((current) => ({ ...current, mapping: { ...current.mapping, [worksheet.name]: { ...(current.mapping[worksheet.name] || {}), [field.name]: event.target.value } } }))} /></label>)}</div><div className="preview-table-wrap"><table className="preview-table"><thead><tr>{worksheet.fields.map((field) => <th key={field.name}>{mapping[field.name] ?? field.name}<small>{field.type}</small></th>)}</tr></thead><tbody>{worksheet.rows.map((row, rowIndex) => <tr key={rowIndex}>{worksheet.fields.map((field) => <td key={field.name}>{row[field.name] == null ? '—' : String(row[field.name])}</td>)}</tr>)}</tbody></table></div>{worksheet.count > worksheet.rows.length && <p className="preview-note">Showing {worksheet.rows.length} of {worksheet.count} records.</p>}</section>
      })}<div className="modal-actions"><button className="secondary-button" onClick={() => { setModal(''); setPendingUpload(null) }}>Cancel</button><button className="primary-button" disabled={uploading || pendingUpload.selectedSheets.length === 0} onClick={confirmWorkbookImport}>{uploading && <LoaderCircle size={17} className="animate-spin" />} Import selected sheets <ArrowUpRight size={16} /></button></div></div></Modal>}
      {modal === 'create' && <Modal title="Create a new list" onClose={() => setModal('')}><CreateListForm onSubmit={createList} onCancel={() => setModal('')} /></Modal>}
      {modal === 'fields' && <Modal title="Manage fields" wide onClose={() => setModal('')}><FieldManager key={`${activeList}-${fields.length}`} fields={fields} lists={lists} onAdd={addField} onUpdate={updateField} onDelete={removeField} onSaveStyles={saveStyles} onCancel={() => setModal('')} /></Modal>}
      {toast && <div className="toast"><span><Check size={15} /></span>{toast.message || toast}{typeof toast === 'object' && toast.undo && <button className="toast-undo" onClick={undoDelete}>Undo</button>}{typeof toast === 'object' && toast.link && <a className="toast-undo" href={toast.link} target="_blank" rel="noreferrer">Open sheet</a>}</div>}
    </div>
  )
}

function parsePastedRows(text, fields, includeHeaders) {
  const lines = text.replaceAll('\r', '').split('\n').filter((line) => line.trim() !== '')
  if (!lines.length) return { fields: [], rows: [], error: '' }

  const editableFields = fields
  let columns
  if (includeHeaders) {
    const headers = lines.shift().split('\t').map((header) => header.trim())
    const fieldMap = new Map(fields.map((field) => [field.name.toLocaleLowerCase(), field]))
    columns = headers.map((header) => fieldMap.get(header.toLocaleLowerCase()))
    if (headers.some((header) => !header) || columns.some((field) => !field)) {
      return { fields: [], rows: [], error: 'Header names must match fields in this list.' }
    }
    if (new Set(headers.map((header) => header.toLocaleLowerCase())).size !== headers.length) {
      return { fields: [], rows: [], error: 'The pasted range contains duplicate headers.' }
    }
  } else {
    const columnCount = lines[0].split('\t').length
    if (columnCount > editableFields.length) {
      return { fields: [], rows: [], error: `This list has ${editableFields.length} fields; the paste has ${columnCount} columns. Include headers to map a subset.` }
    }
    columns = editableFields.slice(0, columnCount)
  }
  if (lines.some((line) => line.split('\t').length > columns.length)) {
    return { fields: [], rows: [], error: 'Every pasted row must fit the selected columns.' }
  }

  const previewFields = columns.filter((field) => field.type !== 'formula')
  const rows = lines.map((line) => {
    const cells = line.split('\t')
    return Object.fromEntries(columns.flatMap((field, index) => (
      field.type === 'formula' ? [] : [[field.name, cells[index] ?? '']]
    )))
  })
  return { fields: previewFields, rows, error: '' }
}

function BulkPasteForm({ fields, selectedCount, onSubmit, onCancel }) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState('append')
  const [includeHeaders, setIncludeHeaders] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => parsePastedRows(text, fields, includeHeaders), [text, fields, includeHeaders])
  const rowCountMismatch = mode === 'update' && parsed.rows.length > 0 && parsed.rows.length !== selectedCount
  const canApply = parsed.rows.length > 0 && !parsed.error && !rowCountMismatch && !busy

  async function apply() {
    if (!canApply) return
    setBusy(true); setError('')
    try { await onSubmit(mode, parsed.rows) } catch (problem) { setError(problem.message) } finally { setBusy(false) }
  }

  return <div className="bulk-paste-form">
    <p className="modal-intro">Paste a tab-separated range copied from Excel. Update mode matches pasted rows to selected records in workbook order.</p>
    <div className="bulk-paste-options">
      <div className="bulk-mode" role="group" aria-label="Paste operation">
        <button type="button" className={mode === 'append' ? 'bulk-mode-active' : ''} aria-pressed={mode === 'append'} onClick={() => setMode('append')}>Add rows</button>
        <button type="button" className={mode === 'update' ? 'bulk-mode-active' : ''} aria-pressed={mode === 'update'} disabled={!selectedCount} onClick={() => setMode('update')}>Update selected ({selectedCount})</button>
      </div>
      <label className="paste-header-toggle"><input type="checkbox" checked={includeHeaders} onChange={(event) => setIncludeHeaders(event.target.checked)} /><span>First pasted row contains field names</span></label>
    </div>
    <textarea className="paste-area" value={text} onChange={(event) => { setText(event.target.value); setError('') }} placeholder="Paste spreadsheet cells here" aria-label="Paste spreadsheet cells" spellCheck="false" />
    {parsed.error && <p className="error-copy">{parsed.error}</p>}
    {rowCountMismatch && <p className="error-copy">Paste exactly {selectedCount} data rows to update the selected records; this paste has {parsed.rows.length}.</p>}
    {parsed.rows.length > 0 && parsed.fields.length > 0 && <section className="paste-preview"><div className="preview-sheet-heading"><h3>Preview</h3><span>{parsed.rows.length} rows</span></div><div className="preview-table-wrap"><table className="preview-table"><thead><tr>{parsed.fields.map((field) => <th key={field.name}>{field.name}<small>{field.type}</small></th>)}</tr></thead><tbody>{parsed.rows.slice(0, 8).map((row, rowIndex) => <tr key={rowIndex}>{parsed.fields.map((field) => <td key={field.name}>{row[field.name] || '—'}</td>)}</tr>)}</tbody></table></div>{parsed.rows.length > 8 && <p className="preview-note">Showing 8 of {parsed.rows.length} rows.</p>}</section>}
    {error && <p className="error-copy">{error}</p>}
    <div className="modal-actions"><button className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={!canApply} onClick={apply}>{busy && <LoaderCircle size={17} className="animate-spin" />}{mode === 'append' ? `Add ${parsed.rows.length || ''} rows` : `Update ${selectedCount} records`} <ArrowUpRight size={16} /></button></div>
  </div>
}

function AttachmentManager({ sheetName, recordId, token }) {
  const [attachments, setAttachments] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)

  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url) }, [preview])

  useEffect(() => {
    let current = true
    api(`/${encodeURIComponent(sheetName)}/rows/${encodeURIComponent(recordId)}/attachments`, token)
      .then((result) => { if (current) setAttachments(result) })
      .catch((problem) => { if (current) setError(problem.message) })
    return () => { current = false }
  }, [sheetName, recordId, token])

  async function addFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true); setError('')
    try {
      const attachment = await uploadAttachment(sheetName, recordId, file, token)
      setAttachments((current) => [...current, attachment])
    }
    catch (problem) { setError(problem.message) }
    finally { setBusy(false) }
  }

  async function downloadFile(attachment) {
    try {
      const blob = await downloadAttachment(sheetName, recordId, attachment.id, token)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url; link.download = attachment.name; document.body.appendChild(link); link.click(); link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (problem) { setError(problem.message) }
  }

  async function previewFile(attachment) {
    try {
      const blob = await downloadAttachment(sheetName, recordId, attachment.id, token)
      setPreview({ url: URL.createObjectURL(blob), type: attachment.content_type || blob.type, name: attachment.name })
    } catch (problem) { setError(problem.message) }
  }

  async function removeFile(attachment) {
    if (!window.confirm(`Delete ${attachment.name}?`)) return
    setBusy(true); setError('')
    try {
      await api(`/${encodeURIComponent(sheetName)}/rows/${encodeURIComponent(recordId)}/attachments/${encodeURIComponent(attachment.id)}`, token, { method: 'DELETE' })
      setAttachments((current) => current.filter((item) => item.id !== attachment.id))
    } catch (problem) { setError(problem.message) }
    finally { setBusy(false) }
  }

  return <div className="attachment-manager">
    <label className="secondary-button attachment-upload"><Paperclip size={16} /> {busy ? 'Working...' : 'Attach file'}<input type="file" onChange={addFile} disabled={busy} /></label>
    <p className="modal-intro">Files up to 10 MB are supported.</p>
    {attachments.length ? <div className="attachment-list">{attachments.map((attachment) => <div className="attachment-item" key={attachment.id}>
      <div className="attachment-file"><strong>{attachment.name}</strong><span>{(attachment.size / 1024).toFixed(0)} KB</span></div>
      {/^(image\/|application\/pdf)/i.test(attachment.content_type) && <button className="row-edit-button" title="Preview file" aria-label={`Preview ${attachment.name}`} onClick={() => previewFile(attachment)}><Eye size={15} /></button>}
      <button className="row-edit-button" title="Download file" aria-label={`Download ${attachment.name}`} onClick={() => downloadFile(attachment)}><Download size={15} /></button>
      <button className="row-edit-button danger-action" title="Delete file" aria-label={`Delete ${attachment.name}`} disabled={busy} onClick={() => removeFile(attachment)}><Trash2 size={15} /></button>
    </div>)}</div> : <p className="attachment-empty">No files attached yet.</p>}
    {preview && <section className="attachment-preview"><div className="attachment-preview-heading"><strong>{preview.name}</strong><button className="icon-button" aria-label="Close preview" onClick={() => setPreview(null)}><X size={16} /></button></div>{preview.type.startsWith('image/') ? <img src={preview.url} alt={preview.name} /> : <iframe title={preview.name} src={preview.url} />}</section>}
    {error && <p className="error-copy">{error}</p>}
  </div>
}

function WidgetSettings({ widgets, visibleWidgets, onChange }) {
  function toggle(widgetId, enabled) {
    onChange((current) => enabled ? [...new Set([...current, widgetId])] : current.filter((id) => id !== widgetId))
  }
  return <div className="widget-settings"><p className="modal-intro">Choose which totals appear on the dashboard.</p><div className="widget-options">{widgets.map((widget) => <label className="widget-option" key={widget.id}><input type="checkbox" checked={visibleWidgets.includes(widget.id)} onChange={(event) => toggle(widget.id, event.target.checked)} /><span>{widget.label}</span><strong>{widget.value}</strong></label>)}</div></div>
}

function parseOcrText(text, fields) {
  const aliases = {
    Customer: ['Client', 'Bill To'], Company: ['Business'], Name: ['Customer', 'Client'],
    Bill: ['Total', 'Amount', 'Invoice Total'], Paid: ['Received', 'Payment'], Balance: ['Due', 'Balance Due'],
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const values = {}
  for (const field of fields) {
    if (field.type === 'formula') continue
    const labels = [field.name, ...(aliases[field.name] || [])]
    const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
    const direct = lines.map((line) => line.match(new RegExp(`^\\s*(?:${labelPattern})\\s*[:#-]\\s*(.+)$`, 'i'))).find(Boolean)
    let value = direct?.[1]?.trim()
    if (!value && field.type === 'date' || (!value && /date/i.test(field.name))) {
      const match = text.match(/\b(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/)
      if (match) {
        const parts = match[1].split(/[/-]/)
        value = parts[0].length === 4 ? `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}` : `${parts[2].length === 2 ? `20${parts[2]}` : parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
      }
    }
    if (!value && field.type === 'dropdown') value = field.options?.find((option) => text.toLowerCase().includes(option.toLowerCase()))
    if (!value && field.type === 'link') value = field.options?.find((option) => text.toLowerCase().includes(option.label.toLowerCase()))?.id
    if (value && field.type === 'number') value = value.replace(/[^\d.-]/g, '')
    if (value) values[field.name] = value
  }
  return values
}

function RecordForm({ fields, onSubmit, onCancel, initialValues = {}, onPreview, editing = false }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.filter((field) => field.type !== 'formula').map((field) => [field.name, initialValues[field.name] ?? ''])))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [ocrText, setOcrText] = useState('')
  const editable = fields.filter((field) => field.type !== 'formula')
  const formulas = fields.filter((field) => field.type === 'formula')
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { await onSubmit(values) } catch (problem) { setError(problem.message) } finally { setBusy(false) }
  }
  async function previewChanges() {
    setBusy(true); setError('')
    try { setPreview(await onPreview(values)) } catch (problem) { setError(problem.message) } finally { setBusy(false) }
  }
  function changeValue(name, value) { setValues((current) => ({ ...current, [name]: value })); setPreview(null) }
  async function scanImage(event) {
    const image = event.target.files?.[0]
    event.target.value = ''
    if (!image) return
    setScanning(true); setError('')
    let worker
    try {
      const { createWorker } = await import('tesseract.js')
      worker = await createWorker('eng')
      const result = await worker.recognize(image)
      setOcrText(result.data.text)
      setValues((current) => ({ ...current, ...parseOcrText(result.data.text, editable) }))
      setPreview(null)
    } catch (problem) { setError(problem.message || 'Could not read text from this image.') }
    finally { if (worker) await worker.terminate(); setScanning(false) }
  }
  return <form className="modal-form" onSubmit={submit}><label className="secondary-button scan-button"><ScanLine size={16} /> {scanning ? 'Scanning...' : 'Scan with camera'}<input type="file" accept="image/*" capture="environment" onChange={scanImage} disabled={scanning} /></label><div className="form-grid">{editable.map((field) => <label className="form-field" key={field.name}><span>{field.name}</span>{['dropdown', 'link'].includes(field.type) ? <select className="text-input" value={values[field.name] || ''} onChange={(event) => changeValue(field.name, event.target.value)}><option value="">{field.type === 'link' ? 'Choose a linked record' : 'Choose an option'}</option>{field.type === 'link' ? (field.options || []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>) : (field.options || []).map((option) => <option key={option}>{option}</option>)}</select> : <input className="text-input" type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} step={field.type === 'number' ? 'any' : undefined} value={values[field.name] || ''} onChange={(event) => changeValue(field.name, event.target.value)} placeholder={`Enter ${field.name.toLowerCase()}`} />}</label>)}{formulas.map((field) => <label className="form-field" key={field.name}><span>{field.name} <i>Calculated</i></span><input className="text-input formula-readonly" value={initialValues[field.name] ?? ''} placeholder="Calculated when saved" readOnly aria-readonly="true" /></label>)}</div>{ocrText && <details className="ocr-result"><summary>Recognized text</summary><pre>{ocrText}</pre></details>}{preview && <section className="record-preview"><h3>Preview changes</h3><dl>{fields.map((field) => <div key={field.name}><dt>{field.name}</dt><dd>{formatValue(preview[field.name], field)}</dd></div>)}</dl></section>}{error && <p className="error-copy">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>{editing && <button type="button" className="secondary-button" disabled={busy} onClick={previewChanges}>{busy && <LoaderCircle size={17} className="animate-spin" />} Preview</button>}<button className="primary-button" disabled={busy || scanning}>{busy && !preview ? <LoaderCircle size={17} className="animate-spin" /> : null} {editing ? 'Save changes' : 'Save record'} <ArrowUpRight size={16} /></button></div></form>
}

function CreateListForm({ onSubmit, onCancel }) {
  const [name, setName] = useState('')
  const [fieldName, setFieldName] = useState('Name')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { await onSubmit(name.trim(), [{ name: fieldName.trim() || 'Name', type: 'text' }]) } catch (problem) { setError(problem.message) } finally { setBusy(false) }
  }
  return <form className="modal-form" onSubmit={submit}><p className="modal-intro">Give this tracker a name. You can add more fields any time.</p><label className="form-field"><span>List name</span><input className="text-input" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Supplier orders" required /></label><label className="form-field"><span>First field</span><input className="text-input" value={fieldName} onChange={(event) => setFieldName(event.target.value)} placeholder="e.g. Supplier" /></label>{error && <p className="error-copy">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy}>{busy && <LoaderCircle size={17} className="animate-spin" />} Create list <ArrowUpRight size={16} /></button></div></form>
}

function FieldManager({ fields, lists, onAdd, onUpdate, onDelete, onSaveStyles, onCancel }) {
  const [names, setNames] = useState(() => Object.fromEntries(fields.map((field) => [field.name, field.name])))
  const [styles, setStyles] = useState({})
  const firstTarget = lists[0]
  const firstTargetField = firstTarget?.fields.find((field) => field.type !== 'formula')
  const [newField, setNewField] = useState({ name: '', type: 'text', formula: '', options: '', target_sheet: firstTarget?.name || '', target_field: firstTargetField?.name || '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  function updateStyle(name, key, value) { setStyles((current) => ({ ...current, [name]: { ...current[name], [key]: value } })) }
  async function submitNew(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { await onAdd({ name: newField.name, type: newField.type, ...(newField.type === 'formula' ? { formula: newField.formula } : {}), ...(newField.type === 'dropdown' ? { options: newField.options.split(',').map((item) => item.trim()).filter(Boolean) } : {}), ...(newField.type === 'link' ? { target_sheet: newField.target_sheet, target_field: newField.target_field } : {}) }); setNewField({ name: '', type: 'text', formula: '', options: '', target_sheet: firstTarget?.name || '', target_field: firstTargetField?.name || '' }) } catch (problem) { setError(problem.message) } finally { setBusy(false) }
  }
  async function saveAll() {
    setBusy(true); setError('')
    try {
      for (const field of fields) if (names[field.name] && names[field.name] !== field.name) await onUpdate(field.name, { name: names[field.name] })
      const renamedStyles = Object.fromEntries(Object.entries(styles).map(([name, style]) => [names[name] || name, style]))
      await onSaveStyles(renamedStyles)
    } catch (problem) { setError(problem.message) } finally { setBusy(false) }
  }
  async function deleteOne(name) {
    if (!window.confirm(`Delete the “${name}” field and its values?`)) return
    try { await onDelete(name) } catch (problem) { setError(problem.message) }
  }
  return <div className="field-manager"><p className="modal-intro">Rename or remove fields, then tune how each column appears in the Excel file.</p><div className="field-list">{fields.map((field) => {
    const style = styles[field.name] || {}
    return <div className="manage-field" key={field.name}><div className="manage-field-top"><label className="form-field"><span>FIELD NAME <i>{field.type}</i></span><input className="text-input" value={names[field.name] ?? field.name} onChange={(event) => setNames({ ...names, [field.name]: event.target.value })} /></label><button className="icon-button danger-icon" aria-label={`Delete ${field.name}`} onClick={() => deleteOne(field.name)}><X size={17} /></button></div><div className="style-controls"><button type="button" className={`format-button ${style.bold ? 'format-on' : ''}`} title="Bold" onClick={() => updateStyle(field.name, 'bold', !style.bold)}><strong>B</strong></button><button type="button" className={`format-button italic-format ${style.italic ? 'format-on' : ''}`} title="Italic" onClick={() => updateStyle(field.name, 'italic', !style.italic)}>I</button><button type="button" className={`format-button under-format ${style.underline ? 'format-on' : ''}`} title="Underline" onClick={() => updateStyle(field.name, 'underline', !style.underline)}>U</button><label className="style-size" title="Font size"><span>Size</span><input type="number" min="8" max="32" value={style.fontSize || 11} onChange={(event) => updateStyle(field.name, 'fontSize', Number(event.target.value))} /></label><label className="color-picker" title="Text color"><span>A</span><input type="color" value={style.color || '#17231e'} onChange={(event) => updateStyle(field.name, 'color', event.target.value)} /></label><label className="color-picker fill-picker" title="Background color"><span>Fill</span><input type="color" value={style.background || '#ffffff'} onChange={(event) => updateStyle(field.name, 'background', event.target.value)} /></label><label className="border-toggle"><input type="checkbox" checked={!!style.border} onChange={(event) => updateStyle(field.name, 'border', event.target.checked)} /><span>Border</span></label></div></div>
  })}</div><form className="add-field-form" onSubmit={submitNew}><div className="add-field-heading"><Plus size={16} /><strong>Add a field</strong></div><div className="add-field-row"><input className="text-input" value={newField.name} onChange={(event) => setNewField({ ...newField, name: event.target.value })} placeholder="Field name" required /><select className="text-input" value={newField.type} onChange={(event) => setNewField({ ...newField, type: event.target.value })}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="dropdown">Dropdown</option><option value="formula">Formula</option><option value="link">Linked record</option></select></div>{newField.type === 'dropdown' && <input className="text-input" value={newField.options} onChange={(event) => setNewField({ ...newField, options: event.target.value })} placeholder="Options, separated by commas" />}{newField.type === 'link' && <div className="link-field-options"><label className="form-field"><span>Target list</span><select className="text-input" value={newField.target_sheet} onChange={(event) => { const target = lists.find((list) => list.name === event.target.value); const targetField = target?.fields.find((field) => field.type !== 'formula' && field.type !== 'link'); setNewField({ ...newField, target_sheet: event.target.value, target_field: targetField?.name || '' }) }} required><option value="">Choose a list</option>{lists.map((list) => <option key={list.name} value={list.name}>{list.name}</option>)}</select></label><label className="form-field"><span>Display field</span><select className="text-input" value={newField.target_field} onChange={(event) => setNewField({ ...newField, target_field: event.target.value })} required><option value="">Choose a field</option>{(lists.find((list) => list.name === newField.target_sheet)?.fields || []).filter((field) => field.type !== 'formula' && field.type !== 'link').map((field) => <option key={field.name} value={field.name}>{field.name}</option>)}</select></label></div>}{newField.type === 'formula' && <label className="form-field formula-editor"><span>EXPRESSION <small>e.g. Bill - Paid, SUM(Amount), IF(Paid &gt; 0, 1, 0)</small></span><input className="text-input" value={newField.formula} onChange={(event) => setNewField({ ...newField, formula: event.target.value })} placeholder="Bill - Paid" required /></label>}<button className="add-field-submit" disabled={busy}><Plus size={15} /> Add field</button></form>{error && <p className="error-copy">{error}</p>}<div className="modal-actions"><button className="secondary-button" onClick={onCancel}>Close</button><button className="primary-button" disabled={busy} onClick={saveAll}>{busy && <LoaderCircle size={17} className="animate-spin" />} Save changes <Check size={16} /></button></div></div>
}

export default App