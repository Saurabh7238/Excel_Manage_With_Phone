import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, BadgeIndianRupee, BriefcaseBusiness, CalendarDays,
  Check, ChevronDown, ChevronLeft, CircleHelp, ClipboardList, Clock3, Download,
  FilePlus2, Filter, LayoutDashboard, LoaderCircle, LogOut, Menu, Plus, Search,
  Settings2, SlidersHorizontal, Sparkles, UsersRound, X,
} from 'lucide-react'
import { api } from './api'

const money = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const palette = ['#dff4a7', '#e7efec', '#ffe3d8', '#e4e8ff']
const icons = [UsersRound, BadgeIndianRupee, BriefcaseBusiness, Clock3]

function formatValue(value, field) {
  if (value === null || value === undefined || value === '') return '—'
  if (field?.type === 'number') return `₹${money.format(Number(value) || 0)}`
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
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('')
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

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 2600)
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
    let rows = data?.rows || []
    if (filter) rows = rows.filter((row) => String(row.Status || '') === filter)
    if (search.trim()) {
      const needle = search.trim().toLowerCase()
      rows = rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(needle)))
    }
    return rows
  }, [data, filter, search])
  const statusOptions = [...new Set((data?.rows || []).map((row) => row.Status).filter(Boolean))]
  const dashboardTotal = lists.reduce((total, list) => total + Object.values(list.sums || {}).reduce((sum, value) => sum + Number(value || 0), 0), 0)

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
          return <button key={list.name} className={`nav-item ${screen === 'list' && activeList === list.name ? 'nav-active' : ''}`} onClick={() => { setActiveList(list.name); setScreen('list') }}><span className={`side-icon side-icon-${index % 4}`}><Icon size={16} /></span><span className="truncate">{list.name}</span><span className="side-count">{list.count}</span></button>
        })}</div>
        <div className="sidebar-bottom"><div className="profile-avatar">S</div><div className="profile-info"><strong>Store owner</strong><span>Business workspace</span></div><button className="icon-button" title="Sign out" onClick={() => { localStorage.removeItem('ledgerly-token'); setToken('') }}><LogOut size={17} /></button></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="mobile-brand"><span className="brand-symbol">L</span><strong>ledgerly</strong></div><div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{screen === 'home' ? 'Overview' : activeList}</strong></div><div className="top-actions"><span className="saved-indicator"><span /> Excel synced</span><button className="avatar-button" title="Sign out" onClick={() => { localStorage.removeItem('ledgerly-token'); setToken('') }}>S</button></div></header>

        {screen === 'home' ? <section className="page-content page-enter">
          <div className="welcome-row"><div><p className="eyebrow">WEDNESDAY, SEPTEMBER 30</p><h1>Good business<br className="mobile-break" /> starts here<span className="title-period">.</span></h1><p className="subheading">A clear view of the work that keeps you moving.</p></div><button className="primary-button create-button" onClick={() => setModal('create')}><Plus size={19} /> Create new list</button></div>
          <div className="overview-strip"><div className="overview-stat"><span className="stat-icon sage"><ClipboardList size={18} /></span><div><span>ACTIVE LISTS</span><strong>{lists.length.toString().padStart(2, '0')}</strong></div></div><div className="strip-divider" /><div className="overview-stat"><span className="stat-icon coral-bg"><ArrowUpRight size={18} /></span><div><span>RECORDS TRACKED</span><strong>{lists.reduce((sum, list) => sum + list.count, 0).toLocaleString('en-IN')}</strong></div></div><div className="strip-divider" /><div className="overview-stat"><span className="stat-icon lilac"><BadgeIndianRupee size={18} /></span><div><span>NUMBER TOTALS</span><strong>₹{money.format(dashboardTotal)}</strong></div></div><div className="strip-aside"><Sparkles size={16} /><span>Everything in its place.</span></div></div>
          <div className="section-heading"><div><p className="eyebrow">YOUR BUSINESS</p><h2>Lists & records</h2></div><span className="list-count-label">{lists.length} LISTS</span></div>
          <div className="dashboard-grid">{lists.map((list, index) => {
            const Icon = icons[index % icons.length]
            const sums = Object.entries(list.sums || {})
            return <button key={list.name} className="list-card" onClick={() => { setActiveList(list.name); setScreen('list') }}><div className="card-top"><span className={`card-icon card-icon-${index % 4}`}><Icon size={19} /></span><ArrowUpRight size={18} className="card-arrow" /></div><h3>{list.name}</h3><p className="card-records">{list.count} {list.count === 1 ? 'record' : 'records'}</p><div className="card-rule" /><div className="card-totals">{sums.length ? sums.slice(0, 2).map(([name, amount]) => <div key={name}><span>{name}</span><strong>₹{money.format(Number(amount) || 0)}</strong></div>) : <div><span>LAST UPDATED</span><strong>Just now</strong></div>}</div></button>
          })}<button className="new-list-tile" onClick={() => setModal('create')}><span className="new-list-plus"><Plus size={20} /></span><strong>Start a new list</strong><span>Set up a tracker for your business</span><ArrowUpRight size={17} className="new-list-arrow" /></button></div>
          <footer className="page-footer"><span>LEDGERLY BUSINESS MANAGER</span><span>YOUR DATA LIVES IN BUSINESS.XLSX</span></footer>
        </section> : <section className="page-content list-page page-enter">
          <button className="back-link" onClick={() => setScreen('home')}><ChevronLeft size={16} /> All lists</button>
          <div className="list-title-row"><div><p className="eyebrow">BUSINESS LIST</p><h1>{activeList}<span className="title-period">.</span></h1><p className="subheading">Every detail, right where you need it.</p></div><div className="list-actions"><button className="secondary-button" onClick={() => setModal('fields')}><Settings2 size={17} /> <span>Manage fields</span></button><button className="primary-button" onClick={() => setModal('add')}><Plus size={19} /> Add record</button></div></div>
          <div className="summary-bar"><div className="summary-count"><span>SHOWING</span><strong>{visibleRows.length}<small> / {data?.count ?? 0}</small></strong></div>{Object.entries(data?.sums || {}).map(([name, value]) => <div className="summary-total" key={name}><span>TOTAL {name.toUpperCase()}</span><strong>₹{money.format(Number(value) || 0)}</strong></div>)}<div className="summary-end"><span className="tiny-green-dot" /> UP TO DATE</div></div>
          <div className="toolbar"><label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${activeList.toLowerCase()}...`} /></label><div className="toolbar-right">{statusOptions.length > 0 && <label className="filter-select"><Filter size={15} /><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">All statuses</option>{statusOptions.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={14} /></label>}<button className="square-button" title="Manage fields and styles" onClick={() => setModal('fields')}><SlidersHorizontal size={17} /></button></div></div>
          {visibleRows.length ? <div className="record-list">{visibleRows.map((row, index) => {
            const leadField = fields.find((field) => ['text', 'dropdown'].includes(field.type)) || fields[0]
            const lead = row[leadField?.name]
            const detailFields = fields.filter((field) => field.name !== leadField?.name && field.type !== 'formula').slice(0, 3)
            const formulas = fields.filter((field) => field.type === 'formula')
            return <article className="record-card" key={`${index}-${String(lead)}`}><div className="record-avatar" style={{ background: palette[index % palette.length] }}>{String(lead || '?').trim().charAt(0).toUpperCase()}</div><div className="record-main"><div className="record-name-row"><h3>{lead || 'Untitled record'}</h3><span className="record-date">{row.Date || row['Due Date'] || `#${String(index + 1).padStart(3, '0')}`}</span></div><div className="record-details">{detailFields.map((field) => <span key={field.name}><small>{field.name}</small>{formatValue(row[field.name], field)}</span>)}</div></div><div className="record-end">{formulas.map((field) => <div className="formula-value" key={field.name}><span>{field.name}</span><strong>{formatValue(row[field.name], field)}</strong></div>)}{row.Status && <span className={`status-pill status-${String(row.Status).toLowerCase().replaceAll(' ', '-')}`}><span />{row.Status}</span>}</div></article>
          })}</div> : <div className="empty-state"><span className="empty-icon"><Search size={21} /></span><h3>{search || filter ? 'No matching records' : 'A fresh page'}</h3><p>{search || filter ? 'Try another search or clear your filters.' : 'Add your first record to get this list moving.'}</p>{!search && !filter && <button className="primary-button" onClick={() => setModal('add')}><Plus size={18} /> Add first record</button>}</div>}
          <footer className="page-footer"><span>{visibleRows.length} RECORD{visibleRows.length === 1 ? '' : 'S'} IN VIEW</span><span>CHANGES SAVE TO BUSINESS.XLSX</span></footer>
        </section>}
      </main>

      <nav className="mobile-nav"><button className={screen === 'home' ? 'mobile-nav-active' : ''} onClick={() => setScreen('home')}><LayoutDashboard size={19} /><span>Overview</span></button><button className={screen === 'list' ? 'mobile-nav-active' : ''} onClick={() => { if (activeList) setScreen('list'); else setModal('create') }}><ClipboardList size={19} /><span>Lists</span></button><button className="mobile-add" aria-label="Add record" onClick={() => screen === 'list' ? setModal('add') : setModal('create')}><Plus size={22} /></button><button onClick={() => setModal('create')}><FilePlus2 size={19} /><span>New list</span></button><button onClick={() => setModal('fields')}><Settings2 size={19} /><span>Fields</span></button></nav>

      {modal === 'add' && <Modal title={`Add to ${activeList}`} onClose={() => setModal('')}><RecordForm fields={fields} onSubmit={addRow} onCancel={() => setModal('')} /></Modal>}
      {modal === 'create' && <Modal title="Create a new list" onClose={() => setModal('')}><CreateListForm onSubmit={createList} onCancel={() => setModal('')} /></Modal>}
      {modal === 'fields' && <Modal title="Manage fields" wide onClose={() => setModal('')}><FieldManager key={`${activeList}-${fields.length}`} fields={fields} onAdd={addField} onUpdate={updateField} onDelete={removeField} onSaveStyles={saveStyles} onCancel={() => setModal('')} /></Modal>}
      {toast && <div className="toast"><span><Check size={15} /></span>{toast}</div>}
    </div>
  )
}

function RecordForm({ fields, onSubmit, onCancel }) {
  const [values, setValues] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const editable = fields.filter((field) => field.type !== 'formula')
  const formulas = fields.filter((field) => field.type === 'formula')
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { await onSubmit(values) } catch (problem) { setError(problem.message) } finally { setBusy(false) }
  }
  return <form className="modal-form" onSubmit={submit}><div className="form-grid">{editable.map((field) => <label className="form-field" key={field.name}><span>{field.name}</span>{field.type === 'dropdown' ? <select className="text-input" value={values[field.name] || ''} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}><option value="">Choose an option</option>{(field.options || []).map((option) => <option key={option}>{option}</option>)}</select> : <input className="text-input" type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} step={field.type === 'number' ? 'any' : undefined} value={values[field.name] || ''} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })} placeholder={`Enter ${field.name.toLowerCase()}`} />}</label>)}{formulas.map((field) => <label className="form-field" key={field.name}><span>{field.name} <i>Calculated</i></span><input className="text-input formula-readonly" value="" placeholder="Calculated when saved" readOnly aria-readonly="true" /></label>)}</div>{error && <p className="error-copy">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy}>{busy && <LoaderCircle size={17} className="animate-spin" />} Save record <ArrowUpRight size={16} /></button></div></form>
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

function FieldManager({ fields, onAdd, onUpdate, onDelete, onSaveStyles, onCancel }) {
  const [names, setNames] = useState(() => Object.fromEntries(fields.map((field) => [field.name, field.name])))
  const [styles, setStyles] = useState({})
  const [newField, setNewField] = useState({ name: '', type: 'text', formula: '', options: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  function updateStyle(name, key, value) { setStyles((current) => ({ ...current, [name]: { ...current[name], [key]: value } })) }
  async function submitNew(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { await onAdd({ name: newField.name, type: newField.type, ...(newField.type === 'formula' ? { formula: newField.formula } : {}), ...(newField.type === 'dropdown' ? { options: newField.options.split(',').map((item) => item.trim()).filter(Boolean) } : {}) }); setNewField({ name: '', type: 'text', formula: '', options: '' }) } catch (problem) { setError(problem.message) } finally { setBusy(false) }
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
  })}</div><form className="add-field-form" onSubmit={submitNew}><div className="add-field-heading"><Plus size={16} /><strong>Add a field</strong></div><div className="add-field-row"><input className="text-input" value={newField.name} onChange={(event) => setNewField({ ...newField, name: event.target.value })} placeholder="Field name" required /><select className="text-input" value={newField.type} onChange={(event) => setNewField({ ...newField, type: event.target.value })}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="dropdown">Dropdown</option><option value="formula">Formula</option></select></div>{newField.type === 'dropdown' && <input className="text-input" value={newField.options} onChange={(event) => setNewField({ ...newField, options: event.target.value })} placeholder="Options, separated by commas" />}{newField.type === 'formula' && <label className="form-field formula-editor"><span>EXPRESSION <small>e.g. Bill - Paid, SUM(Amount), IF(Paid &gt; 0, 1, 0)</small></span><input className="text-input" value={newField.formula} onChange={(event) => setNewField({ ...newField, formula: event.target.value })} placeholder="Bill - Paid" required /></label>}<button className="add-field-submit" disabled={busy}><Plus size={15} /> Add field</button></form>{error && <p className="error-copy">{error}</p>}<div className="modal-actions"><button className="secondary-button" onClick={onCancel}>Close</button><button className="primary-button" disabled={busy} onClick={saveAll}>{busy && <LoaderCircle size={17} className="animate-spin" />} Save changes <Check size={16} /></button></div></div>
}

export default App