import { useEffect, useRef } from 'react';
import './App.css';
import { Outlet } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { useDispatch, useSelector } from 'react-redux';
import { fetchClasses } from './store/slicers/classSlice';
import { fetchCalendar } from './store/slicers/calendarSlice';
import { fetchSettings } from './store/slicers/settingSlice';
import { useAlarm } from './components/Dashboardlayout';
import { checkStudentProfileCreated, getStudentProfile } from './store/slicers/studProfileSlice';
import { getSubscriptionInfo } from './store/slicers/authSlice';
import { getTermsConditions } from './store/slicers/termsConditionSlice';
import 'react-time-picker/dist/TimePicker.css';
import 'react-clock/dist/Clock.css';

function App() {
  const dispatch = useDispatch();
  const { token } = useSelector((s) => s.auth);
  const { profileExists } = useSelector((s) => s.studentprofile);
  const calendar = useSelector((s) => s.calendar.calendar); // <-- use Redux calendar
  const { triggerAlarm } = useAlarm();

  // Track scheduled timers + which triggers already fired
  const timeoutsRef = useRef([]);         // array of timeout ids
  const firedRef = useRef(new Set());     // keys that have already fired

  // 1) Initial data fetch when token changes
  useEffect(() => {
    if (token) {
      dispatch(getStudentProfile());
      dispatch(checkStudentProfileCreated());
      dispatch(getTermsConditions());
      dispatch(fetchClasses());
      dispatch(fetchCalendar());
      dispatch(fetchSettings());
      dispatch(getSubscriptionInfo());
    } else {
      console.log('[App] No token → skipping fetch');
    }
  }, [token, dispatch]);

  // Emit the alarm (ClockAlarmDialog opens via Dashboardlayout)
  const handleTimerComplete = (alarmData) => {
    console.log('[Scheduler] 🔔 handleTimerComplete fired with:', alarmData);
    triggerAlarm(alarmData);
  };

  // Build triggers (reminders + start)
  const buildTriggers = (events) => {
    const now = Date.now();
    const triggers = [];

    for (const ev of events || []) {
      const startMs = Date.parse(ev?.start);
      console.log('event startMs', startMs);
      if (!Number.isFinite(startMs)) {
        console.warn('[Scheduler] Skipping event with invalid start:', ev);
        continue;
      }

      // Always schedule a START trigger, even if there are reminders
      const startKey = `${ev._id || 'ev'}::START::${startMs}`;
      triggers.push({
        key: startKey,
        fireAt: startMs,
        event: ev,
        reminder: null,
        fromReminder: false,
        kind: 'start',
      });

      // Add all REMINDER triggers (if any)
      const reminders = Array.isArray(ev.reminders) ? ev.reminders : [];
      for (const r of reminders) {
        const minutes = Number(r?.minutesBefore);
        if (!Number.isFinite(minutes)) {
          console.warn('[Scheduler] Skipping reminder (invalid minutesBefore):', r, 'event:', ev._id);
          continue;
        }
        const fireAt = startMs - minutes * 60_000;
        const key = `${ev._id || 'ev'}::REM::${r._id || minutes}::${startMs}`;
        triggers.push({
          key,
          fireAt,
          event: ev,
          reminder: r,
          fromReminder: true,
          kind: 'reminder',
        });
      }
    }

    // Filter out past and duplicates (by key), then sort by soonest first
    const unique = new Map();
    for (const t of triggers) {
      if (!unique.has(t.key)) unique.set(t.key, t);
    }

    const future = [...unique.values()]
      .filter((t) => t.fireAt > now && !firedRef.current.has(t.key))
      .sort((a, b) => a.fireAt - b.fireAt);

    console.log('[Scheduler] buildTriggers:', {
      totalRaw: triggers.length,
      unique: unique.size,
      future: future.length,
      nowISO: new Date(now).toISOString(),
      sample: future.slice(0, 5).map((t) => ({
        key: t.key,
        kind: t.kind,
        title: t.event?.title,
        fireAtISO: new Date(t.fireAt).toISOString(),
        inSec: Math.round((t.fireAt - now) / 1000),
      })),
    });

    return future;
  };

  // Schedule triggers when calendar changes
  useEffect(() => {
    // Clear any previously scheduled timers
    timeoutsRef.current.forEach((id) => clearTimeout(id));
    timeoutsRef.current = [];
    console.log('[Scheduler] Cleared previous timers');

    if (!Array.isArray(calendar) || calendar.length === 0) {
      console.log('[Scheduler] No events in Redux calendar → nothing to schedule');
      return;
    }

    // Build from Redux calendar
    const futureTriggers = buildTriggers(calendar);

    const MAX_DELAY = 2_147_483_647; // ~24.8 days
    for (const t of futureTriggers) {
      const delay = t.fireAt - Date.now();
      if (delay <= 0) continue;
      if (delay > MAX_DELAY) {
        console.warn('[Scheduler] Skipping very long timer (>~24d). Consider a poller for long horizons:', t);
        continue;
      }

      console.log(
        `[Scheduler] Scheduling key=${t.key} (${t.kind}) at ${new Date(t.fireAt).toISOString()} (in ~${Math.round(
          delay / 1000
        )}s)`
      );

      const id = setTimeout(() => {
        // mark as fired before any state change to avoid duplicates
        firedRef.current.add(t.key);

        const alarmData = {
          title: t.event?.title || (t.kind === 'start' ? 'Event Started' : 'Event Reminder'),
          scheduledTime: new Date(t.event?.start).toLocaleString(),
          description: t.fromReminder
            ? `Reminder: ${t.event?.title || 'Event'} starting soon${t.event?.location ? ` at ${t.event.location}` : ''}${t.event?.class ? ` • ${t.event.class}` : ''
            }`
            : `Event starting now${t.event?.location ? ` at ${t.event.location}` : ''}${t.event?.class ? ` • ${t.event.class}` : ''
            }`,
          raw: { event: t.event, reminder: t.reminder, fireAt: t.fireAt, kind: t.kind },
        };

        console.log('[Scheduler] 🔥 Trigger firing:', { key: t.key, kind: t.kind, alarmData });
        handleTimerComplete(alarmData);
      }, delay);

      timeoutsRef.current.push(id);
    }

    // Cleanup when calendar changes/unmounts
    return () => {
      timeoutsRef.current.forEach((id) => clearTimeout(id));
      timeoutsRef.current = [];
      console.log('[Scheduler] Cleanup: cleared timers');
    };
  }, [calendar]); // re-evaluate whenever Redux calendar changes

  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="flex flex-col min-h-screen">
        <main>
          <Outlet />
        </main>
      </div>
    </>
  );
}

export default App;

