import { useState, useEffect } from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import * as XLSX from 'xlsx';
import api from '../api';
import LoadingSpinner from '../components/LoadingSpinner';

ChartJS.register(ArcElement, Tooltip, Legend);

/* ──────────── download helpers ──────────── */
const downloadCSV = (rows, headers, filename) => {
  const csvContent = [
    headers.join(','),
    ...rows.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(',')),
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${filename}.csv`);
};

const downloadExcel = (rows, headers, filename) => {
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filename}.xlsx`);
};

const triggerDownload = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/* ──────────── download button component ──────────── */
const DownloadButtons = ({ rows, headers, filename }) => (
  <div style={{ display: 'flex', gap: '0.5rem' }}>
    <button
      className="btn btn-primary btn-sm"
      id={`download-csv-${filename}`}
      onClick={() => downloadCSV(rows, headers, filename)}
    >
      ⬇ CSV
    </button>
    <button
      className="btn btn-primary btn-sm"
      id={`download-excel-${filename}`}
      onClick={() => downloadExcel(rows, headers, filename)}
      style={{ background: '#10b981' }}
    >
      ⬇ Excel
    </button>
  </div>
);

/* ──────────── demo data ──────────── */
const generateDemoReports = () => ({
  daily: [
    { date: '2026-04-24', transaction_count: 12, total_weight: 145.5 },
    { date: '2026-04-25', transaction_count: 8, total_weight: 98.2 },
    { date: '2026-04-26', transaction_count: 15, total_weight: 187.3 },
  ],
  lot: [
    { lot_number: 'LOT-001', transaction_count: 14 },
    { lot_number: 'LOT-002', transaction_count: 9 },
    { lot_number: 'LOT-003', transaction_count: 11 },
    { lot_number: 'LOT-004', transaction_count: 6 },
    { lot_number: 'LOT-005', transaction_count: 17 },
  ],
  missing: [
    { id: 1, scale_id: 'SCL-4', type: 'missing_transaction', message: 'No transaction for 2 hours', severity: 'warning', created_at: new Date().toISOString(), resolved: false },
    { id: 2, scale_id: 'SCL-2', type: 'missing_transaction', message: 'Expected lot not received', severity: 'critical', created_at: new Date().toISOString(), resolved: true },
  ],
});

/* ──────────── component ──────────── */
const Reports = () => {
  const [daily, setDaily] = useState([]);
  const [lot, setLot] = useState([]);
  const [missing, setMissing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const [dailyRes, lotRes, missingRes] = await Promise.all([
          api.get('/reports/daily'),
          api.get('/reports/lot'),
          api.get('/reports/missing-transactions'),
        ]);
        setDaily(dailyRes.data);
        setLot(lotRes.data);
        setMissing(missingRes.data);
      } catch (err) {
        console.error('Failed to load reports', err);
        // Fallback to demo data
        const demo = generateDemoReports();
        setDaily(demo.daily);
        setLot(demo.lot);
        setMissing(demo.missing);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="error">{error}</div>;

  // Prepare pie chart for lot distribution
  const lotLabels = lot.map(item => item.lot_number);
  const lotCounts = lot.map(item => item.transaction_count);
  const pieData = {
    labels: lotLabels,
    datasets: [
      {
        label: 'Transactions per Lot',
        data: lotCounts,
        backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
      },
    ],
  };

  // Prepare download-ready data
  const dailyForDownload = daily.map(row => ({
    date: new Date(row.date).toISOString().split('T')[0],
    transaction_count: row.transaction_count,
    total_weight: row.total_weight,
  }));

  const missingForDownload = missing.map(alert => ({
    scale_id: alert.scale_id,
    type: alert.type,
    message: alert.message,
    severity: alert.severity,
    created_at: new Date(alert.created_at).toLocaleString(),
    resolved: alert.resolved ? 'Yes' : 'No',
  }));

  const lotForDownload = lot.map(item => ({
    lot_number: item.lot_number,
    transaction_count: item.transaction_count,
  }));

  return (
    <div>
      <h1 style={{ marginBottom: '2rem' }}>Reports</h1>

      {/* Daily Report Table */}
      <div className="table-container" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>Daily Transaction Summary</h3>
          <DownloadButtons
            rows={dailyForDownload}
            headers={['date', 'transaction_count', 'total_weight']}
            filename="daily-transaction-summary"
          />
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Transaction Count</th>
              <th>Total Weight</th>
            </tr>
          </thead>
          <tbody>
            {daily.map(row => (
              <tr key={row.date}>
                <td>{new Date(row.date).toISOString().split('T')[0]}</td>
                <td>{row.transaction_count}</td>
                <td>{row.total_weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Lot Distribution Chart + Download */}
      <div className="table-container" style={{ marginBottom: '2rem', maxWidth: '500px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>Lot Distribution</h3>
          <DownloadButtons
            rows={lotForDownload}
            headers={['lot_number', 'transaction_count']}
            filename="lot-distribution"
          />
        </div>
        <Pie data={pieData} />
      </div>

      {/* Missing Transactions Report */}
      <div className="table-container">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>Missing Transaction Alerts</h3>
          <DownloadButtons
            rows={missingForDownload}
            headers={['scale_id', 'type', 'message', 'severity', 'created_at', 'resolved']}
            filename="missing-transaction-alerts"
          />
        </div>
        <table>
          <thead>
            <tr>
              <th>Scale</th>
              <th>Type</th>
              <th>Message</th>
              <th>Severity</th>
              <th>Created</th>
              <th>Resolved</th>
            </tr>
          </thead>
          <tbody>
            {missing.map(alert => (
              <tr key={alert.id}>
                <td>{alert.scale_id}</td>
                <td>{alert.type}</td>
                <td>{alert.message}</td>
                <td><span className={`badge ${alert.severity}`}>{alert.severity}</span></td>
                <td>{new Date(alert.created_at).toLocaleString()}</td>
                <td>{alert.resolved ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Reports;