import { Card, CardContent } from "../ui/Card";
import { Brain, Calendar, Mic, BookOpen } from "lucide-react";
import { GrDocumentText } from "react-icons/gr";
import { Link } from "react-router-dom";
import { cn } from "../../libs/Utils";

export function QuickActions() {
  const notes = [
    {
      label: "Record Lecture",
      icon: Mic,
      href: "/student/upload-lecture",
      color: "bg-red-200/50",
      iconColor: "text-red-500",
    },
    {
      label: "Upload Document",
      icon: GrDocumentText,
      href: "/student/upload-document",
      color: "bg-[#FDEBDE]",
      iconColor: "text-[#FF8A00]",
    },
  ];

  const learningTools = [
    {
      label: "Learn",
      icon: Brain,
      href: "/student/study",
      color: "bg-green-200/50",
      iconColor: "text-green-500",
    },
    {
      label: "My Classes",
      icon: BookOpen,
      href: "/student/my-classes",
      color: "bg-blue-200/50",
      iconColor: "text-blue-500",
    },
    {
      label: "Calendar",
      icon: Calendar,
      href: "/student/calendar",
      color: "bg-purple-200/50",
      iconColor: "text-purple-500",
    },
  ];

  return (
    <div className="wrapper">
      {/* For Notes Cards  */}
      <Card className="p-6 mb-10">
        <div className="mb-3">
          <h2 className="text-xl font-bold mb-2">Create Notes</h2>
          <p className="text-md text-muted-foreground">
            Choose how you want to add your course material
          </p>
        </div>

        <Card className="shadow-none border-0   bg-card text-card-foreground">
          <CardContent className="p-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
              {notes.map((note) => (
                <Link to={note.href} key={note.label}>
                  <Card
                    className={cn(
                      "shadow-sm hover:shadow-lg transition-shadow cursor-pointer h-40",
                      note.color,
                    )}
                  >
                    <CardContent className="p-4 flex flex-col items-center justify-center gap-2 h-full">
                      <note.icon className={cn("w-8 h-8", note.iconColor)} />
                      <span className="text-md mt-2 font-semibold text-foreground">
                        {note.label}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </Card>

      {/* For Learning Cards  */}
       <Card className="p-6 mb-10">
        <div className="mb-3">
          <h2 className="text-xl font-bold mb-2">Continue Learning</h2>
          <p className="text-md text-muted-foreground">
           Access your classes, calendar and saved study tools
          </p>
        </div>

        <Card className="shadow-none border-0   bg-card text-card-foreground">
          <CardContent className="p-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
              {learningTools.map((tools) => (
                <Link to={tools.href} key={tools.label}>
                  <Card
                    className={cn(
                      "shadow-sm hover:shadow-lg transition-shadow cursor-pointer h-40",
                      tools.color,
                    )}
                  >
                    <CardContent className="p-4 flex flex-col items-center justify-center gap-2 h-full">
                      <tools.icon className={cn("w-8 h-8", tools.iconColor)} />
                      <span className="text-md mt-2  font-semibold text-foreground">
                        {tools.label}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </Card>
    </div>
  );
}
