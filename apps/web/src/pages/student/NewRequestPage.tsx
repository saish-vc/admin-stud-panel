import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FilePlus2, Info, Paperclip, Send, Upload, X } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FieldError } from '@/components/common/Form';
import { useToast } from '@/components/common/Toast';
import { api, ApiError } from '@/lib/api';
import { CERTIFICATE_TYPES, formatFileSize } from '@/lib/format';
import { UPLOAD_ACCEPT, validateUploadFile } from '@/lib/files';
import { cn } from '@/lib/utils';
import type { StudentRequest } from '@/types';

const schema = z.object({
  certificateType: z.enum(['BONAFIDE', 'LC', 'DIPLOMA']),
  purpose: z
    .string()
    .trim()
    .min(10, 'Describe the purpose in at least 10 characters.')
    .max(1000, 'Purpose must be at most 1,000 characters.'),
});

type FormValues = z.infer<typeof schema>;

export function NewRequestPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { certificateType: 'BONAFIDE', purpose: '' },
  });
  const purpose = watch('purpose') ?? '';

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (file) {
        const clientError = validateUploadFile(file);
        if (clientError) throw new ApiError(400, 'INVALID_FILE', clientError);
      }
      const form = new FormData();
      form.append('certificateType', values.certificateType);
      form.append('purpose', values.purpose);
      if (file) form.append('document', file);
      return api.postForm<StudentRequest>('/api/student/requests', form);
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['student'] });
      toast({
        title: 'Request submitted',
        description: 'Your request is now waiting for document verification.',
        variant: 'success',
      });
      navigate(`/student/requests/${created.requestId}`, { replace: true });
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

  const limitReached =
    mutation.error instanceof ApiError && mutation.error.code === 'OPEN_REQUEST_LIMIT';

  return (
    <div className="space-y-7">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
          <Link to="/student">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to overview
          </Link>
        </Button>
        <PageHeader
          eyebrow="New request"
          title="Request a certificate"
          description="Tell us which certificate you need and why. Attach a supporting document if the certificate office has asked for one."
          icon={FilePlus2}
        />
      </div>

      {mutation.isError ? (
        <Alert className="border-red-200 bg-red-50 text-red-950">
          <AlertTitle>
            {limitReached ? 'Open request limit reached' : 'Request not submitted'}
          </AlertTitle>
          <AlertDescription>
            {limitReached ? (
              <>
                You can have at most three open requests. Wait for an existing request to be
                decided, or{' '}
                <Link to="/student/requests" className="font-semibold underline">
                  review your open requests
                </Link>
                .
              </>
            ) : mutation.error instanceof ApiError ? (
              mutation.error.message
            ) : (
              'Please check your connection and try again.'
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-6 shadow-card">
            <fieldset>
              <legend className="font-display text-lg font-semibold">Certificate type</legend>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose the document that matches your purpose. The type cannot be changed after
                submission.
              </p>
              <div className="mt-4 grid gap-3">
                {CERTIFICATE_TYPES.map((type) => (
                  <label
                    key={type.value}
                    className="relative flex cursor-pointer gap-3 rounded-xl border border-input bg-card p-4 transition-colors hover:bg-cream-50 has-[:checked]:border-gold-500 has-[:checked]:bg-gold-50/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2"
                  >
                    <input
                      type="radio"
                      value={type.value}
                      className="peer sr-only"
                      {...register('certificateType')}
                    />
                    <span
                      className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-input bg-card peer-checked:border-gold-600 peer-checked:[&>span]:opacity-100"
                      aria-hidden="true"
                    >
                      <span className="h-2.5 w-2.5 rounded-full bg-gold-600 opacity-0 transition-opacity" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{type.label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                        {type.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              <FieldError message={errors.certificateType?.message} />
            </fieldset>
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-baseline justify-between gap-4">
              <Label htmlFor="purpose" className="font-display text-lg font-semibold">
                Purpose of the certificate
              </Label>
              <span
                className={cn(
                  'text-xs tabular-nums',
                  purpose.length > 1000
                    ? 'font-semibold text-destructive'
                    : 'text-muted-foreground',
                )}
                aria-hidden="true"
              >
                {purpose.length}/1000
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              For example: “Education loan application with State Bank of India” or “Higher studies
              admission at PSG College”.
            </p>
            <Textarea
              id="purpose"
              data-testid="request-purpose"
              className="mt-3"
              placeholder="Describe where you will submit this certificate and why it is required."
              aria-invalid={Boolean(errors.purpose)}
              aria-describedby={errors.purpose ? 'purpose-error' : 'purpose-hint'}
              {...register('purpose')}
            />
            <p id="purpose-hint" className="mt-1.5 text-xs text-muted-foreground">
              Minimum 10 characters. Do not include passwords or payment details.
            </p>
            <FieldError id="purpose-error" message={errors.purpose?.message} />
          </section>

          <section className="rounded-xl border border-border bg-card p-6 shadow-card">
            <h2 className="font-display text-lg font-semibold">Supporting document</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Optional. Attach a scan or photo if it helps the clerk verify your request.
            </p>
            <div className="mt-4 rounded-xl border border-dashed border-input bg-cream-50/60 p-5">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-lg bg-card text-gold-700">
                    <Paperclip className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">PDF, JPG, or PNG</p>
                    <p className="text-xs text-muted-foreground">Maximum file size: 5 MB</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Choose file
                </Button>
              </div>
              <input
                ref={fileInputRef}
                id="supporting-document"
                data-testid="request-document"
                type="file"
                accept={UPLOAD_ACCEPT}
                aria-label="Attach supporting document"
                className="sr-only"
                onChange={onFileChange}
              />
              {file ? (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="rounded p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                <p role="alert" className="mt-3 text-sm font-medium text-destructive">
                  {fileError}
                </p>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-5 shadow-card">
            <h2 className="font-display text-base font-semibold">Before you submit</h2>
            <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted-foreground">
              {[
                'Your name, roll number, and programme come from the NTTF master record.',
                'A clerk verifies your documents before the HOD reviews the request.',
                'You can have at most three open requests at any time.',
                'Rejected requests can be corrected and resubmitted with their history intact.',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span
                    className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold-600"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-gold-600/20 bg-gold-50/60 p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-gold-800">
              <Info className="h-4 w-4" aria-hidden="true" />
              Processing time
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-gold-900/70">
              Most requests are reviewed within two working days. You will see each review step on
              the request page; no email notifications are sent in this release.
            </p>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={mutation.isPending}
            data-testid="request-submit"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {mutation.isPending ? 'Submitting request…' : 'Submit request'}
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link to="/student">Cancel</Link>
          </Button>
        </aside>
      </form>
    </div>
  );
}
