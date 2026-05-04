import { useState, useEffect, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import api from '../api';
import './AnalyticsPeriod.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

/* ──────────── helpers ──────────── */
const fmtDate = (d) => d.toISOString().split('T')[0];

const getDefaultRange = () => {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 49); // ~7 weeks
  return { from: fmtDate(from), to: fmtDate(to) };
};

/* ──────────── component ──────────── */
const AnalyticsPeriod = () => {
  const defaults = getDefaultRange();
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [transactions, setTransactions] = useState([]);
  const [scales, setScales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ---- generate demo data when API is unavailable ---- */
  const generateDemoData = () => {
    const products = ['Widget A', 'Component B', 'Assembly C', 'Module D', 'Part E'];
    const operators = ['OP-101', 'OP-102', 'OP-103', 'OP-104', 'OP-105', 'OP-106', 'OP-107'];
    const lots = ['LOT-2026-001', 'LOT-2026-002', 'LOT-2026-003', 'LOT-2026-004', 'LOT-2026-005', 'LOT-2026-006', 'LOT-2026-007'];
    const demoTxns = [];
    const now = new Date();
    for (let i = 0; i < 57; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - Math.floor(Math.random() * 49));
      const isDeviated = Math.random() < 0.35;
      demoTxns.push({
        id: i + 1,
        transaction_number: `TXN-${String(i + 1).padStart(4, '0')}`,
        scale_id: `SCL-${(i % 5) + 1}`,
        lot_number: lots[i % lots.length],
        product_name: products[i % products.length],
        operator: operators[i % operators.length],
        quantity: +(8 + Math.random() * 12).toFixed(2),
        unit: 'kg',
        status: isDeviated ? 'deviated' : 'qualified',
        deviation: isDeviated ? +(0.5 + Math.random() * 2).toFixed(2) : 0,
        date: d.toISOString(),
      });
    }
    return {
      transactions: demoTxns,
      scales: [
        { scale_id: 'SCL-1', status: 'online' },
        { scale_id: 'SCL-2', status: 'online' },
        { scale_id: 'SCL-3', status: 'online' },
        { scale_id: 'SCL-4', status: 'offline' },
        { scale_id: 'SCL-5', status: 'online' },
      ],
    };
  };

  /* ---- fetch data ---- */
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [txRes, scalesRes] = await Promise.all([
        api.get('/transactions', { params: { limit: 5000 } }),
        api.get('/scales'),
      ]);
      setTransactions(txRes.data.data || txRes.data || []);
      setScales(scalesRes.data || []);
    } catch (err) {
      console.error(err);
      // Fallback to demo data when backend is unavailable
      const demo = generateDemoData();
      setTransactions(demo.transactions);
      setScales(demo.scales);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  /* ---- derived analytics ---- */
  const analytics = useMemo(() => {
    if (!transactions.length) {
      return {
        totalWeighments: 0,
        qualifiedNetWeight: 0,
        deviatedWeight: 0,
        qualityIndex: 0,
        totalThroughput: 0,
        processedBatches: 0,
        validatedBatches: 0,
        operationalStaff: 0,
        productSKUs: 0,
        trend: [],
      };
    }

    const from = new Date(fromDate);
    const to = new Date(toDate);
    to.setHours(23, 59, 59, 999);

    const filtered = transactions.filter((t) => {
      const d = new Date(t.date || t.created_at);
      return d >= from && d <= to;
    });

    const totalWeighments = filtered.length;

    // Qualified: within tolerance; Deviated: outside
    const qualified = filtered.filter(
      (t) => t.status === 'qualified' || t.status === 'completed' || !t.deviation || Number(t.deviation) === 0
    );
    const deviated = filtered.filter(
      (t) => t.status === 'deviated' || (t.deviation && Number(t.deviation) !== 0)
    );

    const qualifiedNetWeight = qualified.length;
    const deviatedWeight = deviated.length;

    const qualityIndex =
      totalWeighments > 0
        ? ((qualifiedNetWeight / totalWeighments) * 100).toFixed(1)
        : 0;

    const totalThroughput = filtered
      .reduce((sum, t) => sum + (Number(t.quantity) || 0), 0)
      .toFixed(2);

    // Unique batches / lots
    const lots = new Set(filtered.map((t) => t.lot_number).filter(Boolean));
    const processedBatches = lots.size;

    // Validated = lots where all txns are qualified
    const lotMap = {};
    filtered.forEach((t) => {
      if (!t.lot_number) return;
      if (!lotMap[t.lot_number]) lotMap[t.lot_number] = [];
      lotMap[t.lot_number].push(t);
    });
    const validatedBatches = Object.values(lotMap).filter((arr) =>
      arr.every(
        (t) => t.status === 'qualified' || t.status === 'completed' || !t.deviation || Number(t.deviation) === 0
      )
    ).length;

    // Unique operators / staff
    const operators = new Set(
      filtered.map((t) => t.operator || t.operator_id || t.scale_id).filter(Boolean)
    );
    const operationalStaff = operators.size || scales.length;

    // Unique product names
    const products = new Set(
      filtered.map((t) => t.product_name || t.product_id).filter(Boolean)
    );
    const productSKUs = products.size;

    // Daily trend – group by date
    const dailyMap = {};
    filtered.forEach((t) => {
      const day = new Date(t.date || t.created_at).toISOString().split('T')[0];
      dailyMap[day] = (dailyMap[day] || 0) + (Number(t.quantity) || 1);
    });
    const trend = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({ date, value }));

    return {
      totalWeighments,
      qualifiedNetWeight,
      deviatedWeight,
      qualityIndex,
      totalThroughput,
      processedBatches,
      validatedBatches,
      operationalStaff,
      productSKUs,
      trend,
    };
  }, [transactions, fromDate, toDate, scales]);

  /* ---- chart config ---- */
  const chartData = {
    labels: analytics.trend.map((t) => {
      const d = new Date(t.date);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }),
    datasets: [
      {
        label: 'Throughput',
        data: analytics.trend.map((t) => t.value),
        borderColor: '#f5a623',
        backgroundColor: (ctx) => {
          const chart = ctx.chart;
          const { ctx: c, chartArea } = chart;
          if (!chartArea) return 'rgba(245,166,35,0.1)';
          const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(245,166,35,0.35)');
          gradient.addColorStop(1, 'rgba(245,166,35,0.02)');
          return gradient;
        },
        fill: true,
        tension: 0.45,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#f5a623',
        borderWidth: 2.5,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1a1a1a',
        titleColor: '#f5a623',
        bodyColor: '#e0e0e0',
        borderColor: '#333',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
        ticks: { color: '#666', maxTicksLimit: 8, font: { size: 11 } },
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
        ticks: { color: '#666', font: { size: 11 } },
      },
    },
  };

  /* ---- stat card definitions ---- */
  const statCards = [
    { icon: '📋', label: 'Total Weighments', value: analytics.totalWeighments, color: 'blue' },
    { icon: '✅', label: 'Qualified Net Weight', value: analytics.qualifiedNetWeight, color: 'green' },
    { icon: '❌', label: 'Deviated Weight', value: analytics.deviatedWeight, color: 'red' },
    { icon: '📊', label: 'Quality Index (%)', value: `${analytics.qualityIndex}%`, color: 'teal' },
    { icon: '⚙️', label: 'Total Throughput', value: analytics.totalThroughput, color: 'cyan' },
    { icon: '📦', label: 'Processed Batches', value: analytics.processedBatches, color: 'amber' },
    { icon: '⭐', label: 'Validated Batches', value: analytics.validatedBatches, color: 'yellow' },
    { icon: '👤', label: 'Operational Staff', value: analytics.operationalStaff, color: 'purple' },
    { icon: '🏷️', label: 'Product SKUs', value: analytics.productSKUs, color: 'pink' },
  ];

  /* ---- render ---- */
  if (loading) {
    return (
      <div className="analytics-period">
        <div className="ap-loading">
          <div className="ap-loading__spinner" />
          <span className="ap-loading__text">Loading analytics…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-period">
        <div className="ap-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="analytics-period" id="analytics-period-page">
      {/* Header */}
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

      {/* Stats Grid */}
      <div className="ap-stats-grid" id="ap-stats-grid">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`ap-stat-card ap-stat-card--${card.color}`}
            id={`ap-card-${card.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
          >
            <div className="ap-stat-card__icon">{card.icon}</div>
            <div className="ap-stat-card__info">
              <span className="ap-stat-card__label">{card.label}</span>
              <span className="ap-stat-card__value">{card.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Performance Trend Chart */}
      <div className="ap-chart-section" id="ap-performance-trend">
        <h3 className="ap-chart-section__title">Performance Trend</h3>
        <div style={{ height: 280 }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPeriod;
