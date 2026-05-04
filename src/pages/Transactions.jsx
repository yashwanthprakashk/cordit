import { useState, useEffect, useMemo } from 'react';
import api from '../api';
import socket from '../socket';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const Transactions = () => {
  const [transactions, setTransactions] = useState([]);
  const [scales, setScales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });

  // Filter states
  const [filters, setFilters] = useState({
    from_date: '',
    to_date: '',
    scale_id: '',
    transaction_from: '',
    transaction_to: '',
  });
  const [appliedFilters, setAppliedFilters] = useState({ ...filters });

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    transaction_number: '',
    scale_id: '',
    weight: '',
    unit: 'kg',
    lot_number: '',
    product_name: '',
    tracking_id: '',
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [trackingError, setTrackingError] = useState('');

  // scale-additional state
  const [showScaleModal, setShowScaleModal] = useState(false);
  const [scaleForm, setScaleForm] = useState({ scale_id: '', serial_number: '', model_number: '' });
  const [submittingScale, setSubmittingScale] = useState(false);
  const [scaleError, setScaleError] = useState('');

  // Fetch scales for dropdown
  const fetchScales = async () => {
    try {
      const res = await api.get('/scales');
      setScales(res.data);
    } catch (err) {
      console.error('Failed to fetch scales', err);
    }
  };

  useEffect(() => {
    fetchScales();
  }, []);

  const fetchTransactions = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: pagination.limit,
        ...(appliedFilters.from_date && { from_date: appliedFilters.from_date }),
        ...(appliedFilters.to_date && { to_date: appliedFilters.to_date }),
        ...(appliedFilters.scale_id && { scale_id: appliedFilters.scale_id }),
        ...(appliedFilters.transaction_from && { transaction_from: appliedFilters.transaction_from }),
        ...(appliedFilters.transaction_to && { transaction_to: appliedFilters.transaction_to }),
      });
      const res = await api.get(`/transactions?${params}`);
      setTransactions(res.data.data);
      setPagination(res.data.pagination);
    } catch {
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions(pagination.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters, pagination.page]);

  const txnMarkers = useMemo(() => {
    const markers = {};

    // detect duplicates by transaction_number
    const dupCounts = {};
    transactions.forEach(t => {
      const key = t.transaction_number || '';
      dupCounts[key] = (dupCounts[key] || 0) + 1;
    });
    transactions.forEach(t => {
      if (dupCounts[t.transaction_number] > 1) {
        markers[t.id] = { type: 'duplicate', count: dupCounts[t.transaction_number] };
      }
    });

    // detect missing sequence gaps per scale (best-effort within current page)
    const byScale = {};
    transactions.forEach(t => {
      (byScale[t.scale_id] = byScale[t.scale_id] || []).push(t);
    });
    Object.values(byScale).forEach(arr => {
      arr.sort((a, b) => {
        const na = parseInt((a.transaction_number || '').replace(/\D/g, ''), 10) || 0;
        const nb = parseInt((b.transaction_number || '').replace(/\D/g, ''), 10) || 0;
        return na - nb;
      });
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1];
        const curr = arr[i];
        const prevNum = parseInt((prev.transaction_number || '').replace(/\D/g, ''), 10) || 0;
        const currNum = parseInt((curr.transaction_number || '').replace(/\D/g, ''), 10) || 0;
        if (currNum > prevNum + 1) {
          if (!markers[curr.id] || markers[curr.id].type !== 'duplicate') {
            markers[curr.id] = { type: 'missing', count: currNum - prevNum - 1 };
          }
        }
      }
    });

    return markers;
  }, [transactions]);

  useEffect(() => {
    socket.on('newTransaction', () => {
      fetchTransactions(pagination.page);
    });
    return () => {
      socket.off('newTransaction');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  const applyFilters = () => {
    setAppliedFilters({ ...filters });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const resetFilters = () => {
    const empty = {
      from_date: '',
      to_date: '',
      scale_id: '',
      transaction_from: '',
      transaction_to: '',
    };
    setFilters(empty);
    setAppliedFilters(empty);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  // Export to CSV
  const exportToCSV = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        export: 'true',
        ...(appliedFilters.from_date && { from_date: appliedFilters.from_date }),
        ...(appliedFilters.to_date && { to_date: appliedFilters.to_date }),
        ...(appliedFilters.scale_id && { scale_id: appliedFilters.scale_id }),
        ...(appliedFilters.transaction_from && { transaction_from: appliedFilters.transaction_from }),
        ...(appliedFilters.transaction_to && { transaction_to: appliedFilters.transaction_to }),
      });
      const res = await api.get(`/transactions?${params}`);
      const data = res.data;

      const exportData = data.map(t => ({
        Date: t.date,
        Time: t.time,
        Weight: t.weight,
        Unit: t.unit,
        'Lot number': t.lot_number,
        Notes: t.notes,
        'Product Name': t.product_name,
        'Scale ID': t.scale_id,
        'Scale Serial Number': t.scale_serial_number,
        'Scale Model Number': t.scale_model_number,
        'Txn Number': t.transaction_number,
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
      XLSX.writeFile(wb, `transactions_${new Date().toISOString().slice(0,10)}.csv`, { bookType: 'csv' });
      toast.success('Exported successfully');
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  // Form handling
  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Scale form handling
  const handleScaleInput = (e) => {
    setScaleForm({ ...scaleForm, [e.target.name]: e.target.value });
  };

  const handleScaleSubmit = async (e) => {
    e.preventDefault();
    setSubmittingScale(true);
    setScaleError('');
    try {
      const res = await api.post('/scales', scaleForm);
      toast.success('Scale added');
      setShowScaleModal(false);
      // refresh scale list and select new one
      await fetchScales();
      setFormData(prev => ({ ...prev, scale_id: scaleForm.scale_id }));
      setScaleForm({ scale_id: '', serial_number: '', model_number: '' });
    } catch (err) {
      setScaleError(err.response?.data?.error || 'Failed to add scale');
    } finally {
      setSubmittingScale(false);
    }
  };

  const checkTrackingId = async (tracking_id) => {
    if (!tracking_id) return true;
    try {
      const res = await api.get(`/transactions?tracking_id=${tracking_id}&limit=1`);
      return res.data.data.length === 0;
    } catch {
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    if (parseFloat(formData.weight) <= 0) {
      toast.error('Weight must be positive');
      setSubmitting(false);
      return;
    }
    const isUnique = await checkTrackingId(formData.tracking_id);
    if (!isUnique) {
      setTrackingError('Tracking ID already exists');
      setSubmitting(false);
      return;
    }
    try {
      await api.post('/transactions', formData);
      toast.success('Transaction added');
      setShowModal(false);
      fetchTransactions(pagination.page);
      setFormData({
        transaction_number: '',
        scale_id: '',
        weight: '',
        unit: 'kg',
        lot_number: '',
        product_name: '',
        tracking_id: '',
        notes: ''
      });
      setTrackingError('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && transactions.length === 0) return <LoadingSpinner />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>Transactions</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>New Entry</button>
      </div>

      {/* Filter Section */}
      <div className="table-container" style={{ marginBottom: '1.5rem', padding: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          <div>
            <label>Date From</label>
            <input type="date" name="from_date" value={filters.from_date} onChange={handleFilterChange} className="filter-input" />
          </div>
          <div>
            <label>Date To</label>
            <input type="date" name="to_date" value={filters.to_date} onChange={handleFilterChange} className="filter-input" />
          </div>
          <div>
            <label>Scale</label>
            <select name="scale_id" value={filters.scale_id} onChange={handleFilterChange} className="filter-input">
              <option value="">All</option>
              {scales.map(s => (
                <option key={s.scale_id} value={s.scale_id}>{s.scale_id}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Transaction # From</label>
            <input type="number" name="transaction_from" value={filters.transaction_from} onChange={handleFilterChange} className="filter-input" placeholder="e.g., 500" />
          </div>
          <div>
            <label>Transaction # To</label>
            <input type="number" name="transaction_to" value={filters.transaction_to} onChange={handleFilterChange} className="filter-input" placeholder="e.g., 1000" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
          <button className="btn btn-primary" onClick={applyFilters}>Apply Filters</button>
          <button className="btn" onClick={resetFilters}>Reset</button>
          <button className="btn btn-primary" onClick={exportToCSV} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Download CSV'}
          </button>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Time</th>
              <th>Weight</th>
              <th>Unit</th>
              <th>Lot number</th>
              <th>Notes</th>
              <th>Product Name</th>
              <th>Scale ID</th>
              <th>Scale Serial Number</th>
              <th>Scale Model Number</th>
              <th>Txn Number</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(tx => (
              <tr key={tx.id}>
                <td>{new Date(tx.date).toISOString().split('T')[0]}</td>
                <td>{tx.time}</td>
                <td>{tx.weight}</td>
                <td>{tx.unit}</td>
                <td>{tx.lot_number}</td>
                <td>{tx.notes}</td>
                <td>{tx.product_name}</td>
                <td>{tx.scale_id}</td>
                <td>{tx.scale_serial_number}</td>
                <td>{tx.scale_model_number}</td>
                <td>{tx.transaction_number}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={pagination.page}
          totalPages={pagination.pages}
          onPageChange={handlePageChange}
        />
      </div>

      {/* New Entry Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Entry">
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label>Transaction Number</label>
            <input type="text" name="transaction_number" value={formData.transaction_number} onChange={handleInputChange} required style={{ width: '100%', padding: '0.5rem' }} placeholder="e.g., TN001" />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>Scale ID</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <select name="scale_id" value={formData.scale_id} onChange={handleInputChange} required style={{ flex: 1, padding: '0.5rem' }}>
                <option value="">Select Scale</option>
                {scales.map(s => (
                  <option key={s.scale_id} value={s.scale_id}>{s.scale_id}</option>
                ))}
              </select>
              <button type="button" className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem' }} onClick={() => setShowScaleModal(true)}>+ Add</button>
            </div>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>Weight</label>
            <input type="number" step="0.01" name="weight" value={formData.weight} onChange={handleInputChange} required style={{ width: '100%', padding: '0.5rem' }} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>Unit</label>
            <select name="unit" value={formData.unit} onChange={handleInputChange} style={{ width: '100%', padding: '0.5rem' }}>
              <option value="kg">kg</option>
              <option value="lb">lb</option>
              <option value="g">g</option>
            </select>
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>Lot Number</label>
            <input type="text" name="lot_number" value={formData.lot_number} onChange={handleInputChange} required style={{ width: '100%', padding: '0.5rem' }} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>Product Name</label>
            <input type="text" name="product_name" value={formData.product_name} onChange={handleInputChange} required style={{ width: '100%', padding: '0.5rem' }} />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>Tracking ID</label>
            <input type="text" name="tracking_id" value={formData.tracking_id} onChange={handleInputChange} style={{ width: '100%', padding: '0.5rem' }} />
            {trackingError && <span style={{ color: 'red', fontSize: '0.875rem' }}>{trackingError}</span>}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>Notes</label>
            <textarea name="notes" value={formData.notes} onChange={handleInputChange} style={{ width: '100%', padding: '0.5rem' }} rows="3"></textarea>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button type="button" className="btn" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Transaction'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Scale creation modal */}
      <Modal isOpen={showScaleModal} onClose={() => setShowScaleModal(false)} title="Add Scale">
        <form onSubmit={handleScaleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label>Scale ID</label>
            <input
              type="text"
              name="scale_id"
              value={scaleForm.scale_id}
              onChange={handleScaleInput}
              required
              style={{ width: '100%', padding: '0.5rem' }}
              placeholder="e.g., SCALE-004"
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>Serial Number</label>
            <input
              type="text"
              name="serial_number"
              value={scaleForm.serial_number}
              onChange={handleScaleInput}
              required
              style={{ width: '100%', padding: '0.5rem' }}
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label>Model Number</label>
            <input
              type="text"
              name="model_number"
              value={scaleForm.model_number}
              onChange={handleScaleInput}
              required
              style={{ width: '100%', padding: '0.5rem' }}
            />
          </div>
          {scaleError && <div style={{ color: 'red', marginBottom: '1rem' }}>{scaleError}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
            <button type="button" className="btn" onClick={() => setShowScaleModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submittingScale}>
              {submittingScale ? 'Adding...' : 'Add Scale'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Transactions;