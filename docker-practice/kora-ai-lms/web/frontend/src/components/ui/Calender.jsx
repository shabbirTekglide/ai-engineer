import { DayPicker } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../libs/Utils"; // or your cn()

export function Calendar({
  className,
  classNames: classNamesProp,
  components: componentsProp,
  showOutsideDays = true,
  ...props
}) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: "",
        months: "flex flex-col gap-4",
        month: "space-y-4 w-full p-4",
        caption_label: "text-center font-medium w-full block mb-6",
        month_grid: "w-full border-collapse",
        weekdays: "grid grid-cols-7",
        weekday: "text-muted-foreground text-[0.8rem] text-center",
        week: "grid grid-cols-7 gap-1 mt-2",
        day: "p-0 relative",
        day_button: "h-16 w-full font-normal aria-selected:opacity-100",
        nav: "flex justify-between",
        button_previous: "h-7 w-7 opacity-50 hover:opacity-100",
        button_next: "h-7 w-7 opacity-50 hover:opacity-100",
        ...(classNamesProp || {}),
      }}
      modifiersClassNames={{
        selected:
          "bg-transparent text-accent rounded-lg border-2 border-accent hover:bg-accent/10 focus:bg-accent/10",
        today: "bg-accent/20 text-accent rounded-lg",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-50",
        range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
        hidden: "invisible",
      }}

      {...props}
    />
  );
}