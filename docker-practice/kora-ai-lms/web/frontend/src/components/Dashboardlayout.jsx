import { Toaster } from '../components/ui/Toaster';
import { AiAssistant } from '../components/kora/AiAssistantEnhanced';
import { Sidebar } from '../components/kora/Sidebar';
import ClockAlarmDialog from '../components/kora/ClockAlarm';
import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import StudentProfileDialog from './kora/StudentProfileDialog';
import StatusPill from './kora/StatusPill';
import { toggleTrialExpired } from '../store/slicers/authSlice';
import SubscriptionExpiredDialog from './kora/SubscriptionExpiredDialog';
import TermsConditionsDialog from './kora/TermsConditionsDialog';
import { Outlet } from 'react-router-dom'; // ← ADD

export const metadata = {
  title: 'Rubitt Companion',
  description: 'Your AI-powered study partner.',
};

export default function Dashboardlayout() {
  const [alarmOpen, setAlarmOpen] = useState(false);
  const [currentAlarm, setCurrentAlarm] = useState(null);
  const { trialExpired } = useSelector((s) => s.auth);
  const dispatch = useDispatch();

  useEffect(() => {
    const handleAlarmTrigger = (event) => {
      setCurrentAlarm(event.detail);
      setAlarmOpen(true);
    };
    window.addEventListener('triggerAlarm', handleAlarmTrigger);
    return () => window.removeEventListener('triggerAlarm', handleAlarmTrigger);
  }, []);

  const handleCloseAlarm = () => {
    setAlarmOpen(false);
    setCurrentAlarm(null);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="font-body antialiased flex-1 flex bg-background overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col relative overflow-x-hidden">
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
          <StatusPill />
          <AiAssistant />
        </div>
        <Toaster />
        <ClockAlarmDialog
          open={alarmOpen}
          onClose={handleCloseAlarm}
          alarmTitle={currentAlarm?.title || "Study Reminder"}
          alarmTime={currentAlarm?.scheduledTime || "2:00 PM"}
          alarmDescription={currentAlarm?.description || "Time for your scheduled study session"}
        />
        <StudentProfileDialog>
          <button style={{ display: 'none' }} aria-hidden />
        </StudentProfileDialog>
        <TermsConditionsDialog>
          <button style={{ display: 'none' }} aria-hidden />
        </TermsConditionsDialog>
        <SubscriptionExpiredDialog
          open={trialExpired}
          onClose={() => dispatch(toggleTrialExpired(false))}
        />
      </div>
    </div>
  );
}

export const useAlarm = () => {
  const triggerAlarm = (alarmData) => {
    const event = new CustomEvent('triggerAlarm', { detail: alarmData });
    window.dispatchEvent(event);
  };
  return { triggerAlarm };
};