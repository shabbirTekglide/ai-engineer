// components/kora/DeleteLectureConfirmationDialog.jsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/Dialog";
import { Button } from "../ui/Button";
import { Trash2 } from "lucide-react";

export function DeleteLectureConfirmationDialog({ open, onOpenChange, lecture, onConfirm }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-32px)] max-w-[400px] mx-auto px-5 py-6">
        <DialogHeader className="flex flex-row justify-center items-center gap-3">
          <div className="flex justify-center">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">Delete Lecture</DialogTitle>
        </DialogHeader>

        <p className="text-center text-muted-foreground text-sm mt-1">
          Are you sure you want to delete{" "}
          <span className="font-semibold text-foreground">"{lecture?.title}"</span>?
          This action cannot be undone.
        </p>

        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            className="flex-1 cursor-pointer"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-red-500 hover:bg-red-600 text-white cursor-pointer"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}