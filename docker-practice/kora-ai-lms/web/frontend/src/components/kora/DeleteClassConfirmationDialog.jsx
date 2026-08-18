import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/AlertDialog';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../hooks/use-toast';
import { deleteClass } from '../../store/slicers/classSlice';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';

export function DeleteClassConfirmationDialog({ open, onOpenChange, classData }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleDelete = async () => {
    if (!classData?._id) {
      toast({
        title: 'Error',
        description: 'Class ID is missing',
        variant: 'destructive',
      });
      return;
    }

    try {
      setLoading(true);
      await dispatch(deleteClass(classData._id)).unwrap();

      toast({
        title: 'Class Deleted',
        description: `${classData.name} has been deleted successfully.`
      });

      // Navigate back to classes page
      navigate('/student/my-classes');
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to delete class:', err);
      toast({
        title: 'Error',
        description: err?.message || 'Could not delete class. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!classData) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the class{' '}
            <strong>{classData.name}</strong> and all associated data, including calendar events.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer bg-[#6F2CCA] hover:bg-[#550dba] text-white" disabled={loading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-500 text-white hover:bg-red-600 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Deleting...
              </>
            ) : (
              'Delete'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

