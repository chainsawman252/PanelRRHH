import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import CrearEmpresa from './pages/Crearempresa';
import Signup from './pages/Signup';
import Dashboard from './pages/dashboard';

export default function App() {
  return (
    <Routes>
  <Route path="/login" element={<Login />} />
  <Route path="/crear-empresa" element={<CrearEmpresa />} />
  <Route path="/signup" element={<Signup />} />
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/" element={<Navigate to="/login" replace />} />
  <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}