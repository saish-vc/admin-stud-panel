import { Link } from 'react-router-dom';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="container grid min-h-[60vh] place-items-center py-16">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-gold-600/25 bg-gold-50 text-gold-700">
          <FileQuestion className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-gold-600">
          404 · Page not found
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-navy-900">
          We couldn’t find that page
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          The link may be outdated, or the page may have moved. Return to the certificate portal or
          verify a certificate instead.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button asChild>
            <Link to="/">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to home
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/verify">Verify a certificate</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
