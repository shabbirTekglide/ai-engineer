import { useState, useEffect, useRef } from "react";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/Select";
import { Badge } from "../../components/ui/Badge";
import {
  BookCopy,
  BrainCircuit,
  ClipboardCheck,
  Podcast,
  ChevronLeft,
  X,
  Check,
  ChevronDown,
  Search,
  Info,
  FileText,
  Mic,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { getClassLecturesId } from "../../store/slicers/classSlice";
import {
  clearFlashCards,
  clearStudyGuide,
  clearQuizes,
  setSelectedClassAndLecture,
} from "../../store/slicers/learnSlice";
import { toast } from "react-toastify";

export default function StudyPage() {
  const { classLectureId } = useSelector((state) => state.class);
  const { selectedClassId: reduxClassId, selectedLectureIds: reduxLectureIds, selectedDocumentIds: reduxDocumentIds } =
    useSelector((state) => state.learn);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedLectures, setSelectedLectures] = useState([]);
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);

  // Materials dropdown state
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [materialSearch, setMaterialSearch] = useState("");
  const [materialTab, setMaterialTab] = useState("all"); // "all" | "lectures" | "documents"
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMaterialsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Initialize selections only once when classLectureId loads
  useEffect(() => {
    if (classLectureId.length > 0 && !isInitialized) {
      let classToSelect = reduxClassId;
      let lecturesToSelect = Array.isArray(reduxLectureIds)
        ? [...reduxLectureIds]
        : [];
      let documentsToSelect = Array.isArray(reduxDocumentIds)
        ? [...reduxDocumentIds]
        : [];

      if (!classToSelect) {
        classToSelect = classLectureId[0]?._id || "";
      }

      const selectedClass = classLectureId.find(
        (classItem) => classItem._id === classToSelect,
      );

      // Only keep previously-selected lectures if they still exist and are
      // valid for this class. Do NOT auto-select a default lecture — some
      // classes only have documents, and forcing a lecture selection breaks
      // the "Select study materials" placeholder + downstream logic.
      if (
        lecturesToSelect.length === 0 ||
        !selectedClass?.lectures?.some((lecture) =>
          lecturesToSelect.includes(lecture._id),
        )
      ) {
        lecturesToSelect = [];
      }

      setSelectedClassId(classToSelect);
      setSelectedLectures(lecturesToSelect);
      setSelectedDocuments(documentsToSelect);
      setIsInitialized(true);
    }
  }, [classLectureId, reduxClassId, reduxLectureIds, isInitialized]);

  // Update lectures/documents when selectedClassId changes
  useEffect(() => {
    if (selectedClassId && classLectureId.length > 0) {
      const selectedClass = classLectureId.find(
        (classItem) => classItem._id === selectedClassId,
      );

      if (selectedClass && selectedClass.lectures) {
        const completedLectures = selectedClass.lectures.filter(
          (lecture) => lecture.processingStatus === "completed",
        );
        setLectures(completedLectures);

        if (isInitialized) {
          // Keep only lecture selections that are still valid (audio type)
          const validLectures = selectedLectures.filter((lectureId) =>
            completedLectures.some(
              (lecture) =>
                lecture._id === lectureId && lecture.sourceType !== "document",
            ),
          );
          if (validLectures.length !== selectedLectures.length) {
            setSelectedLectures(validLectures);
          }

          // Keep only document selections that are still valid (document type)
          const validDocs = selectedDocuments.filter((docId) =>
            completedLectures.some(
              (item) => item._id === docId && item.sourceType === "document",
            ),
          );
          if (validDocs.length !== selectedDocuments.length) {
            setSelectedDocuments(validDocs);
          }
        }
      } else {
        setLectures([]);
        if (isInitialized) {
          setSelectedLectures([]);
          setSelectedDocuments([]);
        }
      }
    } else {
      setLectures([]);
      if (isInitialized) {
        setSelectedLectures([]);
        setSelectedDocuments([]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassId, classLectureId, isInitialized]);

  // Save selections to Redux whenever they change (after initialization)
  useEffect(() => {
    if (isInitialized && selectedClassId) {
      dispatch(
        setSelectedClassAndLecture({
          selectedClassId,
          selectedLectureIds: selectedLectures,
          selectedDocumentIds: selectedDocuments,
        }),
      );
    }
  }, [selectedClassId, selectedLectures, selectedDocuments, dispatch, isInitialized]);

  useEffect(() => {
    dispatch(getClassLecturesId());
    dispatch(clearStudyGuide());
    dispatch(clearFlashCards());
    dispatch(clearQuizes());
  }, [dispatch]);

  const toggleLectureSelection = (lectureId) => {
    setSelectedLectures((prev) =>
      prev.includes(lectureId)
        ? prev.filter((id) => id !== lectureId)
        : [...prev, lectureId],
    );
  };

  const toggleDocumentSelection = (docId) => {
    setSelectedDocuments((prev) =>
      prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId],
    );
  };

  // Filtered lists based on search
  const audioLectures = lectures.filter(
    (l) => l.sourceType !== "document" && l.processingStatus === "completed",
  );
  const documentLectures = lectures.filter(
    (l) => l.sourceType === "document" && l.processingStatus === "completed",
  );

  const filteredLectures = audioLectures.filter((l) =>
    l.title?.toLowerCase().includes(materialSearch.toLowerCase()),
  );
  const filteredDocuments = documentLectures.filter((d) =>
    d.title?.toLowerCase().includes(materialSearch.toLowerCase()),
  );

  // Total selected count
  const totalSelected = selectedLectures.length + selectedDocuments.length;

  // Trigger display label
  const renderTriggerLabel = () => {
    if (totalSelected === 0) return "Select study materials";

    if (totalSelected === 1) {
      const className = classLectureId.find(
        (c) => c._id === selectedClassId,
      )?.name;

      if (selectedLectures.length === 1) {
        const lec = audioLectures.find((l) => l._id === selectedLectures[0]);
        if (!lec) return "Select study materials"; // stale id, treat as empty
        return `${lec.title}`;
      }

      const doc = documentLectures.find((d) => d._id === selectedDocuments[0]);
      if (!doc) return "Select study materials"; // stale id, treat as empty
      return `${doc.title}`;
    }

    return `${totalSelected} materials selected`;
  };

  const studyOptions = [
    {
      title: "Study Guide",
      description:
        "Synthesize key concepts and notes into a clear, personalized study guide.",
      icon: BookCopy,
      href: "/student/study/study-guide",
      color: "bg-yellow-200/50",
      iconColor: "text-yellow-500",
    },
    {
      title: "Flashcards",
      description:
        "Review AI-generated flashcards built from your lectures and documents.",
      icon: BrainCircuit,
      href: "/student/study/flashcards",
      color: "bg-purple-200/50",
      iconColor: "text-purple-500",
    },
    {
      title: "Practice Quizzes",
      description:
        "Generate practice quizzes to test your knowledge and track your progress.",
      icon: ClipboardCheck,
      href: "/student/study/practice-quiz",
      color: "bg-blue-200/50",
      iconColor: "text-blue-500",
    },
    {
      title: "Comprehension Assessment",
      description:
        "Chat with Rubitt to assess your understanding and get instant feedback.",
      icon: Podcast,
      href: "/student/study/comprehension-assessment",
      color: "bg-green-200/50",
      iconColor: "text-green-500",
    },
  ];

  const handleStudyOptionClick = (option) => {
    // A class is always required. Materials can be lecture-only,
    // document-only, or a mix of both — at least one of either is required.
    if (!selectedClassId) {
      toast.error("Please select a class first.");
      return;
    }

    if (selectedLectures.length === 0 && selectedDocuments.length === 0) {
      toast.error("Please select at least one lecture or document.");
      return;
    }

    navigate(option.href, {
      state: {
        selectedClassId,
        selectedLectures,
        selectedDocuments,
        timeStamp: Date.now(),
      },
    });
  };

  return (
    <>
      <div className="flex flex-col min-h-screen bg-background">
        <main className="flex-1 overflow-y-auto pb-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-4xl">
            <header className="mb-8 flex items-center gap-2">
              <Button variant="ghost" className="hover:bg-[#6F2CCA]" size="icon" asChild>
                <Link to={"/student/dashboard"}>
                  <ChevronLeft />
                </Link>
              </Button>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                Learn
              </h1>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Class Selection — UNCHANGED */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Select a class to study for
                </label>
                <Select
                  value={selectedClassId}
                  onValueChange={setSelectedClassId}
                >
                  <SelectTrigger className="w-full rounded-md cursor-pointer">
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]">
                    {classLectureId.map((classItem) => (
                      <SelectItem
                        key={classItem?._id}
                        value={classItem?._id}
                        className="cursor-pointer text-sm whitespace-normal break-words py-2 pr-2"
                      >
                        {classItem?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Materials multi-select dropdown */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Select study materials
                </label>
                <div className="relative" ref={dropdownRef}>
                  {/* Trigger */}
                  <button
                    type="button"
                    onClick={() => setMaterialsOpen((o) => !o)}
                    className="w-full flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-accent/5 transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {totalSelected > 0 && (
                        <FileText className="h-4 w-4 text-accent shrink-0" />
                      )}
                      <span className="truncate text-foreground">
                        {renderTriggerLabel()}
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>

                  {/* Dropdown panel */}
                  {materialsOpen && (
                    <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg">
                      {/* Search */}
                      <div className="p-2 border-b border-border">
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted">
                          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <input
                            type="text"
                            placeholder="Search materials"
                            value={materialSearch}
                            onChange={(e) => setMaterialSearch(e.target.value)}
                            className="bg-transparent text-sm outline-none w-full text-foreground placeholder:text-muted-foreground"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>

                      {/* Tabs */}
                      <div className="flex gap-1 px-2 pt-2 pb-1">
                        {["all", "lectures", "documents"].map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => setMaterialTab(tab)}
                            className={`cursor-pointer px-3 py-1 rounded-full text-xs font-medium capitalize transition-colors ${materialTab === tab
                              ? "bg-[#6F2CCA] hover:bg-[#550dba] text-white"
                              : "text-muted-foreground hover:bg-[#6F2CCA] hover:text-white"
                              }`}
                          >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                          </button>
                        ))}
                      </div>

                      {/* Items */}
                      <div className="max-h-[260px] overflow-y-auto px-2 pb-2">
                        {/* Lectures section */}
                        {(materialTab === "all" ||
                          materialTab === "lectures") && (
                            <>
                              <p className="text-xs font-semibold text-foreground px-1 pt-2 pb-1">
                                Lectures
                              </p>
                              {filteredLectures.length > 0 ? (
                                filteredLectures.map((lecture) => (
                                  <div
                                    key={lecture._id}
                                    className="flex items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent/10 cursor-pointer"
                                    onClick={() =>
                                      toggleLectureSelection(lecture._id)
                                    }
                                  >
                                    <div
                                      className={`flex-shrink-0 flex h-4 w-4 items-center justify-center rounded-sm border ${selectedLectures.includes(lecture._id)
                                        ? "bg-[#6F2CCA] hover:bg-[#550dba] text-white"
                                        : "border-border"
                                        }`}
                                    >
                                      {selectedLectures.includes(lecture._id) && (
                                        <Check className="h-3 w-3 text-accent-foreground" />
                                      )}
                                    </div>
                                    <Mic className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="truncate">
                                      {lecture.title}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-muted-foreground px-2 py-1">
                                  {selectedClassId
                                    ? "No completed lectures"
                                    : "Select a class first"}
                                </p>
                              )}
                            </>
                          )}

                        {/* Documents section */}
                        {(materialTab === "all" ||
                          materialTab === "documents") && (
                            <>
                              <p className="text-xs font-semibold text-foreground px-1 pt-3 pb-1">
                                Documents
                              </p>
                              {filteredDocuments.length > 0 ? (
                                filteredDocuments.map((doc) => (
                                  <div
                                    key={doc._id}
                                    className="flex items-center gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent/10 cursor-pointer"
                                    onClick={() =>
                                      toggleDocumentSelection(doc._id)
                                    }
                                  >
                                    <div
                                      className={`flex-shrink-0 flex h-4 w-4 items-center justify-center rounded-sm border ${selectedDocuments.includes(doc._id)
                                        ? "bg-accent border-accent"
                                        : "border-border"
                                        }`}
                                    >
                                      {selectedDocuments.includes(doc._id) && (
                                        <Check className="h-3 w-3 text-accent-foreground" />
                                      )}
                                    </div>
                                    <FileText className="h-3.5 w-3.5 text-red-400 shrink-0" />
                                    <span className="truncate">{doc.title}</span>
                                  </div>
                                ))
                              ) : (
                                <p className="text-xs text-muted-foreground px-2 py-1">
                                  {selectedClassId
                                    ? "No documents found"
                                    : "Select a class first"}
                                </p>
                              )}
                            </>
                          )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Info Banner */}
            <div className="mb-6 flex items-start gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
              <div className="mt-0.5 shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-blue-500">
                <Info className="h-3 w-3 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-900">
                  Learn with lectures and your uploaded documents
                </p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Rubitt uses all available materials to generate tailored study
                  tools just for you.
                </p>
              </div>
              {/* Decorative illustration placeholder */}
              <div className="hidden sm:flex items-center justify-center w-16 h-12 opacity-40">
                <svg viewBox="0 0 64 48" fill="none" className="w-full h-full">
                  <rect
                    x="8"
                    y="8"
                    width="28"
                    height="36"
                    rx="3"
                    fill="#93C5FD"
                  />
                  <rect
                    x="14"
                    y="16"
                    width="16"
                    height="2"
                    rx="1"
                    fill="#DBEAFE"
                  />
                  <rect
                    x="14"
                    y="21"
                    width="12"
                    height="2"
                    rx="1"
                    fill="#DBEAFE"
                  />
                  <rect
                    x="14"
                    y="26"
                    width="14"
                    height="2"
                    rx="1"
                    fill="#DBEAFE"
                  />
                  <circle cx="46" cy="16" r="10" fill="#BFDBFE" />
                  <path
                    d="M42 16h8M46 12v8"
                    stroke="#93C5FD"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>

            {/* Study Options Grid — UNCHANGED */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {studyOptions.map((option) => (
                <Card
                  key={option.title}
                  className="group cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] border-2 border-transparent hover:border-accent/20"
                  onClick={() => handleStudyOptionClick(option)}
                >
                  <CardContent className="px-3 py-2 md:p-6 flex items-center justify-center gap-4 min-h-[92px]">
                    <div
                      className={`p-2 md:p-3 rounded-xl ${option.color} group-hover:scale-110 transition-transform duration-200`}
                    >
                      <option.icon
                        className={`w-5 h-5 md:w-6 md:h-6 ${option.iconColor}`}
                      />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-md md:text-lg font-semibold text-foreground group-hover:text-accent transition-colors">
                        {option.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1 mb-2">
                        {option.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}