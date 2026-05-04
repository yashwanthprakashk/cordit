const StatsCard = ({ title, value, onClick }) => {
  return (
    <div className="stats-card" onClick={onClick} style={onClick ? { cursor: 'pointer' } : {}}>
      <h3>{title}</h3>
      <div className="value">{value}</div>
    </div>
  );
};

export default StatsCard;