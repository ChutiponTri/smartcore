import { Navigate, Route, Routes } from 'react-router-dom';
import { PlayScreen } from './games/PlayScreen';
import { Calibrate } from './therapist/Calibrate';
import { Connect } from './therapist/Connect';
import { History } from './therapist/History';
import { LiveMonitor } from './therapist/LiveMonitor';
import { Patients } from './therapist/Patients';
import { SessionSetup } from './therapist/SessionSetup';
import { Summary } from './therapist/Summary';
import { TherapistLayout } from './therapist/TherapistLayout';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/therapist/connect" replace />} />
      <Route path="/therapist" element={<TherapistLayout />}>
        <Route index element={<Navigate to="connect" replace />} />
        <Route path="connect" element={<Connect />} />
        <Route path="patients" element={<Patients />} />
        <Route path="setup" element={<SessionSetup />} />
        <Route path="calibrate" element={<Calibrate />} />
        <Route path="live" element={<LiveMonitor />} />
        <Route path="summary" element={<Summary />} />
        <Route path="summary/:id" element={<Summary />} />
        <Route path="history" element={<History />} />
      </Route>
      <Route path="/play" element={<PlayScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
