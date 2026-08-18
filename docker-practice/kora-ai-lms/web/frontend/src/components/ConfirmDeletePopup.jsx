import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Loader2 } from "lucide-react";

const ConfirmDeletePopup = ({ open, onOpenChange, onConfirm, eventTitle, isDeleting }) => {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 bg-black/70 z-[200]" />
        <AlertDialog.Content
          className="fixed z-[201] top-1/2 left-1/2 max-w-md w-[90%] 
                     -translate-x-1/2 -translate-y-1/2 bg-white p-6 rounded-md shadow-lg"
        >
          <AlertDialog.Title className="text-lg font-semibold text-center">
            Delete Event
          </AlertDialog.Title>

          <AlertDialog.Description className="text-center mt-3">
            Are you sure you want to delete <strong>{eventTitle}</strong>?
          </AlertDialog.Description>

          <div className="flex justify-center gap-3 mt-6">
            <AlertDialog.Cancel
              disabled={isDeleting}
              className="cursor-pointer px-6 py-2 rounded bg-gray-200 hover:bg-gray-300"
            >
              No
            </AlertDialog.Cancel>

            <AlertDialog.Action
              disabled={isDeleting}
              onClick={onConfirm}
              className="cursor-pointer px-6 py-2 rounded bg-red-600 text-white hover:bg-red-700 flex items-center gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                "Yes, Delete"
              )}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
};

export default ConfirmDeletePopup;
