import { useState, useEffect } from 'react';
import api from '../api';
import socket from '../socket';
import AlertBadge from '../components/AlertBadge';
import LoadingSpinner from '../components/LoadingSpinner';

const Alerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAlerts = async () => {
    try {
      const res = await api.get('/alerts');
      setAlerts(res.data);
    } catch (err) {
      console.error('Failed to load alerts', err);
      setError('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  const resolveAlert = async (id) => {
    try {
      await api.put(`/alerts/${id}/resolve`);
      fetchAlerts(); // refresh after resolve
    } catch (err) {
      console.error('Failed to resolve alert', err);
      alert('Failed to resolve alert');
    }
  };

  useEffect(() => {
    fetchAlerts();

    socket.on('newAlert', fetchAlerts);

    return () => {
      socket.off('newAlert');
    };
  }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="error">{error}</div>;

  return (
    <div>
      <h1 style={{ marginBottom: '2rem' }}>Alerts</h1>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Scale</th>
              <th>Type</th>
              <th>Message</th>
              <th>Severity</th>
              <th>Created</th>
              <th>Resolved</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map(alert => (
              <tr key={alert.id}>
                <td>{alert.scale_id}</td>
                <td>{alert.type}</td>
                <td>{alert.message}</td>
                <td><AlertBadge severity={alert.severity} /></td>
                <td>{new Date(alert.created_at).toLocaleString()}</td>
                <td>{alert.resolved ? 'Yes' : 'No'}</td>
                <td>
                  {!alert.resolved && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => resolveAlert(alert.id)}
                    >
                      Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Alerts;