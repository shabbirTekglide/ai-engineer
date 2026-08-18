import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import React from 'react';

const data = [
  { subject: 'Glycolysis', comprehension: 85 },
  { subject: 'Prompt Eng.', comprehension: 72 },
  { subject: 'LLMs', comprehension: 91 },
  { subject: 'Metabolism', comprehension: 65 },
];

export function FlashcardSummaryDialog({
    children,
    open,
    onOpenChange
}) {
  const navigate = useNavigate();

  const handleFinish = () => {
    onOpenChange(false);
    navigate('/study');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Session Summary</DialogTitle>
          <DialogDescription>
            Here is a breakdown of your comprehension based on this flashcard
            session.
          </DialogDescription>
        </DialogHeader>
        <div className="my-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Comprehension by Subject</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={data} layout="vertical" margin={{ left: 10 }}>
                            <XAxis type="number" domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                            <YAxis dataKey="subject" type="category" width={80} />
                            <Bar dataKey="comprehension" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
        <DialogFooter>
          <Button onClick={handleFinish} className="w-full sm:w-auto">
            Back to Learn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}