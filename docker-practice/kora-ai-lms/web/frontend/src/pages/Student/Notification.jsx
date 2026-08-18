import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Bell, CheckCircle } from 'lucide-react';

// ✅ Use the thunks from settingSlice only
import {
  fetchSettings,
  toggleNotification,
  toggleStudyReminder,
} from '../../store/slicers/settingSlice';
import { useAlarm } from '../../components/Dashboardlayout';

const NotificationsPage = () => {
  const dispatch = useDispatch();
  const { triggerAlarm } = useAlarm();

  // ✅ Select from the correct slice: state.setting
  const { notificationEnabled, eventReminders, loading, error } = useSelector(
    (state) => state.setting
  );

  // ✅ Local UI state mirrors store values
  const [notificationsEnabled, setNotificationsEnabled] = useState(notificationEnabled);
  const [categories, setCategories] = useState({
    studyReminders: eventReminders,
  });

  // ✅ Keep local state in sync with store values
  useEffect(() => {
    setNotificationsEnabled(Boolean(notificationEnabled));
    setCategories({
      studyReminders: Boolean(eventReminders),
    });
  }, [notificationEnabled, eventReminders]);

  const handleTimerComplete = () => {
    triggerAlarm({
      title: 'Study Session Complete',
      scheduledTime: '2:00 PM',
      description: 'Your 25-minute study session has ended. Take a 5-minute break!',
    });
  };

  // ✅ These thunks in your slice don't accept args; they toggle server-side
  const handleMainToggle = () => {
    setNotificationsEnabled((prev) => !prev);
    dispatch(toggleNotification());
  };

  const handleCategoryToggle = (category) => {
    const newValue = !categories[category];
    setCategories((prev) => ({ ...prev, [category]: newValue }));

    switch (category) {
      case 'studyReminders':
        dispatch(toggleStudyReminder());
        break;
      default:
        // no-op
        break;
    }
  };

  const getCategoryIcon = (category) => {
    const icons = { studyReminders: '📚' };
    return icons[category];
  };

  const getCategoryDescription = (category) => {
    const descriptions = {
      studyReminders: 'Reminders for upcoming study sessions and deadlines',
    };
    return descriptions[category];
  };

  return (
    <>
      {/* <button onClick={handleTimerComplete}>Complete Session</button> */}

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="md:text-center mb-8">
            <div className="flex items-center md:justify-center gap-3 mb-4">
              <Bell className="h-8 w-8 text-blue-600" />
              <h1 className="text-3xl font-bold text-gray-900">Notifications</h1>
            </div>
            <p className="text-gray-600">Manage how and when you receive notifications</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-200">
            {/* Enable Notifications */}
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Enable Notifications</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Receive notifications about your study progress and updates
                  </p>
                </div>
                <button
                  onClick={handleMainToggle}
                  disabled={loading}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    notificationsEnabled ? 'bg-blue-600' : 'bg-gray-200'
                  } ${loading ? 'opacity-60 pointer-events-none' : ''}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              {error && (
                <p className="mt-2 text-sm text-red-500">
                  {typeof error === 'string' ? error : 'Failed to update settings'}
                </p>
              )}
            </div>

            {/* Categories */}
            {notificationsEnabled && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Categories</h2>
                <p className="text-sm text-gray-600 mb-6">Choose what you get notified about</p>

                <div className="space-y-6">
                  {Object.entries(categories).map(([category, enabled]) => (
                    <div key={category} className="flex items-start justify-between">
                      <div className="flex items-start space-x-4 flex-1">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-blue-50 text-blue-700 text-lg">
                          {getCategoryIcon(category)}
                        </div>
                        <div className="flex-1">
                          <h3 className="text-sm font-medium text-gray-900 capitalize">
                            {category.replace(/([A-Z])/g, ' $1').toLowerCase()}
                          </h3>
                          <p className="text-sm text-gray-600 mt-1">
                            {getCategoryDescription(category)}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCategoryToggle(category)}
                        disabled={loading}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          enabled ? 'bg-blue-600' : 'bg-gray-200'
                        } ${loading ? 'opacity-60 pointer-events-none' : ''}`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Save Status */}
          <div className="mt-6 flex items-center justify-center text-sm text-gray-600">
            <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
            Preferences saved automatically
          </div>

          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500">
              Notification settings will apply across all your devices
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default NotificationsPage;
