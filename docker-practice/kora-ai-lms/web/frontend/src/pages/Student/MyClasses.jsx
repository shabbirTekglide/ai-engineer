import { Button } from "../../components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { cn } from "../../libs/Utils";
import {
  Search,
  Plus,
  List,
  LayoutGrid,
  ChevronLeft,
  Calendar,
  GraduationCap,
  Clock,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AddClassDialog } from "../../components/kora/AddClassDialog";
import { useEffect, useMemo, useState } from "react";

import { useDispatch, useSelector } from "react-redux";
import { getStartHour, normalizeDays } from "../../utils/utilities";
import {
  clearCurrentLecture,
  clearLectures,
} from "../../store/slicers/lectureSlice";
import { clearCurrentClass } from "../../store/slicers/classSlice";
// import { clearSyllabus } from '../../store/slicers/syllabusSlice';
import { IoMdClose } from "react-icons/io";

function getCurrentTerm() {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1..12
  if (m >= 1 && m <= 5) return `spring-${y}`;
  if (m >= 6 && m <= 7) return `fall-${y}`;
  return `fall-${y}`;
}

export default function MyClassesPage() {
  const dispatch = useDispatch();
  const [view, setView] = useState(() =>
    window.innerWidth < 768 ? "grid" : "list",
  );
  const { classes } = useSelector((state) => state.class);
  const { calendar } = useSelector((state) => state.calendar);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setView("grid");
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // // Filter upcoming events by classId and count events per class
  // const { upcomingEventsByClass, totalUpcomingEvents } = useMemo(() => {
  //   const now = new Date();

  //   // Filter upcoming events and group by classId
  //   const eventsByClass = {};
  //   let totalCount = 0;

  //   calendar.forEach(item => {
  //     // Ensure item.start is a valid date and it's in the future
  //     const startDate = new Date(item.start);
  //     if (startDate > now && item.class && item.class !== 'Personal') {
  //       const classId = item.class; // Using class name as identifier

  //       if (!eventsByClass[classId]) {
  //         eventsByClass[classId] = {
  //           count: 0,
  //           events: []
  //         };
  //       }

  //       eventsByClass[classId].count += 1;
  //       eventsByClass[classId].events.push(item);
  //       totalCount += 1;
  //     }
  //   });

  //   return {
  //     upcomingEventsByClass: eventsByClass,
  //     totalUpcomingEvents: totalCount
  //   };
  // }, [calendar]);

  // // Get upcoming events count for a specific class
  // const getUpcomingEventsCount = (className) => {

  //   return upcomingEventsByClass[className]?.count || 0;
  // };

  // // Get next upcoming event for a class
  // const getNextUpcomingEvent = (className) => {
  //   const classEvents = upcomingEventsByClass[className]?.events;
  //   if (!classEvents || classEvents.length === 0) return null;

  //   // Sort by start date and get the next one
  //   return classEvents.sort((a, b) => new Date(a.start) - new Date(b.start))[0];
  // };

  const { upcomingEventsByClass, totalUpcomingEvents } = useMemo(() => {
    const now = new Date();

    const eventsByClass = {};
    let totalCount = 0;

    calendar.forEach((item) => {
      const startDate = new Date(item.start);
      if (startDate > now && item.class && item.class !== "Personal") {
        // Use class ID instead of class name for consistency
        const classId = item.classId || item.class; // Try classId first, fallback to class

        if (!eventsByClass[classId]) {
          eventsByClass[classId] = {
            count: 0,
            events: [],
          };
        }

        eventsByClass[classId].count += 1;
        eventsByClass[classId].events.push(item);
        totalCount += 1;
      }
    });

    return {
      upcomingEventsByClass: eventsByClass,
      totalUpcomingEvents: totalCount,
    };
  }, [calendar]);

  // Get upcoming events count for a specific class
  const getUpcomingEventsCount = (classId) => {
    return upcomingEventsByClass[classId]?.count || 0;
  };

  // Get next upcoming event for a class
  const getNextUpcomingEvent = (classId) => {
    const classEvents = upcomingEventsByClass[classId]?.events;
    if (!classEvents || classEvents.length === 0) return null;

    return classEvents.sort((a, b) => new Date(a.start) - new Date(b.start))[0];
  };

  // --- filter state ---
  const [filterClasses, setFilterClasses] = useState(classes || []);
  const [search, setSearch] = useState("");
  const [preset, setPreset] = useState(null);
  // presets: 'thisTerm' | 'mwf' | 'tth' | 'morning' | 'afternoon' | null

  // compute current term once
  const currentTerm = useMemo(() => getCurrentTerm(), []);

  // core filtering logic
  useEffect(() => {
    const q = (search || "").trim().toLowerCase();

    const result = (classes || []).filter((c) => {
      // normalize
      const name = (c?.name || "").toLowerCase();
      const instructor = (c?.instructor || "").toLowerCase();
      const days = normalizeDays(c?.meetingDays);
      const timeStartHour = getStartHour(c?.meetingTime);

      // 1) search filter
      const matchesSearch =
        !q ||
        name.includes(q) ||
        instructor.includes(q) ||
        days.some((d) => d.toLowerCase().includes(q)) ||
        (c?.meetingTime || "").toLowerCase().includes(q) ||
        (c?.term || "").toLowerCase().includes(q);

      if (!matchesSearch) return false;

      // 2) preset filters (meeting days / time / term)
      if (preset === "thisTerm") {
        if ((c?.term || "").toLowerCase() !== currentTerm.toLowerCase())
          return false;
      } else if (preset === "mwf") {
        const hasMWF = ["Mon", "Wed", "Fri"].every((d) => days.includes(d));
        if (!hasMWF) return false;
      } else if (preset === "tth") {
        const hasTTh = ["Tue", "Thu"].every((d) => days.includes(d));
        if (!hasTTh) return false;
      } else if (preset === "morning") {
        if (timeStartHour == null || timeStartHour >= 12) return false;
      } else if (preset === "afternoon") {
        if (timeStartHour == null || timeStartHour < 12) return false;
      }

      return true;
    });

    setFilterClasses(result);
  }, [classes, search, preset, currentTerm]);

  // ensure local state sync on classes change
  useEffect(() => {
    // dispatch(clearSyllabus())
    dispatch(clearLectures());
    dispatch(clearCurrentClass());
    setFilterClasses(classes || []);
  }, [classes]);

  // Format date for display
  const formatEventDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  return (
    <>
      <div className="flex flex-col h-screen bg-background">
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-6xl">
            <header className="flex mb-6 my-classes-header flex-col items-start md:flex-row justify-between md:items-center space-y-4 md:space-x-0">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" asChild>
                  <Link to={"/student/dashboard"}>
                    <ChevronLeft />
                  </Link>
                </Button>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                  My Classes
                </h1>
              </div>
              <div className="flex items-center gap-4 w-full md:w-auto">
                <AddClassDialog>
                  <Button className="bg-[#6F2CCA] hover:bg-[#5112a9] cursor-pointer flex-1 md:flex-none">
                    <Plus className="mr-2" /> Add Class
                  </Button>
                </AddClassDialog>
                <div className="items-center rounded-md bg-muted p-1 hidden md:flex">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setView("list")}
                    className={cn(
                      view === "list"
                        ? "bg-[background] shadow-sm cursor-pointer hidden md:block"
                        : "",
                      "text-muted-foreground cursor-pointer hidden md:block hover:bg-[#6F2CCA]",
                    )}
                  >
                    <List />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setView("grid")}
                    className={cn(
                      view === "grid"
                        ? "bg-background shadow-sm cursor-pointer"
                        : "",
                      "text-muted-foreground cursor-pointer hover:bg-[#6F2CCA]",
                    )}
                  >
                    <LayoutGrid />
                  </Button>
                </div>
              </div>
            </header>

            {/* Stats Bar */}
            {totalUpcomingEvents > 0 && (
              <div className="mb-6 border border-[#986AF3] text-black rounded-2xl p-2 md:p-5 shadow-lg">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start md:gap-2">
                    <div className="md:px-3 px-2 bg-white/20 rounded-xl">
                      <Calendar className="w-6 h-6" />
                    </div>
                    <div className="">
                      <p className="font-semibold text-l">
                        {totalUpcomingEvents} upcoming event
                        {totalUpcomingEvents !== 1 ? "s" : ""}
                      </p>
                      <p className="text-[#986AF3] text-sm">
                        Check your calendar to stay updated
                      </p>
                    </div>
                  </div>
                  <div className="view-calendar-btn">
                    <Link to="/student/calendar">
                      <button className="cursor-pointer px-2 py-2 md:px-4 md:py-2 bg-white text-[#986AF3] border-[#986AF3] border rounded-lg  transition-colors text-sm font-medium view-calendar-btn-anchor">
                        View Calendar
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Search */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
              <Input
                placeholder="Search classes, instructors, days..."
                className="py-5 pl-10 w-full focus:border-2 focus:border-[#986AF3]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex gap-4 xl:gap-8 flex-col lg:flex-row ">
              {/* Filters */}
              <div
                className={`${view === "list" ? "lg:w-[25%]" : "lg:w-[23%]"} `}
              >
                <Card>
                  <div className="flex px-4 xl:px-8 py-6 justify-between">
                    <CardTitle className="text-lg tracking-wide">
                      Filters
                    </CardTitle>
                    <button
                      className="justify-start text-red-600 text-sm cursor-pointer underline"
                      onClick={() => {
                        setSearch("");
                        setPreset(null);
                        setFilterClasses(classes || []);
                      }}
                    >
                      <span className="lg:hidden xl:block">Clear Filters</span>
                      <span className="hidden lg:block xl:hidden">
                        <IoMdClose size={20} />
                      </span>
                    </button>
                  </div>
                  <CardContent className="px-3 space-y-4 flex justify-between lg:block gap-2 filters-btn-container">
                    <div className="this-term-btn space-y-2 w-[30%] lg:flex-auto lg:w-auto ">
                      <Button
                        variant={
                          preset === "thisTerm" ? "secondary" : "outline"
                        }
                        className={` w-full justify-center cursor-pointer  ${preset === "thisTerm" ? "bg-[#976AF2] text-white hover:bg-[#976AF2]" : ""}`}
                        onClick={() =>
                          setPreset((p) =>
                            p === "thisTerm" ? null : "thisTerm",
                          )
                        }
                        title={`Current term: ${currentTerm}`}
                      >
                        This Term
                      </Button>
                    </div>
                    <div className="weekdays-btn grid  grid-cols-4  lg:grid-cols-1 xl:grid-cols-2 gap-2 w-[70%] lg:w-auto">
                      <Button
                        variant={preset === "mwf" ? "secondary" : "outline"}
                        className={`cursor-pointer flex-1  ${preset === "mwf" ? "bg-[#976AF2] text-white hover:bg-[#976AF2]" : ""}`}
                        onClick={() =>
                          setPreset((p) => (p === "mwf" ? null : "mwf"))
                        }
                      >
                        M/W/F
                      </Button>
                      <Button
                        className={`cursor-pointer flex-1  ${preset === "tth" ? "bg-[#976AF2] text-white hover:bg-[#976AF2]" : ""}`}
                        variant={preset === "tth" ? "secondary" : "outline"}
                        onClick={() =>
                          setPreset((p) => (p === "tth" ? null : "tth"))
                        }
                      >
                        T/Th
                      </Button>
                      <Button
                        className={`cursor-pointer flex-1  ${preset === "morning" ? "bg-[#976AF2] text-white hover:bg-[#976AF2]" : ""}`}
                        variant={preset === "morning" ? "secondary" : "outline"}
                        onClick={() =>
                          setPreset((p) => (p === "morning" ? null : "morning"))
                        }
                      >
                        Morning
                      </Button>
                      <Button
                        className={`cursor-pointer flex-1  ${preset === "afternoon" ? "bg-[#976AF2] text-white hover:bg-[#976AF2]" : ""}`}
                        variant={
                          preset === "afternoon" ? "secondary" : "outline"
                        }
                        onClick={() =>
                          setPreset((p) =>
                            p === "afternoon" ? null : "afternoon",
                          )
                        }
                      >
                        Afternoon
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Results */}
              <div className={`${view === "list" ? "flex-1" : "lg:w-[82%]"} `}>
                <div className="bg-transparent shadow-none">
                  <div
                    className={` p-0 bg-transparent shadow-none 
                    ${view === "grid"
                        ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                        : "divide-y divide-border"
                      } 
                    `}
                  >
                    {(filterClasses || []).length === 0 ? (
                      <div className="p-6 text-sm text-muted-foreground">
                        No classes found.
                      </div>
                    ) : (
                      filterClasses.map((c) => {
                        const upcomingEventsCount = getUpcomingEventsCount(
                          c._id,
                        );
                        console.log(c.name, upcomingEventsCount);
                        const nextEvent = getNextUpcomingEvent(c._id);

                        return (
                          <div
                            key={c._id}
                            className={` hover:bg-slate-50 cursor-pointer transition-colors rounded-[10px] ${view === "grid"
                              ? "h-full flex flex-col border-t-4 border-l-0 [box-shadow:2px_2px_2px_2px_rgba(0,_0,_0,_0.1)]"
                              : "mb-2 py-2 border-l-4 border-t-0 "
                              }`}
                            style={{
                              borderLeftColor: `hsl(${(Number(c.color) % 101) * 3.6}, 90%, 50%)`,
                              borderTopColor: `hsl(${(Number(c.color) % 101) * 3.6}, 90%, 50%)`,
                            }}
                          >
                            <Link to={`/student/my-classes/${c._id}`}>
                              <div
                                className={`p-3 md:py-5 md:px-3 ${view === "grid" ? "flex flex-col h-full" : ""
                                  }`}
                              >
                                <div className="">
                                  <span className="w-3 h-3 rounded-full flex-shrink-0" />
                                  <div className="flex-1">
                                    <div
                                      className={`flex justify-between items-start gap-3 mb-3 ${view === "grid" ? "flex-wrap" : ""
                                        }`}
                                    >
                                      <p className="font-semibold text-foreground text-[14px] md:text-[16px] w-[85%]">
                                        {c.name}
                                      </p>
                                      {upcomingEventsCount > 0 && (
                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                                          <Calendar className="h-3 w-3" />
                                          {upcomingEventsCount} event
                                          {upcomingEventsCount !== 1 ? "s" : ""}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground  flex gap-2 items-center my-2">
                                      <GraduationCap className="w-4 h-4" />{" "}
                                      {c.instructor ?? "—"}
                                    </p>

                                    <div
                                      className={`flex  text-sm text-slate-600 mb-3 flex-col gap-2  ${view === "grid" ? "flex-col gap-2" : ""
                                        }`}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        <Calendar className="w-4 h-4 text-slate-400" />
                                        <span>
                                          {normalizeDays(c.meetingDays).length
                                            ? normalizeDays(c.meetingDays).join(
                                              ", ",
                                            )
                                            : "—"}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <Clock className="w-4 h-4 text-slate-400" />
                                        <span>{c.meetingTime ?? "—"}</span>
                                      </div>
                                    </div>
                                    {nextEvent && (
                                      <p
                                        className={`text-xs text-green-600 flex ${view === "list" ? " items-center " : "items-start"} gap-1`}
                                      >
                                        <Calendar
                                          className={`${view === "list" ? "w-3 h-3" : "h-5 w-5"} `}
                                        />
                                        <span className="text-[11px]">
                                          Next:{" "}
                                          {formatEventDate(nextEvent.start)} -{" "}
                                          {nextEvent.title}
                                        </span>
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div
                                  className={` ${view === "list" ? "text-right min-w-[120px]" : ""} `}
                                >
                                  {/* <p className="text-sm text-muted-foreground">
                                  {c.upcomingAssignments > 0 ? `${c.upcomingAssignments} assignment${c.upcomingAssignments !== 1 ? 's' : ''}` : 'No assignments'}
                                </p> */}
                                  {upcomingEventsCount === 0 && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      No upcoming events
                                    </p>
                                  )}
                                </div>
                              </div>
                            </Link>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
