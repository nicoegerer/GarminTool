import { NavLink, Route, Routes } from "react-router-dom";
import "./App.css";
import DashboardPage from "./pages/DashboardPage";
import ActivitiesPage from "./pages/ActivitiesPage";
import ActivityDetailPage from "./pages/ActivityDetailPage";
import TrendsPage from "./pages/TrendsPage";
import GearPage from "./pages/GearPage";
import PlansPage from "./pages/PlansPage";
import SettingsPage from "./pages/SettingsPage";

const NAV_ITEMS = [
  { to: "/", label: "Heute", end: true },
  { to: "/activities", label: "Aktivitäten", end: false },
  { to: "/trends", label: "Trends", end: false },
  { to: "/gear", label: "Gear", end: false },
  { to: "/plans", label: "Trainingspläne", end: false },
  { to: "/settings", label: "Einstellungen", end: false },
];

export default function App() {
  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">🏃 Garmin Manager</div>
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} className={({ isActive }) => (isActive ? "active" : "")}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/activities" element={<ActivitiesPage />} />
          <Route path="/activities/:id" element={<ActivityDetailPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/gear" element={<GearPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
