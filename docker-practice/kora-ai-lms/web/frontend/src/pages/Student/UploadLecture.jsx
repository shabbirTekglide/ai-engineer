import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Label } from "../../components/ui/Label";
import {
  Upload,
  Mic,
  Pause,
  ChevronLeft,
  Plus,
  ChevronDown,
  Download,
} from "lucide-react";
import { Link, useNavigate, useBlocker } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { createLecture } from "../../store/slicers/lectureSlice";
import { toast } from "react-toastify";
import { AddClassDialog } from "../../components/kora/AddClassDialog";
import { useAudioRecorder } from "../../hooks/useAudioRecorder";

export default function UploadLecturePage() {
  const navigate = useNavigate();
  const [allowNavigate, setAllowNavigate] = useState(false);
  const [recordedURL, setRecordedURL] = useState(null);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const addClassTriggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const wakeLockRef = useRef(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const dispatch = useDispatch();
  const { classes } = useSelector((state) => state.class);
  const { profile } = useSelector((s) => s.studentprofile || {});
  const { subscriptionStatus } = useSelector((state) => state.auth);
  const previousClassIdsRef = useRef(new Set(classes.map((c) => c._id)));

  // ── Audio Recorder Hook ──────────────────────────────────────────────
  const {
    isRecording,
    isPaused,
    isStopping,
    elapsedTime,
    error: recordErr,
    wasBackgrounded,
    actualAudioDuration,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording: hookCancel,
  } = useAudioRecorder();

  // ── Auto-select newly created class ──────────────────────────────────
  useEffect(() => {
    const currentClassIds = new Set(classes.map((c) => c._id));
    const newClassId = classes.find(
      (c) => !previousClassIdsRef.current.has(c._id),
    )?._id;

    if (newClassId) {
      setSelectedClassId(newClassId);
      console.log("Auto-selected newly created class:", newClassId);
    }

    previousClassIdsRef.current = currentClassIds;
  }, [classes]);

  // ── Close dropdown on outside click ──────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Wake Lock API ────────────────────────────────────────────────────
  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        console.log("[WakeLock] Screen wake lock acquired");

        wakeLockRef.current.addEventListener("release", () => {
          console.log("[WakeLock] Screen wake lock released");
        });
      }
    } catch (err) {
      console.error("[WakeLock] Failed to acquire wake lock:", err);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {
        console.error("[WakeLock] Failed to release wake lock:", err);
      }
    }
  };

  // Re-acquire wake lock when tab becomes visible again during recording
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (
        document.visibilityState === "visible" &&
        isRecording &&
        !wakeLockRef.current
      ) {
        await requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isRecording]);

  // Release wake lock on unmount
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
      if (recordedURL) URL.revokeObjectURL(recordedURL);
    };
  }, []);

  // ── Navigation blocker ───────────────────────────────────────────────
  let blocker = useBlocker(({ nextLocation, currentLocation }) => {
    if (dontShowAgain) {
      return false; // never block if "don't show again" is checked
    }

    return (
      (uploadedFile || recordedBlob) &&
      !allowNavigate &&
      !saving &&
      currentLocation.pathname !== nextLocation.pathname
    );
  });

  useEffect(() => {
    if (blocker.state === "blocked") {
      if (!dontShowAgain) {
        setShowLeaveModal(true);
      } else {
        setAllowNavigate(true);
        blocker.reset();
      }
    }
  }, [blocker, dontShowAgain]);

  const skipKey = profile?.userId
    ? `skipDownloadWarning_${profile.userId}`
    : null;
  useEffect(() => {
    if (!profile?.userId) return;
    const skipKey = `skipDownloadWarning_${profile.userId}`;
    const savedPref = localStorage.getItem(skipKey);
    setDontShowAgain(savedPref === "true");
  }, [profile?.userId]);

  const handleSkipLeave = () => {
    if (dontShowAgain && skipKey) {
      localStorage.setItem(skipKey, "true");
    }

    setShowLeaveModal(false);
    setAllowNavigate(true);
    blocker.reset();
  };

  const handleDownloadFromModal = () => {
    if (dontShowAgain && skipKey) {
      localStorage.setItem(skipKey, "true");
    }
    handleDownload();
    setShowLeaveModal(false);
  };

  // ── Recording actions ────────────────────────────────────────────────
  const handleRecordClick = async () => {
    if (!isRecording) {
      await startRecording();
      await requestWakeLock();
    } else if (isPaused) {
      resumeRecording();
    } else {
      pauseRecording();
    }
  };

  const handleStopClick = useCallback(async () => {
    await releaseWakeLock();

    const blob = await stopRecording();
    if (blob) {
      if (recordedURL) URL.revokeObjectURL(recordedURL);
      const url = URL.createObjectURL(blob);
      setRecordedURL(url);
      setRecordedBlob(blob);
      setUploadedFile(null);
      console.log(
        "[Recording] Stopped — blob:",
        (blob.size / (1024 * 1024)).toFixed(2),
        "MB",
      );
    }
  }, [stopRecording, recordedURL]);

  const handleCancel = useCallback(async () => {
    await releaseWakeLock();
    await hookCancel();

    if (recordedURL) {
      URL.revokeObjectURL(recordedURL);
      setRecordedURL(null);
    }
    setRecordedBlob(null);
    console.log("[Recording] Cancelled");
  }, [hookCancel, recordedURL]);

  // ── Audio duration helper (for uploaded files) ───────────────────────
  const getAudioDurationSec = (fileOrBlob) =>
    new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(fileOrBlob);
        const audio = new Audio();
        audio.preload = "metadata";
        audio.onloadedmetadata = () => {
          const sec = Math.round(audio.duration || 0);
          URL.revokeObjectURL(url);
          resolve(sec);
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(0);
        };
        audio.src = url;
      } catch {
        resolve(0);
      }
    });

  // ── File upload (existing file) ──────────────────────────────────────
  const onUploadClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) {
        if (recordedURL) URL.revokeObjectURL(recordedURL);
        const url = URL.createObjectURL(file);
        setRecordedURL(url);
        setUploadedFile(file);
        setRecordedBlob(null);
      }
    };
    input.click();
  };

  // ── Time formatter ───────────────────────────────────────────────────
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  // ── Submit ───────────────────────────────────────────────────────────
  const MAX_AUDIO_UPLOAD_BYTES = 250 * 1024 * 1024;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitAttempted(true);
    try {
      if (!selectedClassId) {
        toast.error("Please select a class.");
        return;
      }

      let fileToSend = uploadedFile || recordedBlob;
      if (!fileToSend)
        throw new Error("No audio to upload. Record or choose a file first.");

      let fileSize = fileToSend.size ?? fileToSend.byteLength ?? 0;
      if (fileSize > MAX_AUDIO_UPLOAD_BYTES) {
        const maxMB = Math.round(MAX_AUDIO_UPLOAD_BYTES / (1024 * 1024));
        throw new Error(
          `Recording is too large (max ${maxMB} MB). Please record a shorter lecture or split it into parts.`,
        );
      }

      // No compression needed — worker encodes to MP3 in real-time (≈ 28 MB/hr)

      let durationSec = 0;
      if (uploadedFile) {
        durationSec = await getAudioDurationSec(uploadedFile);
      } else {
        durationSec = actualAudioDuration ?? elapsedTime;
      }

      // Recorded audio is always MP3; uploaded files keep their original ext
      const extGuess = uploadedFile?.name?.split(".").pop() || "mp3";

      const formData = new FormData();
      formData.append("file", fileToSend, `${title || "lecture"}.${extGuess}`);
      formData.append("title", title);
      formData.append("durationSec", String(durationSec));

      setSaving(true);
      const loadingToast = toast.loading("Saving and transcribing lecture...");
      await dispatch(createLecture({ classId: selectedClassId, formData }))
        .unwrap()
        .then(() => navigate("/student/my-classes/" + selectedClassId));
      toast.dismiss(loadingToast);
    } catch (e) {
      toast.dismiss();
      toast.error(e || "Failed to save lecture.");
    } finally {
      setSaving(false);
    }
  };

  // ── Download ─────────────────────────────────────────────────────────
  const handleDownload = () => {
    if (!recordedURL) return;

    const loadingToast = toast.loading("Preparing download...");

    let ext = "mp3"; // recorded audio is always MP3
    if (uploadedFile) {
      ext = uploadedFile.name.split(".").pop();
    }

    const link = document.createElement("a");
    link.href = recordedURL;
    link.download = `${title || "lecture"}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.dismiss(loadingToast);
    toast.success("Downloading audio...");
  };

  // ── Class selection ──────────────────────────────────────────────────
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

  const getSelectedClassName = () => {
    if (!selectedClassId) return "Select a class";
    const selectedClass = classes.find((c) => c._id === selectedClassId);
    return selectedClass ? selectedClass.name : "Select a class";
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <>
      <div className="flex flex-col min-h-screen bg-background">
        <main className="flex-1 overflow-y-auto pb-24">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col flex-grow h-full">
            <header className="w-full flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" asChild>
                  <Link to={"/student/dashboard"}>
                    <ChevronLeft />
                  </Link>
                </Button>
                <h1 className="text-[24px] md:text-3xl font-bold text-foreground tracking-tight w-[85%] md:w-full">
                  Record Lecture
                </h1>
              </div>
            </header>

            <div className="mt-5 flex-grow items-center">
              <div className="xl:col-span-2 h-full">
                <Card className="shadow-lg h-full flex flex-col min-h-[60vh]">
                  <CardContent className="p-6 flex flex-col flex-grow">
                    <div className="flex flex-col items-center justify-center p-2 md:p-6 rounded-lg flex-grow">
                      <div className="mb-4">
                        <button
                          disabled={subscriptionStatus !== "active"}
                          onClick={handleRecordClick}
                          className="relative w-48 h-48 rounded-full bg-muted flex items-center justify-center transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-primary"
                          aria-label={
                            isRecording
                              ? isPaused
                                ? "Resume recording"
                                : "Pause recording"
                              : "Start recording"
                          }
                        >
                          {/* Pulse ring when recording */}
                          {isRecording && !isPaused && (
                            <>
                              <span className="absolute inset-6 rounded-full bg-primary/90 animate-ping" />
                              <span className="absolute inset-6 rounded-full ring-2 ring-primary/90" />
                            </>
                          )}

                          <div className="cursor-pointer absolute w-40 h-40 bg-background rounded-full shadow-md flex items-center justify-center">
                            {isRecording && !isPaused ? (
                              <Pause className="h-16 w-16 text-foreground" />
                            ) : (
                              <Mic className="h-16 w-16 text-foreground" />
                            )}
                          </div>
                        </button>
                      </div>

                      <div className="text-5xl font-mono text-foreground mb-4 tabular-nums">
                        {formatTime(elapsedTime)}
                      </div>

                      {recordErr && (
                        <p className="text-sm text-red-500 mb-2">{recordErr}</p>
                      )}

                      {wasBackgrounded && isRecording && (
                        <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-lg px-4 py-2 mb-3 max-w-xl text-sm text-amber-800 dark:text-amber-200">
                          <span className="shrink-0">⚠</span>
                          <span>
                            Recording was interrupted while this tab was in the
                            background. Stay on this screen for a complete
                            recording.
                          </span>
                        </div>
                      )}

                      {isRecording && (
                        <div className="flex items-center gap-4 mb-4">
                          <Button
                            variant="destructive"
                            onClick={handleStopClick}
                          >
                            Stop
                          </Button>
                          <Button
                            variant="outline"
                            onClick={
                              isPaused ? resumeRecording : pauseRecording
                            }
                          >
                            {isPaused ? "Resume" : "Pause"}
                          </Button>
                        </div>
                      )}

                      {isStopping && (
                        <div className="flex items-center gap-3 mb-4 text-muted-foreground">
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-accent border-t-transparent"></div>
                          <span>Processing recording...</span>
                        </div>
                      )}

                      {recordedURL && !isRecording && (
                        <div className="w-full max-w-xl mt-4">
                          <audio
                            src={recordedURL}
                            controls
                            className="w-full"
                          />
                        </div>
                      )}

                      {!isRecording && (
                        <>
                          <div className="text-muted-foreground my-3">OR</div>
                          <Button
                            disabled={subscriptionStatus !== "active"}
                            variant="link"
                            className="text-accent cursor-pointer"
                            onClick={onUploadClick}
                          >
                            <Upload className="mr-2" />
                            Upload an audio file
                          </Button>
                        </>
                      )}
                    </div>

                    {isRecording || isStopping ? (
                      <div className="mt-auto flex justify-end gap-2">
                        <Button
                          disabled={isStopping}
                          onClick={handleCancel}
                          className="bg-red-500 hover:bg-red-600 text-white transition-colors duration-300"
                        >
                          Cancel
                        </Button>
                        <Button disabled>
                          {isStopping ? "Processing..." : "Save"}
                        </Button>
                      </div>
                    ) : (
                      <form
                        onSubmit={handleSubmit}
                        className="mt-auto grid grid-cols-1 md:grid-cols-2 gap-4"
                      >
                        {recordedURL && (
                          <>
                            <div className="space-y-1">
                              <Label htmlFor="class">Class</Label>
                              <div className="relative" ref={dropdownRef}>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setIsDropdownOpen(!isDropdownOpen)
                                  }
                                  className="h-[42px] cursor-pointer w-full flex items-center justify-between text-left px-3 py-2 text-sm bg-background border border-input rounded-md hover:bg-accent/10 focus:outline-none focus:ring-2 focus:ring-accent"
                                >
                                  <span className="truncate mr-2 min-w-0">{getSelectedClassName()}</span>
                                  <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                                </button>

                                {isDropdownOpen && (
                                  <div className="absolute z-50 w-full mt-1 bg-background border border-input rounded-md shadow-lg max-h-60 overflow-auto">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleClassSelect("add-new")
                                      }
                                      className="cursor-pointer w-full text-left px-3 py-2 text-sm hover:bg-accent/10 border-t border-input flex items-center gap-2 text-accent font-medium"
                                    >
                                      <Plus className="h-4 w-4" />
                                      Add New Class
                                    </button>
                                    {classes.map((classItem) => (
                                      <button
                                        key={classItem._id}
                                        type="button"
                                        onClick={() =>
                                          handleClassSelect(classItem._id)
                                        }
                                        className={`cursor-pointer w-full text-left px-3 py-2 text-sm hover:bg-accent/10 ${selectedClassId === classItem._id
                                          ? "bg-accent/20 font-medium"
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
                              <Label htmlFor="lecture-title">
                                Lecture Title
                              </Label>
                              <Input
                                id="lecture-title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="h-[42px]"
                              />
                            </div>

                            <div className="md:col-span-2 flex justify-end gap-3">
                              {recordedURL && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={handleDownload}
                                  className="flex items-center gap-2 text-accent border-accent hover:bg-accent hover:text-white transition-all duration-300 rounded-full px-4"
                                >
                                  <Download className="w-4 h-4" />
                                  Download Audio
                                </Button>
                              )}
                              <button
                                className={`${saving || !selectedClassId
                                  ? "bg-[#808080] text-white cursor-not-allowed"
                                  : "cursor-pointer bg-[#8C5AF2] hover:bg-[#7943e6] transition-colors duration-300 text-white"
                                  } px-4 py-2 min-w-[80px] rounded-[20px] text-[15px]`}
                                type="submit"
                                disabled={saving || !selectedClassId}
                              >
                                {saving ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </>
                        )}
                      </form>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* <div className="xl:col-span-1">
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <div>
                      <h3 className="font-semibold mb-2">How it works</h3>

                      <ul className="ml-5 text-sm text-muted-foreground">
                        <li className="list-decimal mb-1">
                          Tap Record to start recording your lecture.
                        </li>
                        <li className="list-decimal mb-1">
                          Tap Stop when finished
                        </li>
                        <li className="list-decimal mb-1">
                          Tap Save &amp; Transcribe to upload the audio.
                        </li>
                        <li className="list-decimal mb-1">
                          Kora will convert it into a transcript, notes, and
                          other study materials for the correct class.
                        </li>
                        <li className="list-decimal mb-1">
                          <h3 className="text-[15px] font-bold underline">
                            Recording Setup Notice
                          </h3>
                          <p className="text-sm ">
                            Kora records best when capturing audio from an
                            external source. Recording audio from a lecture
                            playing on the same device may not work due to
                            browser and system limitations.
                          </p>
                        </li>

                        <li className="list-decimal mb-1">
                          <h3 className="text-[15px] font-bold underline">
                            Supported setups:
                          </h3>
                          <ul>
                            <li className="list-disc">
                              Playing the lecture on your phone while recording
                              on your laptop
                            </li>
                            <li className="list-disc">
                              Using Kora through your mobile browser until the
                              native apps are available
                            </li>
                            <li className="list-disc">
                              Recording live or in-person lectures using your
                              phone or computer microphone
                            </li>
                          </ul>
                        </li>
                        <li className="list-decimal mb-1">
                          <h3 className="text-[15px] font-bold underline">
                            Processing Notice
                          </h3>
                          <p className="text-sm ">
                            After you save your lecture, processing will
                            continue in the background. You may safely leave the
                            page or close the application while your lecture is
                            being processed. Once processing is complete, your
                            lecture content will be available in Kora.
                          </p>
                        </li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </div> */}
            </div>
          </div>
        </main>
      </div>

      {/* Hidden Add Class Dialog trigger */}
      <AddClassDialog>
        <button
          ref={addClassTriggerRef}
          type="button"
          style={{ display: "none" }}
          aria-hidden="true"
        />
      </AddClassDialog>

      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-3">
              We recommend downloading your audio before leaving this page.
            </h2>

            <div className="flex items-center gap-2 mb-4">
              <label className="text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mr-1"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                />
                Don’t show this again
              </label>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleSkipLeave}>
                Skip
              </Button>

              <Button
                onClick={handleDownloadFromModal}
                className="bg-accent text-white"
              >
                Download Audio
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
