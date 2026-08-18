import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Calendar, Clock, User, BookOpen, CalendarDays } from 'lucide-react';

/**
 * ParsedSyllabusViewer Component
 * ==============================
 * 
 * Displays parsed syllabus data from the new JavaScript syllabus parser
 * Shows structured course information and events
 */
export default function ParsedSyllabusViewer({ syllabusData }) {
  if (!syllabusData) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No parsed syllabus data available.
        </CardContent>
      </Card>
    );
  }

  const { 
    className, 
    term, 
    meetingDays, 
    startTime, 
    endTime, 
    instructor, 
    events = [] 
  } = syllabusData;

  // Group events by type for better display
  const eventsByType = events.reduce((acc, event) => {
    const type = event.type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(event);
    return acc;
  }, {});

  const eventTypeColors = {
    assignment: 'bg-blue-100 text-blue-800',
    quiz: 'bg-green-100 text-green-800',
    exam: 'bg-red-100 text-red-800',
    midterm: 'bg-orange-100 text-orange-800',
    final: 'bg-purple-100 text-purple-800',
    project: 'bg-indigo-100 text-indigo-800',
    presentation: 'bg-pink-100 text-pink-800',
    lab: 'bg-yellow-100 text-yellow-800',
    study: 'bg-gray-100 text-gray-800',
    other: 'bg-gray-100 text-gray-800'
  };

  const formatDate = (dateString) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return dateString;
    }
  };

  const formatMeetingDays = (days) => {
    if (!days || days.length === 0) return 'Not specified';
    return days.join(', ');
  };

  const formatTimeRange = (start, end) => {
    if (!start || !end) return 'Not specified';
    return `${start} - ${end}`;
  };

  return (
    <div className="space-y-6">
      {/* Course Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Course Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">{className}</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{term || 'Term not specified'}</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{instructor || 'Instructor not specified'}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{formatTimeRange(startTime, endTime)}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{formatMeetingDays(meetingDays)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Events Overview */}
      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Course Events ({events.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(eventsByType).map(([type, typeEvents]) => (
                <div key={type} className="space-y-2">
                  <h4 className="font-medium capitalize flex items-center gap-2">
                    <Badge className={eventTypeColors[type] || eventTypeColors.other}>
                      {type} ({typeEvents.length})
                    </Badge>
                  </h4>
                  
                  <div className="space-y-2 ml-4">
                    {typeEvents.map((event, index) => (
                      <div key={index} className="border rounded-lg p-3 bg-gray-50">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <h5 className="font-medium text-sm">{event.title}</h5>
                            {event.location && (
                              <p className="text-xs text-muted-foreground mt-1">
                                📍 {event.location}
                              </p>
                            )}
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <div>{formatDate(event.start)}</div>
                            {event.end !== event.start && (
                              <div>to {formatDate(event.end)}</div>
                            )}
                          </div>
                        </div>
                        
                        {event.reminders && event.reminders.length > 0 && (
                          <div className="mt-2 flex gap-1">
                            {event.reminders.map((reminder, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {reminder.minutesBefore}min before
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Statistics */}
      {events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{events.length}</div>
                <div className="text-sm text-muted-foreground">Total Events</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {events.filter(e => e.type === 'assignment').length}
                </div>
                <div className="text-sm text-muted-foreground">Assignments</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {events.filter(e => ['exam', 'midterm', 'final', 'quiz'].includes(e.type)).length}
                </div>
                <div className="text-sm text-muted-foreground">Exams & Quizzes</div>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {events.filter(e => e.type === 'project').length}
                </div>
                <div className="text-sm text-muted-foreground">Projects</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
