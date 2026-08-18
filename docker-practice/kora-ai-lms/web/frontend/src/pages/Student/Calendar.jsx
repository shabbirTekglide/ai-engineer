import { Button } from "../../components/ui/Button";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Card, CardContent } from "../../components/ui/Card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/Select";
import { Badge } from "../../components/ui/Badge";
import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus, Edit, Trash2 } from "lucide-react";
import { AddEventDialog } from "../../components/kora/AddEventDialog";
import { Link } from "react-router-dom";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { useDispatch, useSelector } from "react-redux";
import {
  createCalendar,
  deleteCalendarEvent,
  fetchCalendar,
  updateCalendar,
} from "../../store/slicers/calendarSlice";
import { getClassLecturesId } from "../../store/slicers/classSlice";
import { toast } from "react-toastify";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/Dialog";
import ConfirmDeletePopup from "../../components/ConfirmDeletePopup";

const localizer = momentLocalizer(moment);

export default function CalendarPage() {
  const { calendar: CalendarData, loading } = useSelector(
    (state) => state.calendar,
  );
  const { classLectureId } = useSelector((state) => state.class);
  const dispatch = useDispatch();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState("month");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [events, setEvents] = useState([]);
  const [selectedClass, setSelectedClass] = useState("all-classes");
  const [filteredEvents, setFilteredEvents] = useState([]);
  // const [buttonDisabled, setButtonDisabled] = useState(true);
  const [open, setOpen] = useState(false);
  const [moreEvents, setMoreEvents] = useState([]);
  const [showDeletePopup, setShowDeletePopup] = useState(false);
  const [eventToDelete, setEventToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const reminderOptions = [
    { value: "1440", label: "1 day before" },
    { value: "2880", label: "2 days before" },
    { value: "4320", label: "3 days before" },
    { value: "20160", label: "2 weeks before" },
    { value: "30240", label: "3 weeks before" },
  ];

  useEffect(() => {
    dispatch(fetchCalendar());
    dispatch(getClassLecturesId());
  }, [dispatch]);

  // useEffect(() => {
  //   let timeoutId;

  //   if (!loading) {
  //     timeoutId = setTimeout(() => {
  //       setButtonDisabled(false);
  //     }, 2000);
  //   } else {
  //     setButtonDisabled(true);
  //   }

  //   return () => {
  //     if (timeoutId) {
  //       clearTimeout(timeoutId);
  //     }
  //   };
  // }, [loading]);

  useEffect(() => {
    if (CalendarData && Array.isArray(CalendarData)) {
      const transformedEvents = CalendarData.map((event) => {
        let hue = 0;
        if (event.classColor) {
          const classColorNum = Number(event.classColor);
          if (
            !isNaN(classColorNum) &&
            classColorNum >= 0 &&
            classColorNum <= 100
          ) {
            hue = (classColorNum % 101) * 3.6;
          }
        }

        return {
          id: event._id,
          title: event.title,
          start: new Date(
            moment.utc(event.start).year(),
            moment.utc(event.start).month(),
            moment.utc(event.start).date(),
            moment.utc(event.start).hour(),
            moment.utc(event.start).minute()
          ),
          end: new Date(
            moment.utc(event.end).year(),
            moment.utc(event.end).month(),
            moment.utc(event.end).date(),
            moment.utc(event.end).hour(),
            moment.utc(event.end).minute()
          ),
          type: event.type || "study",
          class: event.class || "",
          classId: event.classId || "",
          location: event.location || "",
          reminders: event.reminders || [],
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
          color: hue ? `hsl(${hue}, 90%, 50%)` : "#6b7280",
        };
      });
      setEvents(transformedEvents);
      setFilteredEvents(transformedEvents);
    }
  }, [CalendarData]);

  useEffect(() => {
    if (selectedClass === "all-classes") {
      setFilteredEvents(events);
    } else {
      const filtered = events.filter(
        (event) =>
          event.classId === selectedClass || event.class === selectedClass,
      );
      setFilteredEvents(filtered);
    }
  }, [selectedClass, events]);

  const handleClassFilterChange = (classId) => {
    setSelectedClass(classId);
  };

  const handleNavigate = (newDate) => {
    console.log("newDate: ", newDate);
    setCurrentDate(newDate);
  };

  const handleViewChange = (newView) => {
    setView(newView);
  };

  const handleSelectEvent = (event) => {
    setSelectedEvent(event);
  };

  const handleAddEvent = async (newEvent) => {
    console.log("newEvent: ", newEvent);

    try {
      const result = await dispatch(createCalendar(newEvent)).unwrap();
      toast.success(result.message || "Event created successfully");
      console.log("Event created successfully:", result);
      setShowAddDialog(false);
      setSelectedEvent(null);
    } catch (error) {
      console.error("Failed to create event:", error);
      toast.error(
        error.response.data.errors[0] ||
        "Failed to create event. Please try again.",
      );
    }
  };

  const handleUpdateEvent = async (updatedEvent) => {
    console.log("updatedEvent", updatedEvent);

    try {
      const result = await dispatch(
        updateCalendar({
          eventId: updatedEvent.id,
          data: updatedEvent,
        }),
      ).unwrap();
      toast.success(result.message || "Event updated successfully");
      console.log("Event updated successfully:", result);
      setShowAddDialog(false);
      setSelectedEvent(null);
    } catch (error) {
      console.error("Failed to update event:", error);
      toast.error(
        error.response.data.errors[0] ||
        "Failed to update event. Please try again.",
      );
    }
  };

  // Function to initiate delete (opens confirmation popup)
  const initiateDeleteEvent = (event) => {
    setEventToDelete(event);
    setShowDeletePopup(true);
  };

  // Function to close delete popup and also close events dialog
  const handleCloseDeletePopup = () => {
    setShowDeletePopup(false);
    setEventToDelete(null);
  };

  // Actual delete function (called after confirmation)
  const handleDeleteEvent = async (eventId) => {
    if (!eventId) {
      console.error("No event ID provided for deletion");
      return;
    }

    setIsDeleting(true);
    try {
      const result = await dispatch(deleteCalendarEvent(eventId)).unwrap();
      toast.success(result.message || "Event deleted successfully");
      console.log("Event deleted successfully:", result);
      setShowDeletePopup(false);
      setEventToDelete(null);
      setShowAddDialog(false);
      setSelectedEvent(null);
      setOpen(false);
    } catch (error) {
      console.error("Failed to delete event:", error);
      toast.error(
        error.response?.data?.errors[0] ||
        "Failed to delete event. Please try again.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const getEventColor = (type) => {
    const colors = {
      class: "#3b82f6",
      study: "#10b981",
      lab: "#ef4444",
      assignment: "#f59e0b",
      exam: "#8b5cf6",
    };
    return colors[type] || "#6b7280";
  };

  const formatReminders = (reminders) => {
    if (!reminders || !Array.isArray(reminders)) return "";
    return reminders
      .filter((reminder) => reminder && reminder.minutesBefore != null)
      .map(
        (reminder) =>
          reminderOptions.find(
            (option) => option.value === reminder.minutesBefore.toString(),
          )?.label || `${reminder.minutesBefore} minutes before`,
      )
      .join(", ");
  };

  const eventStyleGetter = (event) => {
    return {
      style: {
        backgroundColor: event.color,
        borderRadius: "5px",
        opacity: 0.8,
        color: "white",
        border: "0px",
        fontSize: "12px",
        padding: "2px 5px",
      },
    };
  };

  const handleOpenAddEvent = () => {
    setSelectedEvent(null);
    setShowAddDialog(true);
  };

  const getClassNameById = (classId) => {
    if (classId === "all-classes") return "All Classes";
    const classInfo = classLectureId.find((cls) => cls._id === classId);
    return classInfo ? classInfo.name : "Unknown Class";
  };

  const CustomToolbar = ({ label, onNavigate, onView }) => {
    return (
      <div className="flex flex-col md:flex-row justify-between md:items-start items-center gap-3 mb-4 p-4 bg-card rounded-lg shadow-sm">
        <div className="flex items-center gap-6 flex-wrap sm:flex-nowrap ">
          <div className="flex items-center gap-2 w-full justify-between md:justify-start md:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate("PREV")}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate("TODAY")}
              className="min-w-[140px] flex-1 md:min-w-auto"
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate("NEXT")}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <h2 className="text-xl font-bold ml-4 text-center w-full md:w-auto md:text-start">
            {label}
          </h2>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto mt-5 md:mt-0">
          <Button
            className="bg-[#6F2CCA] hover:bg-[#5f15c5] cursor-pointer w-full"
            onClick={handleOpenAddEvent}
          >
            <Plus className="h-4 w-4 mr-2 text-white" />
            Add Event
          </Button>
        </div>
      </div>
    );
  };

  // Get ALL events for a specific date, including multi-day events
  const getEventsForDate = (date) => {
    return filteredEvents
      .filter((event) => {
        const eventStart = moment(event.start).startOf("day");
        const eventEnd = moment(event.end).startOf("day");
        const targetDate = moment(date).startOf("day");

        // Check if the target date is between event start and end (inclusive)
        // This handles both single-day and multi-day events
        return (
          targetDate.isSameOrAfter(eventStart) &&
          targetDate.isSameOrBefore(eventEnd)
        );
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start));
  };

  const dayEvents = getEventsForDate(currentDate);

  // Handle date cell click - opens popup with ALL events for that date
  const handleDateClick = (date) => {
    const dateEvents = getEventsForDate(date);
    setCurrentDate(date);

    console.log("Date clicked:", moment(date).format("YYYY-MM-DD"));
    console.log("Events found:", dateEvents.length);

    // Open popup if there are events (even if it's just 1)
    if (dateEvents.length > 0) {
      setMoreEvents(dateEvents);
      setOpen(true);
    }
  };

  const CustomDateCellWrapper = ({ children, value }) => {

    const handleClick = (e) => {
      // Prevent if clicking on an event itself
      if (e.target.closest(".rbc-event")) {
        return;
      }

      handleDateClick(value);
    };

    const isSelected = currentDate && moment(value).isSame(currentDate, "day");
    const isToday = moment(value).isSame(new Date(), "day");

    return (
      <div
        className={`rbc-day-bg h-full w-full cursor-pointer ${isSelected ? "selected-date" : ""}  ${isToday ? "rbc-today" : ""}  `}
        onClick={handleClick}
        style={{ minHeight: "100px" }}
      >
        {children}
      </div>
    );
  };

  const handleShowMore = (events, date) => {
    // When "+X more" is clicked, get ALL events for that date
    const allEventsForDate = getEventsForDate(date);
    setCurrentDate(date);
    setMoreEvents(allEventsForDate);
    setOpen(true);
  };

  // Handle dialog close - also close delete popup if open
  const handleDialogClose = (isOpen) => {
    setOpen(isOpen);
    if (!isOpen) {
      // If closing the events dialog, also close delete popup
      setShowDeletePopup(false);
      setEventToDelete(null);
    }
  };

  return (
    <>
      <div className="flex flex-col min-h-screen bg-background overflow-x-hidden">
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-2 lg:px-8 py-8 max-w-6xl">
            <header className="mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              <div className="flex items-center gap-2 md:m-0 mb-5">
                <Button variant="ghost" size="icon" asChild>
                  <Link to={"/student/dashboard"}>
                    <ChevronLeft />
                  </Link>
                </Button>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                  Calendar
                </h1>
              </div>
              <div className="flex items-center gap-4 flex-wrap md:flex-nowrap w-full justify-start md:justify-end">
                <div className="flex-1 md:flex-none">
                  <Select
                    value={selectedClass}
                    onValueChange={handleClassFilterChange}
                  >
                    <SelectTrigger className="cursor-pointer w-full md:w-[300px] bg-card border-none shadow-sm rounded-md focus:ring-accent flex items-center">
                      <SelectValue placeholder="All Classes">
                        {getClassNameById(selectedClass)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      style={{
                        width: "var(--radix-select-trigger-width)",
                        maxWidth: "var(--radix-select-trigger-width)",
                      }}
                    >
                      <SelectItem value="all-classes" className="cursor-pointer text-sm whitespace-normal h-auto py-2 break-words">
                        All Classes
                      </SelectItem>
                      {classLectureId &&
                        classLectureId.map((classItem) => (
                          <SelectItem
                            key={classItem._id}
                            value={classItem._id}
                            className="cursor-pointer runcate max-w-full overflow-hidden text-ellipsis"
                          >
                            {classItem.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <Select value={view} onValueChange={setView}>
                  <SelectTrigger className="cursor-pointer min-w-[120px] w-auto rounded-md focus:ring-accent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem className="cursor-pointer" value="month">Month</SelectItem>
                    <SelectItem className="cursor-pointer" value="week">Week</SelectItem>
                    <SelectItem className="cursor-pointer" value="day">Day</SelectItem>
                    <SelectItem className="cursor-pointer" value="agenda">Agenda</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </header>

            {selectedClass !== "all-classes" && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  Showing events for:{" "}
                  <strong>{getClassNameById(selectedClass)}</strong>
                  <span className="ml-2 text-blue-600">
                    ({filteredEvents.length} events)
                  </span>
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="text-blue-600 p-0 h-auto mt-1"
                  onClick={() => setSelectedClass("all-classes")}
                >
                  Show all classes
                </Button>
              </div>
            )}

            <Card className="mb-6">
              <CardContent className="p-0">
                <div className="w-full " style={{ height: "80vh" }}>
                  <Calendar
                    localizer={localizer}
                    events={filteredEvents}
                    startAccessor="start"
                    endAccessor="end"
                    view={view}
                    date={currentDate}
                    onNavigate={handleNavigate}
                    onView={handleViewChange}
                    onSelectEvent={(event) => {
                      // When clicking on an event, open the dialog for that specific date
                      handleDateClick(event.start);
                    }}
                    onSelectSlot={(slotInfo) => {
                      setCurrentDate(slotInfo.start);
                    }}
                    selectable
                    eventPropGetter={eventStyleGetter}
                    views={["month", "week", "day", "agenda"]}
                    step={30}
                    timeslots={4}
                    showMultiDayTimes
                    popup={true}
                    onShowMore={(events, date) => {
                      handleShowMore(events, date);
                      return false;
                    }}
                    components={{
                      toolbar: CustomToolbar,
                      dateCellWrapper: CustomDateCellWrapper,
                    }}
                    messages={{
                      next: "Next",
                      previous: "Previous",
                      today: "Today",
                      month: "Month",
                      week: "Week",
                      day: "Day",
                      agenda: "Agenda",
                      date: "Date",
                      time: "Time",
                      event: "Event",
                      noEventsInRange:
                        selectedClass === "all-classes"
                          ? "No events in this range"
                          : `No events for ${getClassNameById(selectedClass)} in this range`,
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      <Dialog open={open} onOpenChange={handleDialogClose}>
        <DialogContent
          onPointerDownOutside={(e) => {
            if (showDeletePopup) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (showDeletePopup) e.preventDefault();
          }}
          className="p-4 max-w-[500px] md:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col rounded-lg"
        >
          <DialogHeader className="">
            <DialogTitle className="text-left md:text-center text-lg md:text-xl font-bold">
              Events on {moment(currentDate).format("dddd, MMMM D, YYYY")}
            </DialogTitle>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary">
                {moreEvents.length}{" "}
                {moreEvents.length === 1 ? "event" : "events"}
              </Badge>
              {selectedClass !== "all-classes" && (
                <p className="text-sm text-muted-foreground">
                  Filtered by: {getClassNameById(selectedClass)}
                </p>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-3 overflow-y-auto flex-1 pr-2">
            {moreEvents.length > 0 ? (
              moreEvents.map((event) => (
                <Card
                  key={event.id}
                  className="bg-card shadow-sm hover:shadow-md transition-shadow border-l-4"
                  style={{ borderLeftColor: event.color }}
                >
                  <CardContent className="p-3 md:p-4">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      {/* Event details section */}
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <p className="font-semibold text-base">
                                {event.title}
                              </p>
                              <Badge
                                variant="outline"
                                className="text-xs font-normal"
                                style={{
                                  borderColor: event.color,
                                  color: event.color,
                                }}
                              >
                                {event.type}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground font-medium">
                              {moment(event.start).format("MMM D, hh:mm A")}
                              {event.end &&
                                ` - ${moment(event.end).format("MMM D, hh:mm A")}`}
                            </div>
                          </div>
                        </div>

                        <div className="text-sm text-muted-foreground space-y-1">
                          {event.class && (
                            <div className="flex items-start gap-1">
                              <span className="font-medium">Class:</span>{" "}
                              <span className="text-[13px]">{event.class}</span>
                            </div>
                          )}
                          {event.location && (
                            <div className="flex items-center gap-1">
                              <span className="font-medium">Location:</span>{" "}
                              {event.location}
                            </div>
                          )}
                          {event.reminders && event.reminders.length > 0 && (
                            <div className="text-xs flex items-start gap-1">
                              <span className="font-medium">Reminders:  </span>
                              <span>{formatReminders(event.reminders)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 md:flex-col md:items-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedEvent(event);
                            setShowAddDialog(true);
                            setOpen(false);
                          }}
                          className="hover:bg-accent"
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive"
                          onClick={() => initiateDeleteEvent(event)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {selectedClass === "all-classes"
                  ? "No events scheduled for this date"
                  : `No events for ${getClassNameById(selectedClass)} on this date`}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {showDeletePopup && (
        <ConfirmDeletePopup
          open={showDeletePopup}
          onOpenChange={setShowDeletePopup}
          eventTitle={eventToDelete?.title}
          isDeleting={isDeleting}
          onConfirm={() => handleDeleteEvent(eventToDelete?.id)}
        />
      )}

      <AddEventDialog
        event={selectedEvent}
        selectedDate={currentDate}
        onSave={selectedEvent ? handleUpdateEvent : handleAddEvent}
        onDelete={
          selectedEvent ? () => initiateDeleteEvent(selectedEvent) : null
        }
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) {
            setSelectedEvent(null);
          }
        }}
      />
    </>
  );
}
