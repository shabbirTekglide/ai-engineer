import { Button } from "../../components/ui/Button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/Card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/Tabs";
import { Badge } from "../../components/ui/Badge";
import {
  Link,
  NavLink,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Upload,
  ChevronLeft,
  X,
  MoreHorizontal,
  RotateCcw,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { useEffect, useState, useCallback, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { getClassById, uploadFile } from "../../store/slicers/classSlice.js";
import { formatDateTime, normalizeDays } from "../../utils/utilities.js";
import {
  clearCurrentLecture,
  deleteLecture,
  getAllLectures,
  reprocessLecture,
} from "../../store/slicers/lectureSlice.js";
import SyllabusViewer from "../../components/kora/SyllabusViewer.jsx";
import { EditClassDialog } from "../../components/kora/EditClassDialog.jsx";
import { DeleteClassConfirmationDialog } from "../../components/kora/DeleteClassConfirmationDialog.jsx";
import { toast } from "../../hooks/use-toast.js";
import { toast as toastify } from "react-toastify";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/DropdownMenu";
import ReactSpinner from "../../components/ReactSpinner.jsx";
import {
  Select,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectContent,
} from "../../components/ui/Select.jsx";
import { useProcessingPoller } from "../../hooks/useProcessingPoller.js";
import { DeleteLectureConfirmationDialog } from "../../components/kora/DeleteLectureConfirmationDialog.jsx";

const PAGE_SIZE = 5;

export default function ClassDetailsPage() {
  const { classId } = useParams();
  const { currentClass } = useSelector((state) => state.class);
  const { lectures } = useSelector((state) => state.lecture);

  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [isLoading, setIsLoading] = useState(true);

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "lectures";
  const setActiveTab = (tab) => {
    setSearchParams({ tab }, { replace: true });
  };

  const fileInputRef = useRef(null);
  const [deleteLectureDialog, setDeleteLectureDialog] = useState({
    open: false,
    lecture: null,
  });
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Separate filters + page state per tab
  const [statusFilter, setStatusFilter] = useState("all"); // lectures tab
  const [docStatusFilter, setDocStatusFilter] = useState("all"); // documents tab
  const [currentPage, setCurrentPage] = useState(1); // lectures tab
  const [documentPage, setDocumentPage] = useState(1); // documents tab

  // Auto-poll for status updates when there are active (pending/processing) lectures
  const { hasActiveProcessing } = useProcessingPoller({
    interval: 5000,
    enabled: true,
  });

  // 1. Initial Load: Fetch Class
  useEffect(() => {
    if (!classId) return;

    const fetchClassData = async () => {
      setIsLoading(true);
      try {
        await dispatch(getClassById(classId)).unwrap();
      } catch (err) {
        navigate("/student/my-classes");
        toast({
          title: "Error",
          description: "Failed to fetch class details or unauthorized access.",
          variant: "destructive",
        });
      }
    };

    dispatch(clearCurrentLecture());
    fetchClassData();
  }, [classId, dispatch, navigate]);

  // 2. Fetch combined lectures+documents once per class.
  // We deliberately fetch a large batch and do filtering/pagination client-side
  // since both tabs share the same underlying list from this API.
  useEffect(() => {
    if (!classId) return;

    const fetchLectures = async () => {
      await dispatch(
        getAllLectures({ classId, page: 1, limit: 100, status: "all" }),
      );
      setIsLoading(false);
    };

    fetchLectures();
  }, [classId, dispatch]);

  // Reset both pages whenever class changes
  useEffect(() => {
    setCurrentPage(1);
    setDocumentPage(1);
  }, [classId]);

  const handleStatusChange = (newStatus) => {
    setStatusFilter(newStatus);
    setCurrentPage(1);
  };

  const handleDocStatusChange = (newStatus) => {
    setDocStatusFilter(newStatus);
    setDocumentPage(1);
  };

  // Syllabus upload state
  const [syllabusUploaded, setSyllabusUploaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    setSyllabusUploaded(!!currentClass?.syllabus);
  }, [currentClass]);

  const onPickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleReprocessLecture = async (lectureId) => {
    try {
      const loadingToast = toastify.loading(
        "Saving and transcribing lecture...",
      );
      await dispatch(reprocessLecture({ lectureId })).unwrap();
      toastify.dismiss(loadingToast);
    } catch (e) {
      toastify.dismiss();
      toastify.error(e || "Failed to save lecture.");
    }
  };

  const handleDeleteLecture = async (lectureId) => {
    try {
      await dispatch(deleteLecture({ lectureId })).unwrap();
      toastify.success("Lecture deleted successfully.");
    } catch (e) {
      toastify.error(e || "Failed to delete lecture.");
    }
  };

  const handleLectureClick = (lecture) => {
    if (lecture.processingStatus === "completed") {
      navigate(`/student/my-classes/${classId}/${lecture._id}`, {
        state: { fromTab: activeTab },
      });
      return;
    }

    if (lecture.processingStatus === "processing") {
      navigate(`/student/my-classes/${classId}/generate-notes`, {
        state: { processId: lecture._id },
      });
      return;
    }

    // failed or other states
    toast({
      title: "Lecture Not Ready",
      description: `This lecture is in ${lecture.processingStatus} state. Please wait until it's completed.`,
      variant: "destructive",
    });
  };

  const onFileChange = useCallback((e) => {
    const f = e.target.files?.[0];

    if (f) {
      const allowedTypes = [
        "application/pdf",
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
      ];

      if (allowedTypes.includes(f.type)) {
        setSelectedFile(f);
        setUploadError("");
      } else {
        toast({
          title: "Invalid File Type",
          description: "Please upload PDF or image files only.",
          variant: "destructive",
        });
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);

    const f = e.dataTransfer.files?.[0];
    if (f) {
      const allowedTypes = [
        "application/pdf",
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
      ];

      const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
      const fileExtension = "." + f.name.split(".").pop().toLowerCase();

      if (
        !allowedTypes.includes(f.type) &&
        !allowedExtensions.includes(fileExtension)
      ) {
        toast({
          title: "Invalid File Type",
          description: "Please upload PDF or image files only.",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(f);
      setUploadError("");
    }
  }, []);

  const handleRemoveFile = useCallback(() => {
    setSelectedFile(null);
    setUploadError("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleFileUpload = useCallback(async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadError("");
    setIsLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      await dispatch(uploadFile({ classId, formData })).unwrap();
      setSyllabusUploaded(true);
      setSelectedFile(null);

      dispatch(getClassById(classId));

      toast({
        title: "Upload Successful",
        description: "Syllabus uploaded successfully.",
      });
    } catch (err) {
      if (err?.type === "timeout" || err?.type === "connection_error") {
        const errorMsg =
          err.message || "Processing may continue in the background.";
        const suggestion =
          err.suggestion || "Please check back in a few minutes.";

        setUploadError(errorMsg);

        toast({
          title: "Processing in Background",
          description: `${errorMsg} ${suggestion}`,
          variant: "default",
          duration: 10000,
        });

        setTimeout(() => {
          dispatch(getClassById(classId));
        }, 30000);
      } else {
        const msg =
          typeof err === "string" ? err : err?.message || "Upload failed";
        setUploadError(msg);

        toast({
          title: "Upload Failed",
          description: msg,
          variant: "destructive",
        });
      }
    } finally {
      setUploading(false);
      setIsLoading(false);
    }
  }, [selectedFile, classId, dispatch]);

  const meetingDaysPretty = normalizeDays(currentClass?.meetingDays).length
    ? normalizeDays(currentClass?.meetingDays).join("/")
    : "—";

  const syllabusUrl = currentClass?.syllabus || "";

  // ---- Lectures (audio) — filter + client-side pagination ----
  const filteredAudioLectures = (lectures || []).filter(
    (lecture) =>
      lecture.sourceType !== "document" &&
      (statusFilter === "all" || lecture.processingStatus === statusFilter),
  );

  const audioTotalPages = Math.max(
    1,
    Math.ceil(filteredAudioLectures.length / PAGE_SIZE),
  );

  const paginatedAudioLectures = filteredAudioLectures.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  // ---- Documents — filter + client-side pagination ----
  const filteredDocuments = (lectures || []).filter(
    (lecture) =>
      lecture.sourceType === "document" &&
      (docStatusFilter === "all" ||
        lecture.processingStatus === docStatusFilter),
  );

  const documentsTotalPages = Math.max(
    1,
    Math.ceil(filteredDocuments.length / PAGE_SIZE),
  );

  const paginatedDocuments = filteredDocuments.slice(
    (documentPage - 1) * PAGE_SIZE,
    documentPage * PAGE_SIZE,
  );

  return (
    <>
      {isLoading ? (
        <ReactSpinner />
      ) : (
        <div className="flex flex-col min-h-screen bg-background">
          <main className="flex-1 overflow-y-auto pb-24">
            <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-8 max-w-4xl">
              <header className="mb-6 flex md:justify-between md:items-start flex-col md:flex-row justify-start items-start space-y-5 md:space-x-0 ">
                <div className="flex md:items-center gap-2 max-w-[380px] md:max-w-full">
                  <Button variant="ghost" size="icon" asChild>
                    <Link to="/student/my-classes">
                      <ChevronLeft />
                    </Link>
                  </Button>
                  <div>
                    <div className="flex md:items-center gap-2 mb-1">
                      <span
                        className="mt-2 w-[10px] h-[10px] md:mt-0 md:w-3 md:h-3 rounded-full"
                        style={{
                          backgroundColor: `hsl(${(Number(currentClass?.color ?? 86) % 101) * 3.6}, 90%, 50%)`,
                        }}
                      />
                      <h1 className="text-[20px] leading-[24px] md:text-[24px] md:leading-[30px] font-semibold text-foreground mr-1 w-[80%] md:w-[90%]">
                        {currentClass?.name ?? "—"}
                      </h1>
                    </div>
                    <p className="text-sm text-muted-foreground md:ml-5 mt-2 ml-3">
                      {currentClass?.instructor ?? "—"} — {meetingDaysPretty} —{" "}
                      {currentClass?.meetingTime ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                  <Button
                    className="flex-1 md:flex-none bg-[#6F2CCA] hover:bg-[#550dba] text-white min-w-[70px] min-h-[40px] "
                    variant="outline"
                    size="sm"
                    onClick={() => setEditDialogOpen(true)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    className="flex-1 md:flex-none  min-h-[40px] text-white bg-red-500 hover:bg-red-600  hover:no-underline"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    Delete
                  </Button>
                </div>
              </header>

              <EditClassDialog
                open={editDialogOpen}
                onOpenChange={setEditDialogOpen}
                classData={currentClass}
                onUpdate={() => {
                  if (classId) {
                    dispatch(getClassById(classId));
                  }
                }}
              />

              <DeleteClassConfirmationDialog
                open={deleteDialogOpen}
                onOpenChange={setDeleteDialogOpen}
                classData={currentClass}
              />

              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="w-full"
              >
                <div className="flex justify-between items-center mb-4">
                  <TabsList className="border-b-0">
                    <TabsTrigger value="lectures" className="cursor-pointer">
                      Lectures
                    </TabsTrigger>
                    <TabsTrigger value="documents" className="cursor-pointer">
                      Documents
                    </TabsTrigger>
                    <TabsTrigger value="syllabus" className="cursor-pointer">
                      Syllabus
                    </TabsTrigger>
                  </TabsList>
                  {activeTab === "lectures" && (
                    <Select
                      value={statusFilter}
                      onValueChange={handleStatusChange}
                    >
                      <SelectTrigger className="w-[130px] cursor-pointer rounded-md">
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem className="cursor-pointer" value="all">
                          All
                        </SelectItem>
                        <SelectItem
                          className="cursor-pointer"
                          value="completed"
                        >
                          Completed
                        </SelectItem>
                        <SelectItem
                          className="cursor-pointer"
                          value="processing"
                        >
                          Processing
                        </SelectItem>
                        <SelectItem className="cursor-pointer" value="failed">
                          Failed
                        </SelectItem>
                        <SelectItem className="cursor-pointer" value="pending">
                          Pending
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {activeTab === "documents" && (
                    <Select
                      value={docStatusFilter}
                      onValueChange={handleDocStatusChange}
                    >
                      <SelectTrigger className="w-[130px] cursor-pointer rounded-md">
                        <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem className="cursor-pointer" value="all">
                          All
                        </SelectItem>
                        <SelectItem
                          className="cursor-pointer"
                          value="completed"
                        >
                          Completed
                        </SelectItem>
                        <SelectItem
                          className="cursor-pointer"
                          value="processing"
                        >
                          Processing
                        </SelectItem>
                        <SelectItem className="cursor-pointer" value="failed">
                          Failed
                        </SelectItem>
                        <SelectItem className="cursor-pointer" value="pending">
                          Pending
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <TabsContent value="lectures">
                  <Card>
                    <CardContent className="p-0">
                      <ul className="divide-y divide-border">
                        {paginatedAudioLectures.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            No lectures found
                          </div>
                        ) : (
                          paginatedAudioLectures.map((lecture) => (
                            <div key={lecture._id} className="group relative">
                              <li
                                onClick={() => handleLectureClick(lecture)}
                                className="p-4 flex justify-between items-start md:items-center hover:bg-muted cursor-pointer transition-colors"
                              >
                                <div className="flex-1">
                                  <p className="font-semibold text-foreground group-hover:text-accent transition-colors text-[13px] leading-[17px] md:text-[16px] md:leading-[20px]">
                                    {lecture.title}
                                  </p>
                                  <p className="text-sm text-muted-foreground mt-2">
                                    {formatDateTime(lecture.recordedAt)}
                                  </p>
                                </div>
                                <div
                                  className="flex items-center gap-3"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Badge
                                    variant={
                                      lecture.processingStatus === "completed"
                                        ? "secondary"
                                        : "outline"
                                    }
                                    className={
                                      lecture.processingStatus === "completed"
                                        ? "text-green-600 bg-green-50"
                                        : lecture.processingStatus === "failed"
                                          ? "text-red-600 bg-red-50"
                                          : "text-yellow-600 bg-yellow-50"
                                    }
                                  >
                                    {(lecture.processingStatus === "pending" ||
                                      lecture.processingStatus ===
                                      "processing") && (
                                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                      )}
                                    {lecture.processingStatus}
                                  </Badge>

                                  {(lecture.processingStatus === "completed" ||
                                    lecture.processingStatus === "failed") && (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 rounded-full hover:bg-muted-foreground/10"
                                          >
                                            <MoreHorizontal className="h-4 w-4" />
                                            <span className="sr-only">
                                              Open menu
                                            </span>
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                          align="end"
                                          className="w-[160px]"
                                        >
                                          <DropdownMenuItem
                                            onClick={() =>
                                              handleReprocessLecture(lecture._id)
                                            }
                                            className="hover:bg-[#6F2CCA] cursor-pointer flex items-center gap-2 text-foreground"
                                          >
                                            <RotateCcw className="h-4 w-4" />
                                            <span>Reprocess</span>
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            onClick={() =>
                                              setDeleteLectureDialog({
                                                open: true,
                                                lecture,
                                              })
                                            }
                                            className="hover:bg-[#6F2CCA] cursor-pointer flex items-center gap-2 text-foreground"
                                          >
                                            <X className="h-4 w-4" />
                                            <span>Delete</span>
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    )}
                                </div>
                              </li>
                            </div>
                          ))
                        )}
                      </ul>

                      {/* Lecture Pagination Controls */}
                      {audioTotalPages > 1 && (
                        <div className="flex items-center justify-between p-4 border-t border-border bg-muted/30">
                          <p className="text-xs md:text-sm text-muted-foreground font-medium">
                            Showing page{" "}
                            <span className="text-foreground">
                              {currentPage}
                            </span>{" "}
                            of{" "}
                            <span className="text-foreground">
                              {audioTotalPages}
                            </span>
                          </p>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setCurrentPage((p) => Math.max(1, p - 1));
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              disabled={currentPage <= 1}
                              className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3 cursor-pointer"
                            >
                              <ChevronLeft className="h-4 w-4 md:mr-1" />
                              <span className="hidden md:inline">Previous</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setCurrentPage((p) =>
                                  Math.min(audioTotalPages, p + 1),
                                );
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              disabled={currentPage >= audioTotalPages}
                              className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3 cursor-pointer"
                            >
                              <span className="hidden md:inline">Next</span>
                              <ChevronRight className="h-4 w-4 md:ml-1" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  <div className="mt-4">
                    <Link to="/student/upload-lecture">
                      <Button className="w-full bg-[#6F2CCA] hover:bg-[#550dba]">
                        Record Lecture
                      </Button>
                    </Link>
                  </div>
                </TabsContent>

                <TabsContent value="documents">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                      <div>
                        <CardTitle className="text-base font-semibold">
                          Documents
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          Upload, manage, and access class documents.
                        </p>
                      </div>
                      <Button
                        className="bg-[#6F2CCA] hover:bg-[#550dba] text-white flex items-center gap-2"
                        size="sm"
                        onClick={() => navigate("/student/upload-document", { state: { classId: currentClass._id } })}
                      >
                        <Upload className="h-4 w-4" />
                        Upload Document
                      </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ul className="divide-y divide-border">
                        {paginatedDocuments.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            No documents found
                          </div>
                        ) : (
                          paginatedDocuments.map((doc) => {
                            const fileSize = doc.sourceFile?.sizeBytes
                              ? `${(doc.sourceFile.sizeBytes / (1024 * 1024)).toFixed(2)} MB`
                              : "-";

                            return (
                              <div key={doc._id} className="group relative">
                                <li
                                  key={doc._id}
                                  onClick={() => handleLectureClick(doc)}
                                  className="p-4 flex items-center justify-between hover:bg-muted transition-colors cursor-pointer"
                                >
                                  <div className="flex items-center gap-3">
                                    <div
                                      className={`p-2 rounded ${doc.fileType === "pdf"
                                        ? "bg-red-50"
                                        : doc.fileType === "docx"
                                          ? "bg-blue-50"
                                          : "bg-green-50"
                                        }`}
                                    >
                                      <svg
                                        className={`h-5 w-5 ${doc.fileType === "pdf"
                                          ? "text-red-500"
                                          : doc.fileType === "docx"
                                            ? "text-blue-500"
                                            : "text-green-500"
                                          }`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                        />
                                      </svg>
                                    </div>
                                    <div>
                                      <p className="font-bold text-sm text-foreground">
                                        {doc.title || doc.sourceFile?.originalName}
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        {doc.sourceFile?.extension?.toUpperCase()}{" "}
                                        • Uploaded{" "}
                                        {new Date(doc.createdAt).toLocaleString()}{" "}
                                        • {fileSize}
                                      </p>
                                    </div>
                                  </div>
                                  <div
                                    className="flex items-center gap-3"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Badge
                                      variant={
                                        doc.processingStatus === "completed"
                                          ? "secondary"
                                          : "outline"
                                      }
                                      className={
                                        doc.processingStatus === "completed"
                                          ? "text-green-600 bg-green-50"
                                          : doc.processingStatus === "failed"
                                            ? "text-red-600 bg-red-50"
                                            : "text-yellow-600 bg-yellow-50"
                                      }
                                    >
                                      {(doc.processingStatus === "pending" ||
                                        doc.processingStatus === "processing") && (
                                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                        )}
                                      {doc.processingStatus}
                                    </Badge>

                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 rounded-full hover:bg-muted-foreground/10"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <MoreHorizontal className="h-4 w-4" />
                                          <span className="sr-only">Open menu</span>
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent
                                        align="end"
                                        className="w-[140px]"
                                      >
                                        <DropdownMenuItem className="cursor-pointer flex items-center gap-2 text-foreground">
                                          <NavLink
                                            className="flex justify-between items-center gap-2"
                                            to={`${doc.sourceFile?.url}`}
                                          >
                                            <Upload className="h-4 w-4" />
                                            <span>Download</span>
                                          </NavLink>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="cursor-pointer flex items-center gap-2 text-foreground" onClick={() =>
                                          setDeleteLectureDialog({
                                            open: true,
                                            lecture: doc,
                                          })
                                        }>
                                          <X className="h-4 w-4" />
                                          <span>Delete</span>
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </li>
                              </div>
                            );
                          })
                        )}
                      </ul>

                      {/* Document Pagination Controls */}
                      {documentsTotalPages > 1 && (
                        <div className="flex items-center justify-between p-4 border-t border-border bg-muted/30">
                          <p className="text-xs md:text-sm text-muted-foreground font-medium">
                            Showing page{" "}
                            <span className="text-foreground">
                              {documentPage}
                            </span>{" "}
                            of{" "}
                            <span className="text-foreground">
                              {documentsTotalPages}
                            </span>
                          </p>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setDocumentPage((p) => Math.max(1, p - 1));
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              disabled={documentPage <= 1}
                              className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3 cursor-pointer"
                            >
                              <ChevronLeft className="h-4 w-4 md:mr-1" />
                              <span className="hidden md:inline">Previous</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setDocumentPage((p) =>
                                  Math.min(documentsTotalPages, p + 1),
                                );
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              disabled={documentPage >= documentsTotalPages}
                              className="h-8 w-8 p-0 md:h-9 md:w-auto md:px-3 cursor-pointer"
                            >
                              <span className="hidden md:inline">Next</span>
                              <ChevronRight className="h-4 w-4 md:ml-1" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="syllabus">
                  {syllabusUploaded ? (
                    <div className="space-y-6">
                      <div className="flex items-center gap-2">
                        <Button
                          onClick={onPickFile}
                          disabled={uploading}
                          className=" text-white bg-[#6F2CCA] hover:bg-[#550dba]"
                        >
                          {uploading ? "Uploading..." : "Upload / Replace PDF"}
                        </Button>
                        <input
                          id="syllabus-file-input"
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,image/*"
                          className="hidden"
                          onChange={onFileChange}
                          disabled={uploading}
                        />
                      </div>

                      {selectedFile && (
                        <Card className="w-full">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="md:p-2 bg-secondary rounded shrink-0">
                                  <Upload className="h-3 w-3 md:h-5 md:w-5 text-muted-foreground" />
                                </div>

                                <div className="min-w-0">
                                  <p
                                    className="font-medium text-sm truncate"
                                    title={selectedFile.name}
                                  >
                                    {selectedFile.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {(selectedFile.size / 1024).toFixed(2)} KB
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <Button
                                  onClick={handleFileUpload}
                                  disabled={uploading}
                                  className="bg-[#976AF2] hover:bg-[#7a46e4] text-white"
                                >
                                  {uploading ? "Uploading..." : "Upload"}
                                </Button>

                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={handleRemoveFile}
                                  disabled={uploading}
                                  className="hover:bg-red-100 hover:text-red-600"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {syllabusUrl && (
                        <Card className="w-full">
                          <CardHeader>
                            <CardTitle className="text-lg">
                              Original Syllabus File
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-0">
                            <SyllabusViewer url={syllabusUrl} />
                          </CardContent>
                        </Card>
                      )}

                      {!syllabusUrl && (
                        <Card className="w-full">
                          <CardContent className="p-6 text-center text-muted-foreground">
                            No syllabus found. Upload a syllabus file to see
                            parsed course information and events.
                          </CardContent>
                        </Card>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="hover:shadow-md transition-shadow">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Course Code
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pb-4">
                            <p className="font-semibold ">
                              {currentClass?.name || "BIO-101"}
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="hover:shadow-md transition-shadow">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Instructor Name
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pb-4">
                            <p className="font-semibold break-all">
                              {currentClass?.instructor ||
                                "dr.smith@university.edu"}
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="hover:shadow-md transition-shadow">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Meeting Time
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pb-4">
                            <p className="font-semibold break-all">
                              {currentClass?.meetingTime ||
                                "Tue 3-5 PM (Room 214)"}
                            </p>
                          </CardContent>
                        </Card>
                        <Card className="hover:shadow-md transition-shadow">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                              Meeting Days
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="pb-4">
                            <p className="font-semibold break-all">
                              {meetingDaysPretty}
                            </p>
                          </CardContent>
                        </Card>
                      </div>

                      {uploadError && (
                        <p className="text-xs text-red-500">{uploadError}</p>
                      )}
                    </div>
                  ) : (
                    <>
                      <Card
                        className={`w-full border-dashed border-2 transition-colors cursor-pointer ${isDragging ? "border-primary" : "hover:border-primary"} ${uploading ? "opacity-50" : ""}`}
                        onClick={onPickFile}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                      >
                        <CardContent className="p-12 flex flex-col items-center justify-center text-center">
                          <div className="mb-4 rounded-full bg-secondary p-3">
                            <Upload className="h-8 w-8 text-muted-foreground" />
                          </div>
                          <p className="font-semibold mb-1">
                            Drag & Drop or Click to Upload Syllabus
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Upload a PDF or image file.
                          </p>

                          <input
                            id="syllabus-file-input"
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,image/*"
                            className="hidden"
                            onChange={onFileChange}
                            disabled={uploading}
                          />
                        </CardContent>
                      </Card>

                      {selectedFile && (
                        <Card className="w-full mt-4">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-secondary rounded">
                                  <Upload className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div>
                                  <p className="font-medium text-sm">
                                    {selectedFile.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {(selectedFile.size / 1024).toFixed(2)} KB
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  onClick={handleFileUpload}
                                  disabled={uploading}
                                  className="bg-[#976AF2] hover:bg-[#7a46e4] text-white"
                                >
                                  {uploading ? "Uploading..." : "Upload"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={handleRemoveFile}
                                  disabled={uploading}
                                  className="hover:bg-red-100 hover:text-red-600"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {uploadError && (
                        <p className="mt-2 text-xs text-red-500 text-center">
                          {uploadError}
                        </p>
                      )}
                    </>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </main>
          <DeleteLectureConfirmationDialog
            open={deleteLectureDialog.open}
            onOpenChange={(open) =>
              setDeleteLectureDialog((prev) => ({ ...prev, open }))
            }
            lecture={deleteLectureDialog.lecture}
            onConfirm={() =>
              handleDeleteLecture(deleteLectureDialog.lecture._id)
            }
          />
        </div>
      )}
    </>
  );
}