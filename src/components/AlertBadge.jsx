const AlertBadge = ({ severity }) => {
  const badgeClass = severity === 'critical' ? 'badge critical' : 'badge warning';
  return <span className={badgeClass}>{severity}</span>;
};

export default AlertBadge;