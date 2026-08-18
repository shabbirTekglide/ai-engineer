import React, { useMemo, useState, useEffect, useRef } from "react";
import { Button } from "../ui/Button";
import {
  ChevronRight,
  Zap,
  Crown,
  Sparkles,
  AlertCircle,
  XCircle,
  Star,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { cn } from "../../libs/Utils";

// Limits are defined in HOURS here
const PLAN_LIMITS_HOURS = {
  free: 3,
  basic: 20,
  pro: 100,
};

function StatusPill() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [position, setPosition] = useState(() => ({
    x: window.innerWidth - 80,
    y: window.innerWidth < 768 ? 80 : 16,
  }));
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [expandPosition, setExpandPosition] = useState("right"); // "right" or "left"
  const pillRef = useRef(null);
  const expandedRef = useRef(null);

  const { subscriptionType, subscriptionStatus, availableSeconds } =
    useSelector((s) => s.auth);
  const navigate = useNavigate();

  const subscription = useMemo(() => {
    const plan = subscriptionType || "Free";
    const status = subscriptionStatus?.toLowerCase() || "active";
    const planKey = plan.toLowerCase();

    const limitInHours = PLAN_LIMITS_HOURS[planKey] || 3;
    const limitInSeconds = limitInHours * 3600;

    let currentAvailableSeconds = Math.max(0, availableSeconds || 0);
    let usedSeconds = Math.max(0, limitInSeconds - currentAvailableSeconds);

    if (
      status === "completed" ||
      status === "expired" ||
      status === "cancelled"
    ) {
      usedSeconds = limitInSeconds;
      currentAvailableSeconds = 0;
    }

    return {
      plan,
      availableSeconds: currentAvailableSeconds,
      limitSeconds: limitInSeconds,
      usedSeconds,
      status,
    };
  }, [subscriptionType, subscriptionStatus, availableSeconds]);


  // Calculate which side to expand on
  useEffect(() => {
    if (!pillRef.current || !expandedRef.current) return;

    const pillRect = pillRef.current.getBoundingClientRect();
    const expandedRect = expandedRef.current.getBoundingClientRect();

    if (pillRect.right + expandedRect.width > window.innerWidth) {
      setExpandPosition("left");
    } else {
      setExpandPosition("right");
    }
  }, [isExpanded]);

  // Percentage Calculation
  const progressPercentage = Math.min(
    Math.max((subscription.usedSeconds / subscription.limitSeconds) * 100, 0),
    100,
  );

  // Icon Logic
  const getPlanIcon = () => {
    if (subscription.status === "cancelled") {
      return <XCircle className="h-4 w-4" />;
    }
    if (
      subscription.status === "completed" ||
      subscription.status === "expired" ||
      subscription.status === "failed"
    ) {
      return <AlertCircle className="h-4 w-4" />;
    }
    switch (subscription.plan.toLowerCase()) {
      case "pro":
        return <Crown className="h-4 w-4" />;
      case "basic":
        return <Star className="h-4 w-4" />;
      default:
        return <Zap className="h-4 w-4" />;
    }
  };

  // Color Logic
  const getPlanColor = () => {
    if (subscription.status === "cancelled") {
      return "bg-gradient-to-r from-gray-500 to-gray-700";
    }
    if (
      subscription.status === "completed" ||
      subscription.status === "expired" ||
      subscription.status === "failed"
    ) {
      return "bg-gradient-to-r from-red-500 to-rose-500";
    }
    switch (subscription.plan.toLowerCase()) {
      case "pro":
        return "bg-gradient-to-r from-purple-500 to-pink-500";
      case "basic":
        return "bg-gradient-to-r from-blue-500 to-cyan-500";
      case "free":
        return "bg-gradient-to-r from-blue-500 to-cyan-500";
      default:
        return "bg-gradient-to-r from-gray-500 to-slate-500";
    }
  };

  const handleNavigate = () => {
    navigate("/student/subscribe");
  };

  const toggleExpanded = (e) => {
    e.stopPropagation();
    if (!isDragging) {
      setIsExpanded(!isExpanded);
    }
  };

  // Drag handlers
  const handleDragStart = (e) => {
    e.preventDefault();

    if (!pillRef.current) return;

    const rect = pillRef.current.getBoundingClientRect();
    const clientX = e.type === "mousedown" ? e.clientX : e.touches[0].clientX;
    const clientY = e.type === "mousedown" ? e.clientY : e.touches[0].clientY;

    setIsDragging(false);
    setDragStart({
      x: clientX - rect.left,
      y: clientY - rect.top,
    });
  };

  const handleDragMove = (e) => {
    if (!pillRef.current) return;

    const clientX = e.type === "mousemove" ? e.clientX : e.touches[0].clientX;
    const clientY = e.type === "mousemove" ? e.clientY : e.touches[0].clientY;

    const rect = pillRef.current.getBoundingClientRect();

    let newX = clientX - dragStart.x;
    let newY = clientY - dragStart.y;

    const maxX = window.innerWidth - rect.width;
    const maxY = window.innerHeight - rect.height;

    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    if (
      Math.abs(newX - position.x) > 3 ||
      Math.abs(newY - position.y) > 3
    ) {
      setIsDragging(true);
    }

    setPosition({ x: newX, y: newY });
  };


  const handleDragEnd = () => {
    setDragStart({ x: 0, y: 0 });
    // Reset dragging state after a short delay to prevent click from firing
    setTimeout(() => setIsDragging(false), 100);
  };

  // Add event listeners for dragging
  useEffect(() => {
    const handleMouseMove = (e) => handleDragMove(e);
    const handleMouseUp = () => handleDragEnd();
    const handleTouchMove = (e) => handleDragMove(e);
    const handleTouchEnd = () => handleDragEnd();

    if (dragStart.x !== 0 || dragStart.y !== 0) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.addEventListener("touchmove", handleTouchMove);
      document.addEventListener("touchend", handleTouchEnd);

      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("touchend", handleTouchEnd);
      };
    }
  }, [dragStart, position]);

  const hoursLeft = (subscription.availableSeconds / 3600).toFixed(1);

  return (
    <div
      ref={pillRef}
      className="fixed z-50"
      style={{
        left: position.x,
        top: position.y,
        cursor: isDragging ? "grabbing" : "grab",
        transition: isDragging ? "none" : "all 0.3s ease",
        touchAction: "none",
      }}
      onMouseDown={handleDragStart}
      onTouchStart={handleDragStart}
    >
      {/* Collapsed State - Just Icon */}
      {!isExpanded && (
        <button
          onClick={toggleExpanded}
          className={cn(
            "p-3 rounded-full shadow-lg border border-border/50 backdrop-blur-sm",
            "hover:shadow-xl transition-all duration-300 cursor-pointer",
            "bg-card/90 hover:bg-card",
            getPlanColor(),
            "text-white",
          )}
          aria-label="Show plan details"
        >
          {getPlanIcon()}
        </button>
      )}

      {/* Expanded State - Full Details */}
      {isExpanded && (
        <div
          ref={expandedRef}
          className={cn(
            "absolute top-0 rounded-2xl shadow-lg border border-border/50 backdrop-blur-sm min-w-[220px] max-w-[300px]",
            "transition-all duration-300",
            "bg-card/90",
          )}
          style={{
            [expandPosition === "left" ? "right" : "left"]: 0,
          }}
        >
          <div className="p-4">
            <div className="flex items-start justify-between mb-3">
              {/* Plan Icon */}
              <div
                className={cn("p-2 rounded-full text-white", getPlanColor())}
              >
                {getPlanIcon()}
              </div>

              {/* Close Button */}
              <button
                onClick={toggleExpanded}
                className="cursor-pointer p-1 rounded-full hover:bg-muted transition-colors"
                aria-label="Collapse plan details"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Plan Info */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground capitalize">
                  {subscription.plan} Plan
                </span>

                {/* Status Badges */}
                {subscription.status === "active" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                    Active
                  </span>
                )}
                {subscription.status === "completed" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
                    Limit Reached
                  </span>
                )}
                {subscription.status === "expired" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                    Expired
                  </span>
                )}
                {subscription.status === "cancelled" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-800">
                    Cancelled
                  </span>
                )}
                {subscription.status === "failed" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                    Failed
                  </span>
                )}
              </div>

              {/* Usage Info */}
              <div className="flex justify-between text-xs text-muted-foreground">
                {subscription.status === "expired" ? (
                  <span className="text-red-500 font-medium">Please Renew</span>
                ) : subscription.status === "completed" ? (
                  <span>Limit Reached</span>
                ) : subscription.status === "cancelled" ? (
                  <span className="text-gray-500 font-medium">
                    Subscription Cancelled
                  </span>
                ) : subscription.status === "failed" ? (
                  <span className="text-red-500 font-medium">Please Renew</span>
                ) : (
                  <span>{hoursLeft} hours left</span>
                )}
              </div>

              {/* Progress Bar */}
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    subscription.status === "cancelled"
                      ? "bg-gray-500"
                      : subscription.status === "completed" ||
                        subscription.status === "expired" ||
                        subscription.status === "failed"
                        ? "bg-red-500"
                        : progressPercentage >= 90
                          ? "bg-red-500"
                          : progressPercentage >= 75
                            ? "bg-amber-500"
                            : "bg-green-500",
                  )}
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>

              {/* Upgrade Button */}
              <button
                onClick={handleNavigate}
                className={cn(
                  "cursor-pointer w-full mt-2 px-3 py-2 rounded-lg text-xs font-medium",
                  "bg-[#9439F9] text-white hover:bg-[#8219fb] transition-colors",
                  "flex items-center justify-between",
                )}
              >
                <span>Manage Subscription</span>
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StatusPill;
