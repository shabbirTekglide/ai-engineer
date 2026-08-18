import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Label } from "../ui/Label";
import { useDispatch } from "react-redux";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/Select";
import {
  Plus,
  Upload,
  Clock,
  Loader2,
  Calendar,
  ChevronDown,
  ChevronUp,
  FileText,
  X,
} from "lucide-react";
import { useState, useRef, useTransition } from "react";
import { cn } from "../../libs/Utils";
import { Slider } from "../ui/Slider";
// import { useToast } from "../../hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { createClass } from "../../store/slicers/classSlice";
import axiosInstance from "../../config/axios";
import ReactSpinner from "../ReactSpinner";
import TimePicker from "react-time-picker";
import { toast } from 'react-toastify';

const generateTerms = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const terms = [];
  if (month < 5) {
    terms.push({ value: `spring-${year}`, label: `Spring ${year}` });
    terms.push({ value: `summer-${year}`, label: `Summer ${year}` });
    terms.push({ value: `fall-${year}`, label: `Fall ${year}` });
    terms.push({ value: `spring-${year + 1}`, label: `Spring ${year + 1}` });
  } else if (month < 8) {
    terms.push({ value: `summer-${year}`, label: `Summer ${year}` });
    terms.push({ value: `fall-${year}`, label: `Fall ${year}` });
    terms.push({ value: `spring-${year + 1}`, label: `Spring ${year + 1}` });
    terms.push({ value: `summer-${year + 1}`, label: `Summer ${year + 1}` });
  } else {
    terms.push({ value: `fall-${year}`, label: `Fall ${year}` });
    terms.push({ value: `spring-${year + 1}`, label: `Spring ${year + 1}` });
    terms.push({ value: `summer-${year + 1}`, label: `Summer ${year + 1}` });
    terms.push({ value: `fall-${year + 1}`, label: `Fall ${year + 1}` });
  }
  return terms;
};

const dynamicTerms = generateTerms();

export function AddClassDialog({ children }) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("manual");
  const [isPending, startTransition] = useTransition();
  const [showEvents, setShowEvents] = useState(false);
  const [extractedEvents, setExtractedEvents] = useState([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  // const { toast } = useToast();
  const dispatch = useDispatch();

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    getValues,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      className: "",
      term: dynamicTerms[0].value,
      meetingDays: [],
      startTime: "",
      endTime: "",
      instructor: "",
      color: 50,
    },
  });

  const className = watch("className") || "Biology 101";
  const startTime = watch("startTime");
  const endTime = watch("endTime");
  const term = watch("term");
  const color = watch("color");

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];



  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];
    const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];
    const fileExtension = "." + file.name.split(".").pop().toLowerCase();

    if (
      !allowedTypes.includes(file.type) &&
      !allowedExtensions.includes(fileExtension)
    ) {
      // toast({
      //   title: "Invalid File Type",
      //   description: "Please upload PDF or image files only.",
      //   variant: "destructive",
      // });
      toast.error("Please upload PDF or image files only.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const triggerFileInput = () => fileInputRef.current?.click();

  const removeSelectedFile = () => {
    setSelectedFile(null);
    setExtractedData(null);
    setExtractedEvents([]);
    setShowEvents(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const extractFileData = async () => {
    if (!selectedFile) return;

    setIsExtracting(true);
    setExtractedEvents([]);
    setExtractedData(null);
    setShowEvents(false);

    const formData = new FormData();
    formData.append("file", selectedFile);

    startTransition(async () => {
      try {
        const response = await axiosInstance.post(
          "/api/class/syllabusExtractClass",
          formData,
          { headers: { "Content-Type": "multipart/form-data" } },
        );

        if (response.data.success) {
          const { classDetails } = response.data;
          setExtractedData(classDetails);

          if (classDetails.className)
            setValue("className", classDetails.className);
          if (classDetails.instructor)
            setValue("instructor", classDetails.instructor);
          if (classDetails.term) setValue("term", classDetails.term);
          if (classDetails.meetingDays)
            setValue("meetingDays", classDetails.meetingDays);
          if (classDetails.startTime)
            setValue("startTime", classDetails.startTime);
          if (classDetails.endTime) setValue("endTime", classDetails.endTime);

          if (classDetails.events?.length > 0)
            setExtractedEvents(classDetails.events);

          setActiveTab("manual");

          // toast({
          //   title: "Syllabus Processed",
          //   description: `Class information has been pre-filled. ${classDetails.events?.length || 0} events extracted.`,
          // });
          toast.success(`Syllabus processed! ${classDetails.events?.length || 0} events extracted.`);
        } else {
          throw new Error(
            response.data.message || "Failed to extract syllabus data",
          );
        }
      } catch (error) {
        toast.error(error.response?.data?.error || error.response?.data?.message || "Could not extract information from the syllabus. Please check your connection.",)

      } finally {
        setIsExtracting(false);
      }
    });
  };

  const formatEventDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      // hour: "2-digit",
      // minute: "2-digit",
    });
  };

  const onSubmit = async (data, event) => {
    if (event?.stopPropagation) event.stopPropagation();

    const formData = new FormData();
    formData.append("className", data.className);
    formData.append("instructor", data.instructor);
    formData.append("term", data.term);
    formData.append("meetingDays", JSON.stringify(data.meetingDays));
    formData.append("startTime", data.startTime);
    formData.append("endTime", data.endTime);
    formData.append("color", data.color.toString());

    if (selectedFile) formData.append("syllabus", selectedFile);
    if (extractedEvents.length > 0)
      formData.append("events", JSON.stringify(extractedEvents));

    try {
      setLoading(true);
      await dispatch(createClass(formData)).unwrap();

      reset();
      setSelectedFile(null);
      setExtractedData(null);
      setExtractedEvents([]);
      setShowEvents(false);
      toast.success("Class saved successfully with syllabus.");
      // toast({
      //   title: "Class Created",
      //   description: "Class saved successfully with syllabus.",
      // });
    } catch (err) {
      toast.error(err || "Could not create class. Please try again.")
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {loading ? (
        <ReactSpinner />
      ) : (
        <Dialog>
          <DialogTrigger asChild>{children}</DialogTrigger>
          <DialogContent
            className={cn(
              // Layout & sizing
              "flex flex-col",
              "w-[calc(100vw-32px)] max-w-[460px]",
              "mx-auto",
              "max-h-[calc(100dvh-48px)]",
              "overflow-y-auto overflow-x-hidden",
              "px-2 py-4 md:px-4 md:py-5 ",
              "gap-0",
            )}
          >
            <DialogHeader>
              <DialogTitle className="text-xl md:text-2xl text-center">
                Add a Class
              </DialogTitle>
            </DialogHeader>

            <div className="mt-4 flex-1">
              {/* Tab switcher */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <button
                  className={cn(
                    "flex items-center justify-center gap-2 p-2 py-4 md:p-4 rounded-lg border cursor-pointer",
                    activeTab === "manual"
                      ? "border-accent ring-2 ring-accent"
                      : "bg-card hover:bg-muted",
                  )}
                  onClick={() => setActiveTab("manual")}
                  type="button"
                >
                  <Plus className="h-5 w-5" />
                  <span className="font-semibold">Manual</span>
                </button>

                <button
                  className={cn(
                    "flex flex-col items-center gap-1 p-2 py-4 md:p-7 rounded-lg border cursor-pointer",
                    activeTab === "upload"
                      ? "border-accent ring-2 ring-accent"
                      : "bg-card hover:bg-muted",
                  )}
                  onClick={() => setActiveTab("upload")}
                  type="button"
                >
                  <div className="flex items-center gap-2 justify-center mb-2">
                    <Upload className="h-5 w-5 text-accent" />
                    <span className="font-semibold">Upload Syllabus</span>
                  </div>
                  <p className="text-sm text-muted-foreground text-center md:text-[14px] md:leading-[14px] text-[13px] leading-[12px]">
                    Auto-fill details & propose events
                  </p>
                </button>
              </div>

              {/* File preview — ready to extract */}
              {selectedFile && !extractedData && (
                <div className="mb-4 p-3 border border-blue-200 bg-blue-50 rounded-lg">
                  <div className="flex md:items-center md:justify-between gap-2 flex-col md:flex-row">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FileText className="h-5 w-5 text-blue-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-blue-800 text-sm truncate">
                          {selectedFile.name}
                        </p>
                        <p className="text-sm text-blue-600 whitespace-nowrap">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB •
                          Ready to extract
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        onClick={extractFileData}
                        disabled={isExtracting}
                        className="bg-[#976AF2] text-white hover:bg-[#8955f0] flex-1 md:flex-none"
                      >
                        {isExtracting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            Extracting...
                          </>
                        ) : (
                          "Extract"
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={removeSelectedFile}
                        disabled={isExtracting}
                        className="text-red-600 hover:text-red-800 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* File preview — extracted */}
              {selectedFile && extractedData && (
                <div className="mb-4 p-3 border border-green-200 bg-green-50 rounded-lg">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FileText className="h-5 w-5 text-green-600 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-green-800 truncate text-sm max-w-[180px] sm:max-w-none">
                          {selectedFile.name}
                        </p>
                        <p className="text-sm text-green-600">
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB •
                          Data extracted successfully
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={removeSelectedFile}
                      className="text-red-600 hover:text-red-800 hover:bg-red-50 shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* ── MANUAL TAB ── */}
              {activeTab === "manual" && (
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.stopPropagation();
                    handleSubmit(onSubmit)(e);
                  }}
                >
                  <div>
                    <Label htmlFor="class-name">
                      Class Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="class-name"
                      placeholder="e.g., Biology 101"
                      className="focus:border-[#976AF2] focus:border-2 text-[16px]"
                      {...register("className", {
                        required: "Class name is required",
                      })}
                    />
                    {errors.className && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.className.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="instructor">Instructor</Label>
                    <Input
                      id="instructor"
                      placeholder="e.g., alexander"
                      {...register("instructor")}
                      className="focus:border-[#976AF2] focus:border-2 text-[14px] md:text-[16px]"
                    />
                    {errors.instructor && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.instructor.message}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="term">Term</Label>
                      <Controller
                        control={control}
                        name="term"
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger
                              id="term"
                              className="focus:border-2 rounded-md focus:border-[#976AF2]"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {dynamicTerms.map(t => (
                                <SelectItem key={t.value} value={t.value}>
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Color</Label>
                      <Controller
                        control={control}
                        name="color"
                        render={({ field }) => (
                          <div className="w-full flex items-center gap-2 p-2 rounded-md border">
                            <div className="flex w-full">
                              <Slider
                                value={[field.value]}
                                max={100}
                                step={1}
                                onValueChange={(v) =>
                                  field.onChange(v?.[0] ?? 50)
                                }
                              />
                              <span className="text-xs w-8 text-center">
                                {field.value}
                              </span>
                            </div>
                            <div
                              className="w-7 h-6 rounded-full border"
                              style={{
                                backgroundColor: `hsl(${(field.value / 100) * 360}, 90%, 50%)`,
                              }}
                            />
                          </div>
                        )}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Meeting Days <span className="text-red-500">*</span></Label>
                    <Controller
                      name="meetingDays"
                      control={control}
                      rules={{
                        validate: (value) =>
                          (value && value.length > 0) ||
                          "Please select at least one meeting day",
                      }}
                      render={({ field }) => (
                        <div className="flex gap-2 mt-2">
                          {days.map((day) => (
                            <button
                              key={day}
                              type="button"
                              onClick={() => {
                                const current = field.value || [];
                                const next = current.includes(day)
                                  ? current.filter((d) => d !== day)
                                  : [...current, day];
                                field.onChange(next);
                              }}
                              className={cn(
                                "rounded-full flex-1 py-1.5 md:py-2 text-sm border cursor-pointer transition-colors duration-200",
                                (field.value || []).includes(day)
                                  ? "bg-[#6F2CCA] text-white border-[#6F2CCA]"
                                  : "hover:bg-[#6F2CCA] hover:text-white border-[#6F2CCA]",
                              )}
                            >
                              {day}
                            </button>
                          ))}
                        </div>
                      )}
                    />
                    {errors.meetingDays && (
                      <p className="text-xs text-red-500 mt-1">
                        {errors.meetingDays.message}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="start-time">
                        Start Time <span className="text-red-500">*</span>
                      </Label>
                      <Controller
                        name="startTime"
                        control={control}
                        rules={{ required: "Start time is required" }}
                        render={({ field }) => (
                          <div className="border rounded-md px-3 py-2 focus-within:border-2 focus-within:border-[#976AF2] transition flex items-center gap-2">
                            <TimePicker
                              onChange={field.onChange}
                              value={field.value}
                              format="hh:mm a"
                              disableClock
                              clearIcon={null}
                              className="w-full"
                            />
                            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </div>
                        )}
                      />
                      {errors.startTime && (
                        <p className="text-xs text-red-500 mt-1">
                          {errors.startTime.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="end-time">
                        End Time <span className="text-red-500">*</span>
                      </Label>
                      <Controller
                        name="endTime"
                        control={control}
                        rules={{
                          required: "End time is required",
                          validate: (val) => {
                            const s = getValues("startTime");
                            if (!s || !val) return true;
                            const toMinutes = (time) => {
                              const [hourMinute, modifier] = time.split(" ");
                              let [hours, minutes] = hourMinute
                                .split(":")
                                .map(Number);
                              if (modifier === "PM" && hours !== 12)
                                hours += 12;
                              if (modifier === "AM" && hours === 12) hours = 0;
                              return hours * 60 + minutes;
                            };
                            return (
                              toMinutes(val) > toMinutes(s) ||
                              "End must be after start"
                            );
                          },
                        }}
                        render={({ field }) => (
                          <div className="border rounded-md px-3 py-2 focus-within:border-2 focus-within:border-[#976AF2] transition flex items-center gap-2">
                            <TimePicker
                              onChange={field.onChange}
                              value={field.value}
                              format="hh:mm a"
                              disableClock
                              clearIcon={null}
                              className="w-full"
                            />
                            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </div>
                        )}
                      />
                      {errors.endTime && (
                        <p className="text-xs text-red-500 mt-1">
                          {errors.endTime.message}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Extracted Events */}
                  {extractedEvents.length > 0 && (
                    <div className="border rounded-lg p-2 md:p-4">
                      <button
                        type="button"
                        className="flex items-center justify-between w-full text-left"
                        onClick={() => setShowEvents(!showEvents)}
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3 h-3 md:h-4 md:w-4 text-accent" />
                          <span className="text-[13px] md:text-[16px] font-semibold">
                            {extractedEvents.length} Events Extracted from
                            Syllabus
                          </span>
                        </div>
                        {showEvents ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>

                      {showEvents && (
                        <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                          {extractedEvents.map((event, index) => (
                            <div
                              key={index}
                              className="p-3 bg-muted/50 rounded-md text-sm"
                            >
                              <div className="font-medium">{event.title}</div>
                              <div className="text-muted-foreground">
                                {formatEventDate(event.start)} •{" "}
                                {event.location}
                              </div>
                              {event.type && (
                                <div className="text-xs text-accent capitalize mt-1">
                                  {event.type}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preview */}
                  {/* <div className="bg-muted p-3 rounded-lg text-[13px] md:text-sm text-muted-foreground overflow-hidden">
                    <span className="font-semibold text-foreground">
                      Preview:
                    </span>{" "}
                    {className} — {meetingDays.join("/") || "Mon/Wed/Fri"}{" "}
                    {startTime}-{endTime} • {term}
                    {extractedEvents.length > 0 &&
                      ` • ${extractedEvents.length} events`}
                    {selectedFile && ` • Syllabus: ${selectedFile.name}`}
                  </div> */}

                  <p className="text-xs text-muted-foreground">
                    {selectedFile
                      ? "Class will be created with the uploaded syllabus and extracted events."
                      : "Only the essentials. More details can be edited later."}
                  </p>

                  <div className="mt-6 pb-2 flex flex-row justify-end gap-2">
                    <Button
                      className="p-4 border bg-[#6F2CCA] hover:bg-[#550dba]  hover:text-white cursor-pointer transition-colors duration-300 ring-0 ring-offset-0 outline-none"
                      type="submit"
                      disabled={isExtracting}
                    >
                      {isExtracting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Processing...
                        </>
                      ) : (
                        "Create Class"
                      )}
                    </Button>
                    <DialogClose asChild>
                      <Button
                        variant="ghost"
                        type="button"
                        className="cursor-pointer border bg-red-500 text-white border-red-500 transition-colors duration-300 hover:bg-red-600 hover:border-red-600"
                      >
                        Cancel
                      </Button>
                    </DialogClose>
                  </div>
                </form>
              )}

              {/* ── UPLOAD TAB ── */}
              {activeTab === "upload" && !extractedData && (
                <div
                  className={cn(
                    "w-full border-dashed border-2 transition-colors cursor-pointer rounded-lg",
                    isDragging
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-300 bg-white",
                  )}
                  onClick={triggerFileInput}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (!file) return;
                    handleFileChange({ target: { files: [file] } });
                  }}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".pdf,image/*"
                    disabled={isExtracting}
                  />
                  <div className="p-6 md:p-12 flex flex-col items-center justify-center text-center">
                    <div className="mb-4 rounded-full bg-secondary p-3">
                      <Upload className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="font-semibold mb-1">
                      Drag & Drop or Click to Upload Syllabus
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Upload a PDF or image file to auto-fill class details
                    </p>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
