import { useEffect, useState, useRef } from "react";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import { ChevronLeft, FileText, Loader2, AlertCircle } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { TiExportOutline } from "react-icons/ti";
import { useDispatch, useSelector } from "react-redux";
import { getLearingPod } from "../../../store/slicers/learnSlice";
import { extractHtmlContent } from "../../../utils/utilities";

export default function StudyGuidePage() {
  const { studyGuides, loading, error } = useSelector((state) => state.learn);
  const location = useLocation();
  const { selectedClassId, selectedLectures, selectedDocuments, timestamp } = location.state || {};
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // State for active tab
  const [activeTab, setActiveTab] = useState(0);
  const styleElementRef = useRef(null);
  // Prevent duplicate fetch when effect runs twice (e.g. Strict Mode) or on rapid re-renders
  const lastFetchKeyRef = useRef(null);

  // studyGuides is now an array of { lectureId, title, studyGuide, cached, error }
  const studyGuideData = Array.isArray(studyGuides) ? studyGuides : [];

  const downloadAsHtml = (htmlContent, filename = "study-guide") => {
    if (!htmlContent) {
      console.error("No content to download");
      return;
    }

    // Ensure filename has .html extension
    const finalFilename = filename.endsWith(".html")
      ? filename
      : `${filename}.html`;
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = finalFilename;
    a.style.display = "none";

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!selectedClassId || (!selectedLectures?.length && !selectedDocuments?.length)) return;
    const key = `${selectedClassId}-${selectedLectures?.join(",") || ""}-${selectedDocuments?.join(",") || ""}`;
    // Only fetch once per class+lectures combo per mount to avoid duplicate in-flight requests
    if (lastFetchKeyRef.current === key) return;
    lastFetchKeyRef.current = key;
    dispatch(
      getLearingPod({ classId: selectedClassId, lectureIds: selectedLectures || [], documentIds: selectedDocuments || [] }),
    );
    return () => {
      lastFetchKeyRef.current = null;
    };
  }, [dispatch, selectedClassId, selectedLectures, selectedDocuments]);

  // Reset active tab when new data loads
  useEffect(() => {
    if (studyGuideData.length > 0) {
      setActiveTab(0);
    }
  }, [studyGuideData.length]);

  // Extract and inject styles from HTML study guide
  useEffect(() => {
    const currentStudyGuide = studyGuideData[activeTab]?.studyGuide;

    if (currentStudyGuide) {
      const { styles } = extractHtmlContent(currentStudyGuide);

      if (styles) {
        // Remove existing style element if it exists
        if (styleElementRef.current) {
          styleElementRef.current.remove();
        }

        // Create and inject style element
        const styleElement = document.createElement("style");
        styleElement.id = "kora-study-guide-styles";
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
        styleElementRef.current = styleElement;
      }
    }

    // Cleanup: remove style element when component unmounts or content changes
    return () => {
      if (styleElementRef.current) {
        styleElementRef.current.remove();
        styleElementRef.current = null;
      }
    };
  }, [studyGuideData, activeTab]);

  // Handle case when required state is missing
  useEffect(() => {
    if (!selectedClassId || (!selectedLectures?.length && !selectedDocuments?.length)) {
      navigate("/student/study");
    }
  }, [selectedClassId, selectedLectures, selectedDocuments, navigate]);

  // Get current study guide content
  const currentItem = studyGuideData[activeTab];
  const hasContent = currentItem?.studyGuide && !currentItem?.error;

  return (
    <>
      <div className="flex flex-col min-h-screen bg-muted/30">
        <main className="flex-1 py-8 px-4">
          <div className="container mx-auto max-w-5xl">
            <header className="mb-6 flex items-center md:justify-between justify-start gap-5">
              <div className="flex items-center md:gap-2">
                <Button variant="ghost" size="icon" asChild>
                  <Link to={"/student/study"}>
                    <ChevronLeft />
                  </Link>
                </Button>
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
                    Study Guide
                  </h1>
                  {studyGuideData.length > 0 && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {studyGuideData.length} lecture
                      {studyGuideData.length > 1 ? "s" : ""} selected
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center"></div>
            </header>

            <Card className="shadow-xl">
              <CardContent className="p-4 md:p-8">
                {loading ? (
                  <div className="flex flex-col items-center justify-center min-h-[400px]">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                    <p className="mt-4 text-muted-foreground">
                      Generating your study guide...
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      This may take a moment for the first time.
                    </p>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center min-h-[400px]">
                    <AlertCircle className="w-12 h-12 text-destructive" />
                    <p className="mt-4 text-destructive font-medium">
                      Failed to generate study guide
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground text-center max-w-md">
                      {typeof error === "string" &&
                        (error.toLowerCase().includes("timeout") ||
                          error.includes("ECONNABORTED"))
                        ? "The request took too long. Study guides for multiple lectures can take a minute or two. Please try again — it often succeeds on retry."
                        : error}
                    </p>
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() =>
                        dispatch(
                          getLearingPod({
                            classId: selectedClassId,
                            lectureIds: selectedLectures,
                          }),
                        )
                      }
                    >
                      Try Again
                    </Button>
                  </div>
                ) : studyGuideData.length > 0 ? (
                  <div className="space-y-6">
                    {/* Horizontal Tabs */}
                    {studyGuideData.length > 1 ? (
                      <div className="border-b border-gray-200 flex items-center gap-2">
                        {/* Scrollable tabs area */}
                        <div className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-hide">
                          <nav className="-mb-px flex space-x-2">
                            {studyGuideData.map((item, index) => (
                              <button
                                key={item.lectureId || index}
                                onClick={() => setActiveTab(index)}
                                className={`cursor-pointer whitespace-nowrap py-4 px-3 border-b-2 font-medium text-sm ${activeTab === index
                                  ? "border-primary text-primary"
                                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                                  }${item.error ? " text-destructive" : ""}`}
                              >
                                {item.title || `Lecture ${index + 1}`}
                                {item.error && (
                                  <AlertCircle className="inline ml-1 w-4 h-4" />
                                )}
                              </button>
                            ))}
                          </nav>
                        </div>

                        {/* Export button - always visible */}
                        <div className="flex-shrink-0 pb-1">
                          <Button
                            variant="outline"
                            className="bg-[#6F2CCA] hover:bg-[#550dba] text-white cursor-pointer gap-0"
                            onClick={() =>
                              downloadAsHtml(
                                currentItem?.studyGuide,
                                `${currentItem?.title || "study-guide"}-study-guide`,
                              )
                            }
                            disabled={!hasContent || loading}
                          >
                            <span className="hidden md:flex items-center">
                              <FileText className="mr-2 w-4 h-4" />
                              Export .html
                            </span>
                            <TiExportOutline className="font-bold !w-6 !h-6 block md:hidden" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Show title for single lecture too */}
                        <div className="flex justify-between items-center">
                          {studyGuideData.length === 1 && (
                            <h2 className="text-xl font-semibold text-foreground">
                              {studyGuideData[0]?.title}
                            </h2>
                          )}
                          <Button
                            variant="outline"
                            className="bg-accent text-accent-foreground hover:bg-accent/90 cursor-pointer gap-0"
                            onClick={() =>
                              downloadAsHtml(
                                currentItem?.studyGuide,
                                `${currentItem?.title || "study-guide"}-study-guide`,
                              )
                            }
                            disabled={!hasContent || loading}
                          >
                            <span className="hidden md:flex">
                              <FileText className="mr-2" />
                              Export .html
                            </span>
                            <TiExportOutline className="font-bold !w-6 !h-6 block md:hidden" />
                          </Button>
                        </div>
                      </>
                    )}

                    {/* Tab Content */}
                    <div className="">
                      {currentItem?.error ? (
                        <div className="flex flex-col items-center justify-center min-h-[400px]">
                          <AlertCircle className="w-12 h-12 text-destructive" />
                          <p className="mt-4 text-destructive font-medium">
                            Failed to generate study guide for this lecture
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {currentItem.error}
                          </p>
                        </div>
                      ) : hasContent ? (
                        (() => {
                          const { bodyContent } = extractHtmlContent(
                            currentItem.studyGuide,
                          );
                          return (
                            <div
                              className="notes-container"
                              dangerouslySetInnerHTML={{ __html: bodyContent }}
                              style={{
                                // Isolate the HTML content to prevent style conflicts
                                isolation: "isolate",
                                // Allow the embedded HTML styles to work
                                overflow: "visible",
                              }}
                            />
                          );
                        })()
                      ) : (
                        <div className="flex flex-col items-center justify-center min-h-[400px]">
                          <p className="text-muted-foreground text-center">
                            No content available for this lecture.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Tab Indicator for multiple tabs */}
                    {studyGuideData.length > 1 && (
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>
                          Lecture {activeTab + 1} of {studyGuideData.length}
                        </span>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="hover:bg-[#6F2CCA] "
                            onClick={() =>
                              setActiveTab((prev) => Math.max(0, prev - 1))
                            }
                            disabled={activeTab === 0}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="hover:bg-[#6F2CCA] "
                            onClick={() =>
                              setActiveTab((prev) =>
                                Math.min(studyGuideData.length - 1, prev + 1),
                              )
                            }
                            disabled={activeTab === studyGuideData.length - 1}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center min-h-[400px]">
                    <p className="text-muted-foreground text-center">
                      No study guide content available. <br />
                      Please make sure you have selected a class and lecture.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </>
  );
}
