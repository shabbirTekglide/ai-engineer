import { CheckCircle2, ChevronLeft, Circle, Loader2 } from "lucide-react";
import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Card, CardContent } from "../../components/ui/Card";
import { Button } from "../../components";
import { useDispatch, useSelector } from "react-redux";
import { pollLectureStatuses } from "../../store/slicers/lectureSlice";
import { toast } from "react-toastify";
import { getAllLectures } from "../../store/slicers/lectureSlice";

const DocumentProgress = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { classId } = useParams();
  const location = useLocation();
  const { processId } = location.state || {};

  const { lectures } = useSelector((state) => state.lecture);

  // Find this document/lecture in the store (if pollLectureStatuses updates it there)
  const doc = useMemo(
    () => lectures?.find((l) => l._id === processId),
    [lectures, processId],
  );

  const status = doc?.processingStatus;
  const progress = doc?.overallProgress || 0;

  useEffect(() => {
    if (!processId) {
      toast.error("No document selected to track. Redirecting...");
      navigate(`/student/my-classes/${classId}?tab=documents`, { replace: true });
    }
  }, [processId, classId, navigate]);

  useEffect(() => {
    if (!processId) return;
    if (status === "completed" || status === "failed") return;

    let isMounted = true;

    const poll = async () => {
      try {
        await dispatch(pollLectureStatuses([processId])).unwrap();
      } catch (error) {
        if (isMounted) {
          toast.error(error?.message || "Failed to fetch status");
        }
      }
    };

    poll(); // run immediately on mount
    const interval = setInterval(poll, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [processId, status, dispatch]);

  useEffect(() => {
    if (!classId || lectures?.length) return;

    dispatch(
      getAllLectures({
        classId,
        page: 1,
        limit: 100,
        status: "all",
      }),
    );
  }, [classId, lectures?.length, dispatch]);

  useEffect(() => {
    if (doc?.processingStatus === "completed" && processId) {
      navigate(`/student/my-classes/${classId}/${processId}`, {
        replace: true,
        state: { fromTab: "documents" },
      });
    }
  }, [status, classId, processId, navigate]);

  const statusText =
    status === "failed"
      ? "Something went wrong while processing this document"
      : status === "processing"
        ? "Generating your notes, flashcards, and quizzes"
        : status === "completed"
          ? "Document processed successfully"
          : "Your document is queued for processing";

  const etaText =
    status === "failed"
      ? "You can try reprocessing this document"
      : "This usually takes a minute or two";

  const steps = [
    {
      label: "Document received",
      state: status ? "done" : "pending",
    },
    {
      label: "Reading and transcribing",
      state:
        status === "completed"
          ? "done"
          : status === "processing"
            ? "active"
            : status === "failed"
              ? "error"
              : "pending",
    },
    {
      label: "Identifying key concepts",
      state:
        status === "completed"
          ? "done"
          : status === "failed"
            ? "error"
            : "pending",
    },
  ];

  if (!processId) {
    return null; // redirect effect above will kick in
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-8 max-w-4xl">
          <header className="w-full flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 md:m-0 mb-5">
              <div
                className="cursor-pointer w-9 h-9 border border-[#908c8c] rounded-md flex justify-center items-center hover:bg-[#8c5af2] hover:text-white transition duration-300 hover:border-[#8c5af2]"
                onClick={() => navigate(`/student/my-classes/${classId}?tab=documents`)}
              >
                <ChevronLeft />
              </div>
              <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
                Generating Notes
              </h1>
            </div>
          </header>

          <div className="mt-8">
            <Card className="shadow-sm">
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center">
                  <span
                    className={`text-8xl font-bold ${status === "failed" ? "text-red-500" : "text-blue-600"
                      }`}
                  >
                    {progress}%
                  </span>
                  <p className="text-[16px] font-semibold mt-2">{statusText}</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {etaText}
                  </p>
                </div>

                <div className="mt-4 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${status === "failed" ? "bg-red-500" : "bg-blue-600"
                      }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <div className="mt-5 flex flex-col gap-3">
                  {steps.map((step, idx) => (
                    <div key={step.label}>
                      <div className="flex items-center gap-2.5">
                        {step.state === "done" && (
                          <CheckCircle2 className="h-[18px] w-[18px] text-green-500 shrink-0" />
                        )}
                        {step.state === "active" && (
                          <Loader2 className="h-[18px] w-[18px] text-blue-600 shrink-0 animate-spin" />
                        )}
                        {step.state === "pending" && (
                          <Circle className="h-[18px] w-[18px] text-muted-foreground/40 shrink-0" />
                        )}
                        {step.state === "error" && (
                          <Circle className="h-[18px] w-[18px] text-red-500 shrink-0" />
                        )}
                        <span
                          className={`text-sm ${step.state === "pending"
                            ? "text-muted-foreground"
                            : step.state === "error"
                              ? "text-red-500"
                              : "text-foreground"
                            }`}
                        >
                          {step.label}
                        </span>
                      </div>
                      {idx < steps.length - 1 && (
                        <div className="border-t border-border mt-3" />
                      )}
                    </div>
                  ))}
                </div>

                {status === "failed" && (
                  <div className="mt-6 flex justify-center">
                    <Button
                      onClick={() => navigate(`/student/my-classes/${classId}?tab=documents`)}
                      className="bg-[#8C5AF2] hover:bg-[#7a46e4] text-white"
                    >
                      Back to Documents
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DocumentProgress;
