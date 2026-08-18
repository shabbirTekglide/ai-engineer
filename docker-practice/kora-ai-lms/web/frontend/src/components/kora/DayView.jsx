import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import {
  format,
  isSameDay,
  startOfHour,
  addHours
} from 'date-fns';

export function DayView({ date }) {
  const day = date;

  const events = [
    {
      date: startOfHour(addHours(day, 10)),
      time: '10:00',
      title: 'Midterm Exam',
      class: 'Biology 101',
      color: 'bg-red-500',
    },
    {
      date: startOfHour(addHours(day, 14)),
      time: '14:00',
      title: 'Project Deadline',
      class: 'World History',
      color: 'bg-blue-500',
    },
  ];

  const timeSlots = Array.from({ length: 16 }, (_, i) => {
    const hour = i + 7;
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour} ${period}`;
  });

  const formatEventTime = (time) => {
    const [hourString, minute] = time.split(':');
    let hour = parseInt(hourString, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${minute} ${period}`;
  };

  return (
    <div className="p-4">
      <div className="grid grid-cols-[60px_1fr] gap-x-2">
        <div></div>
        <div className="text-center">
            <p className="text-sm text-muted-foreground">
            {format(day, 'EEE')}
            </p>
            <p
            className={`font-semibold text-lg ${
                isSameDay(day, new Date()) ? 'text-primary' : ''
            }`}
            >
            {format(day, 'd')}
            </p>
        </div>
      </div>
      <div className="grid grid-cols-[60px_1fr] gap-x-2 mt-4">
        <div className="space-y-2">
          {timeSlots.map((time) => (
            <div key={time} className="h-16 text-xs text-muted-foreground text-right pr-2">
              {time}
            </div>
          ))}
        </div>
        <div className="relative border-l border-r border-border">
          {events.map((event, index) => {
            if (!isSameDay(day, event.date)) return null;

            const top = (parseInt(event.time.split(':')[0]) - 7) * 4; // 4rem per hour (h-16)

            return (
              <div
                key={index}
                className="absolute w-[calc(100%-1rem)]"
                style={{
                  left: `0.5rem`,
                  top: `${top}rem`,
                }}
              >
                <Card className={`${event.color} text-primary-foreground p-2`}>
                    <p className="text-xs font-bold">{event.title}</p>
                    <p className="text-xs">{event.class}</p>
                    <p className="text-xs">{formatEventTime(event.time)}</p>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}