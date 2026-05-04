import { NavLink } from 'react-router-dom';

const Sidebar = () => {
  const navItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/transactions', label: 'Scale Entries' },
    // { path: '/alerts', label: 'Alerts' },
    { path: '/reports', label: 'Reports' },
  ];

  return (
    <div className="sidebar">
      <h2>Weighing Dashboard</h2>
      <nav>
        <ul>
          {navItems.map(item => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;