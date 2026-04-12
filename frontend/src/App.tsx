import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import DisclaimerModal from './components/DisclaimerModal';
import FirstRunWizard from './components/FirstRunWizard';
import ProjectList from './pages/ProjectList';
import ProjectDetail from './pages/ProjectDetail';
import Settings from './pages/Settings';
import { api } from './api';

export default function App() {
  // null = still checking, true = show wizard, false = skip wizard
  const [showWizard, setShowWizard] = useState<boolean | null>(null);

  useEffect(() => {
    api.settings
      .get()
      .then((s: any) => {
        setShowWizard(!s.anthropicApiKey);
      })
      .catch(() => {
        // Backend not ready — skip wizard, let user configure later via Settings
        setShowWizard(false);
      });
  }, []);

  function handleWizardComplete(_keyConfigured: boolean) {
    setShowWizard(false);
  }

  // Still checking settings — show nothing to avoid flash
  if (showWizard === null) return null;

  return (
    <>
      <DisclaimerModal />
      {showWizard ? (
        <FirstRunWizard onComplete={handleWizardComplete} />
      ) : (
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<ProjectList />} />
            <Route path="projects/:id" element={<ProjectDetail />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </>
  );
}
