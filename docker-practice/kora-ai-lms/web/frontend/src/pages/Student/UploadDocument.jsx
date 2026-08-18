import React, { useState, useRef, useEffect } from "react";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import { AddClassDialog } from "../../components/kora/AddClassDialog";
import {
  ChevronLeft,
  ChevronDown,
  Plus,
  FileUp,
  Sparkles,
  BookOpen,
  Presentation,
  FileText,
  MoreHorizontal,
  CheckCircle2,
} from "lucide-react";
import { uploadDocument } from "../../store/slicers/lectureSlice";

const DOCUMENT_TYPES = [
  { id: "notes", label: "Notes", icon: BookOpen },
  { id: "slides", label: "Slides", icon: Presentation },
  { id: "handout", label: "Handout", icon: FileText },
  { id: "other", label: "Other", icon: MoreHorizontal },
];

const UploadDocument = () => {
  const location = useLocation();
  const { classId } = location.state || {};
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { classes } = useSelector((state) => state.class);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState(classId || "");
  const [documentName, setDocumentName] = useState("");
  const [documentType, setDocumentType] = useState("notes");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const dropdownRef = useRef(null);
  const fileInputRef = useRef(null);
  const addClassTriggerRef = useRef(null);
  const previousClassIdsRef = useRef(new Set(classes.map((c) => c._id)));

  useEffect(() => {
    if (classes.length === 0) return;

    const currentClassIds = new Set(classes.map((c) => c._id));
    const newClassId = classes.find(
      (c) => !previousClassIdsRef.current.has(c._id),
    )?._id;

    if (newClassId) {
      setSelectedClassId(newClassId);
    } else if (!selectedClassId) {
      setSelectedClassId(classes[0]._id);
    }

    previousClassIdsRef.current = currentClassIds;
  }, [classes, selectedClassId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleDropzoneClick = () => fileInputRef.current?.click();

  const getSelectedClassName = () => {
    if (!selectedClassId) return "Select a class";
    const selectedClass = classes.find((c) => c._id === selectedClassId);
    return selectedClass ? selectedClass.name : "Select a class";
  };

  const handleClassSelect = (classId) => {
    if (classId === "add-new") {
      setIsDropdownOpen(false);
      setTimeout(() => {
        if (addClassTriggerRef.current) {
          addClassTriggerRef.current.click();
        }
      }, 100);
    } else {
      setSelectedClassId(classId);
      setIsDropdownOpen(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedClassId) {
      toast.error("Please select a class.");
      return;
    }

    if (!selectedFile) {
      toast.error("Please upload a document first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("title", documentName || selectedFile.name);

    try {
      setSaving(true);

      const loadingToast = toast.loading("Uploading document...");

      const response = await dispatch(
        uploadDocument({
          classId: selectedClassId,
          formData,
        }),
      ).unwrap();

      toast.dismiss(loadingToast);

      toast.success(response?.message || "Document uploaded successfully");

      // reset form
      setSelectedFile(null);
      setDocumentName("");
      setDocumentType("notes");

      // redirect if needed
      navigate(`/student/my-classes/${selectedClassId}?tab=documents`);
    } catch (error) {
      toast.dismiss();

      toast.error(
        typeof error === "string"
          ? error
          : error?.message || "Failed to upload document",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-col min-h-screen bg-background">
        <main className="flex-1 overflow-y-auto pb-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col flex-grow h-full max-w-6xl">
            <header className="w-full flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" asChild>
                  <Link to="/student/dashboard">
                    <ChevronLeft />
                  </Link>
                </Button>
                <h1 className="text-[24px] md:text-3xl font-bold text-foreground tracking-tight w-[85%] md:w-full">
                  Upload Document
                </h1>
              </div>
            </header>
            <Card className="shadow-sm">
              <CardContent className="p-6 space-y-6">
                <div
                  onClick={handleDropzoneClick}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`
                    relative cursor-pointer rounded-xl border-2 border-dashed transition-all duration-200
                    flex flex-col items-center justify-center py-14 px-6 text-center
                    ${isDragging
                      ? "border-[#6F2CCA] bg-blue-50 dark:bg-blue-950/20"
                      : "border-[#7554a4] bg-blue-50/60 dark:bg-blue-950/10 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                    }
                  `}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.ppt,.pptx,.txt"
                    className="hidden"
                    onChange={handleFileInput}
                  />

                  <div className="mb-5 w-24 h-24 rounded-full border-[10px] border-blue-100/60 dark:border-blue-900/20 flex items-center justify-center">
                    <div className="w-full h-full rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                      <FileUp
                        className="w-8 h-8 text[#320C85]"
                        strokeWidth={1.8}
                      />
                    </div>
                  </div>

                  {selectedFile ? (
                    <>
                      <p className="text-base font-semibold text-foreground mb-1">
                        {selectedFile.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB —
                        click to replace
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="tex-sm md:text-lg font-semibold text-foreground mb-1">
                        Drag documents here or click to upload
                      </p>
                      <p className="mt-2 text-sm text-gray-400 font-medium tracking-wide">
                        PDF, DOCX, PPT, TXT
                      </p>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="class">Class</Label>
                    <div className="relative" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className="h-[42px] cursor-pointer w-full flex items-center justify-between text-left px-3 py-2 text-sm bg-background border border-input rounded-md hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-accent"
                      >
                        <span className="truncate mr-2 min-w-0">
                          {getSelectedClassName()}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                      </button>

                      {isDropdownOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-background border border-input rounded-md shadow-lg max-h-60 overflow-auto">
                          <button
                            type="button"
                            onClick={() => handleClassSelect("add-new")}
                            className="cursor-pointer w-full text-left px-3 py-2 text-sm hover:bg-accent/10 border-b border-input flex items-center gap-2 text-[#320C85] font-medium"
                          >
                            <Plus className="h-4 w-4" />
                            Add New Class
                          </button>
                          {classes.map((classItem) => (
                            <button
                              key={classItem._id}
                              type="button"
                              onClick={() => handleClassSelect(classItem._id)}
                              className={`cursor-pointer w-full text-left px-3 py-2 text-sm hover:bg-accent/10 ${selectedClassId === classItem._id
                                ? "bg-[#6F2CCA]/20 font-medium"
                                : ""
                                }`}
                            >
                              {classItem.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="doc-name">Document Name</Label>
                    <Input
                      id="doc-name"
                      placeholder="Enter document name"
                      value={documentName}
                      onChange={(e) => setDocumentName(e.target.value)}
                      className="h-[42px]"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Document Type</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
                    {DOCUMENT_TYPES.map(({ id, label, icon: Icon }) => {
                      const isSelected = documentType === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setDocumentType(id)}
                          className={`
                            flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium
                            transition-all duration-150 cursor-pointer
                            ${isSelected
                              ? "border-[#6F2CCA] bg-[#6F2CCA]/10 text-[#320C85] "
                              : "border-input bg-background text-foreground hover:bg-accent/10"
                            }
                          `}
                        >
                          {isSelected ? (
                            <CheckCircle2 className="w-4 h-4 text-[#320C85] flex-shrink-0" />
                          ) : (
                            <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                          )}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-center pt-2">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={saving || !selectedFile}
                    className={`
                      min-w-[300px] flex items-center justify-center gap-2 px-10 py-3
                      rounded-full text-white text-[15px] font-semibold transition-all duration-200
                      ${saving || !selectedFile
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-[#6F2CCA] hover:bg-[#550dba] cursor-pointer shadow-md hover:shadow-lg"
                      }
                    `}
                  >
                    <Sparkles className="w-4 h-4" />
                    {saving ? "Processing..." : "Generate Notes"}
                  </button>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {/* Hidden Add Class Dialog trigger — same pattern as UploadLecturePage */}
      <AddClassDialog>
        <button
          ref={addClassTriggerRef}
          type="button"
          style={{ display: "none" }}
          aria-hidden="true"
        />
      </AddClassDialog>
    </>
  );
};

export default UploadDocument;
