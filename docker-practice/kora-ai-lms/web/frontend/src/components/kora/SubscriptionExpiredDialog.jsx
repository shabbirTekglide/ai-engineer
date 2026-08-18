import { useEffect, useState } from "react";
import {
  X,
  Crown,
  Zap,
  Check,
  Sparkles,
  ArrowRight,
  Calendar,
  Clock,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/Dialog";
import { useNavigate } from "react-router-dom";
import { cn } from "../../libs/Utils";
import { useSelector } from "react-redux";

const SubscriptionExpiredDialog = ({
  open = false,
  onClose
}) => {
  const navigate = useNavigate();
  const { subscriptionType, subscriptionStatus, lastPaymentDate } = useSelector((state) => state.auth);

  let trialEndDate = 'N/A';
  let daysUsed = 0;

  if (lastPaymentDate) {
    const startDate = new Date(lastPaymentDate);
    const durationDays = subscriptionType === 'free' ? 7 : 30;
    const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    trialEndDate = endDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    const now = new Date();
    const usedTime = endDate - startDate;
    daysUsed = Math.floor(Math.max(0, usedTime) / (1000 * 60 * 60 * 24));
  }
    const formatPlanName = (plan) => {
    if (subscriptionType === "pro_plan") return "Pro Plan";
    if (subscriptionType === "basic_plan") return "Basic Plan";
    return "Free Tier";
  };

  // useEffect(() => {
  //   if (open) {
  //     // Set expiration time (24 hours from now for demo)
  //     const expirationTime = new Date();
  //     expirationTime.setHours(expirationTime.getHours() + 24);

  //     const updateCountdown = () => {
  //       const now = new Date();
  //       const difference = expirationTime - now;

  //       if (difference > 0) {
  //         const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
  //         const minutes = Math.floor((difference / 1000 / 60) % 60);
  //         const seconds = Math.floor((difference / 1000) % 60);

  //         setTimeLeft({ hours, minutes, seconds });
  //       }
  //     };

  //     updateCountdown();
  //     const interval = setInterval(updateCountdown, 1000);

  //     return () => clearInterval(interval);
  //   }
  // }, [open]);

  const handleSubscribe = () => {
    onClose(); // Close the dialog
    navigate("/student/subscribe"); // Navigate to subscription page
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[380px] max-h-[95vh] gap-0 overflow-y-scroll bg-gradient-to-br from-white to-blue-50 border-0 shadow-2xl p-0">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-8 text-center">
          <DialogHeader className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center justify-center w-10 h-10 md:w-16 md:h-16 rounded-full bg-white/20 backdrop-blur-sm border border-white/30">
                <Crown className="w-6 h-6 md:h-8  md:w-8 text-white" />
              </div>
              <DialogTitle className="text-xl md:text-2xl font-bold text-white">
                Your {formatPlanName(subscriptionType)} Trial Has Ended
              </DialogTitle>
            </div>
            <p className="text-blue-100 font-medium text-center">
              Upgrade to continue accessing premium features
            </p>
          </DialogHeader>
        </div>

        <div className="p-4 md:p-6 space-y-6">
          {/* Trial info */}
          <div className="flex md:items-center md:justify-between flex-col md:flex-row gap-4 bg-blue-50 p-4 rounded-xl border border-blue-200">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Trial ended on</p>
                <p className="font-semibold">{trialEndDate}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">You used</p>
                <p className="font-semibold">{daysUsed} days</p>
              </div>
            </div>
          </div>
          {/* Pricing card */}
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h4 className="font-bold text-lg">Basic Plan</h4>
                <p className="text-sm text-gray-600">Best for casual learners</p>
              </div>
              <div className="text-right">
                <div className="flex items-baseline">
                  <span className="text-2xl md:text-3xl font-bold">$15.00</span>
                  <span className="text-gray-600 ml-1">/month</span>
                </div>
                {/* <p className="text-xs text-gray-500">Billed annually: $150.00</p> */}
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h4 className="font-bold text-lg">Pro Plan</h4>
                <p className="text-sm text-gray-600">Most popular choice</p>
              </div>
              <div className="text-right">
                <div className="flex items-baseline">
                  <span className="text-2xl md:text-3xl font-bold">$20.00</span>
                  <span className="text-gray-600 ml-1">/month</span>
                </div>
                {/* <p className="text-xs text-gray-500">Billed annually: $99.99</p> */}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 py-3 text-gray-700 hover:bg-gray-100 hover:text-black"
            >
              Maybe Later
            </Button>
            <Button
              onClick={handleSubscribe}
              className={cn(
                "flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600",
                "hover:from-purple-700 hover:to-blue-700 text-white",
                "font-semibold shadow-lg hover:shadow-xl transition-all duration-300",
              )}
            >
              <span>Upgrade Now</span>
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>

          {/* Additional incentive */}
          {/* <div className="text-center p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              <span className="font-semibold">7-day money-back guarantee</span>
              {" • "}
              Cancel anytime
            </p>
          </div> */}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SubscriptionExpiredDialog;