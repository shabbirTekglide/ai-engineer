import { useEffect, useState } from 'react';
import { X, Clock, Bell } from 'lucide-react';
import { Button } from '../ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';

const ClockAlarmDialog = ({ 
  open = false, 
  onClose,
  alarmTitle = "Study Reminder",
  alarmTime = "2:00 PM",
  alarmDescription = "Time for your scheduled study session"
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every second
  useEffect(() => {
    if (open) {
      const timer = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [open]);

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-white border-0 shadow-xl">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Bell className="h-5 w-5 text-blue-600" />
            Alarm Triggered
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col items-center text-center space-y-6 py-4">
          {/* Big Clock */}
          <div className="relative">
            <div className="w-48 h-48 rounded-full border-4 border-blue-200 bg-blue-50 flex items-center justify-center shadow-lg">
              <div className="text-center">
                <div className="text-3xl font-bold text-gray-900 mb-1">
                  {formatTime(currentTime)}
                </div>
                <div className="text-sm text-gray-600">
                  {formatDate(currentTime)}
                </div>
              </div>
            </div>
            {/* Animated ringing effect */}
            <div className="absolute inset-0 rounded-full border-4 border-blue-300 animate-ping opacity-20"></div>
          </div>

          {/* Alarm Information */}
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2">
              <Clock className="h-5 w-5 text-blue-600" />
              <h3 className="text-xl font-semibold text-gray-900">
                {alarmTitle}
              </h3>
            </div>
            
            <p className="text-gray-600 text-lg font-medium">
              Scheduled for: {alarmTime}
            </p>
            
            <p className="text-gray-500 max-w-sm">
              {alarmDescription}
            </p>
          </div>

          {/* Dismiss Button */}
          <Button
            onClick={onClose}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-lg font-semibold"
          >
            Dismiss Alarm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ClockAlarmDialog;