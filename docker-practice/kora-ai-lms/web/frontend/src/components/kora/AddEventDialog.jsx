//  frontend/src/components/kora/AddEventDialog.jsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/Select";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover";
import { CalendarIcon, Clock, Trash2, Plus, X } from "lucide-react";
import { Calendar } from "../ui/Calender";
import { useState, useEffect, useRef } from "react";
import { format } from "date-fns";
import { cn } from "../../libs/Utils";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import ReactSpinner from "../ReactSpinner";
import TimePicker from "react-time-picker";
import moment from "moment";

export function AddEventDialog({
  children,
  event = null,
  selectedDate = null,
  onSave,
  onDelete = null,
  open = false,
  onOpenChange,
}) {
  const { classLectureId } = useSelector((state) => state.class);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [startTime, setStartTime] = useState("12:00");
  const [endTime, setEndTime] = useState("13:00");
  const [title, setTitle] = useState("");
  const [eventType, setEventType] = useState("study");
  const [className, setClassName] = useState("personal");
  const [location, setLocation] = useState("");
  const [reminders, setReminders] = useState([]);
  const [newReminder, setNewReminder] = useState("");
  const [loading, setLoading] = useState(false);
  // Predefined reminder options (in minutes)
  const reminderOptions = [
    { value: "1440", label: "1 day before" },
    { value: "2880", label: "2 days before" },
    { value: "4320", label: "3 days before" },
    { value: "20160", label: "2 weeks before" },
    { value: "30240", label: "3 weeks before" },
    // { value: 'custom', label: 'Custom minutes' }
  ];

  const initFromEvent = (ev) => {
    const start = ev.start ? new Date(ev.start) : new Date();
    const end = ev.end ? new Date(ev.end) : new Date();

    setStartDate(start);
    setEndDate(end);
    setTitle(ev.title || "");
    setEventType(ev.type || "study");
    setClassName(ev.classId || "personal");
    setLocation(ev.location || "");

    // The event dates are already mapped to local Date objects containing the exact hours/minutes we want.
    setStartTime(ev.start ? moment(ev.start).format("HH:mm") : moment().format("HH:mm"));
    setEndTime(ev.end ? moment(ev.end).format("HH:mm") : moment().add(1, 'hour').format("HH:mm"));

    // Set reminders from event
    if (ev.reminders && Array.isArray(ev.reminders)) {
      setReminders(
        ev.reminders
          .filter(reminder => reminder && reminder.minutesBefore != null)
          .map((reminder) => ({
            minutesBefore: reminder.minutesBefore,
            label:
              reminderOptions.find(
                (option) => option.value === reminder.minutesBefore.toString(),
              )?.label || `${reminder.minutesBefore} minutes before`,
            // _id: reminder._id || `temp-${Date.now()}-${Math.random()}`
          })),
      );
    } else {
      setReminders([]);
    }
  };

  const initNew = () => {
    const now = new Date();

    const start = selectedDate ? new Date(selectedDate) : new Date();

    start.setHours(now.getHours(), now.getMinutes(), 0, 0);

    setStartDate(start);

    const end = new Date(start.getTime() + 60 * 60 * 1000);
    setEndDate(end);

    // Use local formatting for the default time so it matches the picker's expectation
    setStartTime(moment(start).format("HH:mm"));
    setEndTime(moment(end).format("HH:mm"));

    setTitle("");
    setEventType("study");
    setClassName("personal");
    setLocation("");
    setReminders([]);
    setNewReminder("");
  };
  // Initialize form when event prop changes or when dialog is opened for the first time.
  useEffect(() => {
    if (!open) return;

    // If event prop changes (for example arrives after opening), initialize from event
    if (event) {
      initFromEvent(event);
      // wasOpen.current = open;
      return;
    }

    initNew();
  }, [open, event, selectedDate]);

  const handleSave = async () => {
    try {
      // Validate form
      if (!title.trim()) {
        toast.error("Please enter a title for the event");
        return;
      }

      if (!startDate || !endDate) {
        toast.error("Please select both start and end dates");
        return;
      }

      setLoading(true);
      // Create start and end datetime objects using moment.utc
      const parseTime = (t) => {
        if (!t) return [0, 0];
        const [hourMinute, modifier] = t.split(" ");
        let [hours, minutes] = hourMinute.split(":").map(Number);
        if (modifier === "PM" && hours !== 12) hours += 12;
        if (modifier === "AM" && hours === 12) hours = 0;
        return [hours, minutes];
      };
      const [startHours, startMinutes] = parseTime(startTime);
      const [endHours, endMinutes] = parseTime(endTime);

      const startDateTime = moment.utc([
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate(),
        startHours,
        startMinutes,
      ]).toDate();

      const endDateTime = moment.utc([
        endDate.getFullYear(),
        endDate.getMonth(),
        endDate.getDate(),
        endHours,
        endMinutes,
      ]).toDate();

      // Validate time order
      if (endDateTime <= startDateTime) {
        toast.error("End date and time must be after start date and time");
        setLoading(false);
        return;
      }
      const getClassNameById = (classId) => {
        if (classId === "personal") return "Personal";
        const classInfo = classLectureId.find((cls) => cls._id === classId);
        return classInfo ? classInfo.name : "Unknown Class";
      };

      // Auto-add the currently selected reminder if the user forgot to click the '+' button
      let finalReminders = [...reminders];
      if (newReminder && newReminder !== "custom") {
        const minutes = parseInt(newReminder);
        if (!isNaN(minutes) && minutes > 0 && !finalReminders.some((r) => r.minutesBefore === minutes)) {
          finalReminders.push({ minutesBefore: minutes });
        }
      }

      const eventData = {
        ...(event && { id: event.id }),
        title: title.trim(),
        start: startDateTime,
        end: endDateTime,
        type: eventType,
        classId: className, // Save the class ID separately
        class:
          className === "personal" ? "Personal" : getClassNameById(className), // Save class name he
        location: location.trim(),
        reminders: finalReminders.map((reminder) => ({
          minutesBefore: parseInt(reminder.minutesBefore),
          _id: reminder._id,
        })),
      };

      if (onSave) {
        await onSave(eventData);
        // toast.success("Event saved successfully");
      }
    } catch (error) {
      console.error(error);
      toast.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (onDelete && event?.id) {
      if (window.confirm("Are you sure you want to delete this event?")) {
        onDelete(event.id);
      }
    }
  };

  const addReminder = () => {
    const minutes = parseInt(newReminder);
    if (isNaN(minutes) || minutes <= 0) {
      alert("Please enter a valid number of minutes");
      return;
    }

    // Check for duplicate reminder
    if (reminders.some((reminder) => reminder.minutesBefore === minutes)) {
      alert("This reminder already exists");
      return;
    }
    const selectedOption = reminderOptions.find(
      (opt) => opt.value === minutes.toString(),
    );

    const newReminderObj = {
      minutesBefore: minutes,
      label: selectedOption?.label || `${minutes} minutes before`,
      // _id: `temp-${Date.now()}-${Math.random()}`
    };

    setReminders((prev) => [...prev, newReminderObj]);
    setNewReminder(""); // Reset to default
  };

  const removeReminder = (minutesBefore) => {
    console.log("reminderId to remove:", reminders);
    setReminders((prev) =>
      prev.filter((reminder) => reminder.minutesBefore !== minutesBefore),
    );
  };

  const handleReminderOptionChange = (value) => {
    if (value === "custom") {
      setNewReminder("");
    } else {
      setNewReminder(value);
    }
  };

  // Update end date when start date changes to ensure end is not before start
  useEffect(() => {
    if (startDate && endDate && startDate > endDate) {
      // If start date is after end date, adjust end date to be same as start date
      setEndDate(new Date(startDate));
    }
  }, [startDate]);

  const isEditing = !!event;

  return (
    <>
      {loading ? (
        <ReactSpinner />
      ) : (
        <Dialog open={open} onOpenChange={onOpenChange}>
          {children && <DialogTrigger asChild>{children}</DialogTrigger>}
          <DialogContent
            className="max-w-[450px] p-4 md:p-8 flex flex-col"
            style={{
              maxHeight: "85dvh", // dvh shrinks when keyboard opens, vh doesn't
              height: "auto",
            }}
          >
            <DialogHeader>
              <DialogTitle className="text-center text-xl md:text-2xl">
                {isEditing ? "Edit Event" : "Add New Event"}
              </DialogTitle>
              <DialogDescription className="text-center text-sm">
                {isEditing
                  ? "Update your event details."
                  : "Create a new event for your schedule."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4 overflow-y-auto flex-1 min-h-0 overscroll-contain touch-pan-y">
              {/* Event Title */}
              <div className="flex flex-col sm:grid sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                <Label htmlFor="title" className="text-right block">
                  Title <span className="text-red-600">*</span>
                </Label>
                <Input
                  id="title"
                  className="col-span-3 focus:border-2 focus:border-[#6F2CCA] py-2"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter event title"
                />
              </div>

              {/* Event Type */}
              <div className="flex flex-col sm:grid sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                <Label htmlFor="type" className="text-right">
                  Type
                </Label>
                <Select
                  value={eventType}
                  onValueChange={setEventType}
                  className="py-2"
                >
                  <SelectTrigger
                    id="type"
                    className="col-span-3 rounded-md focus:border-2 focus:border-[#6F2CCA] focus:ring-0"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="class">Class</SelectItem>
                    <SelectItem value="study">Study Session</SelectItem>
                    <SelectItem value="lab">Lab</SelectItem>
                    <SelectItem value="exam">Exam</SelectItem>
                    <SelectItem value="assignment">Assignment</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Start Date & Time */}
              <div className="space-y-4">
                <div className="flex flex-col sm:grid sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                  <Label className="text-right">
                    Start Date <span className="text-red-600">*</span>
                  </Label>
                  <div className="col-span-3 w-full ">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal max-w-full py-2 hover:bg-[#6F2CCA] focus:bg-[#6F2CCA] focus-within:bg-[#6F2CCA]",
                            !startDate && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? (
                            format(startDate, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="start"
                        side="bottom"
                        className="w-[360px] p-1 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl calendar-date-picker"
                      >
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={setStartDate}
                          initialFocus
                          className=" calendar-main"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="flex flex-col sm:grid sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                  <Label htmlFor="start-time" className="text-right">
                    Start Time <span className="text-red-600">*</span>
                  </Label>
                  <div className="relative col-span-3 w-full">
                    <div className="border rounded-md px-3 py-2 focus-within:border-2 focus-within:border-[#6F2CCA] transition flex items-center gap-2">
                      <TimePicker
                        onChange={setStartTime}
                        value={startTime}
                        format="hh:mm a"
                        disableClock
                        clearIcon={null}
                        className="w-full text-sm"
                      />
                      <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </div>
                </div>
              </div>

              {/* End Date & Time */}
              <div className="space-y-4">
                <div className="flex flex-col sm:grid sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                  <Label className="text-right">
                    End Date <span className="text-red-600">*</span>
                  </Label>
                  <div className="col-span-3 w-full ">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full justify-start text-left font-normal py-2 hover:bg-[#6F2CCA] focus:bg-[#6F2CCA] focus-within:bg-[#6F2CCA]",
                            !endDate && "text-muted-foreground",
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? (
                            format(endDate, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[360px] p-1 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl calendar-date-picker">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={setEndDate}
                          initialFocus
                          disabled={(date) => date < startDate}
                          className=" calendar-main"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="flex flex-col sm:grid sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                  <Label htmlFor="end-time" className="text-right">
                    End Time <span className="text-red-600">*</span>
                  </Label>
                  <div className="relative col-span-3 w-full">
                    <div className="border rounded-md px-3 py-2 focus-within:border-2 focus-within:border-[#6F2CCA] transition flex items-center gap-2">
                      <TimePicker
                        onChange={setEndTime}
                        value={endTime}
                        format="hh:mm a"
                        disableClock
                        clearIcon={null}
                        className="w-full text-sm"
                      />
                      <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Class */}
              <div className="flex flex-col sm:grid sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                <Label htmlFor="class" className="text-right">
                  Class
                </Label>
                <Select value={className} onValueChange={setClassName}>
                  <SelectTrigger
                    id="class"
                    className="col-span-3 rounded-md focus:border-2 focus:border-[#6F2CCA] focus:ring-0 py-2"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    style={{
                      width: "var(--radix-select-trigger-width)",
                      maxWidth: "var(--radix-select-trigger-width)",
                    }}
                  >
                    <SelectItem value="personal">Personal</SelectItem>
                    {classLectureId &&
                      classLectureId.map((classItem) => (
                        <SelectItem
                          key={classItem._id}
                          value={classItem._id}
                          className="truncate max-w-full overflow-hidden text-ellipsis"
                        >
                          {classItem.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Location */}
              <div className="flex flex-col sm:grid sm:grid-cols-4 items-start sm:items-center gap-2 sm:gap-4">
                <Label htmlFor="location" className="text-right">
                  Location
                </Label>
                <Input
                  id="location"
                  className="col-span-3 focus:border-2 focus:border-[#6F2CCA] focus:ring-0 py-2"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Room 301, Library, Online"
                />
              </div>

              {/* Reminders Section */}
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="reminders" className="text-right pt-2">
                  Reminders
                </Label>
                <div className="col-span-3 space-y-3">
                  {/* Add Reminder Input */}
                  <div className="flex gap-2">
                    <Select
                      value={newReminder}
                      onValueChange={handleReminderOptionChange}
                    >
                      <SelectTrigger className="flex-1 rounded-md focus:border-2 focus:border-[#6F2CCA] focus:ring-0 py-2">
                        <SelectValue placeholder="Select reminder time" />
                      </SelectTrigger>
                      <SelectContent>
                        {reminderOptions
                          .filter((option) => option.value !== "1440")
                          .map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>

                    {newReminder === "custom" ? (
                      <div className="flex gap-2 flex-1">
                        <Input
                          type="number"
                          placeholder="Minutes"
                          value={newReminder === "custom" ? "" : newReminder}
                          onChange={(e) => setNewReminder(e.target.value)}
                          min="1"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={addReminder}
                          className="bg-accent hover:bg-accent/90"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={addReminder}
                        className={`bg-[#6F2CCA] hover:bg-[#5112a9] cursor-pointer ${!newReminder ? "opacity-50 cursor-not-allowed disabled:" : ""}`}
                      >
                        <Plus className="h-4 w-4 " />
                      </Button>
                    )}
                  </div>

                  {/* Reminders List */}
                  {reminders.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-sm">Scheduled Reminders:</Label>
                      {reminders.map((reminder) => (
                        <div
                          key={reminder.minutesBefore}
                          className="flex items-center justify-between p-2 bg-muted/50 rounded-md border border-[#6F2CCA]"
                        >
                          <span className="text-sm">
                            {console.log("reminder:", reminder)}
                            {reminder.label}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              removeReminder(reminder.minutesBefore)
                            }
                            className="h-6 w-6 p-0 text-destructive hover:bg-[#6F2CCA]  hover:text-white cursor-pointer rounded-full"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter className="flex justify-end items-end md:items-center flex-nowrap flex-row ">
              <div className="flex  items-end md:items-center gap-2">
                <Button
                  type="button"
                  onClick={handleSave}
                  className="p-4 border  bg-[#6F2CCA] hover:bg-[#5f15c5]  hover:text-white cursor-pointer transition-colors duration-300 ring-0 ring-offset-0 outline-none"
                >
                  {isEditing ? "Update Event" : "Save Event"}
                </Button>
                {!isEditing && (
                  <DialogClose asChild>
                    <Button
                      variant="ghost"
                      className="cursor-pointer border bg-red-500 text-white border-red-500 transition-colors duration-300 hover:bg-red-600 hover:border-red-600"
                    >
                      Cancel
                    </Button>
                  </DialogClose>
                )}
              </div>
              <div>
                {isEditing && onDelete && (
                  <Button
                    variant="destructive"
                    className="cursor-pointer border bg-red-500 text-white border-red-500 transition-colors duration-300 hover:bg-red-600 hover:border-red-600"
                    onClick={handleDelete}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
