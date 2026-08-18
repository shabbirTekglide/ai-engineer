import React, { useEffect } from "react";
import { Card, CardContent } from "../../components/ui/Card";
import { UpcomingAssignments } from "../../components/kora/UpcomingAssignment";
import { QuickActions } from "../../components/kora/QuickAction";
import { useSelector } from "react-redux";

const StudentDashboardPage = () => {
  const { profile } = useSelector((s) => s.studentprofile || {});
  return (
    <div className="flex flex-col h-screen bg-background">
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-6xl">
          <header className="mb-8 w-[90%] md:w-full">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              Welcome,{" "}
              {profile?.name
                ? profile.name.charAt(0).toUpperCase() + profile.name.slice(1)
                : "Rubitt"}
              !
            </h1>
          </header>

          <div className="space-y-12">
            <QuickActions />
            <UpcomingAssignments />
          </div>
        </div>
      </main>
    </div>
  );
};

export default StudentDashboardPage;
