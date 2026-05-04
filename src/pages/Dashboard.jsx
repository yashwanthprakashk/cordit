import { useState, useEffect } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import api from '../api';
import socket from '../socket';
import StatsCard from '../components/StatsCard';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import './AnalyticsPeriod.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

/* ──────────── helpers ──────────── */
const fmtDate = (d) => d.toISOString().split('T')[0];

const getDefaultRange = () => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 49);
  return { from: fmtDate(from), to: fmtDate(to) };
};

/* ──────────── demo data ──────────── */
const generateDemoData = () => {
  const products = ['Widget A', 'Component B', 'Assembly C', 'Module D', 'Part E'];
  const lots = ['LOT-001', 'LOT-002', 'LOT-003', 'LOT-004', 'LOT-005'];
  const txns = [];
  const now = new Date();
  for (let i = 0; i < 57; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - Math.floor(Math.random() * 49));
    txns.push({
      id: i + 1,
      transaction_number: `TXN-${String(i + 1).padStart(4, '0')}`,
      scale_id: `SCL-${(i % 5) + 1}`,
      lot_number: lots[i % lots.length],
      product_name: products[i % products.length],
      quantity: +(8 + Math.random() * 12).toFixed(2),
      unit: 'kg',
      date: d.toISOString(),
    });
  }
  return {
    transactions: txns,
    scales: [
      { scale_id: 'SCL-1', serial_number: 'SN-001', model_number: 'MX-200', status: 'online' },
      { scale_id: 'SCL-2', serial_number: 'SN-002', model_number: 'MX-200', status: 'online' },
      { scale_id: 'SCL-3', serial_number: 'SN-003', model_number: 'MX-300', status: 'online' },
      { scale_id: 'SCL-4', serial_number: 'SN-004', model_number: 'MX-300', status: 'offline' },
      { scale_id: 'SCL-5', serial_number: 'SN-005', model_number: 'MX-200', status: 'online' },
    ],
    alerts: [
      { id: 1, scale_id: 'SCL-4', type: 'missing_transaction', message: 'No transaction for 2 hours', severity: 'warning', created_at: new Date().toISOString() },
      { id: 2, scale_id: 'SCL-2', type: 'missing_transaction', message: 'Expected lot not received', severity: 'critical', created_at: new Date().toISOString() },
    ],
  };
};

/* ──────────── component ──────────── */
const Dashboard = () => {
  const defaults = getDefaultRange();
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);

  const [allTransactions, setAllTransactions] = useState([]);
  const [scales, setScales] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showScalesModal, setShowScalesModal] = useState(false);
  const [scalesModalType, setScalesModalType] = useState('');
  const [showAlertsModal, setShowAlertsModal] = useState(false);

  const fetchData = async () => {
    try {
      const [transRes, scalesRes, alertsRes] = await Promise.all([
        api.get('/transactions', { params: { limit: 5000 } }),
        api.get('/scales'),
        api.get('/alerts'),
      ]);
      setAllTransactions(transRes.data.data || transRes.data || []);
      setScales(scalesRes.data || []);
      setAlerts(alertsRes.data || []);
    } catch (err) {
      console.error(err);
      const demo = generateDemoData();
      setAllTransactions(demo.transactions);
      setScales(demo.scales);
      setAlerts(demo.alerts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    socket.on('newTransaction', () => fetchData());
    socket.on('newAlert', () => fetchData());
    socket.on('scaleStatusChanged', () => fetchData());
    return () => {
      socket.off('newTransaction');
      socket.off('newAlert');
      socket.off('scaleStatusChanged');
    };
  }, []);

  /* ──── filter transactions by date range ──── */
  const from = new Date(fromDate);
  const to = new Date(toDate);
  to.setHours(23, 59, 59, 999);

  const filtered = allTransactions.filter((t) => {
    const d = new Date(t.date || t.created_at);
    return d >= from && d <= to;
  });

  /* ──── derive stats from filtered data ──── */
  const activeScales = scales.filter(s => s.status === 'online').length;
  const inactiveScales = scales.filter(s => s.status === 'offline').length;

  // today's transactions within the filtered range
  const today = new Date().toISOString().split('T')[0];
  const todayTxns = filtered.filter(t => (t.date || t.created_at || '').startsWith(today)).length;

  const missingAlertCount = alerts.filter(a => a.type === 'missing_transaction').length;

  const recentTransactions = [...filtered]
    .sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at))
    .slice(0, 5);

  /* ──── charts from filtered data ──── */
  const scalePerfMap = {};
  filtered.forEach(t => {
    scalePerfMap[t.scale_id] = (scalePerfMap[t.scale_id] || 0) + 1;
  });
  const scaleChartData = {
    labels: Object.keys(scalePerfMap),
    datasets: [{ label: 'Transactions', data: Object.values(scalePerfMap), backgroundColor: '#3b82f6' }],
  };

  const dailyMap = {};
  filtered.forEach(t => {
    const day = new Date(t.date || t.created_at).toISOString().split('T')[0];
    dailyMap[day] = (dailyMap[day] || 0) + 1;
  });
  const sortedDays = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b));
  const dailyChartData = {
    labels: sortedDays.map(([d]) => d),
    datasets: [{
      label: 'Transactions',
      data: sortedDays.map(([, c]) => c),
      borderColor: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      tension: 0.4,
    }],
  };

  const chartOptions = { responsive: true, plugins: { legend: { display: false } } };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {/* ═══ Analytics Period Header ═══ */}
      <div className="ap-header" id="ap-header">
        <span className="ap-header__title">Analytics Period</span>
        <div className="ap-header__dates">
          <div className="ap-date-group">
            <span className="ap-date-group__label">From</span>
            <input
              id="ap-date-from"
              type="date"
              className="ap-date-group__input"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="ap-date-group">
            <span className="ap-date-group__label">To</span>
            <input
              id="ap-date-to"
              type="date"
              className="ap-date-group__input"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      <h1 style={{ marginBottom: '2rem', marginTop: '1.5rem' }}>Dashboard</h1>

      {/* Stats Cards */}
      <div className="stats-grid">
        <StatsCard 
          title="Active Scales" 
          value={activeScales}
          onClick={() => { setScalesModalType('active'); setShowScalesModal(true); }}
        />
        <StatsCard 
          title="Inactive Scales" 
          value={inactiveScales}
          onClick={() => { setScalesModalType('inactive'); setShowScalesModal(true); }}
        />
        <StatsCard title="Today's Transactions" value={todayTxns} />
        <StatsCard 
          title="Missing Alerts" 
          value={missingAlertCount}
          onClick={() => setShowAlertsModal(true)}
        />
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
        <div className="table-container">
          <h3 style={{ marginBottom: '1rem' }}>Scale Performance</h3>
          <Bar data={scaleChartData} options={chartOptions} />
        </div>
        <div className="table-container">
          <h3 style={{ marginBottom: '1rem' }}>Daily Transactions</h3>
          <Line data={dailyChartData} options={chartOptions} />
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="table-container">
        <h3 style={{ marginBottom: '1rem' }}>Recent Transactions</h3>
        <table>
          <thead>
            <tr>
              <th>Txn Number</th>
              <th>Scale</th>
              <th>Lot Number</th>
              <th>Product</th>
              <th>Quantity</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {recentTransactions.map(txn => (
              <tr key={txn.id}>
                <td>{txn.transaction_number}</td>
                <td>{txn.scale_id}</td>
                <td>{txn.lot_number}</td>
                <td>{txn.product_name}</td>
                <td>{txn.quantity} {txn.unit}</td>
                <td>{new Date(txn.date).toISOString().split('T')[0]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Scales Detail Modal */}
      <Modal 
        isOpen={showScalesModal} 
        onClose={() => setShowScalesModal(false)} 
        title={scalesModalType === 'active' ? 'Active Scales' : 'Inactive Scales'}
      >
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Scale ID</th>
              <th>Serial Number</th>
              <th>Model</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {scales
              .filter(s => scalesModalType === 'active' ? s.status === 'online' : s.status === 'offline')
              .map(s => (
                <tr key={s.scale_id}>
                  <td>{s.scale_id}</td>
                  <td>{s.serial_number}</td>
                  <td>{s.model_number}</td>
                  <td style={{ color: s.status === 'online' ? '#10b981' : '#ef4444' }}>
                    {s.status === 'online' ? '🟢 Online' : '🔴 Offline'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </Modal>

      {/* Missing Alerts Modal */}
      <Modal 
        isOpen={showAlertsModal} 
        onClose={() => setShowAlertsModal(false)} 
        title="Missing Transaction Alerts"
      >
        <table style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Scale ID</th>
              <th>Message</th>
              <th>Severity</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {alerts
              .filter(a => a.type === 'missing_transaction')
              .map(a => (
                <tr key={a.id}>
                  <td>{a.scale_id}</td>
                  <td>{a.message}</td>
                  <td style={{ color: a.severity === 'warning' ? '#f59e0b' : '#ef4444' }}>
                    {a.severity.toUpperCase()}
                  </td>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </Modal>
    </div>
  );
};

export default Dashboard;