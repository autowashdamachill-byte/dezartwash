import React from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import './styles.css';
import { enablePush } from './push.js';
import { startI18n } from './i18n.js';

const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
const { useState, useEffect, useCallback, useRef } = React;
const money = (n, cur = 'SAR') => `${cur || 'SAR'} ${Number(n).toLocaleString('en-US')}`;
const sar = (n) => money(n);
// The same price number is used in every country; only the currency differs.
function revenueText(rows) {
  const by = {};
  rows.forEach((x) => { const c = x.currency || 'SAR'; by[c] = (by[c] || 0) + Number(x.total); });
  const e = Object.entries(by);
  return e.length ? e.map(([c, v]) => money(v, c)).join(' · ') : money(0);
}

/* Who performs a job: icon + label + colour, never colour alone. */
const PROVIDER = {
  individual: { icon: '🛵', label: 'Individual rider', cls: 'orange' },
  station_rider: { icon: '✔', label: 'Station rider', cls: 'green' },
  station: { icon: '🏪', label: 'Service station', cls: 'blue' },
  sent: { icon: '🏪', label: 'Sent to station', cls: 'blue' },
  none: { icon: '○', label: 'Unassigned', cls: 'grey' },
};
function providerOf(r) {
  if (r.fulfilment === 'station') return { kind: 'station', name: r.stations?.name };
  if (r.rider_id && r.riders?.station_id) return { kind: 'station_rider', name: r.riders?.stations?.name };
  if (r.rider_id) return { kind: 'individual' };
  if (r.station_id) return { kind: 'sent', name: r.stations?.name };
  return { kind: 'none' };
}
function ProviderBadge({ kind, name }) {
  const p = PROVIDER[kind] || PROVIDER.none;
  return <span className={`pbadge ${p.cls}`}><i aria-hidden="true">{p.icon}</i>{p.label}{name ? ` · ${name}` : ''}</span>;
}
const STATUSES = ['pending', 'assigned', 'confirmed', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled'];
// What each status means for the admin.
const STEP_LABEL = { pending: 'Waiting for a rider', assigned: 'Request sent to rider', confirmed: 'Confirmed by rider', on_the_way: 'Rider on the way', arrived: 'Rider arrived', in_progress: 'Service in progress', completed: 'Completed', cancelled: 'Cancelled' };
const STEPS = ['assigned', 'confirmed', 'on_the_way', 'arrived', 'in_progress', 'completed'];

const STATION_LABEL = { pending: 'Waiting for a station', confirmed: 'Approved by station', arrived: 'Customer arrived', in_progress: 'Service in progress', completed: 'Completed' };

function Progress({ status, row }) {
  if (status === 'cancelled') return <span className="badge rejected">Cancelled</span>;
  if (row?.fulfilment === 'station') {
    const label = status === 'pending' && row.station_id ? 'Sent to station, waiting for approval' : (STATION_LABEL[status] || status);
    return <b className={`stat-${status}`}>{label}</b>;
  }
  const at = STEPS.indexOf(status);
  return (
    <div className="steps" title={STEP_LABEL[status]}>
      <b className={`stat-${status}`}>{STEP_LABEL[status] || status}</b>
      <div className="dots">
        {STEPS.map((x, i) => <i key={x} className={i <= at ? 'on' : ''} />)}
      </div>
    </div>
  );
}
const niceStatus = (s) => (s === 'assigned' ? 'request sent' : s.replace(/_/g, ' '));

/* ------------------------------------------------------------- Login */
function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  async function submit(e) {
    e.preventDefault();
    setMsg('');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) setMsg(error.message);
  }
  return (
    <div className="login">
      <div className="water" />
      <form className="card" onSubmit={submit}>
        <div className="brand"><span className="dez">Dezart</span><span className="wash">Wash</span></div>
        <p className="muted">Admin panel</p>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {msg && <p className="err">{msg}</p>}
        <button className="primary">Sign in</button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------- Data */
function useTable(table, order, filter, select = '*') {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    let q = sb.from(table).select(select).order(order.col, { ascending: order.asc ?? true });
    if (filter) q = q.eq(filter[0], filter[1]);
    const { data, error } = await q;
    if (error) setError(error.message);
    else setRows(data);
  }, [table, order.col, order.asc, filter && filter[1], select]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (table !== 'bookings' && table !== 'stations') return undefined;
    // Rider progress shows up here as it happens.
    const ch = sb.channel(`live-${table}-${Math.random()}`).on('postgres_changes', { event: '*', schema: 'public', table }, load).subscribe();
    const t = setInterval(load, 20000);
    return () => { sb.removeChannel(ch); clearInterval(t); };
  }, [table, load]);
  return { rows, error, load };
}

/* ------------------------------------------------------------ Charts */
const PALETTE = ['#1d6fff', '#38b6ff', '#0b3a9a', '#7fd3ff', '#5b6b88', '#1b873f', '#c62828'];

function BarChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 560, h = 190, pad = 24, bw = (w - pad * 2) / data.length;
  return (
    <svg viewBox={`0 0 ${w} ${h + 26}`} className="chart" role="img">
      <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b8bff" /><stop offset="1" stopColor="#1456d6" /></linearGradient></defs>
      {[0, .5, 1].map((t) => (
        <g key={t}><line x1={pad} x2={w - pad} y1={h - t * (h - 16)} y2={h - t * (h - 16)} stroke="#d5e2f7" />
          <text x={pad - 4} y={h - t * (h - 16) + 4} textAnchor="end" fontSize="10" fill="#5b6b88">{Math.round(max * t)}</text></g>
      ))}
      {data.map((d, i) => {
        const bh = (d.value / max) * (h - 16);
        return (
          <g key={i}>
            <rect x={pad + i * bw + bw * .18} y={h - bh} width={bw * .64} height={bh} rx="5" fill="url(#bg)"><title>{`${d.label}: ${d.value}`}</title></rect>
            {i % 2 === 0 && <text x={pad + i * bw + bw / 2} y={h + 16} textAnchor="middle" fontSize="10" fill="#5b6b88">{d.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ data }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 560, h = 190, pad = 30;
  const x = (i) => pad + (i * (w - pad * 2)) / Math.max(1, data.length - 1);
  const y = (v) => h - (v / max) * (h - 16);
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h + 26}`} className="chart" role="img">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1d6fff" stopOpacity=".3" /><stop offset="1" stopColor="#1d6fff" stopOpacity="0" /></linearGradient></defs>
      {[0, .5, 1].map((t) => (<line key={t} x1={pad} x2={w - pad} y1={h - t * (h - 16)} y2={h - t * (h - 16)} stroke="#d5e2f7" />))}
      <text x={4} y={14} fontSize="10" fill="#5b6b88">{sar(max)}</text>
      <polygon points={`${x(0)},${h} ${pts} ${x(data.length - 1)},${h}`} fill="url(#lg)" />
      <polyline points={pts} fill="none" stroke="#1d6fff" strokeWidth="3" strokeLinejoin="round" />
      {data.map((d, i) => (<circle key={i} cx={x(i)} cy={y(d.value)} r="3.5" fill="#fff" stroke="#1d6fff" strokeWidth="2"><title>{`${d.label}: ${sar(d.value)}`}</title></circle>))}
      {data.map((d, i) => (i % 2 === 0 ? <text key={i} x={x(i)} y={h + 16} textAnchor="middle" fontSize="10" fill="#5b6b88">{d.label}</text> : null))}
    </svg>
  );
}

function Donut({ data }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 62, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 160 160" width="160" height="160" role="img">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#eef4ff" strokeWidth="24" />
        {total > 0 && data.map((d, i) => {
          const len = (d.value / total) * c;
          const el = <circle key={d.label} cx="80" cy="80" r={r} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="24"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform="rotate(-90 80 80)"><title>{`${d.label}: ${d.value}`}</title></circle>;
          off += len;
          return el;
        })}
        <text x="80" y="78" textAnchor="middle" fontSize="26" fontWeight="800" fill="#06142f">{total}</text>
        <text x="80" y="96" textAnchor="middle" fontSize="11" fill="#5b6b88">bookings</text>
      </svg>
      <ul>
        {data.map((d, i) => (<li key={d.label}><i style={{ background: PALETTE[i % PALETTE.length] }} />{niceStatus(d.label)} <b>{d.value}</b></li>))}
      </ul>
    </div>
  );
}

function HBars({ data }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="muted">No data yet.</p>;
  return (
    <div className="hbars">
      {data.map((d) => (
        <div key={d.label} className="hrow">
          <span>{d.label}</span>
          <div><i style={{ width: `${(d.value / max) * 100}%` }} /></div>
          <b>{d.value}</b>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------- Dashboard */
function Dashboard() {
  const b = useTable('bookings', { col: 'created_at', asc: false });
  const c = useTable('profiles', { col: 'created_at' });
  const r = useTable('riders', { col: 'created_at' });
  const live = b.rows.filter((x) => x.status !== 'cancelled');
  const completed = b.rows.filter((x) => x.status === 'completed');
  const days = [...Array(14)].map((_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (13 - i)); return d;
  });
  const perDay = days.map((d) => {
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const rows = live.filter((x) => { const t = new Date(x.created_at); return t >= d && t < next; });
    return { label: `${d.getDate()}/${d.getMonth() + 1}`, count: rows.length, rev: rows.reduce((s, x) => s + Number(x.total), 0) };
  });
  const byStatus = STATUSES.map((s) => ({ label: s, value: b.rows.filter((x) => x.status === s).length })).filter((x) => x.value);
  const svc = {};
  live.forEach((x) => { svc[x.service_name] = (svc[x.service_name] || 0) + 1; });
  const top = Object.entries(svc).map(([label, value]) => ({ label, value })).sort((a, z) => z.value - a.value).slice(0, 6);
  const stats = [
    ['Bookings', b.rows.length],
    ['Pending', b.rows.filter((x) => x.status === 'pending').length],
    ['Revenue', revenueText(live)],
    ['Completed', completed.length],
    ['Customers', c.rows.filter((x) => x.role === 'customer').length],
    ['Riders', r.rows.filter((x) => x.approved).length],
    ['To review', r.rows.filter((x) => x.verification === 'submitted').length],
  ];
  return (
    <>
      <div className="stats">
        {stats.map(([k, v]) => (<div className="card stat" key={k}><span>{k}</span><b>{v}</b></div>))}
      </div>
      <div className="grid2">
        <div className="card"><h3>Bookings, last 14 days</h3><BarChart data={perDay.map((d) => ({ label: d.label, value: d.count }))} /></div>
        <div className="card"><h3>Revenue, last 14 days</h3><LineChart data={perDay.map((d) => ({ label: d.label, value: d.rev }))} /></div>
        <div className="card"><h3>Booking status</h3><Donut data={byStatus} /></div>
        <div className="card"><h3>Top services</h3><HBars data={top} /></div>
      </div>
      <h3 className="sect">Latest bookings</h3>
      <BookingsTable rows={b.rows.slice(0, 5)} reload={b.load} />
    </>
  );
}

/* --------------------------------------------------------------- Chat */
function Chat({ booking, onClose }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const end = useRef(null);
  const load = useCallback(async () => {
    const { data } = await sb.from('messages').select('*').eq('booking_id', booking.id).order('created_at');
    setMsgs(data || []);
  }, [booking.id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    const ch = sb.channel(`chat-${booking.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `booking_id=eq.${booking.id}` }, load).subscribe();
    return () => { clearInterval(t); sb.removeChannel(ch); };
  }, [load, booking.id]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs]);
  async function send(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    const { data: u } = await sb.auth.getUser();
    const { error } = await sb.from('messages').insert({ booking_id: booking.id, sender_id: u.user.id, sender_role: 'admin', body });
    if (error) alert(error.message);
    load();
  }
  return (
    <div className="modal" onClick={onClose}>
      <div className="card chat" onClick={(e) => e.stopPropagation()}>
        <div className="bar"><h3>Chat: {booking.service_name} ({booking.customer_name || 'customer'})</h3><button className="link" onClick={onClose}>Close</button></div>
        <div className="msgs">
          {!msgs.length && <p className="muted">No messages yet.</p>}
          {msgs.map((m) => (
            <div key={m.id} className={`msg ${m.sender_role}`}><small>{m.sender_role === 'station' ? (booking.stations?.name || 'station') : m.sender_role} · {new Date(m.created_at).toLocaleTimeString()}</small>{m.body}</div>
          ))}
          <div ref={end} />
        </div>
        <form className="send" onSubmit={send}>
          <input placeholder="Reply as admin…" value={text} onChange={(e) => setText(e.target.value)} />
          <button className="primary">Send</button>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- Chats (all) */
const seenKey = (id) => `admin_seen_${id}`;
const getSeen = (id) => { try { return Number(localStorage.getItem(seenKey(id))) || 0; } catch { return 0; } };
const markSeen = (id) => { try { localStorage.setItem(seenKey(id), String(Date.now())); } catch { /* ignore */ } };

function useChatIndex(enabled) {
  const [convos, setConvos] = useState([]);
  const load = useCallback(async () => {
    const { data: ms } = await sb.from('messages').select('*').order('created_at', { ascending: false }).limit(500);
    const list = ms || [];
    const ids = [...new Set(list.map((m) => m.booking_id))];
    if (!ids.length) { setConvos([]); return; }
    const { data: bs } = await sb.from('bookings').select('id,service_name,customer_name,status,station_id,rider_id,fulfilment,stations(name),riders(name,station_id)').in('id', ids);
    const by = Object.fromEntries((bs || []).map((b) => [b.id, b]));
    setConvos(ids.map((id) => {
      const mine = list.filter((m) => m.booking_id === id);
      const seen = getSeen(id);
      return {
        id,
        booking: by[id] || { id, service_name: 'Booking' },
        last: mine[0],
        unread: mine.filter((m) => m.sender_role !== 'admin' && new Date(m.created_at).getTime() > seen).length,
      };
    }));
  }, []);
  useEffect(() => {
    if (!enabled) return undefined;
    load();
    const t = setInterval(load, 10000);
    const ch = sb.channel('admin-chat-index').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, load).subscribe();
    return () => { clearInterval(t); sb.removeChannel(ch); };
  }, [enabled, load]);
  return { convos, unread: convos.reduce((a, c) => a + c.unread, 0), reload: load };
}

function chatWith(b) {
  if (b?.fulfilment === 'station' || (b?.station_id && !b?.rider_id)) return { kind: 'station', name: b.stations?.name || 'Station' };
  if (b?.riders?.station_id) return { kind: 'station_rider', name: b.riders?.name || 'Rider' };
  if (b?.rider_id) return { kind: 'rider', name: b.riders?.name || 'Rider' };
  return { kind: 'none', name: '' };
}
const WITH_LABEL = { station: 'Station', station_rider: 'Station rider', rider: 'Rider', none: 'No provider' };

function Chats({ idx }) {
  const [open, setOpen] = useState(null);
  const [who, setWho] = useState('all');
  const all = idx.convos;
  const convos = all.filter((c) => {
    const k = chatWith(c.booking).kind;
    return who === 'all' || (who === 'station' ? k === 'station' || k === 'station_rider' : k === 'rider');
  });
  function openChat(c) { markSeen(c.id); idx.reload(); setOpen(c.booking); }
  function close() { if (open) markSeen(open.id); setOpen(null); idx.reload(); }
  return (
    <div className="card">
      <div className="filters">
        {[['all', 'All chats'], ['rider', 'Individual riders'], ['station', 'Stations']].map(([k, l]) => (
          <button key={k} className={who === k ? 'primary' : 'link'} onClick={() => setWho(k)}>{l}</button>
        ))}
      </div>
      {!convos.length && <p className="muted">No conversations yet. Messages between customers, riders and stations appear here.</p>}
      <div className="convos">
        {convos.map((c) => (
          <button key={c.id} className={`convo ${c.unread ? 'new' : ''}`} onClick={() => openChat(c)}>
            <div className="who">
              <b>{c.booking.customer_name || 'Customer'}</b>
              <span className="muted"> · {c.booking.service_name}</span>
              <span className={`pbadge ${({ station: 'blue', station_rider: 'green', rider: 'orange' })[chatWith(c.booking).kind] || ''}`}> {WITH_LABEL[chatWith(c.booking).kind]}{chatWith(c.booking).name ? `: ${chatWith(c.booking).name}` : ''}</span>
              <div className="preview"><small>{c.last?.sender_role}:</small> {c.last?.body}</div>
            </div>
            <div className="meta">
              <small className="muted">{c.last ? new Date(c.last.created_at).toLocaleString() : ''}</small>
              {c.unread > 0 && <span className="count">{c.unread}</span>}
            </div>
          </button>
        ))}
      </div>
      {open && <Chat booking={open} onClose={close} />}
    </div>
  );
}

/* ------------------------------------------------------------ Bookings */
/* Station wash: choose a station and send it. The station approves and sets the time. */
function StationVisitAssign({ row, stations, reload }) {
  const [sid, setSid] = useState('');
  const [busy, setBusy] = useState(false);
  const done = ['confirmed', 'arrived', 'in_progress', 'completed', 'cancelled'].includes(row.status);
  const current = stations.find((x) => x.id === row.station_id);
  async function send() {
    setBusy(true);
    const { error } = await sb.rpc('admin_send_to_station', { p_booking: row.id, p_station: sid });
    setBusy(false);
    if (error) alert(error.message); else { setSid(''); reload(); }
  }
  if (done) {
    return current ? <div><small>{row.status === 'cancelled' ? 'Was sent to' : 'Accepted by'} <b>{current.name}</b></small></div> : null;
  }
  return (
    <div>
      {current && <div><small>Sent to <b>{current.name}</b>. Waiting for approval.</small></div>}
      <select style={{ minWidth: 190 }} value={sid} onChange={(e) => setSid(e.target.value)}>
        <option value="">{current ? 'Send to another station' : 'Select a service station'}</option>
        {stations.filter((x) => x.id !== row.station_id).map((x) => <option key={x.id} value={x.id}>{x.name}{x.city ? ` · ${x.city}` : ''}</option>)}
      </select>
      {sid && <button className="primary send" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send for approval'}</button>}
    </div>
  );
}

const BOOKING_SELECT = '*, stations(name), riders(name, station_id, stations(name))';

function BookingsTable({ rows, reload }) {
  const riders = useTable('riders', { col: 'name' }).rows.filter((r) => r.approved && !r.station_id);
  const allStations = useTable('stations', { col: 'name' }).rows.filter((x) => x.status === 'approved');
  const stations = allStations.filter((x) => ['home', 'both'].includes(x.mode));
  const [chat, setChat] = useState(null);
  const [pick, setPick] = useState({});
  const [sending, setSending] = useState('');
  // Choosing a rider or station only selects it; the request goes out with the button.
  async function send(id) {
    const v = pick[id];
    if (!v) return;
    setSending(id);
    const { error } = v.startsWith('s:')
      ? await sb.rpc('assign_station', { p_booking: id, p_station: v.slice(2) })
      : await sb.rpc('assign_rider', { p_booking: id, p_rider: v });
    setSending('');
    if (error) alert(error.message);
    else setPick((p) => { const n = { ...p }; delete n[id]; return n; });
    reload();
  }
  async function setStatus(id, status) { await sb.from('bookings').update({ status }).eq('id', id); reload(); }
  async function del(id) { if (confirm('Delete this booking?')) { await sb.from('bookings').delete().eq('id', id); reload(); } }
  if (!rows.length) return <p className="muted">No bookings match.</p>;
  return (
    <>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Customer</th><th>Service</th><th>Vehicle / Address</th><th>Total</th><th>Assigned to</th><th>Status</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => {
              const pv = providerOf(r);
              const locked = ['confirmed', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled'].includes(r.status);
              const current = r.rider_id || (r.station_id ? `s:${r.station_id}` : '');
              return (
              <tr key={r.id}>
                <td>{r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : '-'}</td>
                <td>{r.customer_name || '-'}<br /><small>{r.phone}</small></td>
                <td>{r.service_name}</td>
                <td>{r.vehicle}{r.fulfilment !== 'station' && <><br /><small>{r.address}</small></>}</td>
                <td>{money(r.total, r.currency)}</td>
                <td>
                  <ProviderBadge kind={pv.kind} name={pv.name} />
                  {r.fulfilment === 'station' ? (
                    <StationVisitAssign row={r} stations={allStations} reload={reload} />
                  ) : (
                    <>
                      <select value={pick[r.id] ?? current} disabled={locked} onChange={(e) => setPick((p) => ({ ...p, [r.id]: e.target.value }))}>
                        <option value="">Select rider or station</option>
                        <optgroup label="Individual riders">
                          {riders.map((x) => <option key={x.id} value={x.id}>{x.skills?.includes(r.service_id) ? '★ ' : ''}{x.name}</option>)}
                        </optgroup>
                        {stations.length > 0 && (
                          <optgroup label="Service stations">
                            {stations.map((x) => <option key={x.id} value={`s:${x.id}`}>{x.name}</option>)}
                          </optgroup>
                        )}
                      </select>
                      {['pending', 'assigned'].includes(r.status) && pick[r.id] && pick[r.id] !== current && (
                        <button className="primary send" disabled={sending === r.id} onClick={() => send(r.id)}>{sending === r.id ? 'Sending…' : pick[r.id].startsWith('s:') ? 'Send to station' : 'Send to rider'}</button>
                      )}
                    </>
                  )}
                </td>
                <td><Progress status={r.status} row={r} /></td>
                <td className="actions">
                  <button className="link" onClick={() => setChat(r)}>Chat</button>
                  {!['completed', 'cancelled'].includes(r.status) && <button className="link danger" onClick={() => setStatus(r.id, 'cancelled')}>Cancel</button>}
                  <button className="link danger" onClick={() => del(r.id)}>Delete</button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {chat && <Chat booking={chat} onClose={() => setChat(null)} />}
    </>
  );
}

function Bookings() {
  const { rows, error, load } = useTable('bookings', { col: 'created_at', asc: false }, null, BOOKING_SELECT);
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const text = q.trim().toLowerCase();
  const shown = rows.filter((r) => {
    if (f !== 'all' && r.status !== f) return false;
    if (text && !`${r.customer_name} ${r.phone} ${r.service_name} ${r.vehicle} ${r.address}`.toLowerCase().includes(text)) return false;
    return true;
  });
  const count = (k) => rows.filter((r) => providerOf(r).kind === k).length;
  return (
    <>
      <div className="stats">
        <div className="card stat"><span>Unassigned</span><b>{count('none')}</b></div>
        <div className="card stat"><span>Individual riders</span><b>{count('individual')}</b></div>
        <div className="card stat"><span>Station riders</span><b>{count('station_rider')}</b></div>
        <div className="card stat"><span>Station visits</span><b>{count('station')}</b></div>
        <div className="card stat"><span>Sent to stations</span><b>{count('sent')}</b></div>
      </div>
      <div className="bar wrap">
        {['all', ...STATUSES].map((x) => (
          <button key={x} className={`pill ${f === x ? 'on' : ''}`} onClick={() => setF(x)}>{niceStatus(x)}</button>
        ))}
      </div>
      <div className="bar wrap">
        <input placeholder="Search customer, phone, service" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <p className="err">{error}</p>}
      <BookingsTable rows={shown} reload={load} />
    </>
  );
}

/* ------------------------------------------------------------ Stations */
const STATION_STATUS = { draft: 'Not submitted', submitted: 'Submitted', under_review: 'Under review', needs_info: 'Needs information', approved: 'Approved', rejected: 'Rejected', suspended: 'Suspended' };
const STATION_DOC = { commercial_registration: 'Commercial registration', municipality_licence: 'Municipality licence', vat_certificate: 'VAT certificate', owner_id: 'Owner ID', location_photo: 'Station photo', other: 'Other document' };
const MODE = { home: 'Home service only', visit: 'Customers visit', both: 'Home service and visits' };

function StationDocLink({ doc }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    sb.storage.from('station-docs').createSignedUrl(doc.file_path, 3600).then(({ data }) => setUrl(data?.signedUrl || ''));
  }, [doc.file_path]);
  const isImg = /\.(png|jpe?g|webp|gif)$/i.test(doc.file_path);
  if (!url) return <span className="muted">Loading…</span>;
  return isImg
    ? <a href={url} target="_blank" rel="noreferrer"><img className="thumb" src={url} alt={doc.kind} /></a>
    : <a href={url} target="_blank" rel="noreferrer">Open file</a>;
}

function StationReview({ station, onClose, reload }) {
  const [docs, setDocs] = useState([]);
  const [note, setNote] = useState(station.review_note || '');
  const load = useCallback(async () => {
    const { data } = await sb.from('station_documents').select('*').eq('station_id', station.id).order('created_at');
    setDocs(data || []);
  }, [station.id]);
  useEffect(() => { load(); }, [load]);
  async function docStatus(id, status) { await sb.from('station_documents').update({ status }).eq('id', id); load(); }
  async function decide(status) {
    if (['needs_info', 'rejected', 'suspended'].includes(status) && !note.trim()) { alert('Write a note for the station owner first.'); return; }
    const { error } = await sb.rpc('review_station', { p_station: station.id, p_status: status, p_note: note || null });
    if (error) alert(error.message); else { reload(); onClose(); }
  }
  return (
    <div className="modal" onClick={onClose}>
      <div className="card review" onClick={(e) => e.stopPropagation()}>
        <div className="bar"><h3>{station.name}</h3><button className="link" onClick={onClose}>Close</button></div>
        <p className="muted">{station.phone} · {station.email || 'no email'} · {station.city}, {station.address}</p>
        <p>Status: <b>{STATION_STATUS[station.status]}</b> · {MODE[station.mode]} · {station.capacity} cars per slot</p>
        <p>Commercial registration: <b>{station.commercial_reg || '-'}</b> · VAT: <b>{station.vat_no || '-'}</b></p>
        {station.lat && <p><a href={`https://www.google.com/maps?q=${station.lat},${station.lng}`} target="_blank" rel="noreferrer">Open location on map</a></p>}
        <h4>Documents</h4>
        {!docs.length && <p className="muted">No documents uploaded.</p>}
        <div className="docs">
          {docs.map((d) => (
            <div className="doc" key={d.id}>
              <StationDocLink doc={d} />
              <div>
                <b>{STATION_DOC[d.kind]}</b>
                <div className={`badge ${d.status}`}>{d.status}</div>
                {d.ai_type && <div><small>AI sees: <b>{AI[d.ai_type] || d.ai_type}</b></small></div>}
                <div className="actions">
                  <button className="link" onClick={() => docStatus(d.id, 'approved')}>Approve</button>
                  <button className="link danger" onClick={() => docStatus(d.id, 'rejected')}>Reject</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <label>Note to the station (required to reject, suspend or ask for more)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Commercial registration is expired" />
        </label>
        <div className="bar wrap">
          <button className="link" onClick={() => decide('under_review')}>Mark under review</button>
          <button className="link" onClick={() => decide('needs_info')}>Request more information</button>
          <button className="primary" onClick={() => decide('approved')}>Approve station</button>
          <button className="reject" onClick={() => decide('rejected')}>Reject</button>
          {station.status === 'approved' && <button className="reject" onClick={() => decide('suspended')}>Suspend</button>}
        </div>
      </div>
    </div>
  );
}

function Stations() {
  const { rows, error, load } = useTable('stations', { col: 'created_at', asc: false });
  const riders = useTable('riders', { col: 'name' }).rows;
  const [show, setShow] = useState('submitted');
  const [review, setReview] = useState(null);
  const count = (k) => rows.filter((r) => r.status === k).length;
  const list = rows.filter((r) => (show === 'all' ? true : r.status === show));
  return (
    <>
      <div className="bar wrap">
        {[['submitted', `Waiting (${count('submitted')})`], ['under_review', 'Under review'], ['needs_info', 'Needs info'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['suspended', 'Suspended'], ['draft', 'Not submitted'], ['all', 'All']].map(([k, l]) => (
          <button key={k} className={`pill ${show === k ? 'on' : ''}`} onClick={() => setShow(k)}>{l}</button>
        ))}
      </div>
      {error && <p className="err">{error}</p>}
      {!list.length && <p className="muted">No stations here.</p>}
      <div className="grid2">
        {list.map((r) => (
          <div className="card" key={r.id}>
            <div className="bar"><h3>{r.name}</h3><span className={`badge ${r.status === 'approved' ? 'approved' : r.status === 'rejected' || r.status === 'suspended' ? 'rejected' : 'pending'}`}>{STATION_STATUS[r.status]}</span></div>
            <p className="muted">{r.city} · {r.phone}</p>
            <p><ProviderBadge kind="station" /> <small>{MODE[r.mode]} · {riders.filter((x) => x.station_id === r.id).length} riders</small></p>
            <div className="bar"><button className="primary" onClick={() => setReview(r)}>Review station</button></div>
          </div>
        ))}
      </div>
      {review && <StationReview station={review} onClose={() => setReview(null)} reload={load} />}
    </>
  );
}

/* -------------------------------------------------------- Rider review */
const KIND = { id: 'Iqama / ID', licence: 'Driving licence', certificate: 'Certificate', experience: 'Experience letter', other: 'Other document' };
const AI = { iqama_or_id: 'Iqama / ID', driving_licence: 'Driving licence', certificate: 'Certificate', experience_letter: 'Experience letter', other_document: 'Other document', chat_screenshot: 'Chat screenshot', not_a_document: 'Not a document' };

function DocLink({ doc }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    sb.storage.from('rider-docs').createSignedUrl(doc.file_path, 3600).then(({ data }) => setUrl(data?.signedUrl || ''));
  }, [doc.file_path]);
  const isImg = /\.(png|jpe?g|webp|gif)$/i.test(doc.file_path);
  if (!url) return <span className="muted">Loading…</span>;
  return isImg
    ? <a href={url} target="_blank" rel="noreferrer"><img className="thumb" src={url} alt={doc.title || doc.kind} /></a>
    : <a href={url} target="_blank" rel="noreferrer">Open file</a>;
}

function RiderReview({ rider, onClose, reload }) {
  const [docs, setDocs] = useState([]);
  const svcNames = Object.fromEntries(useTable('services', { col: 'sort' }).rows.map((x) => [x.id, x.name]));
  const [note, setNote] = useState(rider.review_note || '');
  const load = useCallback(async () => {
    const { data } = await sb.from('rider_documents').select('*').eq('rider_id', rider.id).order('created_at');
    setDocs(data || []);
  }, [rider.id]);
  useEffect(() => { load(); }, [load]);
  async function docStatus(id, status) { await sb.from('rider_documents').update({ status }).eq('id', id); load(); }
  async function decide(ok) {
    const { error } = await sb.rpc('review_rider', { p_rider: rider.id, p_approve: ok, p_note: note || null });
    if (error) alert(error.message); else { reload(); onClose(); }
  }
  return (
    <div className="modal" onClick={onClose}>
      <div className="card review" onClick={(e) => e.stopPropagation()}>
        <div className="bar"><h3>{rider.name}</h3><button className="link" onClick={onClose}>Close</button></div>
        <p className="muted">{rider.phone} · {rider.vehicle || 'no vehicle'} · status <b>{rider.verification}</b></p>
        {rider.experience && <p><b>Experience:</b> {rider.experience}</p>}
        {rider.skills?.length > 0 && <p><b>Best at:</b> {rider.skills.map((id) => svcNames[id] || id).join(', ')}</p>}
        <h4>Documents</h4>
        {!docs.length && <p className="muted">No documents uploaded.</p>}
        <div className="docs">
          {docs.map((d) => (
            <div className="doc" key={d.id}>
              <DocLink doc={d} />
              <div>
                <b>{KIND[d.kind]}</b> <small>{d.title}</small>
                <div className={`badge ${d.status}`}>{d.status}</div>
                {d.ai_type && <div><small>AI sees: <b>{AI[d.ai_type] || d.ai_type}</b>{d.ai_note ? ` - ${d.ai_note}` : ''}</small></div>}
                <div className="actions">
                  <button className="link" onClick={() => docStatus(d.id, 'approved')}>Approve</button>
                  <button className="link danger" onClick={() => docStatus(d.id, 'rejected')}>Reject</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <label>Note to rider (shown if rejected)
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. ID photo is blurry" />
        </label>
        <div className="bar">
          <button className="primary" onClick={() => decide(true)}>Approve rider</button>
          <button className="reject" onClick={() => decide(false)}>Reject</button>
        </div>
      </div>
    </div>
  );
}

function Riders() {
  const { rows, error, load } = useTable('riders', { col: 'created_at', asc: false });
  const profiles = useTable('profiles', { col: 'created_at' }).rows;
  const names = Object.fromEntries(useTable('services', { col: 'sort' }).rows.map((x) => [x.id, x.name]));
  const email = Object.fromEntries(profiles.map((p) => [p.id, p.email]));
  const [review, setReview] = useState(null);
  const stationNames = Object.fromEntries(useTable('stations', { col: 'name' }).rows.map((x) => [x.id, x.name]));
  const approved = rows.filter((r) => r.approved);
  async function patch(id, v) { await sb.from('riders').update(v).eq('id', id); load(); }
  async function del(r) {
    if (confirm(`Remove ${r.name}? They will lose access.`)) {
      await sb.from('riders').delete().eq('id', r.id);
      await sb.from('profiles').update({ role: 'customer' }).eq('id', r.id);
      load();
    }
  }
  return (
    <>
      <div className="stats">
        <div className="card stat"><span>Total riders</span><b>{approved.length}</b></div>
        <div className="card stat"><span>Available now</span><b>{approved.filter((r) => r.available).length}</b></div>
        <div className="card stat"><span>Waiting approval</span><b>{rows.filter((r) => !r.approved && r.verification === 'submitted').length}</b></div>
      </div>
      {error && <p className="err">{error}</p>}
      {!approved.length && <p className="muted">No approved riders yet. New riders appear under "Rider approvals" first.</p>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Rider</th><th>Provider</th><th>Contact</th><th>Vehicle</th><th>Best at</th><th>Status</th><th>Last location</th><th /></tr></thead>
          <tbody>{approved.map((r) => (
            <tr key={r.id}>
              <td><b>{r.name}</b></td>
              <td><ProviderBadge kind={r.station_id ? 'station_rider' : 'individual'} name={stationNames[r.station_id]} /></td>
              <td><a href={`tel:${r.phone}`}>{r.phone}</a><br /><small>{email[r.id] || ''}</small></td>
              <td>{r.vehicle}</td>
              <td>{(r.skills || []).map((id) => names[id] || id).join(', ') || '-'}</td>
              <td><span className={`badge ${r.available ? 'approved' : 'pending'}`}>{r.available ? 'Available' : 'Off duty'}</span></td>
              <td>{r.lat ? (<a href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noreferrer">{new Date(r.location_at).toLocaleTimeString()} - map</a>) : '-'}</td>
              <td className="actions">
                <button className="link" onClick={() => setReview(r)}>Documents</button>
                <button className="link" onClick={() => patch(r.id, { available: !r.available })}>{r.available ? 'Set off duty' : 'Set available'}</button>
                <button className="link danger" onClick={() => del(r)}>Remove</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {review && <RiderReview rider={review} onClose={() => setReview(null)} reload={load} />}
    </>
  );
}

/* ---------------------------------------------------------- Approvals */
function Approvals() {
  const { rows, error, load } = useTable('riders', { col: 'created_at', asc: false });
  const [review, setReview] = useState(null);
  const [show, setShow] = useState('submitted');
  const list = rows.filter((r) => (show === 'all' ? true : show === 'submitted' ? r.verification === 'submitted' && !r.approved : r.verification === show));
  const count = (v) => rows.filter((r) => r.verification === v && !r.approved).length;
  async function quick(r, ok) {
    const { error } = await sb.rpc('review_rider', { p_rider: r.id, p_approve: ok, p_note: ok ? null : 'Not approved' });
    if (error) alert(error.message); else load();
  }
  return (
    <>
      <div className="bar wrap">
        {[['submitted', `Waiting for approval (${count('submitted')})`], ['incomplete', `Documents missing (${count('incomplete')})`], ['rejected', 'Rejected'], ['approved', 'Approved'], ['all', 'All']].map(([k, l]) => (
          <button key={k} className={`pill ${show === k ? 'on' : ''}`} onClick={() => setShow(k)}>{l}</button>
        ))}
      </div>
      {error && <p className="err">{error}</p>}
      {!list.length && <p className="muted">Nothing here. When a rider uploads documents and taps "Send for review" they appear under "Waiting for approval".</p>}
      <div className="grid2">
        {list.map((r) => (
          <div className="card" key={r.id}>
            <div className="bar"><h3>{r.name}</h3><span className={`badge ${r.approved ? 'approved' : r.verification}`}>{r.approved ? 'approved' : r.verification}</span></div>
            <p className="muted">{r.phone} · {r.vehicle || 'no vehicle'}</p>
            {r.experience && <p>{r.experience}</p>}
            <div className="bar">
              <button className="primary" onClick={() => setReview(r)}>Review documents</button>
              {!r.approved && <button className="link" onClick={() => quick(r, true)}>Approve</button>}
              {!r.approved && <button className="link danger" onClick={() => quick(r, false)}>Reject</button>}
            </div>
          </div>
        ))}
      </div>
      {review && <RiderReview rider={review} onClose={() => setReview(null)} reload={load} />}
    </>
  );
}

/* ---------------------------------------------------------- Editables */
function Editable({ table, order, cols, blank, keyCol = 'id', title }) {
  const { rows, error, load } = useTable(table, order);
  const [draft, setDraft] = useState(null);
  const [msg, setMsg] = useState('');
  async function save(e) {
    e.preventDefault();
    const payload = {};
    cols.forEach((c) => {
      let v = draft[c.key];
      if (c.type === 'number') v = Number(v);
      if (c.type === 'checkbox') v = !!v;
      payload[c.key] = v;
    });
    const q = draft.__new ? sb.from(table).insert(payload) : sb.from(table).update(payload).eq(keyCol, draft[keyCol]);
    const { error } = await q;
    if (error) setMsg(error.message); else { setDraft(null); setMsg(''); load(); }
  }
  async function del(r) {
    if (confirm(`Delete "${r[cols[0].key]}"?`)) { await sb.from(table).delete().eq(keyCol, r[keyCol]); load(); }
  }
  return (
    <>
      <div className="bar"><h3>{title}</h3><button className="primary" onClick={() => setDraft({ ...blank, __new: true })}>+ Add</button></div>
      {error && <p className="err">{error}</p>}
      <div className="card table-wrap">
        <table>
          <thead><tr>{cols.map((c) => <th key={c.key}>{c.label}</th>)}<th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[keyCol]}>
                {cols.map((c) => (
                  <td key={c.key}>{c.type === 'checkbox' ? (r[c.key] ? 'Yes' : 'No') : c.type === 'number' && c.money ? sar(r[c.key]) : String(r[c.key] ?? '')}</td>
                ))}
                <td className="actions">
                  <button className="link" onClick={() => setDraft({ ...r })}>Edit</button>
                  <button className="link danger" onClick={() => del(r)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {draft && (
        <div className="modal" onClick={() => setDraft(null)}>
          <form className="card" onClick={(e) => e.stopPropagation()} onSubmit={save}>
            <h3>{draft.__new ? 'Add' : 'Edit'} {title.toLowerCase()}</h3>
            {cols.map((c) => (
              <label key={c.key}>{c.label}
                {c.type === 'checkbox' ? (
                  <input type="checkbox" checked={!!draft[c.key]} onChange={(e) => setDraft({ ...draft, [c.key]: e.target.checked })} />
                ) : c.options ? (
                  <select value={draft[c.key]} onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}>
                    {c.options.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type={c.type || 'text'} step="any" required={!c.optional} value={draft[c.key] ?? ''}
                    disabled={!draft.__new && c.key === keyCol}
                    onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })} />
                )}
              </label>
            ))}
            {msg && <p className="err">{msg}</p>}
            <div className="bar"><button className="primary">Save</button><button type="button" className="link" onClick={() => setDraft(null)}>Cancel</button></div>
          </form>
        </div>
      )}
    </>
  );
}

const Services = () => {
  const cats = useTable('service_categories', { col: 'sort' }).rows;
  const options = cats.length ? cats.map((c) => c.id) : ['wash', 'care', 'protection', 'styling'];
  return (
    <>
      <Editable title="Categories" table="service_categories" order={{ col: 'sort' }}
        blank={{ id: '', name: '', name_ar: '', sort: 100, active: true }}
        cols={[
          { key: 'name', label: 'Name' }, { key: 'name_ar', label: 'Arabic name' }, { key: 'id', label: 'ID (no spaces)' },
          { key: 'active', label: 'Active', type: 'checkbox' },
          { key: 'sort', label: 'Order', type: 'number' },
        ]} keyCol="id" />
      <Editable title="Services" table="services" order={{ col: 'sort' }}
        blank={{ id: '', name: '', category: options[0], price: 0, duration_minutes: 0, premium: false, bike: false, active: true, sort: 200 }}
        cols={[
          { key: 'name', label: 'Name' }, { key: 'id', label: 'ID' },
          { key: 'category', label: 'Category', options },
          { key: 'price', label: 'Price', type: 'number', money: true },
          { key: 'duration_minutes', label: 'Duration (min, 0 = TBC)', type: 'number' },
          { key: 'premium', label: 'Premium carousel', type: 'checkbox' },
          { key: 'bike', label: 'Motorbike service', type: 'checkbox' },
          { key: 'active', label: 'Active', type: 'checkbox' },
          { key: 'sort', label: 'Order', type: 'number' },
        ]} keyCol="id" />
    </>
  );
};
const Plans = () => (
  <Editable title="Monthly plans" table="monthly_plans" order={{ col: 'group_name' }}
    blank={{ group_name: 'Standard Wash', washes: 6, home_price: 0, station_price: 0, active: true }}
    cols={[
      { key: 'group_name', label: 'Plan' }, { key: 'washes', label: 'Washes / month', type: 'number' },
      { key: 'home_price', label: 'Home price', type: 'number', money: true },
      { key: 'station_price', label: 'Station price', type: 'number', money: true },
      { key: 'active', label: 'Active', type: 'checkbox' },
    ]} />
);
const Coupons = () => (
  <Editable title="Coupons" table="coupons" order={{ col: 'code' }} keyCol="code"
    blank={{ code: '', percent: 10, description: '', active: true }}
    cols={[
      { key: 'code', label: 'Code' }, { key: 'percent', label: 'Percent off', type: 'number' },
      { key: 'description', label: 'Description', optional: true }, { key: 'active', label: 'Active', type: 'checkbox' },
    ]} />
);

function Customers() {
  const { rows, error } = useTable('profiles', { col: 'created_at', asc: false });
  return (
    <>
      {error && <p className="err">{error}</p>}
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Joined</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td>{r.name}</td><td>{r.email}</td><td>{r.phone}</td><td>{r.role}</td><td>{new Date(r.created_at).toLocaleDateString()}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

const TABS = { Dashboard, Bookings, Chats, 'Rider approvals': Approvals, Riders, 'Station verification': Stations, Services, 'Monthly plans': Plans, Coupons, Customers };

function useChatAlerts(me, enabled) {
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!enabled) return undefined;
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    const ch = sb.channel('admin-chat-alerts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
      const m = p.new;
      if (m.sender_id === me) return;
      setToast(`New ${m.sender_role} message: ${m.body}`);
      setTimeout(() => setToast(''), 6000);
      if ('Notification' in window && Notification.permission === 'granted') new Notification(`New message from ${m.sender_role}`, { body: m.body });
    }).subscribe();
    return () => sb.removeChannel(ch);
  }, [me, enabled]);
  return toast;
}

function Shell({ session }) {
  const [tab, setTab] = useState('Dashboard');
  const [role, setRole] = useState(null);
  const toast = useChatAlerts(session.user.id, role === 'admin');
  const [waiting, setWaiting] = useState(0);
  const [stationWaiting, setStationWaiting] = useState(0);
  const [pending, setPending] = useState(0);
  const [bookingToast, setBookingToast] = useState('');
  const idx = useChatIndex(role === 'admin');
  useEffect(() => { if (role === 'admin') enablePush(sb, session.user.id); }, [role]);
  useEffect(() => {
    if (role !== 'admin') return undefined;
    const f = async () => {
      const { count } = await sb.from('bookings').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      setPending(count || 0);
    };
    f();
    const t = setInterval(f, 15000);
    const ch = sb.channel('admin-new-bookings').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, (p) => {
      f();
      setBookingToast(`New booking: ${p.new.service_name || 'Service'}${p.new.customer_name ? ` (${p.new.customer_name})` : ''}`);
      setTimeout(() => setBookingToast(''), 7000);
    }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings' }, f).subscribe();
    return () => { clearInterval(t); sb.removeChannel(ch); };
  }, [role]);
  useEffect(() => {
    const n = pending + idx.unread + waiting + stationWaiting;
    document.title = n > 0 ? `(${n}) DezartWash Admin` : 'DezartWash Admin';
  }, [pending, idx.unread, waiting, stationWaiting]);
  useEffect(() => {
    if (role !== 'admin') return undefined;
    const f = async () => {
      const { count } = await sb.from('riders').select('id', { count: 'exact', head: true }).eq('verification', 'submitted').eq('approved', false);
      setWaiting(count || 0);
      const st = await sb.from('stations').select('id', { count: 'exact', head: true }).eq('status', 'submitted');
      setStationWaiting(st.count || 0);
    };
    f();
    const t = setInterval(f, 15000);
    return () => clearInterval(t);
  }, [role, tab]);
  useEffect(() => {
    sb.from('profiles').select('role').eq('id', session.user.id).single().then(({ data }) => setRole(data?.role ?? 'customer'));
  }, [session]);
  if (!role) return <p className="muted pad">Loading…</p>;
  if (role !== 'admin') {
    return (
      <div className="login"><div className="water" /><div className="card">
        <h3>Not an admin</h3>
        <p className="muted">{session.user.email} does not have admin access.</p>
        <button className="primary" onClick={() => sb.auth.signOut()}>Sign out</button>
      </div></div>
    );
  }
  const View = TABS[tab];
  const badges = { Bookings: pending, Chats: idx.unread, 'Rider approvals': waiting, 'Station verification': stationWaiting };
  return (
    <div className="layout">
      <aside>
        <div className="brand"><span className="dez">Dezart</span><span className="wash">Wash</span></div>
        {Object.keys(TABS).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}{badges[t] > 0 ? <span className="count">{badges[t]}</span> : null}</button>
        ))}
        <div className="grow" />
        <small>{session.user.email}</small>
        <button onClick={() => sb.auth.signOut()}>Sign out</button>
      </aside>
      <main>
        {(bookingToast || toast) && <div className="toast">{bookingToast || toast}</div>}
        <div className="topband"><h1>{tab}</h1></div>
        <div className="content"><View idx={idx} /></div>
        <footer className="foot">All rights reserved by Damachill</footer>
      </main>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <p className="muted pad">Loading…</p>;
  return session ? <Shell session={session} /> : <Login />;
}

createRoot(document.getElementById('root')).render(<App />);
startI18n();
