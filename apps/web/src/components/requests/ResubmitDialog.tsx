import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Upload, X } from 'lucide-react';
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
import { FieldError } from '@/components/common/Form';
import { useToast } from '@/components/common/Toast';
import { api, ApiError } from '@/lib/api';
import { formatFileSize } from '@/lib/format';
import { UPLOAD_ACCEPT, validateUploadFile } from '@/lib/files';
import type { StudentRequest } from '@/types';

const schema = z.object({
  purpose: z
    .string()
    .trim()
    .min(10, 'Purpose must be at least 10 characters.')
    .max(1000, 'Purpose must be at most 1,000 characters.'),
});

type FormValues = z.infer<typeof schema>;

export function ResubmitDialog({
  request,
  open,
  onOpenChange,
  onSuccess,
}: {
  request: StudentRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { purpose: request.purpose },
  });

  React.useEffect(() => {
    if (open) {
      reset({ purpose: request.purpose });
      setFile(null);
      setFileError(null);
    }
  }, [open, request.purpose, reset]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (file) {
        const clientError = validateUploadFile(file);
        if (clientError) throw new ApiError(400, 'INVALID_FILE', clientError);
      }
      const form = new FormData();
      form.append('purpose', values.purpose);
      if (file) form.append('document', file);
      return api.postForm<StudentRequest>(
        `/api/student/requests/${request.requestId}/resubmit`,
        form,
      );
    },
    onSuccess: () => {
      toast({
        title: 'Request resubmitted',
        description: 'Your updated request is back in the verification queue.',
        variant: 'success',
      });
      void queryClient.invalidateQueries({ queryKey: ['student'] });
      onOpenChange(false);
      onSuccess();
    },
  });

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      setFile(null);
      setFileError(null);
      return;
    }
    const error = validateUploadFile(selected);
    if (error) {
      setFileError(error);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(selected);
    setFileError(null);
  };

  const submit = handleSubmit((values) => {
    mutation.mutate(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Resubmit this request</DialogTitle>
          <DialogDescription>
            Update the purpose or attach a corrected document. The request returns to the
            verification queue and keeps its full audit history.
          </DialogDescription>
        </DialogHeader>

        {mutation.isError ? (
          <Alert className="border-red-200 bg-red-50 text-red-950">
            <AlertTitle>Could not resubmit</AlertTitle>
            <AlertDescription>
              {mutation.error instanceof ApiError
                ? mutation.error.message
                : 'Please try again in a moment.'}
            </AlertDescription>
          </Alert>
        ) : null}

        <form onSubmit={submit} noValidate className="space-y-4">
          <div>
            <Label htmlFor="resubmit-purpose">Purpose</Label>
            <Textarea
              id="resubmit-purpose"
              className="mt-1.5"
              aria-invalid={Boolean(errors.purpose)}
              aria-describedby={errors.purpose ? 'resubmit-purpose-error' : undefined}
              {...register('purpose')}
            />
            <FieldError id="resubmit-purpose-error" message={errors.purpose?.message} />
          </div>

          <div>
            <Label htmlFor="resubmit-document">Replacement document (optional)</Label>
            <div className="mt-1.5 rounded-lg border border-dashed border-input bg-cream-50/60 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Choose file
                </Button>
                <span className="text-xs text-muted-foreground">PDF, JPG, or PNG · max 5 MB</span>
              </div>
              <input
                ref={fileInputRef}
                id="resubmit-document"
                type="file"
                accept={UPLOAD_ACCEPT}
                aria-label="Attach replacement document"
                className="sr-only"
                onChange={onFileChange}
              />
              {file ? (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
                  <span className="truncate">
                    {file.name}{' '}
                    <span className="text-xs text-muted-foreground">
                      ({formatFileSize(file.size)})
                    </span>
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    aria-label="Remove selected file"
                    onClick={() => {
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
              {fileError ? (
                <p role="alert" className="mt-2 text-sm font-medium text-destructive">
                  {fileError}
                </p>
              ) : null}
            </div>
            {request.supportingDocument ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Leaving this empty keeps your existing document.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={mutation.isPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={mutation.isPending}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {mutation.isPending ? 'Resubmitting…' : 'Resubmit request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
