import * as React from 'react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  remarksLabel = 'Remarks',
  remarksRequired = false,
  remarks,
  onRemarksChange,
  onConfirm,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  remarksLabel?: string;
  remarksRequired?: boolean;
  remarks: string;
  onRemarksChange: (value: string) => void;
  onConfirm: () => void;
  pending: boolean;
  error: string | null;
}) {
  const remarksId = React.useId();
  const missingRemarks = remarksRequired && remarks.trim().length < 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>{description}</div>
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert className="border-red-200 bg-red-50 text-red-950">
            <AlertTitle>Action failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div>
          <Label htmlFor={remarksId}>
            {remarksLabel}
            {remarksRequired ? (
              <span className="ml-1 font-normal text-destructive" aria-hidden="true">
                (required)
              </span>
            ) : (
              <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
            )}
          </Label>
          <Textarea
            id={remarksId}
            value={remarks}
            onChange={(event) => onRemarksChange(event.target.value)}
            maxLength={2000}
            className="mt-1.5"
            placeholder={
              destructive
                ? 'Explain what the student needs to correct.'
                : 'Add context for the student and the audit record.'
            }
            aria-required={remarksRequired}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {remarks.trim().length}/2000 · Visible to the student and stored in the audit trail.
          </p>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={pending || missingRemarks}
          >
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
