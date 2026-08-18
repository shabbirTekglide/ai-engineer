import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Clock, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "../../libs/Utils";
import { Slider } from "../ui/Slider";
import { useToast } from "../../hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { updateClass, getClassById } from "../../store/slicers/classSlice";
import TimePicker from "react-time-picker";

export function EditClassDialog({ open, onOpenChange, classData, onUpdate }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const dispatch = useDispatch();

  // Parse meeting time if it exists
  const parseMeetingTime = (meetingTime) => {
    console.log("Original meetingTime:", meetingTime);
    if (!meetingTime) return { startTime: "", endTime: "" };

    // Helper function to convert "9:00 AM" to "09:00"
    const convertTo24Hour = (timeStr) => {
      if (!timeStr) return "";

      // Split time and modifier (AM/PM)
      const [time, modifier] = timeStr.trim().split(/\s+/);
      let [hours, minutes] = time.split(":").map(Number);

      if (modifier === "PM" && hours !== 12) {
        hours += 12;
      }
      if (modifier === "AM" && hours === 12) {
        hours = 0;
      }

      // Zero padding (e.g., "9" becomes "09")
      const h = hours.toString().padStart(2, "0");
      const m = minutes.toString().padStart(2, "0");

      return `${h}:${m}`;
    };

    const parts = meetingTime.split("-");

    return {
      startTime: convertTo24Hour(parts[0]),
      endTime: convertTo24Hour(parts[1]),
    };
  };

  const { startTime: initialStartTime, endTime: initialEndTime } =
    classData?.meetingTime
      ? parseMeetingTime(classData.meetingTime)
      : { startTime: "", endTime: "" };

  // ------------------ react-hook-form ------------------
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
      className: classData?.name || "",
      term: classData?.term || "fall-2025",
      meetingDays: classData?.meetingDays || [],
      startTime: initialStartTime,
      endTime: initialEndTime,
      instructor: classData?.instructor || "",
      color: classData?.color || 50,
    },
  });

  // Update form when classData changes
  useEffect(() => {
    if (classData) {
      const { startTime, endTime } = classData?.meetingTime
        ? parseMeetingTime(classData.meetingTime)
        : { startTime: "", endTime: "" };

      reset({
        className: classData.name || "",
        term: classData.term || "fall-2025",
        meetingDays: classData.meetingDays || [],
        startTime,
        endTime,
        instructor: classData.instructor || "",
        color: classData.color || 50,
      });
    }
  }, [classData, reset]);

  // live preview from form values
  const className = watch("className") || "";
  const startTime = watch("startTime");
  const endTime = watch("endTime");
  const term = watch("term");
  const color = watch("color");

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  // Toggle a day into meetingDays[] in form


  // ------------------ Submit handler ------------------
  const onSubmit = async (data) => {
    if (!classData?._id) {
      toast({
        title: "Error",
        description: "Class ID is missing",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      // Prepare data for API (send as JSON, not FormData)
      const classDataToUpdate = {
        className: data.className,
        instructor: data.instructor,
        term: data.term,
        meetingDays: data.meetingDays,
        startTime: data.startTime,
        endTime: data.endTime,
        color: data.color.toString(),
      };

      await dispatch(
        updateClass({ classId: classData._id, classData: classDataToUpdate }),
      ).unwrap();

      // Refresh class data
      await dispatch(getClassById(classData._id)).unwrap();

      toast({
        title: "Class Updated",
        description: "Class details have been updated successfully.",
      });

      // Call onUpdate callback if provided
      if (onUpdate) {
        onUpdate();
      }

      onOpenChange(false);
    } catch (err) {
      console.error("Failed to update class:", err);
      toast({
        title: "Error",
        description:
          err?.message || "Could not update class. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!classData) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            Edit Class
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <Label htmlFor="edit-class-name">
                Class Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="edit-class-name"
                placeholder="e.g., Biology 101"
                className="focus:border-[#6F2CCA] focus:border-2 text-[16px]"
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
              <Label htmlFor="edit-instructor">Instructor</Label>
              <Input
                id="edit-instructor"
                placeholder="e.g., alexander"
                {...register("instructor")}
                className="focus:border-[#6F2CCA] focus:border-2"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-term">Term</Label>
                <Controller
                  control={control}
                  name="term"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      className=" "
                    >
                      <SelectTrigger
                        id="edit-term"
                        className="focus:border-2 rounded-md focus:border-[#6F2CCA]"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fall-2025">Fall 2025</SelectItem>
                        <SelectItem value="spring-2026">Spring 2026</SelectItem>
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
                          onValueChange={(v) => field.onChange(v?.[0] ?? 50)}
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
              <Label>
                Meeting Days <span className="text-red-500">*</span>
              </Label>
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
                <Label htmlFor="edit-start-time">
                  Start Time <span className="text-red-500">*</span>
                </Label>
                <Controller
                  name="startTime"
                  control={control}
                  rules={{ required: "Start time is required" }}
                  render={({ field }) => (
                    <div className="border rounded-md px-3 py-2 focus-within:border-2 focus-within:border-[#6F2CCA] transition flex items-center gap-2">
                      <TimePicker
                        id="edit-start-time"
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
                <Label htmlFor="edit-end-time">
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

                        if (modifier === "PM" && hours !== 12) hours += 12;
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
                    <div className="border rounded-md px-3 py-2 focus-within:border-2 focus-within:border-[#6F2CCA] transition flex items-center gap-2">
                      <TimePicker
                        id="edit-end-time"
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

            {/* <div className="bg-muted p-3 rounded-lg text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Preview:</span>{" "}
              <span className="text-xs text-muted-foreground">{className || "Class Name"} —{" "}
              {meetingDays.join("/") || "Mon/Wed/Fri"} {startTime}-{endTime} •{" "}
              {term}</span>
            </div> */}

            <DialogFooter className="mt-6 flex flex-row justify-end gap-2">
              <Button
                className="p-4 border  bg-[#6F2CCA] hover:bg-[#550dba] cursor-pointer transition-colors duration-300 ring-0 ring-offset-0 outline-none"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Updating...
                  </>
                ) : (
                  "Update Class"
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
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
