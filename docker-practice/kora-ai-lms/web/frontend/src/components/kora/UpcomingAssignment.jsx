import {
  Card,
  CardContent,
  CardHeader,
  CardFooter,
  CardTitle,
} from '../ui/Card';
import { Separator } from '../ui/Seperator';
import { Button } from '../ui/Button';
import { Link } from 'react-router-dom';
import { useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { formatDateTime } from '../../utils/utilities';

export function UpcomingAssignments() {
  const { calendar } = useSelector(state => state.calendar);
  
  // Filter only upcoming events (start date is in the future)
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return calendar.filter(item => {
      // Ensure item.start is a valid date
      const startDate = new Date(item.start);
      return startDate > now;
    });
  }, [calendar]);

  console.log('calendar', calendar);
  console.log('upcomingEvents', upcomingEvents);

  return (
    <Card className="shadow-sm border">
      <CardHeader>
        <CardTitle className="text-xl">Upcoming</CardTitle>
      </CardHeader>
      <CardContent>
        {upcomingEvents.length > 0 ? (
          <ul className="space-y-3">
            {upcomingEvents.map((item, index) => (
              <li key={item._id || item.id || index}>
                <div className="flex md:justify-between md:items-center py-2 flex-col md:flex-row space-y-4 md:space-y-0 gap-2">

  <div className="flex-1 min-w-0">
    <p className="font-semibold break-normal">
      {item.title}
    </p>

    {item.class && (
      <p className="text-sm text-muted-foreground break-normal">
        {item.class}
      </p>
    )}
  </div>

  <div className="text-right shrink-0">
    <p className="text-sm text-muted-foreground font-medium">
      {formatDateTime(item.start)}
    </p>

    {item.location && (
      <p className="text-xs text-muted-foreground">
        {item.location}
      </p>
    )}
  </div>

</div>
                {index < upcomingEvents.length - 1 && <Separator />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No upcoming assignments.</p>
        )}
      </CardContent>
      {upcomingEvents.length > 0 && (
        <CardFooter className="flex justify-center pt-4">
          <Link to="/student/calendar">
            <Button variant="link">View More</Button>
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}